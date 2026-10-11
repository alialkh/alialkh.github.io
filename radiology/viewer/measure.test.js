import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceMm, formatMm, niceScale } from './measure.js';
import { planeInfo, PLANES } from './planes.js';

test('a horizontal line is scaled by the voxel width and a vertical one by the voxel height', () => {
  assert.equal(distanceMm([10, 5], [20, 5], 0.5, 3), 5);
  assert.equal(distanceMm([10, 5], [10, 9], 0.5, 3), 12);
});

test('a diagonal uses both spacings, so an anisotropic plane is not measured in pixels', () => {
  // 6 voxels by 4 voxels at 0.5 by 2 mm is 3 mm by 8 mm.
  assert.ok(Math.abs(distanceMm([0, 0], [6, 4], 0.5, 2) - Math.hypot(3, 8)) < 1e-12);
});

test('measuring is symmetric and zero between equal points', () => {
  assert.equal(distanceMm([3, 4], [3, 4], 2, 5), 0);
  assert.equal(distanceMm([1, 1], [4, 5], 1, 1), distanceMm([4, 5], [1, 1], 1, 1));
});

test('millimetres read to a tenth below 100 and whole above', () => {
  assert.equal(formatMm(0), '0.0 mm');
  assert.equal(formatMm(34.26), '34.3 mm');
  assert.equal(formatMm(99.94), '99.9 mm');
  assert.equal(formatMm(123.6), '124 mm');
});

test('the scale bar picks the longest 1, 2 or 5 step that fits', () => {
  assert.deepEqual(niceScale(2), { mm: 50, px: 100 });
  assert.deepEqual(niceScale(1), { mm: 100, px: 100 });
  assert.deepEqual(niceScale(0.5), { mm: 200, px: 100 });
  assert.deepEqual(niceScale(0.3), { mm: 200, px: 60 });
  assert.deepEqual(niceScale(14), { mm: 10, px: 140 });
  assert.deepEqual(niceScale(70), { mm: 2, px: 140 });
  assert.equal(niceScale(10, 55).mm, 5);
});

test('the scale bar handles a fraction of a millimetre and a missing scale', () => {
  assert.deepEqual(niceScale(1000), { mm: 0.1, px: 100 });
  assert.deepEqual(niceScale(0), { mm: 0, px: 0 });
});

test('ten voxels across each plane measure with the two spacings of that plane', () => {
  // x 0.5 mm, y 2 mm, z 5 mm. Screen x is x, y or y, and screen y is y or z.
  const spacing = [0.5, 2, 5];
  const mm = (plane, a, b) => { const { du, dv } = planeInfo(plane, [20, 20, 20], spacing); return distanceMm(a, b, du, dv); };
  assert.deepEqual(PLANES.map(p => mm(p, [3, 4], [13, 4])), [5, 5, 20]);
  assert.deepEqual(PLANES.map(p => mm(p, [3, 4], [3, 14])), [20, 50, 50]);
});
