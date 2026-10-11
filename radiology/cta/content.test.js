import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { validateContent, licenseAllowed, indexContent } from './content.js';
import { caseSystem, entryAngle, matchProjection } from './views.js';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const real = () => ({ segments: read('./content/segments.json'), projections: read('./content/projections.json'), ivus: read('./content/ivus.json'), cases: read('../data/cath/manifest.json') });

const base = () => ({
  segments: [
    { id: 'seg-5', name: 'Left main', artery: 'left-main', syntax: '5', aha: 5, description: 'Ostium to the bifurcation.' },
    { id: 'seg-6', name: 'Proximal LAD', artery: 'lad', syntax: '6', aha: null, description: 'First part of the LAD.' },
  ],
  projections: [{
    id: 'lao-cranial', name: 'LAO cranial', aliases: [], primary: { side: 'LAO', angle: 45 }, secondary: { direction: 'cranial', angle: 20 }, system: 'left',
    bestSeen: ['seg-5'], foreshortened: [], overlapped: ['seg-6'], whenToUse: 'Use it.', pitfalls: ['Pitfall.'], sources: ['Ref.'],
  }],
  ivus: [{ id: 'lumen', name: 'Lumen', definition: 'Def.', howToSee: 'See.', pitfalls: ['Pitfall.'], sources: ['Ref.'] }],
  cases: [{
    id: 'still-1', kind: 'angio-still', title: 'Still', summary: 'A still.', src: 'still-1.jpg', poster: 'still-1-thumb.jpg', width: 512, height: 512,
    markers: [{ segment: 'seg-5', at: [0.3, 0.3], r: 0.04 }],
    regions: [{ segment: 'seg-6', polygon: [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]] }],
    pins: [{ at: [0.5, 0.5], text: 'Lesion labelled 20 to 50 percent stenosis by the dataset.' }],
    source: { author: 'A', license: 'CC0 1.0', licenseUrl: 'https://l', url: 'https://u', attribution: '', modified: 'Converted.' },
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

test('the shipped tables and manifest pass every rule', () => {
  assert.deepEqual(validateContent(real()), []);
});

test('rejects a projection that lists a segment the table lacks, in each of its three lists', () => {
  for (const list of ['bestSeen', 'foreshortened', 'overlapped']) {
    const p = problemsAfter(t => { t.projections[0][list].push('seg-99'); });
    assert.deepEqual(p, [`projections["lao-cranial"].${list} lists unknown segment "seg-99"`], list);
  }
});

test('rejects markers, regions and pins that name a missing segment or sit outside the frame', () => {
  assert.match(problemsAfter(t => { t.cases[0].markers[0].segment = 'seg-99'; }).join(), /markers\[0\] names unknown segment "seg-99"/);
  assert.match(problemsAfter(t => { t.cases[0].regions[0].segment = 'seg-99'; }).join(), /regions\[0\] names unknown segment "seg-99"/);
  assert.match(problemsAfter(t => { t.cases[0].markers[0].at = [1.2, 0.3]; }).join(), /markers\[0\]\.at must be \[x, y\]/);
  assert.match(problemsAfter(t => { t.cases[0].pins[0].at = [0.5, -0.1]; }).join(), /pins\[0\]\.at/);
});

test('a polygon needs at least three points, each inside the frame', () => {
  assert.match(problemsAfter(t => { t.cases[0].regions[0].polygon = [[0.1, 0.1], [0.2, 0.2]]; }).join(), /polygon must be a list of at least 3/);
  assert.match(problemsAfter(t => { t.cases[0].regions[0].polygon[1] = [0.2, 1.01]; }).join(), /polygon must be/);
  assert.match(problemsAfter(t => { t.cases[0].regions[0].polygon = 'x'; }).join(), /polygon must be/);
});

test('pin text stops at 90 characters', () => {
  assert.deepEqual(problemsAfter(t => { t.cases[0].pins[0].text = 'x'.repeat(90); }), []);
  assert.match(problemsAfter(t => { t.cases[0].pins[0].text = 'x'.repeat(91); }).join(), /pins\[0\]\.text must be non-empty text of 90 characters or fewer/);
});

test('a case projection must be in the projection table', () => {
  assert.deepEqual(problemsAfter(t => { t.cases[0].projection = 'lao-cranial'; }), []);
  assert.match(problemsAfter(t => { t.cases[0].projection = 'ghost'; }).join(), /projection "ghost" is not a projection/);
});

const withAngles = (primary, secondary, projection) => t => {
  Object.assign(t.cases[0], { angles: { primary, secondary }, ...(projection && { projection }) });
};
const LAO45_CRA20 = [{ side: 'LAO', angle: 45 }, { direction: 'cranial', angle: 20 }];

test('stated angles are a primary side and angle plus a secondary direction and angle, and decimals are fine', () => {
  assert.deepEqual(problemsAfter(withAngles(...LAO45_CRA20)), []);
  assert.deepEqual(problemsAfter(withAngles({ side: 'RAO', angle: 2.7 }, { direction: 'cranial', angle: 28.7 })), []);
  assert.match(problemsAfter(withAngles({ side: 'left', angle: 45 }, LAO45_CRA20[1])).join(), /angles\.primary\.side is "left", expected one of LAO, RAO, AP/);
  assert.match(problemsAfter(withAngles(LAO45_CRA20[0], { direction: 'up', angle: 20 })).join(), /angles\.secondary\.direction is "up"/);
  assert.match(problemsAfter(withAngles({ side: 'LAO', angle: 91 }, LAO45_CRA20[1])).join(), /angles\.primary\.angle must be a number from 0 to 90/);
  assert.match(problemsAfter(withAngles(LAO45_CRA20[0], { direction: 'caudal', angle: -5 })).join(), /angles\.secondary\.angle must be a number from 0 to 90/);
  assert.match(problemsAfter(t => { t.cases[0].angles = { primary: LAO45_CRA20[0] }; }).join(), /angles\.secondary must be an object/);
  assert.match(problemsAfter(t => { t.cases[0].angles = 'LAO 45'; }).join(), /angles must be an object/);
});

test('stated angles follow the same AP and no-tilt rules as the projection table', () => {
  assert.match(problemsAfter(withAngles({ side: 'AP', angle: 10 }, LAO45_CRA20[1])).join(), /cases\["still-1"\]\.angles is AP, so primary\.angle must be 0/);
  assert.match(problemsAfter(withAngles(LAO45_CRA20[0], { direction: 'none', angle: 20 })).join(), /cases\["still-1"\]\.angles has no tilt, so secondary\.angle must be 0/);
  assert.deepEqual(problemsAfter(withAngles({ side: 'AP', angle: 0 }, { direction: 'none', angle: 0 })), []);
});

test('a named view beside stated angles must be within 15 degrees of its typical angles on both axes', () => {
  // lao-cranial is LAO 45, cranial 20 in the base table.
  assert.deepEqual(problemsAfter(withAngles({ side: 'LAO', angle: 60 }, { direction: 'cranial', angle: 35 }, 'lao-cranial')), []);
  assert.match(problemsAfter(withAngles({ side: 'LAO', angle: 61 }, LAO45_CRA20[1], 'lao-cranial')).join(), /projection "lao-cranial" is not within 15 degrees of the stated angles LAO 61, cranial 20/);
  assert.match(problemsAfter(withAngles(LAO45_CRA20[0], { direction: 'cranial', angle: 36 }, 'lao-cranial')).join(), /is not within 15 degrees/);
  assert.match(problemsAfter(withAngles({ side: 'RAO', angle: 45 }, LAO45_CRA20[1], 'lao-cranial')).join(), /is not within 15 degrees/, 'RAO is on the other side of LAO');
  assert.deepEqual(problemsAfter(withAngles({ side: 'RAO', angle: 45 }, LAO45_CRA20[1])), [], 'with no named view there is nothing to be near');
});

test('a named view without stated angles is allowed, because the source named it', () => {
  assert.deepEqual(problemsAfter(t => { t.cases[0].projection = 'lao-cranial'; }), []);
});

test('kinds are the four known ones and a clip needs fps and duration', () => {
  assert.match(problemsAfter(t => { t.cases[0].kind = 'ct-volume'; }).join(), /kind is "ct-volume", expected one of/);
  const clip = t => Object.assign(t.cases[0], { kind: 'angio-clip', src: 'a.mp4' });
  assert.match(problemsAfter(clip).join(), /is a clip, so it needs fps and durationSec/);
  assert.deepEqual(problemsAfter(t => { clip(t); Object.assign(t.cases[0], { fps: 10, durationSec: 4.9 }); }), []);
});

test('only licenses that allow republishing pass', () => {
  for (const ok of ['CC0 1.0', 'Public domain', 'CC BY 4.0', 'CC BY-SA 2.5']) assert.equal(licenseAllowed(ok), true, ok);
  for (const no of ['CC BY-NC 4.0', 'CC BY-ND 4.0', 'All rights reserved', '']) assert.equal(licenseAllowed(no), false, no);
  assert.match(problemsAfter(t => { t.cases[0].source.license = 'CC BY-NC 4.0'; }).join(), /license "CC BY-NC 4\.0" is not allowed/);
});

test('ids are unique, kebab-case, and a case may not take a reference screen id', () => {
  assert.match(problemsAfter(t => { t.segments.push({ ...t.segments[0] }); }).join(), /duplicate id/);
  assert.match(problemsAfter(t => { t.segments[0].id = 'Seg_5'; }).join(), /id must be a kebab-case id/);
  assert.match(problemsAfter(t => { t.cases[0].id = 'ref-segments'; }).join(), /must not start with "ref-"/);
  assert.match(problemsAfter(t => { t.segments[1].syntax = '5'; }).join(), /syntax "5" is used twice/);
});

test('an AP view has no rotation and a view with no tilt has no angle', () => {
  assert.match(problemsAfter(t => { t.projections[0].primary = { side: 'AP', angle: 10 }; }).join(), /is AP, so primary\.angle must be 0/);
  assert.match(problemsAfter(t => { t.projections[0].secondary = { direction: 'none', angle: 20 }; }).join(), /has no tilt, so secondary\.angle must be 0/);
});

test('a table that is not a list is reported once and stops the checks', () => {
  assert.deepEqual(problemsAfter(t => { t.segments = {}; }), ['segments must be a list']);
});

test('the media of every shipped case exists and carries a source credit', () => {
  const dir = new URL('../data/cath/', import.meta.url);
  for (const c of real().cases) {
    for (const file of [c.src, c.poster]) assert.ok(existsSync(new URL(file, dir)), `${c.id} ${file}`);
    assert.ok(c.source.author && c.source.url && c.source.modified, c.id);
  }
});

test('regions and pins on shipped cases follow the source rules', () => {
  const { cases, segments } = real();
  const named = new Set(segments.map(s => s.id));
  for (const c of cases) {
    // ARCADE and CADICA state no projection for their images, so none of their cases may name a view or give angles.
    if (/^(arcade|cadica)-/.test(c.id)) assert.deepEqual([c.projection, c.angles], [undefined, undefined], `${c.id} states a view`);
    for (const r of c.regions ?? []) assert.ok(named.has(r.segment), `${c.id} ${r.segment}`);
    for (const p of c.pins ?? []) assert.match(p.text, /^Lesion labelled \d+ to \d+ percent stenosis by the dataset\.$/, c.id);
  }
});

test('a shipped case with stated angles names the nearest listed view of its system, or none when no view is within 15 degrees', () => {
  const content = indexContent(real());
  const angled = content.cases.filter(c => c.angles);
  assert.ok(angled.length > 0, 'the shipped manifest has cases with stated angles');
  for (const c of angled) {
    const system = caseSystem(c, content);
    const near = system && matchProjection(entryAngle(c.angles), content.projections, system);
    assert.equal(c.projection, near ? near.entry.id : undefined, c.id);
  }
  assert.ok(angled.some(c => c.projection) && angled.some(c => !c.projection), 'both outcomes are on the shelf');
});

test('indexContent finds rows by id', () => {
  const idx = indexContent(real());
  assert.equal(idx.segment.get('seg-6').name, 'Proximal LAD');
  assert.equal(idx.projection.get('lao-caudal').aliases[0], 'Spider view');
  assert.equal(idx.concept.get('plaque-burden').name.startsWith('Plaque'), true);
  assert.equal(idx.case.get('arcade-14').regions.length, 8);
});
