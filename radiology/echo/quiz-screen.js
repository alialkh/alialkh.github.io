import { h } from '../core/dom.js';
import { startQuiz, quizReducer, currentQuestion, lastResult, accuracy, missed } from '../core/quiz.js';
import { buildDeck } from './questions.js';
import { createPlayer, credit } from './player.js';

const TOPICS = { view: 'View recognition', structure: 'Structures', diagnosis: 'Diagnosis' };
const newSeed = () => Math.floor(Math.random() * 2 ** 32);

export function renderQuiz(main, content) {
  let state = startQuiz(buildDeck(content, newSeed()));
  let player = null;
  const root = h('div', { class: 'quiz' });
  const status = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });
  main.append(h('h2', {}, 'Quiz'), status, root);

  if (!state.deck.length) {
    root.append(h('p', { class: 'empty' }, 'No questions yet. Questions are generated from clips, and none have been added.'));
    return;
  }

  function dispatch(action) {
    state = quizReducer(state, action);
    if (state.phase === 'revealed') showFeedback();
    else if (state.phase === 'asking') showQuestion();
    else showSummary();
  }

  const answerOf = q => (q.kind === 'choice' ? q.options.find(o => o.id === q.correct).label : content.structure.get(q.structure).name);
  let answerArea;
  let feedback;
  function showQuestion() {
    const q = currentQuestion(state);
    const clip = content.clip.get(q.clip);
    player?.destroy();
    player = createPlayer(clip, { markers: [], showCredit: false, fullscreen: false, nameOf: id => content.structure.get(id).name });
    feedback = h('div', { class: 'feedback' });
    answerArea = q.kind === 'choice'
      ? h('div', { class: 'options' }, q.options.map(o => h('button', { type: 'button', 'data-id': o.id, onclick: () => dispatch({ type: 'answer', response: o.id }) }, o.label)))
      : pointTarget(player.stage, response => dispatch({ type: 'answer', response }));
    root.replaceChildren(
      h('p', { class: 'muted' }, `Question ${state.index + 1} of ${state.deck.length}. ${TOPICS[q.topic]}.`),
      h('p', { class: 'prompt' }, q.prompt),
      player.el,
      q.kind === 'choice' ? answerArea : h('p', { class: 'muted' }, 'Click the frame, or focus it and use the arrow keys and Enter.'),
      feedback);
    (q.kind === 'choice' ? answerArea.querySelector('button') : answerArea).focus({ preventScroll: true });
  }

  function showFeedback() {
    const q = currentQuestion(state);
    const { correct, response } = lastResult(state);
    if (q.kind === 'choice') {
      for (const b of answerArea.querySelectorAll('button')) {
        b.disabled = true;
        b.classList.toggle('correct', b.dataset.id === q.correct);
        b.classList.toggle('wrong', b.dataset.id === response && !correct);
      }
    } else {
      answerArea.remove();
      player.setMarkers([{ structure: q.structure, at: q.correct.at, r: q.correct.r }]);
      player.setLabels(true);
      player.stage.append(h('span', { class: `answer-dot ${correct ? 'correct' : 'wrong'}`, style: `left: ${response[0] * 100}%; top: ${response[1] * 100}%` }));
    }
    const verdict = correct ? 'Correct.' : `Not quite. The answer is ${answerOf(q)}.`;
    status.textContent = verdict;
    const last = state.index + 1 === state.deck.length;
    const next = h('button', { type: 'button', class: 'primary', onclick: () => dispatch({ type: 'next' }) }, last ? 'See results' : 'Next question');
    feedback.replaceChildren(
      h('p', { class: `verdict ${correct ? 'correct' : 'wrong'}` }, verdict),
      h('p', {}, q.explanation),
      credit(content.clip.get(q.clip)),
      next);
    next.focus({ preventScroll: true });
  }

  function showSummary() {
    player?.destroy();
    player = null;
    const right = state.results.filter(r => r.correct).length;
    const misses = missed(state);
    const rows = Object.entries(accuracy(state, 'topic')).map(([topic, a]) => h('tr', {},
      h('th', { scope: 'row' }, TOPICS[topic]), h('td', {}, `${a.correct} of ${a.total}`), h('td', {}, `${Math.round((100 * a.correct) / a.total)}%`)));
    status.textContent = `Finished. ${right} of ${state.deck.length} correct.`;
    root.replaceChildren(
      h('p', { class: 'score' }, `You scored ${right} of ${state.deck.length}.`),
      h('table', { class: 'accuracy' }, h('thead', {}, h('tr', {}, h('th', {}, 'Question type'), h('th', {}, 'Correct'), h('th', {}, 'Accuracy'))), h('tbody', {}, rows)),
      misses.length ? h('h3', {}, 'Missed') : null,
      misses.length ? h('ul', {}, misses.map(q => h('li', {}, q.kind === 'choice' ? `${q.prompt} ${answerOf(q)}.` : q.prompt))) : null,
      h('div', { class: 'button-row' },
        misses.length ? h('button', { type: 'button', class: 'primary', onclick: () => dispatch({ type: 'reviewMisses' }) }, `Review misses (${misses.length})`) : null,
        h('button', { type: 'button', onclick: () => dispatch({ type: 'restart' }) }, 'Retry this round'),
        h('button', { type: 'button', onclick: () => { state = startQuiz(buildDeck(content, newSeed())); showQuestion(); } }, 'New quiz')));
    root.querySelector('.button-row button').focus({ preventScroll: true });
  }

  showQuestion();
  return () => player?.destroy();
}

// Click target over the frame, with a keyboard crosshair so point questions work without a mouse.
function pointTarget(stage, onAnswer) {
  let at = [0.5, 0.5];
  const cross = h('span', { class: 'crosshair' });
  const place = () => Object.assign(cross.style, { left: `${at[0] * 100}%`, top: `${at[1] * 100}%` });
  const target = h('div', {
    class: 'target', tabindex: '0', role: 'application',
    'aria-label': 'Answer area. Click the structure, or move the crosshair with the arrow keys and press Enter.',
    onclick: e => {
      const r = stage.getBoundingClientRect();
      onAnswer([(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]);
    },
    onkeydown: e => {
      const d = e.shiftKey ? 0.1 : 0.02;
      const moves = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
      if (moves[e.key]) at = at.map((v, i) => Math.min(1, Math.max(0, v + moves[e.key][i])));
      else if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      if (moves[e.key]) place();
      else onAnswer(at);
    },
  }, cross);
  place();
  stage.append(target);
  return target;
}
