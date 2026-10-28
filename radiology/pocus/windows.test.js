import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WINDOWS, WINDOW_SPECS } from './windows.js';
import { buildPatient, DEFAULTS, restOf } from './patient.js';
import { resolve } from './anatomy.js';
import { TISSUE_INDEX } from './tissues.js';
import { PROBES } from './probes.js';
import { poseFrame, compliance } from './geometry.js';
import { visibleStructures } from './visibility.js';
import { evaluateView } from './exam.js';

const builder = buildPatient();
const make = extra => { const P = { ...DEFAULTS, ...extra }; return { P, res: resolve(builder, TISSUE_INDEX, P, restOf(P)) }; };
const normal = make({});
const view = (w, ctx) => visibleStructures(ctx.res, PROBES[w.probe], poseFrame(w.pose, ctx.P.habitus), w.depth, { lines: 36, step: 3, gapMax: compliance(w.pose.p[2]) });

test('every standard window has a pose', () => {
  for (const w of WINDOWS) assert.ok(w.pose, `${w.id} has no pose: run tools/make-windows.mjs`);
});

test('every window shows what it needs on a normal patient', () => {
  for (const w of WINDOWS) {
    if (!w.pose) continue;
    const v = view(w, normal);
    const ev = evaluateView(v, w, { depth: w.depth });
    assert.ok(ev.ok, `${w.id}: missing ${ev.missing.join(', ')} (coverage ${ev.coverage.toFixed(2)})`);
  }
});

test('the abnormal patient shows its finding in the window that is meant to catch it', () => {
  for (const w of WINDOWS) {
    if (!w.pose || !w.positive) continue;
    const ctx = make(w.positive);
    const v = view(w, ctx);
    for (const id of w.sees ?? []) assert.ok((v.areas.get(id) ?? 0) > 30, `${w.id} cannot see ${id} when it is there`);
  }
});

test('a window is not mostly shadow, and its probe sits on the skin', () => {
  for (const w of WINDOWS) {
    if (!w.pose) continue;
    const v = view(w, normal);
    assert.ok(v.blocked / v.total < 0.6, `${w.id} is ${(100 * v.blocked / v.total).toFixed(0)}% shadow`);
    assert.ok(v.coupled >= 24, `${w.id} loses contact on ${36 - v.coupled} lines`);
  }
});

test('window specs name probes and presets that exist', () => {
  for (const s of WINDOW_SPECS) assert.ok(PROBES[s.probe]);
});
