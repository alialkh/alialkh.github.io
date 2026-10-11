// Encodes one cath lab image, clip or IVUS clip, writes its poster and appends a manifest entry.
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContent, KINDS } from '../cta/content.js';
import { regionsFromCoco } from './cath-lib.mjs';

const USAGE = `Usage: node radiology/tools/add-cath.mjs <file or frame pattern like in/%05d.png> --id <id> --kind <${KINDS.join('|')}>
  --title <text> --summary <text> --author <text> --license <text> --license-url <url> --url <url> [--attribution <text>]
  [--notes <text>] [--projection <id>] [--modified <text>] [--fps <n> for a frame pattern] [--stretch <x> scales the width to fix non-square pixels]
  [--crf <n>] [--coco <annotations.json> --coco-file <name>] [--pin "x,y,text" ...] [--manifest <path>]
  default manifest radiology/data/cath/manifest.json, media are written beside it`;
const REQUIRED = ['id', 'kind', 'title', 'summary', 'author', 'license', 'license-url', 'url'];
const TEXT = ['projection', 'notes', 'attribution', 'modified', 'fps', 'stretch', 'crf', 'coco', 'coco-file', 'manifest'];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.error?.code === 'ENOENT') fail(`${cmd} was not found on PATH. Install ffmpeg, which includes ffprobe, and try again.`);
  if (r.status !== 0) fail(`${cmd} failed:\n${r.stderr || r.error?.message}`);
  return r.stdout;
}

let args;
try {
  const options = Object.fromEntries([...REQUIRED, ...TEXT].map(k => [k, { type: 'string' }]));
  args = parseArgs({ allowPositionals: true, options: { ...options, pin: { type: 'string', multiple: true } } });
} catch (e) {
  fail(`${e.message}\n${USAGE}`);
}
const { values: o, positionals: [input] } = args;
const missing = [...(input ? [] : ['<file>']), ...REQUIRED.filter(k => !o[k]).map(k => `--${k}`)];
if (missing.length) fail(`Missing ${missing.join(', ')}.\n${USAGE}`);
if (!KINDS.includes(o.kind)) fail(`--kind must be one of ${KINDS.join(', ')}.`);
const sequence = input.includes('%');
if (!sequence && !existsSync(input)) fail(`No such file: ${input}`);
const still = o.kind.endsWith('-still');

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(o.manifest ?? join(here, '../data/cath/manifest.json'));
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : [];
const table = name => JSON.parse(readFileSync(join(here, `../cta/content/${name}.json`), 'utf8'));
const tables = { segments: table('segments'), projections: table('projections'), ivus: table('ivus') };

const defaultModified = still
  ? 'Converted from PNG to JPEG. Polygons were simplified to fewer points.'
  : `Re-encoded to H.264 MP4${o.stretch ? `, resampled to square pixels (width scaled by ${o.stretch})` : ''}, audio and metadata removed.`;
const regions = o.coco ? regionsFromCoco(JSON.parse(readFileSync(o.coco, 'utf8')), o['coco-file'], new Set(tables.segments.map(s => s.id))) : null;
const pins = (o.pin ?? []).map(p => {
  const [x, y, ...text] = p.split(',');
  return { at: [Number(x), Number(y)], text: text.join(',').trim() };
});
// fps, duration and size are placeholders until ffprobe measures the encoded file.
const entry = {
  id: o.id, kind: o.kind, ...(o.projection && { projection: o.projection }), title: o.title, summary: o.summary,
  src: `${o.id}.${still ? 'jpg' : 'mp4'}`, poster: still ? `${o.id}-thumb.jpg` : `${o.id}.jpg`,
  ...(!still && { fps: 1, durationSec: 1 }), width: 1, height: 1, markers: [],
  ...(regions && { regions: regions.regions }), ...(pins.length && { pins }), ...(o.notes && { notes: o.notes }),
  source: {
    author: o.author, license: o.license, licenseUrl: o['license-url'], url: o.url, attribution: o.attribution ?? '', modified: o.modified ?? defaultModified,
  },
};
// The page refuses to load any content the validator rejects, so the tool must refuse it first.
const problems = validateContent({ ...tables, cases: [...manifest, entry] });
if (problems.length) fail(`Nothing was written. The manifest would not pass validation:\n${problems.map(p => `  ${p}`).join('\n')}`);
if (regions?.dropped.length) console.log(`Dropped segments the table lacks: ${regions.dropped.join(', ')}.`);

if (!run('ffmpeg', ['-hide_banner', '-h', 'long']).includes('-fps_mode')) fail('add-cath needs ffmpeg 5.1 or newer, which added -fps_mode. Update ffmpeg and try again.');
const dir = dirname(manifestPath);
mkdirSync(dir, { recursive: true });
const out = name => join(dir, name);
const inputArgs = sequence ? ['-framerate', o.fps ?? '10', '-i', input] : ['-i', input];
// Even sides for H.264 and square pixels at the display shape, so the page's box from width and height never letterboxes.
const scale = `scale='trunc(iw*${o.stretch ?? 1}/2)*2':'trunc(ih/2)*2',setsar=1`;
if (still) {
  run('ffmpeg', ['-y', '-v', 'error', ...inputArgs, '-frames:v', '1', '-q:v', '3', out(entry.src)]);
  run('ffmpeg', ['-y', '-v', 'error', ...inputArgs, '-vf', 'scale=160:-2', '-frames:v', '1', '-q:v', '4', out(entry.poster)]);
} else {
  run('ffmpeg', [
    '-y', '-v', 'error', ...inputArgs, '-map', '0:v:0', '-an', '-sn', '-dn', '-map_metadata', '-1',
    '-vf', `${scale},format=yuv420p`, '-fps_mode', 'cfr',
    '-c:v', 'libx264', '-crf', o.crf ?? '22', '-preset', 'slow', '-movflags', '+faststart', out(entry.src),
  ]);
}
const probe = JSON.parse(run('ffprobe', [
  '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate:format=duration,size', '-of', 'json', out(entry.src),
]));
const { width, height, avg_frame_rate: rate } = probe.streams[0];
Object.assign(entry, { width, height });
if (!still) {
  const [num, den] = rate.split('/').map(Number);
  const durationSec = +Number(probe.format.duration).toFixed(3);
  Object.assign(entry, { fps: +(num / den).toFixed(3), durationSec });
  run('ffmpeg', ['-y', '-v', 'error', '-ss', String(durationSec / 2), '-i', out(entry.src), '-frames:v', '1', '-q:v', '3', out(entry.poster)]);
}

const tmp = `${manifestPath}.tmp`;
writeFileSync(tmp, `${JSON.stringify([...manifest, entry], null, 2)}\n`);
renameSync(tmp, manifestPath);
console.log(`Added ${o.id}: ${width}x${height}${still ? '' : `, ${entry.fps} fps, ${entry.durationSec} s`}, ${Math.round(probe.format.size / 1024)} KB, ${entry.regions?.length ?? 0} regions, ${pins.length} pins.`);
console.log(`Next: add a row to data/INDEX.md and a row to docs/LICENSES.md if the source is new.`);
