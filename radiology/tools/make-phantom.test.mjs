import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unpackVolume } from './pack-volume.mjs';

const script = fileURLToPath(new URL('./make-phantom.mjs', import.meta.url));
const committed = fileURLToPath(new URL('../viewer/test-fixtures/cases/', import.meta.url));
const make = (out, ...args) => spawnSync(process.execPath, [script, '--out', out, ...args], { encoding: 'utf8' });
// Unequal spacing so a renderer that mixes up axes measures the wrong size.
const SMALL_CT = ['--only', 'synthetic-ct', '--dims', '90,60,40', '--spacing', '4,6,5'];
const SMALL_MR = ['--only', 'synthetic-mr', '--dims', '40,48,18', '--spacing', '8,7,10'];

const files = dir => readdirSync(dir, { recursive: true }).filter(f => statSync(join(dir, f)).isFile()).sort();
const manifest = dir => JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
function volume(dir) {
  const meta = JSON.parse(readFileSync(join(dir, 'vol.json'), 'utf8'));
  const bytes = new Uint8Array(unpackVolume(meta, f => readFileSync(join(dir, f))));
  return { meta, data: meta.dtype === 'int16' ? new Int16Array(bytes.buffer) : bytes };
}

const runs = [];
before(() => {
  for (let n = 0; n < 2; n++) {
    const dir = mkdtempSync(join(tmpdir(), 'make-phantom-'));
    runs.push(dir);
    for (const args of [SMALL_CT, SMALL_MR]) {
      const r = make(dir, ...args);
      assert.equal(r.status, 0, r.stderr);
    }
  }
});
after(() => runs.forEach(dir => rmSync(dir, { recursive: true, force: true })));

test('two runs write identical bytes and --only keeps the cases already listed', () => {
  const [a, b] = runs;
  assert.deepEqual(files(a), files(b));
  for (const f of files(a)) assert.ok(readFileSync(join(a, f)).equals(readFileSync(join(b, f))), `${f} differs between runs`);
  assert.deepEqual(manifest(a).map(c => c.id), ['synthetic-ct', 'synthetic-mr']);
});

test('label centroids match the label volume and put each shape on the side LPS says', () => {
  const ct = manifest(runs[0])[0];
  const { meta, data } = volume(join(runs[0], ct.labels.url));
  const [nx, ny] = meta.dims;
  const sums = {};
  data.forEach((label, p) => {
    if (!label) return;
    const s = (sums[label] ??= [0, 0, 0, 0]);
    s[0] += p % nx; s[1] += Math.floor(p / nx) % ny; s[2] += Math.floor(p / nx / ny); s[3]++;
  });
  const fromVolume = Object.fromEntries(Object.entries(sums).map(([id, [x, y, z, n]]) => [id, [x, y, z].map(v => Math.round(v / n * 10) / 10)]));
  assert.deepEqual(ct.labels.centroids, fromVolume);
  assert.deepEqual(Object.keys(ct.labels.centroids), ['1', '2', '3', '4', '5', '6', '7', '8']);
  const c = ct.labels.centroids;
  assert.ok(c[4][0] > c[3][0], "the patient's left cavity lies at higher x than the right one");
  assert.ok(c[6][1] < c[2][1], 'the sphere lies anterior to the rod');
  assert.ok(c[7][2] > c[5][2], 'the cube lies superior to the block');
});

test('the cube is 30 mm across x and the sphere 24 mm across y, within one voxel', () => {
  const ct = manifest(runs[0])[0];
  const { meta, data } = volume(join(runs[0], ct.labels.url));
  const [nx, ny] = meta.dims;
  const [sx, sy] = meta.spacing;
  const at = (i, j, k) => data[i + nx * (j + ny * k)];
  const [cubeJ, cubeK] = ct.labels.centroids[7].slice(1).map(Math.round);
  const [sphereI, , sphereK] = ct.labels.centroids[6].map(Math.round);
  const cube = Array.from({ length: nx }, (_, i) => at(i, cubeJ, cubeK)).filter(v => v === 7).length * sx;
  const sphere = Array.from({ length: ny }, (_, j) => at(sphereI, j, sphereK)).filter(v => v === 6).length * sy;
  assert.ok(Math.abs(cube - 30) <= sx, `cube is ${cube} mm across`);
  assert.ok(Math.abs(sphere - 24) <= sy, `sphere is ${sphere} mm across`);
});

for (const [name, dir] of [['the committed fixtures', committed], ['a small run', null]]) {
  test(`${name}: every volume exists on one grid per case and every finding lands inside it`, () => {
    const root = dir ?? runs[0];
    for (const c of manifest(root)) {
      const grids = [...c.series.map(s => s.url), c.labels.url].map(url => {
        assert.match(url, /\/$/);
        const { meta } = volume(join(root, url));
        return { dims: meta.dims, spacing: meta.spacing };
      });
      grids.forEach(g => assert.deepEqual(g, grids[0], `${c.id} shares one voxel grid`));
      const [nx, ny, nz] = grids[0].dims;
      for (const f of c.findings) {
        const n = { axial: nz, coronal: ny, sagittal: nx }[f.plane];
        assert.ok(Number.isInteger(f.index) && f.index >= 0 && f.index < n, `${c.id}/${f.id} index ${f.index} of ${n}`);
        assert.ok(f.at.every(v => v > 0 && v < 1), `${c.id}/${f.id} at ${f.at}`);
      }
    }
  });
}

test('the committed fixtures hold three cases in under 2 MB and empty.json is an empty list', () => {
  const total = files(committed).reduce((n, f) => n + statSync(join(committed, f)).size, 0);
  assert.ok(total < 2 * 1024 * 1024, `fixtures are ${total} bytes`);
  assert.deepEqual(manifest(committed).map(c => c.id), ['synthetic-ct', 'synthetic-ct-thick', 'synthetic-mr']);
  assert.deepEqual(JSON.parse(readFileSync(join(committed, 'empty.json'), 'utf8')), []);
});

test('make-phantom refuses a field of view smaller than the phantom and writes nothing', t => {
  const dir = mkdtempSync(join(tmpdir(), 'make-phantom-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const small = make(dir, '--only', 'synthetic-ct', '--dims', '20,20,10');
  assert.equal(small.status, 1);
  assert.match(small.stderr, /synthetic-ct: the field of view 70 x 70 x 40 mm is smaller than the phantom/);
  const noOnly = make(dir, '--dims', '20,20,10');
  assert.equal(noOnly.status, 1);
  assert.match(noOnly.stderr, /--dims and --spacing need --only/);
  assert.equal(existsSync(join(dir, 'manifest.json')), false);
  assert.deepEqual(readdirSync(dir), []);
});
