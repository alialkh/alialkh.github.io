import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { polygonAnchor, spreadPoints } from './polygon.js';

// A C-shaped tube. Its centroid is in the gap, outside the shape.
const C = [[0, 0], [10, 0], [10, 2], [2, 2], [2, 8], [10, 8], [10, 10], [0, 10]];
const inside = (poly, [x, y]) => {
  let on = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) on = !on;
  }
  return on;
};

test('the anchor of a C shape is on the shape, not at its centroid', () => {
  const centroid = [C.reduce((s, p) => s + p[0], 0) / C.length, C.reduce((s, p) => s + p[1], 0) / C.length];
  assert.equal(inside(C, centroid), false);
  assert.equal(inside(C, polygonAnchor(C)), true);
});

test('the anchor of a square is near its middle', () => {
  const [x, y] = polygonAnchor([[0, 0], [1, 0], [1, 1], [0, 1]]);
  assert.ok(Math.abs(x - 0.5) < 0.05 && Math.abs(y - 0.5) < 0.05, `${x}, ${y}`);
});

test('every region of the shipped cases has an anchor on its own outline', () => {
  const cases = JSON.parse(readFileSync(new URL('../data/cath/manifest.json', import.meta.url), 'utf8'));
  let count = 0;
  for (const r of cases.flatMap(c => c.regions ?? [])) {
    assert.equal(inside(r.polygon, polygonAnchor(r.polygon)), true, r.segment);
    count++;
  }
  assert.ok(count >= 50);
});

const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('spreadPoints separates points that share a corner and leaves apart points alone', () => {
  const close = [[100, 100], [104, 102], [100, 100], [300, 300]];
  const out = spreadPoints(close, 22, 512, 512);
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) assert.ok(gap(out[i], out[j]) >= 21.9, `${i} and ${j}`);
  assert.deepEqual(out[3], [300, 300]);
  assert.deepEqual(spreadPoints([[50, 50], [200, 200]], 22, 512, 512), [[50, 50], [200, 200]]);
});

test('spreadPoints keeps points inside the frame and is repeatable', () => {
  const edge = [[2, 2], [4, 3], [6, 2]];
  const out = spreadPoints(edge, 22, 100, 100);
  for (const [x, y] of out) assert.ok(x >= 11 && y >= 11 && x <= 89 && y <= 89, `${x}, ${y}`);
  assert.deepEqual(spreadPoints(edge, 22, 100, 100), out);
});

test('the anchors of every shipped still can be spread to a badge each', () => {
  const cases = JSON.parse(readFileSync(new URL('../data/cath/manifest.json', import.meta.url), 'utf8')).filter(c => c.regions?.length);
  for (const c of cases) {
    const out = spreadPoints(c.regions.map(r => polygonAnchor(r.polygon).map(v => v * 360)), 22, 360, 360);
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) assert.ok(gap(out[i], out[j]) >= 21.5, `${c.id} ${i} and ${j}`);
  }
});
