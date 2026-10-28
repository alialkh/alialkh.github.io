import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presetState, reduce, RANGES, PRESETS, simConfig, readouts, gainDb, powerDb, mirrored, autoTgc, nearestDepth } from './machine.js';
import { PROBES, depthSteps } from './probes.js';

test('every preset builds a state inside every range, with a probe that exists', () => {
  for (const id of Object.keys(PRESETS)) {
    const s = presetState(id);
    const probe = PROBES[s.probe];
    assert.ok(probe, id);
    assert.ok(depthSteps(probe).includes(s.depth), `${id} depth ${s.depth}`);
    assert.ok(s.focus >= RANGES.focus[0] && s.focus <= s.depth, `${id} focus`);
    for (const k of ['gain', 'dr', 'power', 'persist', 'smooth', 'sharp']) assert.ok(s[k] >= RANGES[k][0] && s[k] <= RANGES[k][1], `${id} ${k}`);
    assert.equal(s.tgc.length, 8);
  }
});

test('depth steps through the probe list and stops at the ends', () => {
  let s = presetState('abdomen');
  const steps = depthSteps(PROBES.C5);
  for (let i = 0; i < 40; i++) s = reduce(s, { type: 'depth', step: 1 });
  assert.equal(s.depth, steps.at(-1));
  for (let i = 0; i < 40; i++) s = reduce(s, { type: 'depth', step: -1 });
  assert.equal(s.depth, steps[0]);
});

test('the focus follows the depth, and can never be deeper than the image', () => {
  let s = presetState('abdomen');
  const before = s.focus / s.depth;
  s = reduce(s, { type: 'depth', step: 2 });
  assert.ok(Math.abs(s.focus / s.depth - before) < 0.08);
  s = reduce(s, { type: 'focus', value: 9999 });
  assert.equal(s.focus, s.depth);
});

test('knobs clamp to their range', () => {
  let s = presetState('abdomen');
  s = reduce(s, { type: 'gain', value: 500 });
  assert.equal(s.gain, 100);
  s = reduce(s, { type: 'dr', value: 2 });
  assert.equal(s.dr, RANGES.dr[0]);
  s = reduce(s, { type: 'tgc', index: 3, value: 99 });
  assert.equal(s.tgc[3], RANGES.tgc[1]);
  assert.equal(s.tgc[2], 0);
  s = reduce(s, { type: 'tgc-reset' });
  assert.ok(s.tgc.every(v => v === 0));
});

test('changing probe keeps the depth inside the new probe range', () => {
  let s = presetState('abdomen');
  s = reduce(s, { type: 'probe', id: 'L12' });
  assert.ok(s.depth <= PROBES.L12.depthMax);
  assert.ok(s.focus <= s.depth);
});

test('gain 50 is neutral and the knob spans plus or minus 40 dB', () => {
  assert.equal(gainDb(50), 0);
  assert.equal(gainDb(100), 40);
  assert.equal(gainDb(0), -40);
  assert.equal(powerDb(100), 0);
  assert.ok(Math.abs(powerDb(50) + 6.02) < 0.01);
});

test('the cardiac convention mirrors the image and a user flip undoes it', () => {
  let s = presetState('cardiac');
  assert.equal(mirrored(s), true);
  s = reduce(s, { type: 'flipx' });
  assert.equal(mirrored(s), false);
  assert.equal(mirrored(presetState('abdomen')), false);
});

test('simConfig turns the console into simulator numbers', () => {
  const s = reduce(presetState('abdomen'), { type: 'gain', value: 75 });
  const c = simConfig(s);
  assert.equal(c.gainDb, 20);
  assert.equal(c.depth, s.depth);
  assert.equal(c.tgc.length, 8);
  assert.ok(c.persist >= 0 && c.persist < 1);
  assert.equal(c.probe, PROBES.C5);
});

test('readouts are strings a screen can print, and a higher frame rate costs lines or zones', () => {
  const r = readouts(presetState('cardiac'));
  assert.equal(r.probe, 'P4-2');
  assert.match(r.freq, /THI/);
  const a = readouts(presetState('abdomen'));
  const z = readouts(reduce(presetState('abdomen'), { type: 'zones', value: 3 }));
  assert.ok(z.fr < a.fr);
});

test('auto TGC lifts the dark bands and lowers the bright ones toward the first bands', () => {
  const t = autoTgc([-5, -5, -9, -13, -17, -21, -25, -30]);
  assert.equal(t[0], 0);
  assert.ok(t[7] > t[2] && t[2] > 0);
  assert.ok(t.every(v => v >= RANGES.tgc[0] && v <= RANGES.tgc[1]));
  assert.deepEqual(autoTgc([]), new Array(8).fill(0));
});

test('nearestDepth picks a listed step', () => {
  assert.equal(nearestDepth(PROBES.C5, 175), 180);
  assert.equal(nearestDepth(PROBES.L12, 500), 90);
});
