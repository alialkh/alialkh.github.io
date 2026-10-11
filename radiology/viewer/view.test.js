import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitScale, zoomAt, clampPan, pinch, HOME, MAX_ZOOM } from './view.js';

test('the fit scale is limited by the tighter side, from millimetres and not voxels', () => {
  assert.equal(fitScale(400, 300, 100, 300), 1);
  assert.equal(fitScale(400, 300, 400, 100), 1);
  assert.equal(fitScale(200, 900, 100, 100), 2);
  assert.equal(fitScale(0, 300, 100, 100), 0);
});

test('zooming about a point keeps the image point under it fixed', () => {
  const anchor = { x: 40, y: -30 };
  const before = { zoom: 2, panX: 15, panY: -8 };
  const after = zoomAt(before, 1.5, anchor);
  // The image point under the anchor, in unzoomed pixels from the image centre.
  const under = v => ({ x: (anchor.x - v.panX) / v.zoom, y: (anchor.y - v.panY) / v.zoom });
  assert.ok(Math.abs(under(after).x - under(before).x) < 1e-9);
  assert.ok(Math.abs(under(after).y - under(before).y) < 1e-9);
  assert.equal(after.zoom, 3);
});

test('zooming about the centre does not move the pan', () => {
  assert.deepEqual(zoomAt(HOME, 2, { x: 0, y: 0 }), { zoom: 2, panX: 0, panY: 0 });
});

test('zoom stops at the limits and does not drift the pan at them', () => {
  assert.equal(zoomAt(HOME, 0.1, { x: 5, y: 5 }).zoom, 1);
  assert.deepEqual(zoomAt(HOME, 0.1, { x: 5, y: 5 }), HOME);
  assert.equal(zoomAt({ zoom: MAX_ZOOM, panX: 0, panY: 0 }, 2, { x: 0, y: 0 }).zoom, MAX_ZOOM);
});

test('the pan cannot carry the image centre past half the image', () => {
  assert.deepEqual(clampPan({ zoom: 2, panX: 900, panY: -900 }, 400, 300), { zoom: 2, panX: 200, panY: -150 });
  assert.deepEqual(clampPan({ zoom: 2, panX: 10, panY: -10 }, 400, 300), { zoom: 2, panX: 10, panY: -10 });
});

test('a pinch zooms by the change in finger gap and pans by the midpoint move', () => {
  const r = pinch([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 10, y: 20 }, { x: 210, y: 20 }]);
  assert.deepEqual(r, { factor: 2, anchor: { x: 50, y: 0 }, dx: 60, dy: 20 });
  assert.equal(pinch([{ x: 5, y: 5 }, { x: 5, y: 5 }], [{ x: 0, y: 0 }, { x: 9, y: 9 }]).factor, 1);
});
