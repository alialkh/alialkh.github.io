// Encodes one echo clip, writes its poster and appends a manifest entry with empty markers.
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContent } from '../echo/content.js';

const USAGE = `Usage: node radiology/tools/add-clip.mjs <file> --id <id> --view <view> [--condition <id>]
  --author <text> --license <text> --license-url <url> --url <url> [--attribution <text>]
  [--manifest <path>]   default radiology/data/clips/manifest.json, clips are written beside it`;
const REQUIRED = ['id', 'view', 'author', 'license', 'license-url', 'url'];

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
  const options = Object.fromEntries([...REQUIRED, 'condition', 'attribution', 'manifest'].map(k => [k, { type: 'string' }]));
  args = parseArgs({ allowPositionals: true, options });
} catch (e) {
  fail(`${e.message}\n${USAGE}`);
}
const { values: o, positionals: [input] } = args;
const missing = [...(input ? [] : ['<file>']), ...REQUIRED.filter(k => !o[k]).map(k => `--${k}`)];
if (missing.length) fail(`Missing ${missing.join(', ')}.\n${USAGE}`);
if (!existsSync(input)) fail(`No such file: ${input}`);

const manifestPath = resolve(o.manifest ?? fileURLToPath(new URL('../data/clips/manifest.json', import.meta.url)));
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : [];
// fps, duration and size are placeholders until ffprobe measures the encoded file.
const entry = {
  id: o.id, view: o.view, ...(o.condition && { condition: o.condition }),
  src: `${o.id}.mp4`, poster: `${o.id}.jpg`, fps: 1, durationSec: 1, width: 1, height: 1, markers: [],
  source: {
    author: o.author, license: o.license, licenseUrl: o['license-url'], url: o.url, attribution: o.attribution ?? '',
    modified: 'Re-encoded to H.264 MP4, scaled to at most 720 px wide, audio and metadata removed.',
  },
};
// The page refuses to load any content the validator rejects, so the tool must refuse it first.
const table = name => JSON.parse(readFileSync(new URL(`../echo/content/${name}.json`, import.meta.url), 'utf8'));
const problems = validateContent({ structures: table('structures'), views: table('views'), conditions: table('conditions'), clips: [...manifest, entry] });
if (problems.length) fail(`Nothing was written. The manifest would not pass validation:\n${problems.map(p => `  ${p}`).join('\n')}`);

if (!run('ffmpeg', ['-hide_banner', '-h', 'long']).includes('-fps_mode')) fail('add-clip needs ffmpeg 5.1 or newer, which added -fps_mode. Update ffmpeg and try again.');
run('ffprobe', ['-version']);

const dir = dirname(manifestPath);
mkdirSync(dir, { recursive: true });
const mp4 = join(dir, `${o.id}.mp4`);
const jpg = join(dir, `${o.id}.jpg`);
run('ffmpeg', [
  '-y', '-v', 'error', '-i', input, '-map', '0:v:0', '-an', '-sn', '-dn', '-map_metadata', '-1',
  // Square pixels at the source's display shape, so the player's box from width and height never letterboxes.
  '-vf', "scale='min(720,trunc(iw*sar/2)*2)':'trunc(ow/dar/2)*2',setsar=1,format=yuv420p", '-fps_mode', 'cfr',
  '-c:v', 'libx264', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', mp4,
]);
const probe = JSON.parse(run('ffprobe', [
  '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate:format=duration,size', '-of', 'json', mp4,
]));
const { width, height, avg_frame_rate: rate } = probe.streams[0];
const [num, den] = rate.split('/').map(Number);
const fps = +(num / den).toFixed(3);
const durationSec = +Number(probe.format.duration).toFixed(3);
run('ffmpeg', ['-y', '-v', 'error', '-ss', String(durationSec / 2), '-i', mp4, '-frames:v', '1', '-q:v', '3', jpg]);

Object.assign(entry, { fps, durationSec, width, height });
const tmp = `${manifestPath}.tmp`;
writeFileSync(tmp, `${JSON.stringify([...manifest, entry], null, 2)}\n`);
renameSync(tmp, manifestPath);
console.log(`Added ${o.id}: ${width}x${height}, ${fps} fps, ${durationSec} s, ${Math.round(probe.format.size / 1024)} KB.`);
console.log(`Next: place markers for view "${o.view}" in ${manifestPath}, then add a row to data/INDEX.md.`);
