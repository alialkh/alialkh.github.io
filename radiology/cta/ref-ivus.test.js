import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { burdenFormula } from './ref-ivus.js';
import { PARTS } from './ivus-figure.js';

const ivus = JSON.parse(readFileSync(new URL('./content/ivus.json', import.meta.url), 'utf8'));
const concept = id => ivus.find(c => c.id === id);

test('the plaque burden formula on screen is read from the table', () => {
  assert.equal(
    burdenFormula(concept('plaque-burden')),
    'Plaque plus media area = EEM area minus lumen area. Plaque burden = plaque plus media area divided by EEM area, which is (EEM area minus lumen area) divided by EEM area.',
  );
});

test('every part of the drawing names a concept that exists, and each part has one id', () => {
  for (const p of PARTS) assert.ok(concept(p.concept), `${p.id} names ${p.concept}`);
  assert.equal(new Set(PARTS.map(p => p.id)).size, PARTS.length);
  for (const id of ['catheter', 'guidewire', 'lumen', 'plaque', 'calcium', 'shadow', 'media', 'eem', 'adventitia']) assert.ok(PARTS.some(p => p.id === id), id);
});
