import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { packVolume, unpackVolume, writeVolume } from './pack-volume.mjs';

const script = fileURLToPath(new URL('./pack-volume.mjs', import.meta.url));
const bytes = n => Uint8Array.from({ length: n }, (_, i) => (i * 37 + (i >> 8)) & 255);
const roundTrip = ({ meta, files }) => unpackVolume(meta, name => files.find(f => f.name === name).bytes);

test('int16 round trip with a short last chunk and the exact vol.json shape', () => {
  const raw = bytes(3 * 4 * 5 * 2);
  const packed = packVolume(raw, { dims: [3, 4, 5], spacing: [0.5, 0.5, 2], dtype: 'int16', chunkSlices: 2 });
  assert.deepEqual(packed.meta, {
    dtype: 'int16', dims: [3, 4, 5], spacing: [0.5, 0.5, 2], chunkSlices: 2,
    chunks: [{ file: 'c0000.gz', z0: 0, z1: 2 }, { file: 'c0001.gz', z0: 2, z1: 4 }, { file: 'c0002.gz', z0: 4, z1: 5 }],
  });
  assert.deepEqual(packed.files.map(f => f.name), ['c0000.gz', 'c0001.gz', 'c0002.gz']);
  assert.deepEqual(gunzipSync(packed.files[2].bytes), Buffer.from(raw.subarray(4 * 24)), 'last chunk holds only slice 4');
  assert.deepEqual(roundTrip(packed), Buffer.from(raw));
  assert.deepEqual(packVolume(raw, { dims: [3, 4, 5], spacing: [0.5, 0.5, 2], dtype: 'int16', chunkSlices: 2 }).files, packed.files, 'same input, same bytes');
});

test('uint8 round trip with the default chunk size', () => {
  const raw = bytes(7 * 6 * 20);
  const packed = packVolume(raw, { dims: [7, 6, 20], spacing: [1, 1, 1], dtype: 'uint8' });
  assert.deepEqual(packed.meta.chunks, [{ file: 'c0000.gz', z0: 0, z1: 16 }, { file: 'c0001.gz', z0: 16, z1: 20 }]);
  assert.deepEqual(roundTrip(packed), Buffer.from(raw));
});

test('chunks cover 0..nz with no gap or overlap and each holds its slices', () => {
  for (const [nz, chunkSlices] of [[1, 16], [16, 16], [17, 16], [33, 8], [5, 1], [9, 4]]) {
    const { meta, files } = packVolume(bytes(2 * 3 * nz), { dims: [2, 3, nz], spacing: [1, 1, 1], dtype: 'uint8', chunkSlices });
    assert.equal(meta.chunks.length, Math.ceil(nz / chunkSlices));
    let next = 0;
    meta.chunks.forEach((c, i) => {
      assert.equal(c.z0, next, `chunk ${i} starts where the last ended (nz ${nz})`);
      assert.ok(c.z1 > c.z0 && c.z1 - c.z0 <= chunkSlices);
      assert.equal(gunzipSync(files[i].bytes).length, (c.z1 - c.z0) * 6);
      next = c.z1;
    });
    assert.equal(next, nz);
  }
});

test('packVolume refuses bad input with a clear message', () => {
  const ok = { dims: [2, 2, 2], spacing: [1, 1, 1], dtype: 'uint8' };
  const raw = bytes(8);
  assert.throws(() => packVolume(bytes(7), ok), /raw is 7 bytes but 2x2x2 uint8 needs 8/);
  assert.throws(() => packVolume(bytes(8), { ...ok, dtype: 'int16' }), /needs 16/);
  assert.throws(() => packVolume(new Int16Array(8), ok), /Uint8Array or Buffer/);
  for (const dims of [[2, 2], [0, 2, 2], [2.5, 2, 2], '2,2,2']) assert.throws(() => packVolume(raw, { ...ok, dims }), /dims must be three positive integers/);
  for (const spacing of [[1, 1, 0], [1, 1, NaN], [1, -1, 1], [1, 1]]) assert.throws(() => packVolume(raw, { ...ok, spacing }), /spacing must be three positive numbers/);
  for (const dtype of ['float32', 'toString', undefined]) assert.throws(() => packVolume(raw, { ...ok, dtype }), /dtype must be int16 or uint8/);
  for (const chunkSlices of [0, 1.5, -2, NaN]) assert.throws(() => packVolume(raw, { ...ok, chunkSlices }), /chunkSlices must be a positive integer/);
});

test('writeVolume writes vol.json and chunks and drops chunks a rerun no longer needs', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'pack-volume-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const raw = bytes(4 * 4 * 5);
  const out = join(dir, 'a', 'b');
  await writeVolume(out, raw, { dims: [4, 4, 5], spacing: [1, 1, 1], dtype: 'uint8', chunkSlices: 2 });
  assert.deepEqual(readdirSync(out).sort(), ['c0000.gz', 'c0001.gz', 'c0002.gz', 'vol.json']);
  const text = readFileSync(join(out, 'vol.json'), 'utf8');
  assert.ok(text.endsWith('}\n'));
  assert.deepEqual(unpackVolume(JSON.parse(text), f => readFileSync(join(out, f))), Buffer.from(raw));
  await writeVolume(out, raw, { dims: [4, 4, 5], spacing: [1, 1, 1], dtype: 'uint8' });
  assert.deepEqual(readdirSync(out).sort(), ['c0000.gz', 'vol.json']);
});

test('the CLI packs from --meta or from --dims, --spacing and --dtype and fails clearly', t => {
  const dir = mkdtempSync(join(tmpdir(), 'pack-volume-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const raw = bytes(2 * 3 * 4 * 2);
  writeFileSync(join(dir, 'v.raw'), raw);
  writeFileSync(join(dir, 'v.json'), JSON.stringify({ dtype: 'int16', dims: [2, 3, 4], spacing: [0.7, 0.7, 3], centroids: {} }));
  const run = args => spawnSync(process.execPath, [script, join(dir, 'v.raw'), ...args], { encoding: 'utf8' });

  const fromMeta = run(['--out', join(dir, 'm'), '--meta', join(dir, 'v.json'), '--chunk-slices', '3']);
  assert.equal(fromMeta.status, 0, fromMeta.stderr);
  assert.match(fromMeta.stdout, /^Wrote 2 chunks, \d+ bytes, and vol\.json to /);
  const meta = JSON.parse(readFileSync(join(dir, 'm', 'vol.json'), 'utf8'));
  assert.deepEqual({ ...meta, chunks: meta.chunks.length }, { dtype: 'int16', dims: [2, 3, 4], spacing: [0.7, 0.7, 3], chunkSlices: 3, chunks: 2 });

  const fromFlags = run(['--out', join(dir, 'f'), '--dims', '2,3,4', '--spacing', '0.7,0.7,3', '--dtype', 'int16']);
  assert.equal(fromFlags.status, 0, fromFlags.stderr);
  assert.deepEqual(unpackVolume(JSON.parse(readFileSync(join(dir, 'f', 'vol.json'), 'utf8')), f => readFileSync(join(dir, 'f', f))), Buffer.from(raw));

  const wrong = run(['--out', join(dir, 'w'), '--dims', '2,3,5', '--spacing', '1,1,1', '--dtype', 'int16']);
  assert.equal(wrong.status, 1);
  assert.match(wrong.stderr, /raw is 48 bytes but 2x3x5 int16 needs 60/);
  const both = run(['--out', join(dir, 'w'), '--meta', join(dir, 'v.json'), '--dtype', 'uint8']);
  assert.equal(both.status, 1);
  assert.match(both.stderr, /either --meta or/);
});
