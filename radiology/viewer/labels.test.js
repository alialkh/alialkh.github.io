import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelPalette, labelAt, structuresPresent, centroidCursor, cssColor } from './labels.js';
import { createVolume } from './volume.js';
import { PLANES, voxelAt, cursorIndex, extractSlice, planeInfo } from './planes.js';

const labels = {
  names: { 2: 'Rod', 10: 'Block', 1: 'Body' },
  centroids: { 1: [4, 4, 2], 2: [4.4, 9.6, 2], 10: [1.2, 2.5, 3.5] },
};

test('structures come back in numeric id order, so 10 follows 2', () => {
  assert.deepEqual(structuresPresent(labels).map(s => [s.id, s.name]), [[1, 'Body'], [2, 'Rod'], [10, 'Block']]);
  assert.deepEqual(structuresPresent(labels)[1].centroid, [4.4, 9.6, 2]);
});

test('a centroid becomes the nearest whole voxel and stays inside the volume', () => {
  assert.deepEqual(centroidCursor([4.4, 9.6, 2], [10, 12, 4]), [4, 10, 2]);
  assert.deepEqual(centroidCursor([-0.4, 11.6, 3.6], [10, 12, 4]), [0, 11, 3]);
  assert.deepEqual(centroidCursor([12, 3, 3.5], [10, 12, 4]), [9, 3, 3]);
});

test('jumping to a centroid puts every plane on that structure, whichever plane is showing', () => {
  const dims = [10, 12, 4];
  const cursor = centroidCursor([4.4, 9.6, 2], dims);
  assert.deepEqual(PLANES.map(p => cursorIndex(p, cursor)), [2, 10, 4]);
  // The voxel the cursor names is the one drawn at the matching pixel of an axial slice.
  assert.deepEqual(voxelAt('axial', cursor[2], cursor[0] + 0.5, cursor[1] + 0.5, dims), cursor);
});

test('the label under a point is read from the label volume, 0 outside any structure', () => {
  const vol = createVolume({ dtype: 'uint8', dims: [3, 2, 2], spacing: [1, 1, 1] });
  vol.data[1 + 3 * (1 + 2 * 1)] = 7;
  assert.equal(labelAt(vol, [1, 1, 1]), 7);
  assert.equal(labelAt(vol, [0, 0, 0]), 0);
});

test('the palette leaves id 0 clear and gives each of the first ids its own opaque colour', () => {
  const palette = labelPalette();
  assert.equal(palette[0], 0);
  const colours = new Set();
  for (let id = 1; id <= 12; id++) {
    assert.equal(palette[id] >>> 24, 0xff);
    colours.add(palette[id]);
  }
  assert.equal(colours.size, 12);
  assert.notEqual(cssColor(1), cssColor(2));
});

test('the structure under any pixel of any plane is the label of the voxel drawn there', () => {
  const dims = [4, 3, 5];
  const vol = createVolume({ dtype: 'uint8', dims, spacing: [1, 1, 1] });
  // Every voxel gets a distinct id, so a wrong flip or axis swap reads back the wrong one.
  for (let i = 0; i < vol.data.length; i++) vol.data[i] = i + 1;
  for (const plane of PLANES) {
    const info = planeInfo(plane, dims, [1, 1, 1]);
    for (let index = 0; index < info.count; index++) {
      const slice = extractSlice(vol, plane, index);
      for (let j = 0; j < info.height; j++) {
        for (let i = 0; i < info.width; i++) assert.equal(labelAt(vol, voxelAt(plane, index, i + 0.5, j + 0.5, dims)), slice[j * info.width + i]);
      }
    }
  }
});
