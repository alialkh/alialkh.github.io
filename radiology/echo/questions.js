// Pure deck generator. Input is the indexed content from content.js, output is core/quiz.js questions.
import { mulberry32, shuffle } from '../core/quiz.js';

const OPTIONS = 4;

function options(answer, pool, near, random) {
  const others = pool.filter(x => x.id !== answer.id);
  const close = shuffle(others.filter(x => near(x)), random);
  const far = shuffle(others.filter(x => !near(x)), random);
  return shuffle([answer, ...close, ...far].slice(0, OPTIONS), random);
}

export function buildDeck(content, seed) {
  const random = mulberry32(seed);
  const deck = [];
  for (const clip of content.clips) {
    const view = content.view.get(clip.view);
    const views = options(view, content.views, v => v.window === view.window, random);
    if (views.length > 1) {
      deck.push({
        id: `view:${clip.id}`, kind: 'choice', topic: 'view', clip: clip.id,
        prompt: 'Which view is this?',
        options: views.map(v => ({ id: v.id, label: `${v.name} (${v.abbrev})` })),
        correct: view.id,
        explanation: [`This is the ${view.name} (${view.abbrev}), a ${view.window} view.`, ...view.tips].join(' '),
      });
    }
    for (const m of clip.markers) {
      const s = content.structure.get(m.structure);
      deck.push({
        id: `structure:${clip.id}:${s.id}`, kind: 'point', topic: 'structure', clip: clip.id,
        prompt: `Click the ${s.name.replace(/^[A-Z](?=[a-z])/, c => c.toLowerCase())}.`,
        correct: { at: m.at, r: m.r }, aspect: clip.width / clip.height, structure: s.id,
        explanation: `${s.name}. ${s.description}`,
      });
    }
    const condition = clip.condition && content.condition.get(clip.condition);
    if (!condition) continue;
    const diagnoses = options(condition, content.conditions, c => c.system === condition.system, random);
    if (diagnoses.length > 1) {
      deck.push({
        id: `diagnosis:${clip.id}`, kind: 'choice', topic: 'diagnosis', clip: clip.id,
        prompt: 'What is the most likely diagnosis?',
        options: diagnoses.map(c => ({ id: c.id, label: c.name })),
        correct: condition.id,
        explanation: [`${condition.name}.`, ...condition.findings].join(' '),
      });
    }
  }
  return shuffle(deck, random);
}
