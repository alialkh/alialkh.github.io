// Pure quiz state machine. No DOM, so node can test it.
// Question: { id, kind: 'choice', options: [{ id, label }], correct: optionId }
//         | { id, kind: 'point', correct: { at: [x, y], r }, aspect: width / height }

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(items, random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function isHit({ at: [mx, my], r }, aspect, [x, y]) {
  // r is a fraction of frame width, so the y offset is converted to width units.
  return Math.hypot(x - mx, (y - my) / aspect) <= r;
}

export function isCorrect(question, response) {
  return question.kind === 'point'
    ? isHit(question.correct, question.aspect, response)
    : response === question.correct;
}

export function startQuiz(deck) {
  return { phase: deck.length ? 'asking' : 'done', deck, index: 0, results: [] };
}

const TRANSITIONS = {
  asking: {
    answer: (s, { response }) => {
      const q = s.deck[s.index];
      return { ...s, phase: 'revealed', results: [...s.results, { id: q.id, response, correct: isCorrect(q, response) }] };
    },
  },
  revealed: {
    next: s => (s.index + 1 < s.deck.length ? { ...s, phase: 'asking', index: s.index + 1 } : { ...s, phase: 'done' }),
  },
  done: {
    reviewMisses: s => (missed(s).length ? startQuiz(missed(s)) : s),
  },
};

export function quizReducer(state, action) {
  if (action.type === 'restart') return startQuiz(state.deck);
  const step = TRANSITIONS[state.phase][action.type];
  return step ? step(state, action) : state;
}

export const currentQuestion = state => state.deck[state.index];
export const lastResult = state => state.results[state.results.length - 1];

export function missed(state) {
  const wrong = new Set(state.results.filter(r => !r.correct).map(r => r.id));
  return state.deck.filter(q => wrong.has(q.id));
}

// Accuracy grouped by a question field, 'kind' by default.
export function accuracy(state, key = 'kind') {
  const groups = {};
  state.results.forEach((r, i) => {
    const g = (groups[state.deck[i][key]] ??= { correct: 0, total: 0 });
    g.total++;
    if (r.correct) g.correct++;
  });
  return groups;
}
