// Exam logic: which standard view an image is, how good it is, and the score. Pure functions over the visibility of structures,
// so the same code rates a live image, a saved one, and a test fixture.

import { scoreView } from './visibility.js';
import { WINDOWS, EXAMS, windowById } from './windows.js';
import { STRUCTURES } from './patient.js';

export const structureName = id => STRUCTURES.find(s => s.id === id)?.name ?? id;

// How well the image depth suits the view: full marks within a sensible band around the window's own depth.
export function depthFit(depth, target) {
  const r = depth / target;
  if (r >= 0.65 && r <= 1.35) return 1;
  if (r < 0.65) return Math.max(0, r / 0.65 - 0.2);
  return Math.max(0, 1 - (r - 1.35) * 1.4);
}

// Mean brightness of the image against what a clinician would accept: neither a black screen nor a white one.
export function brightnessFit(mean) {
  if (!Number.isFinite(mean)) return 1;
  if (mean >= 0.22 && mean <= 0.6) return 1;
  return mean < 0.22 ? Math.max(0, mean / 0.22) : Math.max(0, 1 - (mean - 0.6) / 0.25);
}

// view: from visibleStructures. machine: { depth }. grayMean: mean grey of the image from 0 to 1, if known.
export function evaluateView(view, spec, { depth, grayMean = NaN }) {
  const coverage = scoreView(view, spec.need);
  const missing = Object.entries(spec.need).filter(([id, area]) => (view.areas.get(id) ?? 0) < area * 0.85).map(([id]) => id);
  const shadow = view.total > 0 ? view.blocked / view.total : 1;
  const dFit = depthFit(depth, spec.depth);
  const bFit = brightnessFit(grayMean);
  const quality = Math.max(0, Math.min(1, coverage * 0.62 + dFit * 0.14 + bFit * 0.12 + (1 - Math.min(1, shadow * 1.4)) * 0.12));
  return { coverage, missing, shadow, depthFit: dFit, brightnessFit: bFit, quality, ok: coverage >= 0.85 };
}

// Which of an exam's windows an image is most likely meant to be: the one whose needs it meets best.
export function recognise(view, windowIds, depth) {
  let best = null;
  for (const id of windowIds) {
    const spec = windowById(id);
    if (!spec) continue;
    const cov = scoreView(view, spec.need);
    if (!best || cov > best.coverage) best = { id, coverage: cov, spec };
  }
  return best && best.coverage >= 0.5 ? { ...best, depth } : null;
}

// What the student wrote for a window against the truth of the case: 'yes', 'no' or 'unsure'.
export function answerScore(answer, truth) {
  if (answer === 'unsure' || !answer) return 0;
  return (answer === 'yes') === !!truth ? 1 : 0;
}

// results: { windowId: { quality, answer } }. P and lung: the case. A missed positive costs the whole interpretation mark.
export function scoreExam(examId, results, P, lung = {}) {
  const exam = EXAMS[examId];
  const rows = exam.windows.map(id => {
    const spec = windowById(id);
    const r = results[id];
    const truth = spec.truth(P, lung);
    const acquisition = r ? r.quality : 0;
    const interpretation = r ? answerScore(r.answer, truth) : 0;
    return {
      id, name: spec.name, short: spec.short, acquired: !!r, acquisition, answer: r?.answer ?? null, truth, interpretation,
      missedPositive: !!(truth && r && r.answer !== 'yes') || !!(truth && !r),
      falseAlarm: !!(!truth && r?.answer === 'yes'),
      points: 0.5 * acquisition + 0.5 * interpretation,
    };
  });
  const total = (100 * rows.reduce((a, r) => a + r.points, 0)) / rows.length;
  return { rows, total, missed: rows.filter(r => r.missedPositive).map(r => r.short), falseAlarms: rows.filter(r => r.falseAlarm).map(r => r.short) };
}

export { WINDOWS };
