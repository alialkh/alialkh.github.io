import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { screenList, REFERENCE } from './cases.js';

const manifest = JSON.parse(readFileSync(new URL('../data/cath/manifest.json', import.meta.url), 'utf8'));
const labels = list => list.sections.map(s => `${s.label}: ${s.groups.map(g => g.cases.length).join('+')}`);

test('the sidebar has Angiography, IVUS and Reference, stills before cine', () => {
  const list = screenList({ cases: manifest });
  assert.deepEqual(list.sections.map(s => s.label), ['Angiography', 'IVUS', 'Reference']);
  assert.deepEqual(list.sections[0].groups.map(g => g.label), ['Stills with segment outlines', 'Cine loops']);
  assert.ok(list.cases[0].kind === 'angio-still' && list.cases[0].c.regions.length > 0, 'the first screen is an outlined still');
  assert.equal(list.sections[2].groups[0].cases.length, REFERENCE.length);
});

test('every case is listed once and the flat order follows the sections', () => {
  const list = screenList({ cases: manifest });
  assert.equal(list.cases.length, manifest.length + REFERENCE.length);
  assert.equal(new Set(list.cases.map(s => s.id)).size, list.cases.length);
});

test('with no cases the reference screens still open', () => {
  const list = screenList({ cases: [] });
  assert.deepEqual(labels(list), ['Reference: 3']);
  assert.equal(list.cases[0].id, 'ref-segments');
});

test('tabs follow the kind and the subtitle counts what the case shows', () => {
  const list = screenList({ cases: manifest });
  const by = id => list.cases.find(s => s.id === id);
  assert.deepEqual(by('arcade-14').tabs, ['overview', 'segments', 'projections', 'credits']);
  assert.equal(by('arcade-14').subtitle, '8 outlined segments');
  assert.deepEqual(by('ivus-scad-haematoma').tabs, ['overview', 'concepts', 'credits']);
  assert.equal(by('cadica-p12-v1').subtitle, '5 s cine');
  assert.deepEqual(by('ref-ivus').tabs, ['guide', 'concept', 'credits']);
  assert.deepEqual(by('ref-projections').tabs[0], 'projection', 'the picker opens on the entry it selected');
});
