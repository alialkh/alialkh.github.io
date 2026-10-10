import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startQuiz, quizReducer, missed, accuracy, isHit, mulberry32, shuffle, currentQuestion } from './quiz.js';

const choice = (id, correct = 'a') => ({ id, kind: 'choice', options: [{ id: 'a' }, { id: 'b' }], correct });
const point = id => ({ id, kind: 'point', correct: { at: [0.5, 0.5], r: 0.1 }, aspect: 2 });
const run = (state, ...actions) => actions.reduce(quizReducer, state);
const answer = response => ({ type: 'answer', response });
const next = { type: 'next' };

test('phases go asking, revealed, asking, then done after the last question', () => {
  const s0 = startQuiz([choice('q1'), choice('q2')]);
  assert.equal(s0.phase, 'asking');
  const s1 = run(s0, answer('a'));
  assert.equal(s1.phase, 'revealed');
  const s2 = run(s1, next);
  assert.equal(s2.phase, 'asking');
  assert.equal(currentQuestion(s2).id, 'q2');
  assert.equal(run(s2, answer('b'), next).phase, 'done');
});

test('an empty deck starts done', () => {
  assert.equal(startQuiz([]).phase, 'done');
});

test('actions outside their phase leave the state unchanged', () => {
  const asking = startQuiz([choice('q1')]);
  assert.equal(quizReducer(asking, next), asking);
  const revealed = run(asking, answer('a'));
  assert.equal(quizReducer(revealed, answer('b')), revealed);
  assert.equal(quizReducer(revealed, { type: 'reviewMisses' }), revealed);
});

test('scores choice answers and groups accuracy by kind', () => {
  const s = run(startQuiz([choice('q1'), choice('q2'), point('p1')]), answer('a'), next, answer('b'), next, answer([0.5, 0.5]), next);
  assert.deepEqual(s.results.map(r => r.correct), [true, false, true]);
  assert.deepEqual(accuracy(s), { choice: { correct: 1, total: 2 }, point: { correct: 1, total: 1 } });
  assert.deepEqual(missed(s).map(q => q.id), ['q2']);
});

test('accuracy can group by another question field', () => {
  const deck = [{ ...choice('q1'), topic: 'view' }, { ...choice('q2'), topic: 'diagnosis' }];
  const s = run(startQuiz(deck), answer('a'), next, answer('b'), next);
  assert.deepEqual(accuracy(s, 'topic'), { view: { correct: 1, total: 1 }, diagnosis: { correct: 0, total: 1 } });
});

test('reviewMisses starts a fresh round with only the missed questions', () => {
  const done = run(startQuiz([choice('q1'), choice('q2'), choice('q3')]), answer('b'), next, answer('a'), next, answer('b'), next);
  const review = quizReducer(done, { type: 'reviewMisses' });
  assert.equal(review.phase, 'asking');
  assert.deepEqual(review.deck.map(q => q.id), ['q1', 'q3']);
  assert.deepEqual(review.results, []);
});

test('reviewMisses does nothing when there were no misses', () => {
  const done = run(startQuiz([choice('q1')]), answer('a'), next);
  assert.equal(quizReducer(done, { type: 'reviewMisses' }), done);
});

test('restart returns to the first question with no results', () => {
  const s = run(startQuiz([choice('q1'), choice('q2')]), answer('b'), next, { type: 'restart' });
  assert.equal(s.phase, 'asking');
  assert.equal(currentQuestion(s).id, 'q1');
  assert.deepEqual(s.results, []);
});

test('point hit test measures r in frame widths and scales y by height over width', () => {
  const marker = { at: [0.5, 0.5], r: 0.1 };
  // Frame twice as wide as tall: 0.15 of the height is 0.075 of the width, inside r.
  assert.equal(isHit(marker, 2, [0.5, 0.65]), true);
  assert.equal(isHit(marker, 2, [0.5, 0.75]), false);
  assert.equal(isHit(marker, 2, [0.62, 0.5]), false);
  assert.equal(isHit(marker, 1, [0.5, 0.65]), false);
});

test('a point answer is graded with the question aspect', () => {
  const s = run(startQuiz([point('p1')]), answer([0.5, 0.68]));
  assert.equal(s.results[0].correct, true);
});

test('seeded shuffle is reproducible and keeps every item', () => {
  const items = Array.from({ length: 20 }, (_, i) => i);
  const a = shuffle(items, mulberry32(42));
  assert.deepEqual(a, shuffle(items, mulberry32(42)));
  assert.notDeepEqual(a, shuffle(items, mulberry32(43)));
  assert.deepEqual([...a].sort((x, y) => x - y), items);
  assert.notDeepEqual(a, items);
});
