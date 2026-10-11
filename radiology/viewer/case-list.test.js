import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseList, caseSubtitle } from './case-list.js';

const c = (id, region, modality = 'CT', names = ['Axial']) => ({ id, region, modality, series: names.map(name => ({ name })) });

test('cases group by region in the fixed region order, not the manifest order', () => {
  const list = caseList([c('a', 'abdomen'), c('b', 'head'), c('d', 'abdomen'), c('e', 'chest')]);
  assert.deepEqual(list.sections.map(s => s.label), ['Head', 'Chest', 'Abdomen']);
  assert.deepEqual(list.cases.map(x => x.id), ['b', 'e', 'a', 'd']);
  assert.deepEqual(list.sections[2].groups[0].cases.map(x => x.id), ['a', 'd']);
});

test('a region with no case has no section, and no cases means no sections', () => {
  assert.deepEqual(caseList([c('a', 'spine')]).sections.map(s => s.label), ['Spine']);
  assert.deepEqual(caseList([]), { sections: [], cases: [] });
});

test('the second line names the modality and every sequence', () => {
  assert.equal(caseSubtitle(c('a', 'head', 'CT', ['Axial CT'])), 'CT · Axial CT');
  assert.equal(caseSubtitle(c('a', 'head', 'MR', ['T1', 'T2'])), 'MR · T1, T2');
});
