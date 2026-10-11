import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCursor, scrollCursor, seekCursor, crosshairShown, findingSlot } from './link.js';

const vp = (plane, series = 's', cursor = [1, 2, 3]) => ({ plane, series, cursor });

test('a linked cursor reaches every viewport and an unlinked one only its own', () => {
  const vps = [vp('axial'), vp('coronal'), vp('axial', 't2')];
  const next = [9, 9, 9];
  assert.deepEqual(applyCursor(vps, 1, next, true).map(v => v.cursor), [next, next, next]);
  const alone = applyCursor(vps, 1, next, false);
  assert.deepEqual(alone.map(v => v.cursor), [[1, 2, 3], next, [1, 2, 3]]);
  assert.equal(alone[0], vps[0], 'untouched viewports are the same objects, so they are not redrawn');
});

test('scrolling an axial viewport counts from the head down, so one step down lowers the voxel z', () => {
  assert.deepEqual(scrollCursor(vp('axial', 's', [4, 5, 7]), 1, 10), [4, 5, 6]);
  assert.deepEqual(scrollCursor(vp('axial', 's', [4, 5, 7]), -2, 10), [4, 5, 9]);
});

test('coronal and sagittal scroll with the voxel index along their own axis', () => {
  assert.deepEqual(scrollCursor(vp('coronal', 's', [4, 5, 7]), 1, 10), [4, 6, 7]);
  assert.deepEqual(scrollCursor(vp('sagittal', 's', [4, 5, 7]), -1, 10), [3, 5, 7]);
});

test('scrolling stops at the ends, and wraps only when asked', () => {
  assert.deepEqual(scrollCursor(vp('coronal', 's', [4, 9, 7]), 3, 10), [4, 9, 7]);
  assert.deepEqual(scrollCursor(vp('coronal', 's', [4, 9, 7]), 1, 10, true), [4, 0, 7]);
});

test('seek takes a reading position, clamps it, and Home and End reach the first and last slice', () => {
  assert.deepEqual(seekCursor(vp('axial', 's', [4, 5, 7]), 0, 10), [4, 5, 9], 'the first axial image is the most superior voxel');
  assert.deepEqual(seekCursor(vp('axial', 's', [4, 5, 7]), Infinity, 10), [4, 5, 0]);
  assert.deepEqual(seekCursor(vp('sagittal', 's', [4, 5, 7]), 3, 10), [3, 5, 7]);
  assert.deepEqual(seekCursor(vp('sagittal', 's', [4, 5, 7]), -5, 10), [0, 5, 7]);
});

test('the crosshair shows only while linked and another plane is on screen', () => {
  const planes = (...p) => p.map(x => vp(x));
  assert.equal(crosshairShown({ viewports: planes('axial', 'coronal'), link: true, maximized: null }, 0), true);
  assert.equal(crosshairShown({ viewports: planes('axial', 'coronal'), link: false, maximized: null }, 0), false);
  assert.equal(crosshairShown({ viewports: planes('axial', 'axial', 'axial', 'axial'), link: true, maximized: null }, 2), false);
  assert.equal(crosshairShown({ viewports: planes('axial', 'coronal'), link: true, maximized: 0 }, 0), false, 'a maximized viewport has nothing to cross with');
});

test('a finding opens in the viewport that already shows its plane and series, then one with its plane, then the active one', () => {
  const state = (viewports, active = 0, maximized = null) => ({ viewports, active, maximized });
  const f = { plane: 'coronal', series: 't2' };
  assert.equal(findingSlot(state([vp('axial', 't1'), vp('coronal', 't1'), vp('coronal', 't2')]), f), 2);
  assert.equal(findingSlot(state([vp('axial', 't1'), vp('coronal', 't1'), vp('sagittal', 't2')]), f), 1);
  assert.equal(findingSlot(state([vp('axial', 't1'), vp('axial', 't2')], 1), f), 1);
  assert.equal(findingSlot(state([vp('coronal', 't2'), vp('coronal', 't2')], 1), f), 1, 'the active viewport is tried first');
  assert.equal(findingSlot(state([vp('axial'), vp('coronal')], 0, 0), { plane: 'coronal' }), 0, 'a maximized viewport is the only one the reader sees');
  assert.equal(findingSlot(state([vp('axial', 'a'), vp('coronal', 'b')]), { plane: 'coronal' }), 1, 'no series named means any series will do');
});

test('a viewport that already holds the cursor is not replaced, so it is not redrawn', () => {
  const c = [1, 2, 3];
  const vps = [vp('axial', 's', c), vp('coronal', 's', c)];
  assert.equal(applyCursor(vps, 0, c, true)[1], vps[1]);
});

test('wrapping backwards from the first slice lands on the last', () => {
  assert.deepEqual(scrollCursor(vp('coronal', 's', [4, 0, 7]), -1, 10, true), [4, 9, 7]);
});
