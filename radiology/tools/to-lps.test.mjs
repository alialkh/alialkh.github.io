import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./to-lps.py', import.meta.url));
const python = ['python3', 'python'].find(cmd => spawnSync(cmd, ['-c', 'import SimpleITK, numpy']).status === 0);
const skip = !python && 'python with SimpleITK and numpy is not on PATH, to-lps.py is untested';

// Every input is built by SimpleITK itself, and each marker sits at the voxel whose physical point is furthest
// toward a patient direction, so the expectations rest on SimpleITK's geometry and not on to-lps.py.
const MAKE_INPUTS = String.raw`
import os, sys, numpy as np, SimpleITK as sitk
d = sys.argv[1]
RAS = (-1, 0, 0, 0, -1, 0, 0, 0, 1)
def vol(direction, dtype=np.int16):
    img = sitk.GetImageFromArray(np.zeros((6, 5, 4), dtype))
    img.SetSpacing((1, 2, 3)); img.SetDirection(direction); img.SetOrigin((10, -20, 30))
    return img
def corner(img, *toward):
    n = img.GetSize()
    cs = [(i, j, k) for i in (0, n[0] - 1) for j in (0, n[1] - 1) for k in (0, n[2] - 1)]
    return max(cs, key=lambda c: sum(t * p for t, p in zip(toward, img.TransformIndexToPhysicalPoint(c))))
def marked(direction):
    img = vol(direction)
    img[corner(img, 1, 1, 1)] = 100
    img[corner(img, 1, -1, -1)] = 50
    return img
sitk.WriteImage(marked(RAS), os.path.join(d, 'ras.nii.gz'))
sitk.WriteImage(marked((1, 0, 0, 0, -1, 0, 0, 0, 1)), os.path.join(d, 'las.nrrd'))
sitk.WriteImage(marked((0, 0, -1, -1, 0, 0, 0, 1, 0)), os.path.join(d, 'perm.mha'))
t = np.radians(10)
sitk.WriteImage(marked((np.cos(t), -np.sin(t), 0, np.sin(t), np.cos(t), 0, 0, 0, 1)), os.path.join(d, 'tilt.nrrd'))
a = np.array([0, 7, 2])[np.arange(10) % 3][None, None, :] + 10 * np.arange(4)[:, None, None] + np.zeros((4, 9, 10))
for name, t in (('grid-img.nrrd', np.int16), ('grid-lab.nrrd', np.uint8)):
    img = sitk.GetImageFromArray(a.astype(t)); img.SetSpacing((0.5, 0.5, 2)); sitk.WriteImage(img, os.path.join(d, name))
lab = vol(RAS, np.uint8)
for idx in ((0, 0, 0), (1, 0, 0), (0, 1, 0)): lab[idx] = 3
lab[2, 2, 2] = 9
sitk.WriteImage(lab, os.path.join(d, 'cent.nii.gz'))
c = np.zeros((2, 2, 3), np.float32); c[0, 0, :] = (40000, -40000, 1.6)
sitk.WriteImage(sitk.GetImageFromArray(c), os.path.join(d, 'clip.nrrd'))
os.makedirs(os.path.join(d, 'dicom'))
for uid in ('1.2.826.0.1.3680043.2.1125.1', '1.2.826.0.1.3680043.2.1125.2'):
    img = marked(RAS)
    for k in range(img.GetSize()[2]):
        s = img[:, :, k]
        ipp = '\\'.join(map(str, img.TransformIndexToPhysicalPoint((0, 0, k))))
        for tag, v in (('0008|0060', 'MR'), ('0020|000d', '1.2.826.0.1.3680043.2.1125.9'), ('0020|000e', uid),
                       ('0020|0037', '-1\\0\\0\\0\\-1\\0'), ('0020|0032', ipp), ('0020|0013', str(k + 1))):
            s.SetMetaData(tag, v)
        w = sitk.ImageFileWriter(); w.KeepOriginalImageUIDOn()
        w.SetFileName(os.path.join(d, 'dicom', uid[-1] + '-' + str(k) + '.dcm')); w.Execute(s)
`;

let dir;
before(() => {
  if (skip) return;
  dir = mkdtempSync(join(tmpdir(), 'to-lps-'));
  const made = spawnSync(python, ['-c', MAKE_INPUTS, dir], { encoding: 'utf8' });
  assert.equal(made.status, 0, made.stderr);
});
after(() => dir && rmSync(dir, { recursive: true, force: true }));
const run = (input, ...args) => spawnSync(python, [script, join(dir, input), '--out', join(dir, 'out', input), ...args], { encoding: 'utf8' });

function load(input) {
  const meta = JSON.parse(readFileSync(join(dir, 'out', `${input}.json`), 'utf8'));
  const bytes = new Uint8Array(readFileSync(join(dir, 'out', `${input}.raw`)));
  const data = meta.dtype === 'int16' ? new Int16Array(bytes.buffer) : bytes;
  const [nx, ny] = meta.dims;
  const marks = [];
  data.forEach((v, n) => v && marks.push([n % nx, Math.floor(n / nx) % ny, Math.floor(n / nx / ny), v]));
  return { meta, data, marks };
}

test('to-lps puts patient left, posterior and superior at high x, y and z for RAS, LAS and permuted inputs', { skip }, () => {
  for (const [input, dims, spacing] of [
    ['ras.nii.gz', [4, 5, 6], [1, 2, 3]],
    ['las.nrrd', [4, 5, 6], [1, 2, 3]],
    ['perm.mha', [6, 4, 5], [3, 1, 2]],
  ]) {
    const r = run(input);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, '', 'no warning when nothing is clipped');
    const { meta, marks } = load(input);
    assert.deepEqual(meta, { dtype: 'int16', dims, spacing }, input);
    const [nx, ny, nz] = dims;
    assert.deepEqual(marks, [[nx - 1, 0, 0, 50], [nx - 1, ny - 1, nz - 1, 100]], `${input}: left-anterior-inferior then left-posterior-superior`);
  }
  const tilted = run('tilt.nrrd');
  assert.equal(tilted.status, 0, tilted.stderr);
  assert.match(tilted.stderr, /oblique by up to 10\.0 degrees and was snapped to the nearest axes/);
});

test('to-lps reads one series from a DICOM folder and refuses to guess between several', { skip }, () => {
  const guess = run('dicom');
  assert.equal(guess.status, 1);
  assert.match(guess.stderr, /holds 2 DICOM series\. Pick one with --series-uid/);
  assert.match(run('dicom', '--series-uid', '9.9').stderr, /series 9\.9 is not in/);
  const r = run('dicom', '--series-uid', '1.2.826.0.1.3680043.2.1125.2');
  assert.equal(r.status, 0, r.stderr);
  const { meta, marks } = load('dicom');
  assert.deepEqual(meta, { dtype: 'int16', dims: [4, 5, 6], spacing: [1, 2, 3] });
  assert.deepEqual(marks, [[3, 0, 0, 50], [3, 4, 5, 100]]);
});

test('an image and its labels end on one grid after --max-size and --z-range, area average versus nearest', { skip }, () => {
  for (const [input, extra] of [['grid-img.nrrd', []], ['grid-lab.nrrd', ['--labels']]]) {
    const r = run(input, '--max-size', '4', '--z-range', '1:3', ...extra);
    assert.equal(r.status, 0, r.stderr);
  }
  const img = load('grid-img.nrrd');
  const lab = load('grid-lab.nrrd');
  assert.deepEqual([img.meta.dims, img.meta.spacing], [[3, 3, 2], [1.5, 1.5, 2]]);
  assert.deepEqual([lab.meta.dims, lab.meta.spacing], [img.meta.dims, img.meta.spacing]);
  assert.equal(lab.meta.dtype, 'uint8');
  // Input columns repeat 0, 7, 2 and each slice adds 10, so a 3-wide block averages to 3 and its centre is 7.
  assert.deepEqual([...img.data], [...Array(9).fill(13), ...Array(9).fill(23)]);
  assert.deepEqual([...lab.data], [...Array(9).fill(17), ...Array(9).fill(27)]);
  assert.deepEqual(lab.meta.centroids, { 17: [1, 1, 0], 27: [1, 1, 1] });
});

test('label centroids are voxel coordinates in the output grid with background skipped', { skip }, () => {
  const r = run('cent.nii.gz', '--labels');
  assert.equal(r.status, 0, r.stderr);
  const { meta } = load('cent.nii.gz');
  // RAS input: output x is 3 - i and y is 4 - j, so (0,0,0), (1,0,0), (0,1,0) become (3,4,0), (2,4,0), (3,3,0).
  assert.deepEqual(meta, { dtype: 'uint8', dims: [4, 5, 6], spacing: [1, 2, 3], centroids: { 3: [2.7, 3.7, 0], 9: [1, 2, 2] } });
});

test('values are rounded, clipped to int16 with a counted warning, and bad input exits nonzero', { skip }, () => {
  const r = run('clip.nrrd');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /warning, 2 voxels were outside the int16 range/);
  assert.deepEqual([...load('clip.nrrd').data.slice(0, 4)], [32767, -32768, 2, 0]);
  for (const [input, args, message] of [
    ['missing.nii', [], /no such file or folder/],
    ['clip.nrrd', ['--z-range', '0:9'], /--z-range 0:9 is outside 0:2/],
    ['clip.nrrd', ['--z-range', 'x'], /must look like a:b/],
    ['clip.nrrd', ['--labels'], /label values must be whole numbers/],
    ['las.nrrd', ['--max-size', '0'], /--max-size must be at least 1/],
  ]) {
    const bad = run(input, ...args);
    assert.equal(bad.status, 1, `${input} ${args.join(' ')}`);
    assert.match(bad.stderr, message);
  }
});
