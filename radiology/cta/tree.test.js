import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GEOMETRY, LINKS, ROOT, APEX, VIEW, BADGE_R, SEPTALS, badgeAt, pointAt, curvePath } from './tree.js';

const segments = JSON.parse(readFileSync(new URL('./content/segments.json', import.meta.url), 'utf8'));
const pts = id => GEOMETRY[id].pts;
const same = (a, b) => a[0] === b[0] && a[1] === b[1];

test('every segment in the table is drawn once, and nothing else is', () => {
  assert.deepEqual(Object.keys(GEOMETRY).sort(), segments.map(s => s.id).sort());
  assert.deepEqual(LINKS.map(l => l[0]).sort(), segments.map(s => s.id).sort());
});

test('the right coronary artery has its own drawing and every other segment is in the left one', () => {
  for (const s of segments) assert.equal(GEOMETRY[s.id].system, s.artery === 'rca' ? 'right' : 'left', s.id);
});

test('each segment starts where its description says it starts', () => {
  for (const [id, how, parents = []] of LINKS) {
    const start = pts(id)[0];
    if (how === 'ostium') {
      const ostium = ROOT.ostia[GEOMETRY[id].system];
      assert.ok(same(start, ostium), `${id} starts at the ostium`);
      assert.ok(Math.abs(Math.hypot(start[0] - ROOT.c[0], start[1] - ROOT.c[1]) - ROOT.r) < 2, `${id} ostium is on the root`);
    } else if (how === 'end') {
      assert.ok(parents.some(p => same(start, pts(p).at(-1))), `${id} starts at the end of ${parents}`);
    } else {
      // Inside a parent's course, never at its first or last point, which are the other two cases.
      assert.ok(parents.some(p => pts(p).slice(1, -1).some(v => same(start, v))), `${id} starts inside ${parents}`);
    }
  }
});

test('a branch shares the system of its parent', () => {
  for (const [id, , parents = []] of LINKS) for (const p of parents) assert.equal(GEOMETRY[id].system, GEOMETRY[p].system, `${id} and ${p}`);
});

test('the descriptions that name a place are drawn there', () => {
  // 10 arises from the junction of 7 and 8, and 8 starts where 7 ends.
  assert.ok(same(pts('seg-8')[0], pts('seg-7').at(-1)));
  assert.ok(same(pts('seg-10')[0], pts('seg-8')[0]));
  // 11 includes the origin of the first obtuse marginal, so 12a leaves before 11 ends.
  assert.ok(pts('seg-11').findIndex(v => same(v, pts('seg-12a')[0])) < pts('seg-11').length - 1);
  // 13 runs on from 11, past the last obtuse marginal, and the PDA from the circumflex continues it.
  assert.ok(same(pts('seg-13')[0], pts('seg-11').at(-1)) && same(pts('seg-15')[0], pts('seg-13').at(-1)));
  // 6 ends at the origin of the first septal branch, which it includes, and 7 starts just after it.
  assert.ok(same(SEPTALS[0][0], pts('seg-6').at(-1)));
  // 4 and 16 both leave the end of 3.
  assert.ok(same(pts('seg-4')[0], pts('seg-3').at(-1)) && same(pts('seg-16')[0], pts('seg-3').at(-1)));
  // The LAD, and the PDA from either artery, run to the apex.
  for (const id of ['seg-8', 'seg-4', 'seg-15']) assert.ok(Math.hypot(...pts(id).at(-1).map((v, i) => v - APEX[i])) < 20, id);
});

test('the number badges stay inside the drawing and never touch', () => {
  const ids = Object.keys(GEOMETRY);
  for (const id of ids) {
    const [x, y] = badgeAt(id);
    assert.ok(x >= VIEW.x + BADGE_R && x <= VIEW.x + VIEW.w - BADGE_R && y >= VIEW.y + BADGE_R && y <= VIEW.y + VIEW.h - BADGE_R, `${id} is inside`);
  }
  for (const a of ids) {
    for (const b of ids) {
      if (a >= b || GEOMETRY[a].system !== GEOMETRY[b].system) continue;
      const [p, q] = [badgeAt(a), badgeAt(b)];
      assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1]) >= 2 * BADGE_R + 4, `${a} and ${b} are apart`);
    }
  }
});

test('the curve passes through its points and pointAt runs from the first to the last', () => {
  const line = [[0, 0], [50, 0], [100, 0]];
  assert.deepEqual(pointAt(line, 0).map(Math.round), [0, 0]);
  assert.deepEqual(pointAt(line, 0.5).map(Math.round), [50, 0]);
  assert.deepEqual(pointAt(line, 1).map(Math.round), [100, 0]);
  assert.match(curvePath(line), /^M0,0C.* 50,0C.* 100,0$/);
});
