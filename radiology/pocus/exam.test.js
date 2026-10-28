import { test } from 'node:test';
import assert from 'node:assert/strict';
import { depthFit, brightnessFit, evaluateView, recognise, answerScore, scoreExam } from './exam.js';
import { EXAMS, WINDOW_SPECS, windowById } from './windows.js';
import { SCENARIOS, scenarioById, paramsOf } from './scenarios.js';
import { DEFAULTS, STRUCTURES } from './patient.js';

const viewOf = (areas, blocked = 0, total = 1000) => ({ areas: new Map(Object.entries(areas)), blocked, total, lines: 28, coupled: 28 });

test('depth is fine within a band around the window depth and falls off outside it', () => {
  assert.equal(depthFit(200, 200), 1);
  assert.equal(depthFit(150, 200), 1);
  assert.ok(depthFit(60, 200) < 0.5);
  assert.ok(depthFit(360, 200) < 0.5);
});

test('a black or a white screen is not a good image', () => {
  assert.equal(brightnessFit(0.4), 1);
  assert.ok(brightnessFit(0.05) < 0.3);
  assert.ok(brightnessFit(0.85) < 0.1);
  assert.equal(brightnessFit(NaN), 1);
});

test('a view that meets a window needs is ok, one that misses a structure is not and names it', () => {
  const ruq = windowById('ruq');
  const good = evaluateView(viewOf({ liver: 4000, 'right-kidney': 1500 }), ruq, { depth: 200, grayMean: 0.4 });
  assert.equal(good.ok, true);
  assert.ok(good.quality > 0.9);
  const bad = evaluateView(viewOf({ liver: 4000 }), ruq, { depth: 200, grayMean: 0.4 });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.missing, ['right-kidney']);
  assert.ok(bad.quality < good.quality);
});

test('shadow, wrong depth and a dark image each lower the quality', () => {
  const ruq = windowById('ruq');
  const v = viewOf({ liver: 4000, 'right-kidney': 1500 });
  const base = evaluateView(v, ruq, { depth: 200, grayMean: 0.4 }).quality;
  assert.ok(evaluateView(viewOf({ liver: 4000, 'right-kidney': 1500 }, 600), ruq, { depth: 200, grayMean: 0.4 }).quality < base);
  assert.ok(evaluateView(v, ruq, { depth: 60, grayMean: 0.4 }).quality < base);
  assert.ok(evaluateView(v, ruq, { depth: 200, grayMean: 0.05 }).quality < base);
});

test('an image is recognised as the window it best satisfies, and not at all when it is nothing', () => {
  const ids = EXAMS.efast.windows;
  assert.equal(recognise(viewOf({ liver: 4000, 'right-kidney': 1500 }), ids, 200).id, 'ruq');
  assert.equal(recognise(viewOf({ spleen: 2000, 'left-kidney': 900 }), ids, 200).id, 'luq');
  assert.equal(recognise(viewOf({ bladder: 4000 }), ids, 140).id, 'pelvis-long');
  assert.equal(recognise(viewOf({ liver: 100 }), ids, 200), null);
});

test('answers score only when they match the truth', () => {
  assert.equal(answerScore('yes', true), 1);
  assert.equal(answerScore('no', true), 0);
  assert.equal(answerScore('no', false), 1);
  assert.equal(answerScore('unsure', false), 0);
  assert.equal(answerScore(undefined, false), 0);
});

test('a perfect FAST on a positive case scores 100, an empty one scores 0, and a missed positive is named', () => {
  const sc = scenarioById('blunt-ruq');
  const P = paramsOf(sc, DEFAULTS);
  const perfect = Object.fromEntries(EXAMS.fast.windows.map(id => [id, { quality: 1, answer: windowById(id).truth(P, sc.lung) ? 'yes' : 'no' }]));
  assert.equal(scoreExam('fast', perfect, P).total, 100);
  assert.equal(scoreExam('fast', {}, P).total, 0);
  const missed = { ...perfect, ruq: { quality: 1, answer: 'no' } };
  const r = scoreExam('fast', missed, P);
  assert.deepEqual(r.missed, ['RUQ']);
  assert.ok(r.total < 100 && r.total > 70);
  const alarm = { ...perfect, luq: { quality: 1, answer: 'yes' } };
  assert.deepEqual(scoreExam('fast', alarm, P).falseAlarms, ['LUQ']);
});

test('every window spec is well formed and every exam names real windows', () => {
  const ids = new Set(WINDOW_SPECS.map(w => w.id));
  assert.equal(ids.size, WINDOW_SPECS.length);
  const known = new Set(STRUCTURES.map(s => s.id));
  for (const w of WINDOW_SPECS) {
    assert.ok(w.need && Object.keys(w.need).length, w.id);
    for (const k of [...Object.keys(w.need), ...(w.extra ?? [])]) assert.ok(known.has(k), `${w.id} names unknown structure ${k}`);
    assert.equal(typeof w.truth, 'function');
    assert.ok(w.question.endsWith('?'));
    assert.ok(['C5', 'P4', 'L12'].includes(w.probe));
  }
  for (const e of Object.values(EXAMS)) for (const id of e.windows) assert.ok(ids.has(id), `exam names ${id}`);
});

test('every case is complete and its findings match what its parameters do', () => {
  assert.ok(SCENARIOS.length >= 10);
  const seen = new Set();
  for (const s of SCENARIOS) {
    assert.ok(!seen.has(s.id), s.id);
    seen.add(s.id);
    assert.ok(s.story.length > 40 && s.title && s.teach.length >= 2, s.id);
    for (const k of Object.keys(s.params)) assert.ok(k in DEFAULTS, `${s.id} sets unknown parameter ${k}`);
    assert.ok(s.vitals.hr >= 40 && s.vitals.hr <= 160);
  }
  const P = scenarioById('blunt-ruq');
  assert.equal(windowById('ruq').truth(paramsOf(P, DEFAULTS)), true);
  assert.equal(windowById('luq').truth(paramsOf(P, DEFAULTS)), false);
  assert.equal(windowById('subxiphoid').truth(paramsOf(scenarioById('tamponade'), DEFAULTS)), true);
  assert.equal(windowById('lung-r').truth(paramsOf(scenarioById('pneumothorax'), DEFAULTS), {}), false);
  assert.equal(windowById('lung-r').truth(paramsOf(scenarioById('normal'), DEFAULTS), {}), true);
});
