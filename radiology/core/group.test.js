import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupBy } from './group.js';

test('groupBy keeps first-seen key order and item order, like Map.groupBy', () => {
  const g = groupBy(['b1', 'a1', 'b2', 'c1', 'a2'], s => s[0]);
  assert.deepEqual([...g], [['b', ['b1', 'b2']], ['a', ['a1', 'a2']], ['c', ['c1']]]);
  assert.deepEqual([...groupBy([], s => s)], []);
});
