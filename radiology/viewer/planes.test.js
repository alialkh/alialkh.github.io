import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANES, planeInfo, extractSlice, voxelAt, imagePoint, findingCursor, indexToPosition, positionToIndex, cursorIndex, withIndex } from './planes.js';

// Every voxel value encodes its own coordinates: x + 10 y + 100 z. Dims differ on each axis so a swapped axis shows.
const DIMS = [4, 3, 5];
const SPACING = [1, 2, 3];
const tiny = () => {
  const data = new Int16Array(DIMS[0] * DIMS[1] * DIMS[2]);
  for (let z = 0; z < 5; z++) for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) data[x + 4 * (y + 3 * z)] = x + 10 * y + 100 * z;
  return { data, dims: DIMS, spacing: SPACING, dtype: 'int16' };
};
const rows = (slice, w) => Array.from({ length: slice.length / w }, (_, j) => Array.from(slice.subarray(j * w, (j + 1) * w)));

test('axial: screen x is voxel x, screen y is voxel y, so right is on the left of the image and anterior on top', () => {
  assert.deepEqual(rows(extractSlice(tiny(), 'axial', 1), 4), [
    [100, 101, 102, 103],
    [110, 111, 112, 113],
    [120, 121, 122, 123],
  ]);
});

test('coronal: screen x is voxel x, screen y runs from superior at the top', () => {
  assert.deepEqual(rows(extractSlice(tiny(), 'coronal', 2), 4), [
    [420, 421, 422, 423],
    [320, 321, 322, 323],
    [220, 221, 222, 223],
    [120, 121, 122, 123],
    [20, 21, 22, 23],
  ]);
});

test('sagittal: screen x is voxel y so anterior is on the left, superior at the top', () => {
  assert.deepEqual(rows(extractSlice(tiny(), 'sagittal', 3), 3), [
    [403, 413, 423],
    [303, 313, 323],
    [203, 213, 223],
    [103, 113, 123],
    [3, 13, 23],
  ]);
});

test('the letters on each plane are R L A P S I from the voxel order, never typed per case', () => {
  const letters = plane => planeInfo(plane, DIMS, SPACING).letters;
  assert.deepEqual(letters('axial'), { left: 'R', right: 'L', top: 'A', bottom: 'P' });
  assert.deepEqual(letters('coronal'), { left: 'R', right: 'L', top: 'S', bottom: 'I' });
  assert.deepEqual(letters('sagittal'), { left: 'A', right: 'P', top: 'S', bottom: 'I' });
});

// A lone bright voxel at the end of an axis must show up on the screen edge whose letter names that end.
test('each letter names the edge where the voxels at that end of the patient really land', () => {
  const END = { R: [0, 0], L: [0, DIMS[0] - 1], A: [1, 0], P: [1, DIMS[1] - 1], I: [2, 0], S: [2, DIMS[2] - 1] };
  for (const plane of PLANES) {
    const info = planeInfo(plane, DIMS, SPACING);
    for (const [edge, letter] of Object.entries(info.letters)) {
      const [axis, at] = END[letter];
      for (let index = 0; index < info.count; index++) {
        const slice = extractSlice(tiny(), plane, index);
        // Voxel coordinate along this axis is recoverable from the encoded value.
        const coord = v => [v % 10, Math.floor(v / 10) % 10, Math.floor(v / 100)][axis];
        for (let j = 0; j < info.height; j++) {
          for (let i = 0; i < info.width; i++) {
            const onEdge = { left: i === 0, right: i === info.width - 1, top: j === 0, bottom: j === info.height - 1 }[edge];
            if (onEdge) assert.equal(coord(slice[j * info.width + i]), at, `${plane} ${edge} edge is ${letter}`);
          }
        }
      }
    }
  }
});

test('a plane image is as wide in millimetres as its voxels and spacing say, so the aspect comes from spacing', () => {
  const info = plane => planeInfo(plane, DIMS, SPACING);
  assert.deepEqual([info('axial').width, info('axial').height, info('axial').widthMm, info('axial').heightMm], [4, 3, 4, 6]);
  assert.deepEqual([info('coronal').width, info('coronal').height, info('coronal').widthMm, info('coronal').heightMm], [4, 5, 4, 15]);
  assert.deepEqual([info('sagittal').width, info('sagittal').height, info('sagittal').widthMm, info('sagittal').heightMm], [3, 5, 6, 15]);
  assert.deepEqual(PLANES.map(p => info(p).count), [5, 3, 4]);
});

test('voxelAt and imagePoint agree with extractSlice for every voxel of every plane', () => {
  for (const plane of PLANES) {
    const info = planeInfo(plane, DIMS, SPACING);
    for (let index = 0; index < info.count; index++) {
      const slice = extractSlice(tiny(), plane, index);
      for (let j = 0; j < info.height; j++) {
        for (let i = 0; i < info.width; i++) {
          const [x, y, z] = voxelAt(plane, index, i + 0.5, j + 0.5, DIMS);
          assert.equal(slice[j * info.width + i], x + 10 * y + 100 * z, `${plane} ${index} ${i},${j}`);
          assert.deepEqual(imagePoint(plane, [x, y, z], DIMS), [i + 0.5, j + 0.5]);
        }
      }
    }
  }
});

test('voxelAt is null outside the image and floors inside a voxel', () => {
  assert.equal(voxelAt('axial', 0, -0.01, 1, DIMS), null);
  assert.equal(voxelAt('axial', 0, 4, 1, DIMS), null);
  assert.equal(voxelAt('axial', 0, 1, 3, DIMS), null);
  assert.deepEqual(voxelAt('axial', 2, 3.99, 2.99, DIMS), [3, 2, 2]);
});

test('a finding lands on its voxel, and a fraction of exactly 1 stays on the last voxel', () => {
  assert.deepEqual(findingCursor({ plane: 'coronal', index: 2, at: [0.5, 0] }, DIMS), [2, 2, 4]);
  assert.deepEqual(findingCursor({ plane: 'coronal', index: 2, at: [1, 1] }, DIMS), [3, 2, 0]);
  assert.deepEqual(findingCursor({ plane: 'sagittal', index: 1, at: [0, 0.5] }, DIMS), [1, 0, 2]);
});

test('the axial position counts from the head down and the others count with the voxel index', () => {
  assert.equal(indexToPosition('axial', 4, 5), 0);
  assert.equal(indexToPosition('axial', 0, 5), 4);
  assert.equal(positionToIndex('axial', indexToPosition('axial', 1, 5), 5), 1);
  assert.equal(indexToPosition('coronal', 2, 3), 2);
  assert.equal(indexToPosition('sagittal', 0, 4), 0);
});

test('the cursor index of a plane is the voxel along its scroll axis', () => {
  const cursor = [1, 2, 3];
  assert.deepEqual(PLANES.map(p => cursorIndex(p, cursor)), [3, 2, 1]);
  assert.deepEqual(withIndex(cursor, 'coronal', 0), [1, 0, 3]);
  assert.deepEqual(cursor, [1, 2, 3]);
});

test('extractSlice reuses a right-sized output and keeps the volume dtype', () => {
  const vol = tiny();
  const out = new Int16Array(12);
  assert.equal(extractSlice(vol, 'axial', 0, out), out);
  assert.notEqual(extractSlice(vol, 'axial', 0, new Int16Array(5)).length, 5);
  const labels = { data: Uint8Array.from(vol.data, v => v % 200), dims: DIMS, spacing: SPACING };
  assert.ok(extractSlice(labels, 'sagittal', 0) instanceof Uint8Array);
});
