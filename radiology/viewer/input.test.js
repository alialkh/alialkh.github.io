import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accumulate, wheelSteps, pxPerSlice, movePosition, SPEEDS } from './input.js';

test('accumulate keeps what is left over so slow movement is not lost', () => {
  let r = { steps: 0, carry: 0 };
  const seen = [];
  for (let i = 0; i < 7; i++) {
    r = accumulate(r.carry, 10, 30);
    seen.push(r.steps);
  }
  assert.deepEqual(seen, [0, 0, 1, 0, 0, 1, 0]);
  assert.equal(r.carry, 10);
});

test('accumulate works backward too', () => {
  assert.deepEqual(accumulate(0, -65, 30), { steps: -2, carry: -5 });
});

test('one mouse notch is one slice on every platform', () => {
  assert.equal(wheelSteps(0, 100, 0).steps, 1);
  assert.equal(wheelSteps(0, -120, 0).steps, -1);
  assert.equal(wheelSteps(0, 3, 1).steps, 1);
  assert.equal(wheelSteps(0, -3, 1).steps, -1);
  assert.equal(wheelSteps(0, 240, 0).steps, 2);
});

test('a trackpad stream of small deltas moves a slice per 30 px and keeps the rest', () => {
  assert.deepEqual(wheelSteps(0, 12, 0), { steps: 0, carry: 12 });
  assert.deepEqual(wheelSteps(12, 20, 0), { steps: 1, carry: 2 });
  assert.deepEqual(wheelSteps(0, -35, 0), { steps: -1, carry: -5 });
});

test('a finger covers the stack but never moves less than 6 px or more than 24 px a slice', () => {
  assert.equal(pxPerSlice(600, 50), 12);
  assert.equal(pxPerSlice(600, 500), 6);
  assert.equal(pxPerSlice(600, 5), 24);
});

test('the position stops at both ends, or wraps for cine', () => {
  assert.equal(movePosition(3, 10, 5), 4);
  assert.equal(movePosition(3, -10, 5), 0);
  assert.equal(movePosition(4, 1, 5, true), 0);
  assert.equal(movePosition(0, -1, 5, true), 4);
  assert.equal(movePosition(2, 12, 5, true), 4);
});

test('cine speeds are slices a second in rising order', () => {
  assert.deepEqual([...SPEEDS].sort((a, b) => a - b), SPEEDS);
});
