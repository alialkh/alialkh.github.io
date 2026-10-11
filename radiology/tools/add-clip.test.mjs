import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./add-clip.mjs', import.meta.url));
const hasFfmpeg = !spawnSync('ffmpeg', ['-version']).error;
const addClip = (args, env = process.env) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env });
const source = id => ['--author', 'Test', '--license-url', 'https://l', '--url', 'https://u', '--id', id, '--view', 'plax'];

test('add-clip encodes, writes a poster, appends an entry and refuses bad input', { skip: !hasFfmpeg && 'ffmpeg is not on PATH' }, t => {
  const dir = mkdtempSync(join(tmpdir(), 'add-clip-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const input = join(dir, 'in.mp4');
  const manifest = join(dir, 'out', 'manifest.json');
  // Non-square pixels: stored 400x400, shown 800x400.
  const made = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=400x400:r=25:d=1,setsar=2', '-f', 'lavfi', '-i', 'sine=d=1', '-shortest', input]);
  assert.equal(made.status, 0, String(made.stderr));

  const ok = addClip([input, ...source('c1'), '--license', 'CC BY 4.0', '--manifest', manifest]);
  assert.equal(ok.status, 0, ok.stderr);
  const [entry] = JSON.parse(readFileSync(manifest, 'utf8'));
  assert.deepEqual(
    { ...entry, source: undefined },
    { id: 'c1', view: 'plax', src: 'c1.mp4', poster: 'c1.jpg', fps: 25, durationSec: 1, width: 720, height: 360, markers: [], source: undefined },
  );
  assert.equal(entry.source.license, 'CC BY 4.0');
  assert.ok(existsSync(join(dir, 'out', 'c1.jpg')));
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,pix_fmt,sample_aspect_ratio', '-of', 'csv=p=0', join(dir, 'out', 'c1.mp4')], { encoding: 'utf8' });
  assert.equal(probe.stdout.trim(), 'h264,video,1:1,yuv420p');
  const bytes = readFileSync(join(dir, 'out', 'c1.mp4'));
  const moov = bytes.indexOf('moov');
  assert.ok(moov !== -1 && moov < bytes.indexOf('mdat'), 'faststart puts the index first');

  const before = readFileSync(manifest, 'utf8');
  const dup = addClip([input, ...source('c1'), '--license', 'CC BY 4.0', '--manifest', manifest]);
  assert.equal(dup.status, 1);
  assert.match(dup.stderr, /duplicate id/);
  const nc = addClip([input, ...source('c2'), '--license', 'CC BY-NC 4.0', '--manifest', manifest]);
  assert.equal(nc.status, 1);
  assert.match(nc.stderr, /not allowed/);
  assert.equal(existsSync(join(dir, 'out', 'c2.mp4')), false);
  assert.equal(readFileSync(manifest, 'utf8'), before);
});

test('add-clip refuses a typo in --view or --condition with the validator message and writes nothing', t => {
  const dir = mkdtempSync(join(tmpdir(), 'add-clip-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const manifest = join(dir, 'manifest.json');
  writeFileSync(manifest, '[]\n');
  const view = addClip([script, ...source('c4'), '--view', 'plxa', '--license', 'CC0 1.0', '--manifest', manifest]);
  assert.equal(view.status, 1);
  assert.match(view.stderr, /clips\["c4"\]\.view "plxa" is not a view/);
  const condition = addClip([script, ...source('c4'), '--condition', 'efusion', '--license', 'CC0 1.0', '--manifest', manifest]);
  assert.equal(condition.status, 1);
  assert.match(condition.stderr, /condition "efusion" is not a condition/);
  assert.equal(readFileSync(manifest, 'utf8'), '[]\n');
  assert.deepEqual(readdirSync(dir), ['manifest.json']);
});

test('add-clip fails clearly when ffmpeg is missing', t => {
  const dir = mkdtempSync(join(tmpdir(), 'add-clip-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== 'PATH'));
  const r = addClip([script, ...source('c3'), '--license', 'CC0 1.0', '--manifest', join(dir, 'manifest.json')], { ...env, PATH: dir });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ffmpeg was not found on PATH/);
  assert.equal(existsSync(join(dir, 'manifest.json')), false);
});
