import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { validateContent, licenseAllowed, groupBy, indexContent } from './content.js';

const base = () => ({
  structures: [
    { id: 'lv', name: 'Left ventricle', description: 'Main pumping chamber.' },
    { id: 'la', name: 'Left atrium', description: 'Receives pulmonary venous blood.' },
    { id: 'ra', name: 'Right atrium', description: 'Receives systemic venous blood.' },
  ],
  views: [{
    id: 'plax', name: 'Parasternal long axis', abbrev: 'PLAX', window: 'parasternal',
    probe: { site: 'Left sternal border.', chest: [0.56, 0.42], notch: 'Toward the right shoulder.', angle: 225 },
    screen: 'Apex to the left.', structures: ['lv', 'la'], tips: ['Tip.'], pitfalls: ['Pitfall.'],
  }],
  conditions: [{
    id: 'effusion', name: 'Pericardial effusion', system: 'pericardium', summary: 'Fluid.', findings: ['Dark space.'],
    significance: 'Tamponade.', pearls: ['Pearl.'], mimics: ['Pleural effusion'], compareView: 'plax', sources: ['Ref.'],
  }],
  clips: [{
    id: 'plax-1', view: 'plax', condition: 'effusion', src: 'plax-1.mp4', poster: 'plax-1.jpg',
    fps: 30, durationSec: 2, width: 640, height: 480,
    markers: [{ structure: 'lv', at: [0.5, 0.5], r: 0.1 }],
    source: { author: 'A', license: 'CC BY 4.0', licenseUrl: 'https://l', url: 'https://u', attribution: '', modified: 'Re-encoded.' },
  }],
});

const problemsAfter = mutate => {
  const t = base();
  mutate(t);
  return validateContent(t);
};

test('the baseline tables are valid', () => {
  assert.deepEqual(validateContent(base()), []);
});

test('rejects a clip whose view does not exist', () => {
  const p = problemsAfter(t => { t.clips[0].view = 'ghost-view'; });
  assert.equal(p.length, 1);
  assert.match(p[0], /ghost-view/);
});

test('rejects a view that lists an unknown structure', () => {
  const p = problemsAfter(t => { t.views[0].structures.push('ghost'); });
  assert.deepEqual(p, ['views["plax"] lists unknown structure "ghost"']);
});

test('rejects a compareView and a clip condition that do not exist', () => {
  assert.match(problemsAfter(t => { t.conditions[0].compareView = 'a4c'; }).join(), /compareView "a4c"/);
  assert.match(problemsAfter(t => { t.clips[0].condition = 'ghost'; }).join(), /condition "ghost"/);
});

test('rejects a marker on a structure the clip view does not list', () => {
  const p = problemsAfter(t => { t.clips[0].markers.push({ structure: 'ra', at: [0.2, 0.2], r: 0.05 }); });
  assert.equal(p.length, 1);
  assert.match(p[0], /"ra".*"plax"/);
});

test('rejects a structure marked twice on one clip', () => {
  const p = problemsAfter(t => { t.clips[0].markers.push({ structure: 'lv', at: [0.2, 0.2], r: 0.05 }); });
  assert.equal(p.length, 1);
  assert.match(p[0], /"lv" twice/);
});

test('rejects NC and ND licenses and accepts the allowlist', () => {
  for (const bad of ['CC BY-NC 4.0', 'CC BY-NC-SA 4.0', 'CC BY-ND 4.0', 'CC BY-NC-ND 3.0', 'All rights reserved', '']) {
    assert.equal(licenseAllowed(bad), false, bad);
  }
  for (const ok of ['CC0 1.0', 'Public domain', 'CC BY 4.0', 'CC BY-SA 3.0', 'CC BY 2.5']) {
    assert.equal(licenseAllowed(ok), true, ok);
  }
  const p = problemsAfter(t => { t.clips[0].source.license = 'CC BY-NC 4.0'; });
  assert.equal(p.length, 1);
  assert.match(p[0], /CC BY-NC 4\.0/);
});

test('rejects duplicate ids in every table', () => {
  for (const name of ['structures', 'views', 'conditions', 'clips']) {
    const p = problemsAfter(t => { t[name].push(structuredClone(t[name][0])); });
    assert.ok(p.some(m => m.startsWith(`${name}[`) && m.endsWith('is a duplicate id')), `${name}: ${p}`);
  }
});

test('rejects a wrong shape with the field named', () => {
  assert.deepEqual(problemsAfter(t => { t.views[0].window = 'apex'; }),
    ['views["plax"].window is "apex", expected one of parasternal, apical, subcostal, suprasternal']);
  assert.deepEqual(problemsAfter(t => { t.views[0].probe.chest = [1.2, 0.4]; }),
    ['views["plax"].probe.chest must be [x, y] with each between 0 and 1']);
  assert.deepEqual(problemsAfter(t => { delete t.conditions[0].findings; }),
    ['conditions["effusion"].findings must be a list of non-empty text']);
  assert.deepEqual(problemsAfter(t => { t.clips[0].markers[0].r = 0; }),
    ['clips["plax-1"].markers[0].r must be a fraction of frame width above 0']);
});

test('rejects a probe angle that is missing, not a number, 360 or negative, and accepts 0 and 359.9', () => {
  const bad = ['views["plax"].probe.angle must be a number from 0 up to but not including 360'];
  assert.deepEqual(problemsAfter(t => { delete t.views[0].probe.angle; }), bad);
  for (const angle of ['90', 360, -1]) {
    assert.deepEqual(problemsAfter(t => { t.views[0].probe.angle = angle; }), bad, JSON.stringify(angle));
  }
  for (const angle of [0, 359.9]) {
    assert.deepEqual(problemsAfter(t => { t.views[0].probe.angle = angle; }), [], String(angle));
  }
});

test('pins and notes are optional, and valid ones pass', () => {
  assert.deepEqual(problemsAfter(t => {
    t.clips[0].pins = [{ at: [0, 1], text: 'x'.repeat(90) }];
    t.clips[0].notes = 'A single beat from a healthy volunteer.';
  }), []);
});

test('rejects a pin off the frame, without text or with text over 90 characters', () => {
  const pinProblems = pin => problemsAfter(t => { t.clips[0].pins = [{ at: [0.5, 0.5], text: 'Fluid.' }, pin]; });
  assert.deepEqual(pinProblems({ at: [0.5, 1.2], text: 'Fluid.' }), ['clips["plax-1"].pins[1].at must be [x, y] with each between 0 and 1']);
  assert.deepEqual(pinProblems({ at: [0.5], text: 'Fluid.' }), ['clips["plax-1"].pins[1].at must be [x, y] with each between 0 and 1']);
  const badText = ['clips["plax-1"].pins[1].text must be non-empty text of 90 characters or fewer'];
  assert.deepEqual(pinProblems({ at: [0.5, 0.5], text: ' ' }), badText);
  assert.deepEqual(pinProblems({ at: [0.5, 0.5] }), badText);
  assert.deepEqual(pinProblems({ at: [0.5, 0.5], text: 'x'.repeat(91) }), badText);
});

test('rejects pins that are not a list and notes that are not a string', () => {
  assert.deepEqual(problemsAfter(t => { t.clips[0].pins = { at: [0.5, 0.5], text: 'Fluid.' }; }), ['clips["plax-1"].pins must be a list']);
  assert.deepEqual(problemsAfter(t => { t.clips[0].notes = ['Two', 'sentences.']; }), ['clips["plax-1"].notes must be a string']);
});

test('a missing table is reported, not thrown', () => {
  assert.deepEqual(problemsAfter(t => { delete t.clips; }), ['clips must be a list']);
});

test('groupBy keeps first-seen key order and item order, like Map.groupBy', () => {
  const g = groupBy(['b1', 'a1', 'b2', 'c1', 'a2'], s => s[0]);
  assert.deepEqual([...g], [['b', ['b1', 'b2']], ['a', ['a1', 'a2']], ['c', ['c1']]]);
  assert.deepEqual([...groupBy([], s => s)], []);
});

test('indexContent groups normal clips by view and case clips by condition', () => {
  const t = base();
  t.clips.push({ ...t.clips[0], id: 'plax-2', condition: undefined }, { ...t.clips[0], id: 'plax-3' });
  const c = indexContent(t);
  assert.deepEqual(c.normalClips.get('plax').map(x => x.id), ['plax-2']);
  assert.deepEqual(c.caseClips.get('effusion').map(x => x.id), ['plax-1', 'plax-3']);
});

const read = url => JSON.parse(readFileSync(url, 'utf8'));
const tablesAt = (contentDir, clipsUrl) => ({
  structures: read(new URL('structures.json', contentDir)),
  views: read(new URL('views.json', contentDir)),
  conditions: read(new URL('conditions.json', contentDir)),
  clips: existsSync(clipsUrl) ? read(clipsUrl) : [],
});

test('the real content passes every rule', t => {
  const dir = new URL('./content/', import.meta.url);
  const missing = ['structures', 'views', 'conditions'].filter(n => !existsSync(new URL(`${n}.json`, dir)));
  if (missing.length) return t.skip(`echo/content/ has no ${missing.join(', ')}.json yet`);
  assert.deepEqual(validateContent(tablesAt(dir, new URL('../data/clips/manifest.json', import.meta.url))), []);
});

test('the test fixtures pass every rule', () => {
  const dir = new URL('./test-fixtures/', import.meta.url);
  assert.deepEqual(validateContent(tablesAt(new URL('content/', dir), new URL('clips/manifest.json', dir))), []);
});
