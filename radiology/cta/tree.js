// Pure data and geometry for the schematic coronary tree. One drawing per system, 560 by 730.
// Every branch starts on a point (vertex) of its parent, so the drawing is topologically exact by construction
// and tree.test.js checks it against the segment descriptions in content/segments.json.
export const VIEW = { x: 66, y: 0, w: 490, h: 724 };
export const ROOT = { c: [270, 52], r: 34, ostia: { right: [238, 64], left: [302, 64] } };
export const APEX = [352, 712];
export const OUTLINE = 'M200 112C120 152 78 300 100 430C120 540 220 650 352 722C470 680 548 560 548 410C548 250 470 132 360 112C310 102 250 102 200 112Z';
export const CRUX = [250, 596];

// Safari before 15.4 has no Array.prototype.at.
const last = a => a[a.length - 1];

// Right system.
const r1 = [ROOT.ostia.right, [206, 80], [172, 112], [142, 164], [128, 222]];
const r2 = [last(r1), [120, 292], [124, 372], [146, 446], [176, 506]];
const r3 = [last(r2), [206, 548], [228, 576], CRUX];
const r4 = [CRUX, [282, 632], [318, 668], [346, 704]];
const r16 = [CRUX, [300, 586], [352, 570], [404, 548], [450, 513]];
const r16a = [r16[1], [326, 612], [356, 634], [388, 644]];
const r16b = [r16[2], [384, 594], [420, 606], [456, 610]];
const r16c = [r16[3], [440, 564], [474, 574], [506, 580]];

// Left system.
const l5 = [ROOT.ostia.left, [306, 92], [300, 118], [292, 140]];
const l6 = [last(l5), [290, 190], [288, 244], [290, 300]];
const l7 = [last(l6), [294, 360], [300, 420], [304, 470]];
const l8 = [last(l7), [306, 505], [314, 548], [332, 626], [352, 706]];
const l9 = [l6[2], [322, 260], [350, 286], [368, 326]];
const l9a = [l7[1], [326, 376], [352, 400], [368, 438]];
const l10 = [last(l7), [332, 484], [354, 500], [366, 526]];
const l10a = [l8[1], [330, 518], [346, 536], [354, 556]];
const l11 = [last(l5), [350, 136], [420, 138], [478, 158], [506, 190]];
const l12 = [last(l5), [330, 170], [372, 214], [404, 268], [418, 340], [418, 430], [402, 490]];
const l12a = [l11[3], [470, 218], [452, 284], [440, 360], [436, 430], [436, 490]];
const l12b = [last(l11), [494, 248], [476, 314], [466, 380], [466, 430], [470, 468]];
const l13 = [last(l11), [528, 256], [530, 340], [520, 420], [490, 480], [440, 538], [380, 568], [318, 590], CRUX];
const l14 = [l13[4], [516, 524], [520, 574], [506, 622]];
const l14a = [l13[5], [462, 580], [466, 626], [452, 664]];
const l14b = [l13[6], [394, 604], [396, 654], [386, 696]];
const l15 = r4;

// w is the stroke width, t where along the curve the number sits and off nudges it clear of a neighbour.
const seg = (system, pts, w, t = 0.5, off = [0, 0]) => ({ system, pts, w, t, off });
export const GEOMETRY = {
  'seg-1': seg('right', r1, 11), 'seg-2': seg('right', r2, 11), 'seg-3': seg('right', r3, 10),
  'seg-4': seg('right', r4, 7), 'seg-16': seg('right', r16, 7),
  'seg-16a': seg('right', r16a, 4.5), 'seg-16b': seg('right', r16b, 4.5), 'seg-16c': seg('right', r16c, 4.5),
  'seg-5': seg('left', l5, 12), 'seg-6': seg('left', l6, 10), 'seg-7': seg('left', l7, 9), 'seg-8': seg('left', l8, 7, 0.8),
  'seg-9': seg('left', l9, 6), 'seg-9a': seg('left', l9a, 4.5), 'seg-10': seg('left', l10, 6), 'seg-10a': seg('left', l10a, 4.5),
  'seg-11': seg('left', l11, 9), 'seg-12': seg('left', l12, 6), 'seg-12a': seg('left', l12a, 6, 0.4), 'seg-12b': seg('left', l12b, 4.5, 0.62),
  'seg-13': seg('left', l13, 7), 'seg-14': seg('left', l14, 5), 'seg-14a': seg('left', l14a, 4.5), 'seg-14b': seg('left', l14b, 4.5),
  'seg-15': seg('left', l15, 7),
};

// Thin septal branches drawn for orientation. The segment table gives them no number.
// The first one leaves where 6 ends, because 6 includes its origin and 7 starts just after it.
export const SEPTALS = [
  [last(l6), [262, 322], [246, 356]],
  [l7[1], [270, 396], [256, 430]],
  [l7[2], [274, 456], [262, 494]],
];

// How each segment starts, from its description. 'ostium' is the aortic root, 'end' is the end of a parent,
// 'on' is a point inside a parent's course, and a list of parents means any one of them.
export const LINKS = [
  ['seg-1', 'ostium'], ['seg-2', 'end', ['seg-1']], ['seg-3', 'end', ['seg-2']], ['seg-4', 'end', ['seg-3']], ['seg-16', 'end', ['seg-3']],
  ['seg-16a', 'on', ['seg-16']], ['seg-16b', 'on', ['seg-16']], ['seg-16c', 'on', ['seg-16']],
  ['seg-5', 'ostium'], ['seg-6', 'end', ['seg-5']], ['seg-7', 'end', ['seg-6']], ['seg-8', 'end', ['seg-7']],
  ['seg-9', 'on', ['seg-6', 'seg-7']], ['seg-9a', 'on', ['seg-6', 'seg-7']], ['seg-10', 'end', ['seg-7']], ['seg-10a', 'on', ['seg-8']],
  ['seg-11', 'end', ['seg-5']], ['seg-12', 'end', ['seg-5']], ['seg-12a', 'on', ['seg-11']], ['seg-12b', 'end', ['seg-11']],
  ['seg-13', 'end', ['seg-11']], ['seg-14', 'on', ['seg-13']], ['seg-14a', 'on', ['seg-13']], ['seg-14b', 'on', ['seg-13']],
  ['seg-15', 'end', ['seg-13']],
];

// Catmull-Rom through the points, as cubic Bezier segments.
const bezier = pts => pts.slice(0, -1).map((p, i) => {
  const [a, b, c, d] = [pts[Math.max(0, i - 1)], p, pts[i + 1], pts[Math.min(pts.length - 1, i + 2)]];
  return [b, [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6], [c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6], c];
});
const f = n => Math.round(n * 10) / 10;
export const curvePath = pts => `M${pts[0].map(f)}${bezier(pts).map(([, c1, c2, e]) => `C${c1.map(f)} ${c2.map(f)} ${e.map(f)}`).join('')}`;

// The point a fraction t along the drawn curve, by length.
export function pointAt(pts, t) {
  const dense = [pts[0]];
  for (const [b, c1, c2, e] of bezier(pts)) {
    for (let k = 1; k <= 12; k++) {
      const u = k / 12;
      const m = 1 - u;
      dense.push([0, 1].map(i => m ** 3 * b[i] + 3 * m * m * u * c1[i] + 3 * m * u * u * c2[i] + u ** 3 * e[i]));
    }
  }
  const steps = dense.slice(1).map((p, i) => Math.hypot(p[0] - dense[i][0], p[1] - dense[i][1]));
  let left = t * steps.reduce((s, d) => s + d, 0);
  for (const [i, d] of steps.entries()) {
    if (left <= d || i === steps.length - 1) return [0, 1].map(k => dense[i][k] + (dense[i + 1][k] - dense[i][k]) * Math.min(1, left / d));
    left -= d;
  }
}

export const BADGE_R = 14;
export const badgeAt = id => {
  const { pts, t, off } = GEOMETRY[id];
  const [x, y] = pointAt(pts, t);
  return [f(x + off[0]), f(y + off[1])];
};
