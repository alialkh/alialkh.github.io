import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutLabels } from './label-layout.js';

// Chip text is 12px semibold, about 6.5px a character plus 16px of padding, and 22px tall.
const chip = name => ({ w: Math.ceil(name.length * 6.5 + 16), h: 22 });
// a4c-mitral-regurgitation-1, where the septum and left ventricle names collided.
const A4C_MR = [
  ['Left ventricle', 0.5, 0.33, 0.05], ['Interventricular septum', 0.41, 0.35, 0.025], ['Right ventricle', 0.35, 0.4, 0.04],
  ['Left atrium', 0.48, 0.6, 0.045], ['Right atrium', 0.33, 0.58, 0.04],
];
const MR_PINS = [[0.52, 0.5]];
const PLAX_NORMAL = [
  ['Right ventricle', 0.513, 0.192, 0.05], ['Interventricular septum', 0.481, 0.281, 0.035], ['Left ventricle', 0.409, 0.406, 0.055],
  ['Aortic root', 0.665, 0.333, 0.04], ['Left atrium', 0.625, 0.5, 0.05], ['Inferolateral wall', 0.385, 0.525, 0.035],
];

function scene(width, height, markers = A4C_MR, pins = MR_PINS) {
  return {
    width, height,
    markers: markers.map(([name, x, y, r]) => ({ x: x * width, y: y * height, r: r * width, ...chip(name) })),
    pins: pins.map(([x, y]) => ({ x: x * width, y: y * height })),
  };
}

// The chips that show as text, as rectangles in frame pixels.
function shown(s) {
  return layoutLabels(s).flatMap((spot, i) => {
    const m = s.markers[i];
    return spot.badge ? [] : [{ i, left: m.x + spot.x, top: m.y + spot.y, right: m.x + spot.x + m.w, bottom: m.y + spot.y + m.h }];
  });
}

const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const covers = (r, p) => p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom;

function assertClear(s) {
  const chips = shown(s);
  for (const a of chips) {
    for (const b of chips) if (a.i < b.i) assert.ok(!hit(a, b), `chips ${a.i} and ${b.i} overlap at ${s.width}x${s.height}`);
    s.markers.forEach((m, j) => assert.ok(j === a.i || !covers(a, m), `chip ${a.i} covers ring ${j} at ${s.width}x${s.height}`));
    s.pins.forEach((p, j) => assert.ok(!covers(a, p), `chip ${a.i} covers pin ${j} at ${s.width}x${s.height}`));
  }
  return chips;
}

test('crowded clips get no chip over another chip or a ring center, from phone to desktop size', () => {
  for (const [markers, pins] of [[A4C_MR, MR_PINS], [PLAX_NORMAL, []]]) {
    for (const w of [360, 646, 900]) assertClear(scene(w, Math.round(w * 0.74), markers, pins));
  }
  assert.equal(assertClear(scene(646, 478)).length, A4C_MR.length, 'every a4c-mr name shows as text at the clip size');
});

test('chips stay inside the frame, near every edge and with long names', () => {
  const edges = [
    ['Right ventricular outflow tract', 0.5, 0.03, 0.03], ['Left ventricular apex', 0.97, 0.5, 0.03],
    ['Inferolateral wall', 0.03, 0.5, 0.03], ['Anterolateral papillary muscle', 0.5, 0.97, 0.03], ['Liver', 0.97, 0.97, 0.03],
  ];
  for (const [w, h] of [[640, 480], [260, 200]]) {
    const s = scene(w, h, edges, []);
    const chips = assertClear(s);
    assert.ok(chips.length > 0, `some chips show at ${w}x${h}`);
    for (const c of chips) assert.ok(c.left >= 0 && c.top >= 0 && c.right <= w && c.bottom <= h, `chip ${c.i} leaves the ${w}x${h} frame`);
  }
});

test('a marker with no clear spot becomes a badge instead of overlapping text', () => {
  const s = scene(300, 222);
  const spots = layoutLabels(s);
  assert.ok(spots.some(p => p.badge), 'some marker is badged');
  assert.ok(spots.some(p => !p.badge), 'some marker keeps its text');
  assertClear(s);
});

test('the same input gives the same layout, whatever ran before', () => {
  const first = layoutLabels(scene(646, 478));
  layoutLabels(scene(300, 222));
  assert.deepEqual(layoutLabels(scene(646, 478)), first);
  assert.ok(first.every(p => !p.badge), 'nothing left over from earlier calls blocks a spot');
});
