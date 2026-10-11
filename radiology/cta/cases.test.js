import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { screenList, REFERENCE } from './cases.js';

const manifest = JSON.parse(readFileSync(new URL('../data/cath/manifest.json', import.meta.url), 'utf8'));
const labels = list => list.sections.map(s => `${s.label}: ${s.groups.map(g => g.cases.length).join('+')}`);

test('the sidebar has Angiography, IVUS and Reference, with the stated views first and stills before cine', () => {
  const list = screenList({ cases: manifest });
  assert.deepEqual(list.sections.map(s => s.label), ['Angiography', 'IVUS', 'Reference']);
  assert.deepEqual(list.sections[0].groups.map(g => g.label), ['Angiography with stated projection', 'Stills with segment outlines', 'Cine loops']);
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

const fixture = () => {
  const source = { author: 'A', license: 'CC0 1.0', licenseUrl: 'https://l', url: 'https://u', attribution: '', modified: 'x' };
  const angles = { primary: { side: 'LAO', angle: 40.3 }, secondary: { direction: 'cranial', angle: 25.1 } };
  const base = { summary: 's', src: 'a.jpg', poster: 'a-t.jpg', width: 512, height: 512, markers: [], source };
  return {
    cases: [
      { ...base, id: 'plain-still', kind: 'angio-still', title: 'Plain still', regions: [{ segment: 'seg-6', polygon: [[0, 0], [1, 0], [1, 1]] }] },
      { ...base, id: 'plain-clip', kind: 'angio-clip', title: 'Plain clip', fps: 10, durationSec: 4.9 },
      { ...base, id: 'named-clip', kind: 'angio-clip', title: 'Named clip', fps: 10, durationSec: 3.6, projection: 'rao-caudal' },
      { ...base, id: 'angled-still', kind: 'angio-still', title: 'Angled still', angles, projection: 'lao-cranial', regions: [{ segment: 'seg-6', polygon: [[0, 0], [1, 0], [1, 1]] }] },
      { ...base, id: 'far-still', kind: 'angio-still', title: 'Far still', angles: { primary: { side: 'RAO', angle: 80 }, secondary: { direction: 'none', angle: 0 } } },
      { ...base, id: 'ivus', kind: 'ivus-clip', title: 'IVUS', fps: 25, durationSec: 9 },
    ],
    projection: new Map([['rao-caudal', { name: 'RAO caudal (left coronary)' }], ['lao-cranial', { name: 'LAO cranial (left coronary)' }]]),
  };
};

test('cases that state their view form the first group, stills before cine, ahead of the unlabelled ones', () => {
  const [angio] = screenList(fixture()).sections;
  assert.deepEqual(angio.groups.map(g => g.label), ['Angiography with stated projection', 'Stills with segment outlines', 'Cine loops']);
  assert.deepEqual(angio.groups.map(g => g.cases.map(s => s.id)), [['angled-still', 'far-still', 'named-clip'], ['plain-still'], ['plain-clip']]);
});

test('with no case stating a view there is no such group', () => {
  const content = fixture();
  content.cases = content.cases.filter(c => c.id.startsWith('plain') || c.id === 'ivus');
  assert.deepEqual(screenList(content).sections[0].groups.map(g => g.label), ['Stills with segment outlines', 'Cine loops']);
});

test('the sidebar second line shows the stated angles, else the named view, else only what the case holds', () => {
  const by = Object.fromEntries(screenList(fixture()).cases.map(s => [s.id, s.subtitle]));
  assert.equal(by['angled-still'], 'LAO 40.3, cranial 25.1 · 1 outlined segment', 'angles win over the nearest listed view');
  assert.equal(by['far-still'], 'RAO 80 · Still frame');
  assert.equal(by['named-clip'], 'RAO caudal (left coronary) · 4 s cine');
  assert.equal(by['plain-still'], '1 outlined segment');
  assert.equal(by['plain-clip'], '5 s cine');
  assert.equal(by.ivus, '9 s cine');
});

test('a named view the table lacks falls back to its id instead of a blank line', () => {
  const content = fixture();
  content.projection = new Map();
  assert.equal(screenList(content).cases.find(s => s.id === 'named-clip').subtitle, 'rao-caudal · 4 s cine');
});

test('on the shipped manifest the stated-view group holds exactly the cases that state a view, and none from ARCADE or CADICA', () => {
  const [group] = screenList({ cases: manifest }).sections[0].groups;
  assert.equal(group.label, 'Angiography with stated projection');
  assert.deepEqual(group.cases.map(s => s.id).sort(), manifest.filter(c => c.angles || c.projection).map(c => c.id).sort());
  assert.ok(group.cases.length > 0 && group.cases.every(s => !/^(arcade|cadica)-/.test(s.id)));
  const kinds = group.cases.map(s => s.kind);
  assert.deepEqual(kinds, [...kinds].sort((a, b) => (a === 'angio-still' ? 0 : 1) - (b === 'angio-still' ? 0 : 1)), 'stills come before clips');
});
