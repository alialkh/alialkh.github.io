import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./add-cath.mjs', import.meta.url));
const hasFfmpeg = !spawnSync('ffmpeg', ['-version']).error;
const addCath = args => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
const meta = (id, kind) => ['--id', id, '--kind', kind, '--title', 'T', '--summary', 'S', '--author', 'A B, C D', '--license-url', 'https://l', '--url', 'https://u'];

test('add-cath encodes a still with regions, a stretched clip with a pin, and refuses bad input', { skip: !hasFfmpeg && 'ffmpeg is not on PATH' }, t => {
  const dir = mkdtempSync(join(tmpdir(), 'add-cath-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const png = join(dir, '1.png');
  const mp4 = join(dir, 'in.mp4');
  const manifest = join(dir, 'out', 'manifest.json');
  const coco = join(dir, 'coco.json');
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=64x64', '-frames:v', '1', png]).status, 0);
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=640x480:r=25:d=1', '-f', 'lavfi', '-i', 'sine=d=1', '-shortest', mp4]).status, 0);
  writeFileSync(coco, JSON.stringify({
    images: [{ id: 1, file_name: '1.png', width: 64, height: 64 }],
    categories: [{ id: 1, name: '6' }, { id: 2, name: 'stenosis' }],
    annotations: [{ image_id: 1, category_id: 1, segmentation: [[0, 0, 32, 0, 32, 32]] }, { image_id: 1, category_id: 2, segmentation: [[0, 0, 8, 0, 8, 8]] }],
  }));

  const still = addCath([png, ...meta('s1', 'angio-still'), '--license', 'CC0 1.0', '--coco', coco, '--coco-file', '1.png', '--manifest', manifest]);
  assert.equal(still.status, 0, still.stderr);
  assert.match(still.stdout, /Dropped segments the table lacks: stenosis/);
  const [s1] = JSON.parse(readFileSync(manifest, 'utf8'));
  assert.deepEqual([s1.src, s1.poster, s1.width, s1.height], ['s1.jpg', 's1-thumb.jpg', 64, 64]);
  assert.deepEqual(s1.regions, [{ segment: 'seg-6', polygon: [[0, 0], [0.5, 0], [0.5, 0.5]] }]);
  assert.ok(existsSync(join(dir, 'out', 's1.jpg')) && existsSync(join(dir, 'out', 's1-thumb.jpg')));

  const clip = addCath([mp4, ...meta('c1', 'ivus-clip'), '--license', 'CC BY 2.0', '--stretch', '0.75', '--pin', '0.5,0.5,Lesion, here.', '--manifest', manifest]);
  assert.equal(clip.status, 0, clip.stderr);
  const c1 = JSON.parse(readFileSync(manifest, 'utf8'))[1];
  assert.deepEqual([c1.width, c1.height, c1.fps, c1.durationSec], [480, 480, 25, 1]);
  assert.deepEqual(c1.pins, [{ at: [0.5, 0.5], text: 'Lesion, here.' }]);
  assert.match(c1.source.modified, /square pixels \(width scaled by 0\.75\)/);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,sample_aspect_ratio', '-of', 'csv=p=0', join(dir, 'out', 'c1.mp4')], { encoding: 'utf8' });
  assert.equal(probe.stdout.trim(), 'video,1:1', 'one video stream, square pixels, no audio');

  const before = readFileSync(manifest, 'utf8');
  const nc = addCath([png, ...meta('s2', 'angio-still'), '--license', 'CC BY-NC 4.0', '--manifest', manifest]);
  assert.equal(nc.status, 1);
  assert.match(nc.stderr, /not allowed/);
  const dup = addCath([png, ...meta('s1', 'angio-still'), '--license', 'CC0 1.0', '--manifest', manifest]);
  assert.match(dup.stderr, /duplicate id/);
  const ghost = addCath([png, ...meta('s3', 'angio-still'), '--license', 'CC0 1.0', '--projection', 'ghost', '--manifest', manifest]);
  assert.match(ghost.stderr, /projection "ghost" is not a projection/);
  assert.equal(addCath([png, ...meta('s4', 'tomogram'), '--license', 'CC0 1.0', '--manifest', manifest]).status, 1);
  assert.equal(existsSync(join(dir, 'out', 's2.jpg')) || existsSync(join(dir, 'out', 's3.jpg')), false);
  assert.equal(readFileSync(manifest, 'utf8'), before);
});

test('add-cath stores stated angles exactly, derives the projection only when a listed view is near, and refuses a far one', { skip: !hasFfmpeg && 'ffmpeg is not on PATH' }, t => {
  const dir = mkdtempSync(join(tmpdir(), 'add-cath-angles-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const png = join(dir, '1.png');
  const manifest = join(dir, 'out', 'manifest.json');
  const lad = join(dir, 'lad.json');
  const rca = join(dir, 'rca.json');
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=64x64', '-frames:v', '1', png]).status, 0);
  const coco = category => JSON.stringify({
    images: [{ id: 1, file_name: '1.png', width: 64, height: 64 }], categories: [{ id: 1, name: category }],
    annotations: [{ image_id: 1, category_id: 1, segmentation: [[0, 0, 32, 0, 32, 32]] }],
  });
  writeFileSync(lad, coco('6'));
  writeFileSync(rca, coco('2'));
  const add = (id, ...extra) => addCath([png, ...meta(id, 'angio-still'), '--license', 'CC BY 4.0', '--manifest', manifest, ...extra]);
  const read = () => JSON.parse(readFileSync(manifest, 'utf8'));

  const near = add('left-near', '--dicom-angles', '40.3,25.1', '--coco', lad, '--coco-file', '1.png');
  assert.equal(near.status, 0, near.stderr);
  assert.match(near.stdout, /Stated LAO 40\.3, cranial 25\.1\. Nearest listed left view lao-cranial, 5\.1 degrees away/);
  assert.deepEqual(read()[0].angles, { primary: { side: 'LAO', angle: 40.3 }, secondary: { direction: 'cranial', angle: 25.1 } });
  assert.equal(read()[0].projection, 'lao-cranial');

  const right = add('right-near', '--dicom-angles', '41,0', '--coco', rca, '--coco-file', '1.png');
  assert.equal(right.status, 0, right.stderr);
  assert.equal(read()[1].projection, 'rca-lao', 'the same system rule picks the right coronary view for RCA outlines');

  const far = add('left-far', '--dicom-angles=-80,0', '--coco', lad, '--coco-file', '1.png');
  assert.match(far.stdout, /No listed left view is within 15 degrees, so no projection is set/);
  assert.deepEqual([read()[2].projection, read()[2].angles.primary], [undefined, { side: 'RAO', angle: 80 }]);

  const unknown = add('no-outlines', '--dicom-angles', '41,0');
  assert.match(unknown.stdout, /No outlines say which system this is/);
  assert.equal(read()[3].projection, undefined);

  const before = readFileSync(manifest, 'utf8');
  const mismatch = add('mismatch', '--dicom-angles=-30,-30', '--projection', 'lao-cranial');
  assert.equal(mismatch.status, 1);
  assert.match(mismatch.stderr, /projection "lao-cranial" is not within 15 degrees of the stated angles RAO 30, caudal 30/);
  assert.equal(add('garbage', '--dicom-angles', '40').status, 1);
  assert.equal(readFileSync(manifest, 'utf8'), before, 'a refused case writes nothing');
  assert.equal(existsSync(join(dir, 'out', 'mismatch.jpg')), false);
});
