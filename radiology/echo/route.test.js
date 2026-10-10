import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute } from './route.js';

const screens = new Map([['', {}], ['atlas', {}], ['cases', {}], ['quiz', {}]]);

test('known routes parse, with and without an id', () => {
  assert.deepEqual(parseRoute('', screens), { id: '', arg: undefined });
  assert.deepEqual(parseRoute('#/', screens), { id: '', arg: undefined });
  assert.deepEqual(parseRoute('#/atlas', screens), { id: 'atlas', arg: undefined });
  assert.deepEqual(parseRoute('#/atlas/plax', screens), { id: 'atlas', arg: 'plax' });
  assert.deepEqual(parseRoute('#/cases/a%20b', screens), { id: 'cases', arg: 'a b' });
});

test('a trailing slash means no id, not an empty one', () => {
  assert.deepEqual(parseRoute('#/atlas/', screens), { id: 'atlas', arg: undefined });
  assert.deepEqual(parseRoute('#/cases/', screens), { id: 'cases', arg: undefined });
});

test('unknown, inherited and malformed routes are null', () => {
  for (const hash of ['#/nope', '#/constructor', '#/__proto__', '#/toString', '#/atlas/%E0', '#/cases/%']) {
    assert.equal(parseRoute(hash, screens), null, hash);
  }
});
