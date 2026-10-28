import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aimSeeds, aimDirs } from './aim.mjs';
import { WINDOW_SPECS } from '../pocus/windows.js';
import { poseFrame } from '../pocus/geometry.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

test('the heart windows have a textbook plane, and the poses it gives point the beam along it', () => {
  const aimed = WINDOW_SPECS.filter(w => w.aim);
  assert.ok(aimed.length >= 4, 'subxiphoid, PLAX, PSAX and A4C each have an aim');
  for (const spec of aimed) {
    const seeds = aimSeeds(spec, 0.3);
    assert.ok(seeds.length > 5, `${spec.id} has seeds`);
    const { nW } = aimDirs(spec)[0];
    const best = Math.max(...seeds.map(s => dot(poseFrame({ ...s }, 0.3).n, nW)));
    assert.ok(best > 0.95, `${spec.id}: the nearest seed is ${(Math.acos(Math.min(best, 1)) * 180 / Math.PI).toFixed(0)} degrees off the beam it asks for`);
  }
});
