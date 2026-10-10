import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeck } from './questions.js';
import { indexContent } from './content.js';
import { isCorrect } from '../core/quiz.js';

const view = (id, window) => ({ id, name: `View ${id}`, abbrev: id.toUpperCase(), window, tips: [`Tip for ${id}.`], structures: ['lv', 'la'] });
const condition = (id, system) => ({ id, name: `Condition ${id}`, system, findings: [`Finding of ${id}.`] });
const clip = (id, viewId, extra = {}) => ({ id, view: viewId, width: 800, height: 400, markers: [], ...extra });

const content = (clips = [
  clip('plax-normal', 'plax', { markers: [{ structure: 'lv', at: [0.5, 0.5], r: 0.1 }, { structure: 'la', at: [0.7, 0.4], r: 0.08 }] }),
  clip('a4c-ms', 'a4c', { condition: 'ms' }),
  clip('plax-eff', 'plax', { condition: 'effusion' }),
]) => indexContent({
  structures: [{ id: 'lv', name: 'Left ventricle', description: 'Main chamber.' }, { id: 'la', name: 'Left atrium', description: 'Upper chamber.' }],
  views: [view('plax', 'parasternal'), view('psax-av', 'parasternal'), view('psax-mv', 'parasternal'), view('rv-inflow', 'parasternal'), view('a4c', 'apical'), view('a2c', 'apical')],
  conditions: [condition('ms', 'valves'), condition('as', 'valves'), condition('effusion', 'pericardium'), condition('tamponade', 'pericardium'), condition('dcm', 'cardiomyopathy')],
  clips,
});

const choices = deck => deck.filter(q => q.kind === 'choice');
const seeds = Array.from({ length: 20 }, (_, i) => i + 1);

test('the same seed gives the same deck and another seed reorders it', () => {
  assert.deepEqual(buildDeck(content(), 7), buildDeck(content(), 7));
  assert.notDeepEqual(buildDeck(content(), 7), buildDeck(content(), 8));
});

test('question ids are stable across seeds', () => {
  const ids = seed => buildDeck(content(), seed).map(q => q.id).sort();
  assert.deepEqual(ids(1), ids(99));
  assert.deepEqual(ids(1), [
    'diagnosis:a4c-ms', 'diagnosis:plax-eff',
    'structure:plax-normal:la', 'structure:plax-normal:lv',
    'view:a4c-ms', 'view:plax-eff', 'view:plax-normal',
  ]);
});

test('the correct answer is always among unique options', () => {
  for (const seed of seeds) {
    for (const q of choices(buildDeck(content(), seed))) {
      const ids = q.options.map(o => o.id);
      assert.ok(ids.includes(q.correct), `${q.id} seed ${seed}`);
      assert.equal(new Set(ids).size, ids.length, `${q.id} seed ${seed}`);
      assert.equal(ids.length, 4);
    }
  }
});

test('view distractors come from the same window first', () => {
  for (const seed of seeds) {
    const deck = buildDeck(content(), seed);
    const plax = deck.find(q => q.id === 'view:plax-normal');
    assert.deepEqual(plax.options.map(o => o.id).sort(), ['plax', 'psax-av', 'psax-mv', 'rv-inflow']);
    const a4c = deck.find(q => q.id === 'view:a4c-ms');
    assert.ok(a4c.options.some(o => o.id === 'a2c'), `seed ${seed}`);
  }
});

test('diagnosis distractors come from the same system first', () => {
  for (const seed of seeds) {
    const q = buildDeck(content(), seed).find(x => x.id === 'diagnosis:a4c-ms');
    assert.ok(q.options.some(o => o.id === 'as'), `seed ${seed}`);
  }
});

test('a point question carries the marker and the frame aspect, and its own marker scores', () => {
  const q = buildDeck(content(), 3).find(x => x.id === 'structure:plax-normal:lv');
  assert.deepEqual({ kind: q.kind, correct: q.correct, aspect: q.aspect }, { kind: 'point', correct: { at: [0.5, 0.5], r: 0.1 }, aspect: 2 });
  assert.equal(q.prompt, 'Click the left ventricle.');
  assert.equal(isCorrect(q, [0.5, 0.5]), true);
  assert.equal(isCorrect(q, [0.7, 0.4]), false);
});

test('explanations draw on view tips and condition findings', () => {
  const deck = buildDeck(content(), 5);
  assert.match(deck.find(q => q.id === 'view:a4c-ms').explanation, /Tip for a4c\./);
  assert.match(deck.find(q => q.id === 'diagnosis:a4c-ms').explanation, /Finding of ms\./);
});

test('no clips gives an empty deck, and a lone option is not a question', () => {
  assert.deepEqual(buildDeck(content([]), 1), []);
  const single = indexContent({
    structures: [], views: [view('plax', 'parasternal')], conditions: [condition('ms', 'valves')],
    clips: [clip('c1', 'plax', { condition: 'ms' })],
  });
  assert.deepEqual(buildDeck(single, 1), []);
});
