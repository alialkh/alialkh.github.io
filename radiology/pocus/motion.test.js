import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardiacState, breathLevel, animate, systoleFraction, lungSlide } from './motion.js';

const sample = (fn, n = 400) => Array.from({ length: n }, (_, i) => fn(i / n));

test('every cardiac quantity stays in range at every phase and rate', () => {
  for (const hr of [40, 70, 120, 170]) {
    for (const s of sample(p => cardiacState(p, hr))) {
      for (const k of ['sys', 'av', 'mv', 'tv', 'atria', 'pulse']) assert.ok(s[k] >= 0 && s[k] <= 1, `${k} ${s[k]} out of range at ${hr} bpm`);
    }
  }
});

test('the ventricle contracts after the R wave and is relaxed again before the next', () => {
  const hr = 70;
  const ts = systoleFraction(hr);
  assert.ok(cardiacState(0, hr).sys < 0.05);
  assert.ok(cardiacState(ts * 0.6, hr).sys > 0.95);
  assert.ok(cardiacState(0.97, hr).sys < 0.05);
});

test('the aortic valve is open in systole only and the mitral valve in diastole only', () => {
  const hr = 70;
  const ts = systoleFraction(hr);
  const mid = cardiacState(ts / 2, hr);
  assert.ok(mid.av > 0.9 && mid.mv < 0.05);
  const dia = cardiacState(ts + 0.25, hr);
  assert.ok(dia.av < 0.05 && dia.mv > 0.9);
});

test('systole takes a smaller share of the beat at lower heart rates', () => {
  assert.ok(systoleFraction(50) < systoleFraction(100));
  assert.ok(systoleFraction(70) > 0.25 && systoleFraction(70) < 0.5);
});

test('breathing runs between 0 and 1 and is slower out than in', () => {
  const v = sample(breathLevel, 1000);
  assert.ok(Math.min(...v) >= 0 && Math.max(...v) <= 1);
  assert.ok(Math.max(...v) > 0.99 && Math.min(...v) < 0.01);
  assert.ok(breathLevel(0.4) > 0.99);
  assert.ok(breathLevel(0.2) > 0.4 && breathLevel(0.2) < 0.6);
});

test('animate keeps the scenario and moves only the cycle quantities', () => {
  const base = { habitus: 0.5, fluidRUQ: 12, ef: 0.5 };
  const a = animate(base, 1.3);
  assert.equal(a.habitus, 0.5);
  assert.equal(a.fluidRUQ, 12);
  assert.ok('sys' in a && 'breath' in a && 'pulse' in a);
  assert.deepEqual(animate(base, 0, { still: true }).sys, 0);
  assert.equal(animate(base, 3, { breathHold: 0.7 }).breath, 0.7);
});

test('lung sliding scales with the breath and vanishes when the lung is stuck', () => {
  assert.deepEqual(lungSlide(0), [0, 0, -0]);
  assert.ok(lungSlide(1)[2] < -10);
  assert.equal(lungSlide(1, 0)[2], -0);
});
