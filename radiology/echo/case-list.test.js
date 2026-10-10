import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexContent } from './content.js';
import { caseList, caseOf } from './case-list.js';

const view = (id, abbrev, window, reviewed = false) => ({ id, name: `${abbrev} name`, abbrev, window, reviewed });
const condition = (id, system, compareView, reviewed = false) => ({ id, name: `${id} name`, system, compareView, reviewed });
const clip = (id, viewId, conditionId) => ({ id, view: viewId, ...(conditionId && { condition: conditionId }) });

// Manifest order is deliberately unlike views.json and conditions.json order.
const tables = () => ({
  structures: [],
  views: [view('plax', 'PLAX', 'parasternal', true), view('a4c', 'A4C', 'apical'), view('ivc', 'IVC', 'subcostal')],
  conditions: [
    condition('effusion', 'pericardium', 'plax'),
    condition('ms', 'valves', 'ivc', true),
    condition('tamponade', 'pericardium', 'a4c'),
    condition('dcm', 'cardiomyopathy', 'a4c'),
  ],
  clips: [
    clip('dcm-1', 'a4c', 'dcm'),
    clip('ms-1', 'plax', 'ms'),
    clip('a4c-1', 'a4c'),
    clip('tamp-1', 'ivc', 'tamponade'),
    clip('plax-1', 'plax'),
    clip('eff-1', 'plax', 'effusion'),
    clip('plax-2', 'plax'),
    clip('eff-2', 'a4c', 'effusion'),
  ],
});

const shape = list => list.sections.map(s => [s.label, s.groups.map(g => [g.label, g.cases.map(c => c.id)])]);

test('normal views follow views.json, pathology groups by system in conditions.json order', () => {
  assert.deepEqual(shape(caseList(indexContent(tables()))), [
    ['Normal views', [[null, ['plax-1', 'plax-2', 'a4c-1']]]],
    ['Pathology', [['Pericardium', ['eff-1', 'eff-2', 'tamp-1']], ['Valves', ['ms-1']], ['Cardiomyopathy', ['dcm-1']]]],
  ]);
});

test('every clip is a case exactly once, and the flat order matches the sidebar', () => {
  const t = tables();
  const list = caseList(indexContent(t));
  assert.deepEqual([...list.cases.map(c => c.id)].sort(), t.clips.map(c => c.id).sort());
  assert.deepEqual(list.cases.map(c => c.id), ['plax-1', 'plax-2', 'a4c-1', 'eff-1', 'eff-2', 'tamp-1', 'ms-1', 'dcm-1']);
});

test('a section with no clips is left out, and no clips means no sections', () => {
  const t = tables();
  t.clips = t.clips.filter(c => c.condition);
  assert.deepEqual(caseList(indexContent(t)).sections.map(s => s.label), ['Pathology']);
  assert.deepEqual(caseList(indexContent({ ...t, clips: [] })), { sections: [], cases: [] });
});

test('a normal case is titled by its view and offers overview, structures and tips', () => {
  const content = indexContent(tables());
  const c = caseOf(content, content.clip.get('a4c-1'));
  assert.equal(c.kind, 'normal');
  assert.equal(c.title, 'A4C');
  assert.equal(c.subtitle, 'Apical');
  assert.deepEqual(c.tabs, ['overview', 'structures', 'tips']);
  assert.equal(c.condition, null);
  assert.equal(c.compare, null);
});

test('a pathology case is titled by its condition and offers overview, findings and why it matters', () => {
  const content = indexContent(tables());
  const c = caseOf(content, content.clip.get('eff-2'));
  assert.equal(c.kind, 'pathology');
  assert.equal(c.title, 'effusion name');
  assert.equal(c.subtitle, 'A4C');
  assert.deepEqual(c.tabs, ['overview', 'findings', 'significance']);
});

test('clips that would read the same, same title and same view, are numbered on the second line', () => {
  const t = tables();
  t.clips.push(clip('eff-3', 'plax', 'effusion'));
  const content = indexContent(t);
  const subtitle = id => caseOf(content, content.clip.get(id)).subtitle;
  assert.deepEqual(['plax-1', 'plax-2', 'a4c-1'].map(subtitle), ['Parasternal, clip 1', 'Parasternal, clip 2', 'Apical']);
  assert.deepEqual(['eff-1', 'eff-2', 'eff-3', 'ms-1'].map(subtitle), ['PLAX, clip 1', 'A4C', 'PLAX, clip 2', 'PLAX']);
});

test('a case is a draft when its view or its condition is unreviewed', () => {
  const content = indexContent(tables());
  const draft = id => caseOf(content, content.clip.get(id)).draft;
  assert.equal(draft('plax-1'), false, 'reviewed view');
  assert.equal(draft('a4c-1'), true, 'unreviewed view');
  assert.equal(draft('ms-1'), false, 'reviewed condition on a reviewed view');
  assert.equal(draft('eff-1'), true, 'unreviewed condition on a reviewed view');
  const t = tables();
  t.conditions[2].reviewed = true;
  const conditionOnly = indexContent(t);
  assert.equal(caseOf(conditionOnly, conditionOnly.clip.get('tamp-1')).draft, true, 'reviewed condition on an unreviewed view');
  t.views[2].reviewed = true;
  const both = indexContent(t);
  assert.equal(caseOf(both, both.clip.get('tamp-1')).draft, false, 'both reviewed');
});

test('compare offers the first normal clip of the condition compareView, or nothing', () => {
  const content = indexContent(tables());
  const compare = id => caseOf(content, content.clip.get(id)).compare?.id ?? null;
  assert.equal(compare('eff-1'), 'plax-1');
  assert.equal(compare('tamp-1'), 'a4c-1');
  assert.equal(compare('ms-1'), null, 'no normal IVC clip');
});
