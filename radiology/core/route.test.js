import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoute } from './route.js';

const ids = ['plax-normal', 'a4c-normal', 'plax-effusion'];

test('#/<id> selects that case', () => {
  assert.deepEqual(resolveRoute('#/a4c-normal', ids), { id: 'a4c-normal', notice: false });
  assert.deepEqual(resolveRoute('#/plax-effusion', ids), { id: 'plax-effusion', notice: false });
});

test('an empty hash selects the first case quietly', () => {
  for (const hash of ['', '#', '#/']) assert.deepEqual(resolveRoute(hash, ids), { id: 'plax-normal', notice: false }, hash);
});

test('unknown, malformed, inherited and old screen routes select the first case with a notice', () => {
  const old = ['#/atlas', '#/atlas/plax', '#/cases/pericardial-effusion', '#/quiz'];
  const odd = ['#/ghost', '#/plax-normal/', '#/a4c-normal/x', '#/%E0', '#/%', '#/constructor', '#/__proto__', '#/PLAX-NORMAL'];
  for (const hash of [...old, ...odd]) assert.deepEqual(resolveRoute(hash, ids), { id: 'plax-normal', notice: true }, hash);
});

test('with no cases there is nothing to select and nothing to explain', () => {
  assert.deepEqual(resolveRoute('#/ghost', []), { id: null, notice: false });
  assert.deepEqual(resolveRoute('', []), { id: null, notice: false });
});
