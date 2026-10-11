import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPrefs, savePrefs } from './prefs.js';

const memory = (initial = {}) => {
  const data = { ...initial };
  return { getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, data };
};
const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };

test('what was saved comes back as the same panel flags and annotation flag', () => {
  const storage = memory();
  savePrefs({ panels: { left: false, right: true, bar: false }, annotations: false }, storage);
  assert.deepEqual(loadPrefs(storage), { panels: { left: false, right: true, bar: false }, annotations: false });
});

test('blocked storage gives defaults on load and no error on save', () => {
  assert.deepEqual(loadPrefs(blocked), { panels: {} });
  assert.doesNotThrow(() => savePrefs({ panels: { left: false }, annotations: true }, blocked));
  assert.deepEqual(loadPrefs(undefined), { panels: {} }, 'node has no localStorage at all');
});

test('nothing saved, junk, or values of the wrong type are ignored one by one', () => {
  assert.deepEqual(loadPrefs(memory()), { panels: {} });
  assert.deepEqual(loadPrefs(memory({ 'radiology.viewer.layout': '{not json' })), { panels: {} });
  const odd = memory({ 'radiology.viewer.layout': JSON.stringify({ left: 'no', right: false, bar: 1, annotations: 'yes', extra: true }) });
  assert.deepEqual(loadPrefs(odd), { panels: { right: false } });
});
