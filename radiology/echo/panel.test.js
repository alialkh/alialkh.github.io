import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probeTransform } from './panel.js';

test('the probe sits at its chest point on the 200 by 240 figure and turns by its angle', () => {
  assert.deepEqual(probeTransform({ chest: [0.5, 0.5], notch: 'Toward the right shoulder.', angle: 225 }), { x: 100, y: 120, angle: 225 });
});

test('the arrow follows probe.angle, not the direction the notch sentence names', () => {
  assert.equal(probeTransform({ chest: [0.5, 0.5], notch: 'Toward the right shoulder.', angle: 45 }).angle, 45);
});
