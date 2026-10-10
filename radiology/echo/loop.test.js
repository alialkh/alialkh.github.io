import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_LOOP, setLoopPoint, loopActive, loopSeek, loopLabel } from './loop.js';

const loop = (a, b) => setLoopPoint(setLoopPoint(NO_LOOP, 'a', a), 'b', b);

test('playing past B wraps to A and frames inside the loop play on', () => {
  const l = loop(5, 10);
  assert.equal(loopSeek(l, 11), 5);
  assert.equal(loopSeek(l, 10), null);
  assert.equal(loopSeek(l, 5), null);
  assert.equal(loopSeek(l, 7), null);
});

test('a frame before A snaps to A', () => {
  assert.equal(loopSeek(loop(5, 10), 0), 5);
  assert.equal(loopSeek(loop(5, 10), 4), 5);
});

test('A and B set in reverse order are swapped', () => {
  assert.deepEqual(loop(10, 5), { a: 5, b: 10 });
  assert.deepEqual(setLoopPoint(setLoopPoint(NO_LOOP, 'b', 3), 'a', 8), { a: 3, b: 8 });
  assert.equal(loopSeek(loop(10, 5), 11), 5);
});

test('A and B on the same frame is no loop, and the label says so', () => {
  const l = loop(6, 6);
  assert.equal(loopActive(l), false);
  for (const f of [0, 6, 7, 20]) assert.equal(loopSeek(l, f), null, `frame ${f}`);
  assert.equal(loopLabel(l), 'A and B are both frame 7, so no loop is active.');
});

test('one point alone never seeks, and clearing removes both', () => {
  const onlyA = setLoopPoint(NO_LOOP, 'a', 4);
  assert.equal(loopSeek(onlyA, 0), null);
  assert.equal(loopLabel(onlyA), 'A frame 5, B not set');
  assert.equal(loopLabel(loop(4, 9)), 'A frame 5, B frame 10');
  assert.deepEqual(setLoopPoint(loop(4, 9), null), NO_LOOP);
  assert.equal(loopLabel(NO_LOOP), '');
});
