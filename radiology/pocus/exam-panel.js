// The side panel: the case, the windows to find, what the probe sees right now, and the review of saved images.
// Learn mode shows everything. Exam mode hides the diagnosis, the structure names and the "show me" buttons, and scores what is saved.

import { h } from '../core/dom.js';
import { SCENARIOS } from './scenarios.js';
import { EXAMS, WINDOWS, windowById } from './windows.js';
import { structureName } from './exam.js';

const pct = x => `${Math.round(x * 100)}%`;

export function createExamPanel({ onCase, onExam, onMode, onGoto, onAnswer, onFinish, onRestart, onToggle }) {
  const caseSelect = h('select', { id: 'case-select', 'aria-label': 'Patient case' }, ...SCENARIOS.map(s => h('option', { value: s.id }, `${s.title}`)));
  caseSelect.addEventListener('change', () => onCase(caseSelect.value));
  const examSelect = h('select', { id: 'exam-select', 'aria-label': 'Exam', class: 'ep-exam' },
    h('option', { value: 'free' }, 'Free scanning'), ...Object.entries(EXAMS).map(([id, e]) => h('option', { value: id }, e.name)));
  examSelect.addEventListener('change', () => onExam(examSelect.value));
  const modeLearn = h('button', { type: 'button', class: 'seg', role: 'radio', 'aria-checked': 'true', onclick: () => onMode('learn') }, 'Learn');
  const modeExam = h('button', { type: 'button', class: 'seg', role: 'radio', 'aria-checked': 'false', onclick: () => onMode('exam') }, 'Test myself');
  const modeRow = h('div', { class: 'segment', role: 'radiogroup', 'aria-label': 'Mode' }, modeLearn, modeExam);

  const story = h('div', { class: 'ep-story' });
  const toggles = h('div', { class: 'ep-toggles' });
  const mk = (id, label, on) => {
    const c = h('input', { type: 'checkbox', id, checked: on ? true : null });
    c.addEventListener('change', () => onToggle(id, c.checked));
    toggles.append(h('label', { class: 'ep-check', for: id }, c, label));
    return c;
  };
  const cLabels = mk('t-labels', 'Name the structures on the image', false);
  const cCut = mk('t-cut', 'Show the plane inside the patient', true);
  const cBody = mk('t-body', 'Show the body map on the screen', true);

  const winList = h('ol', { class: 'ep-windows' });
  const inView = h('div', { class: 'ep-inview', 'aria-live': 'off' });
  const review = h('div', { class: 'ep-review', hidden: true, role: 'region', 'aria-label': 'Saved image' });
  const gallery = h('div', { class: 'ep-gallery' });
  const report = h('div', { class: 'ep-report', hidden: true });
  const timer = h('div', { class: 'ep-timer' });
  const finish = h('button', { type: 'button', class: 'primary', onclick: onFinish }, 'Finish exam');
  const restart = h('button', { type: 'button', onclick: onRestart }, 'Start again');

  const el = h('div', { class: 'exam-panel' },
    h('section', { class: 'ep-sec' }, h('h2', {}, 'Case'), caseSelect, story),
    h('section', { class: 'ep-sec' }, h('h2', {}, 'In view now'), inView),
    h('section', { class: 'ep-sec' }, h('h2', {}, 'Exam'), examSelect, modeRow, timer, winList, h('div', { class: 'ep-row' }, finish, restart)),
    review, report,
    h('section', { class: 'ep-sec' }, h('h2', {}, 'Saved images'), gallery),
    h('section', { class: 'ep-sec' }, h('h2', {}, 'Display'), toggles));

  function renderCase(scenario, examMode, scored) {
    caseSelect.value = scenario.id;
    story.replaceChildren(
      h('p', { class: 'ep-level' }, scenario.level),
      h('p', {}, scenario.story),
      examMode && !scored
        ? h('p', { class: 'muted' }, 'The findings are hidden. Scan, save the views you can get, and answer what each shows.')
        : h('div', {},
          h('h3', {}, 'What to learn'),
          h('ul', { class: 'ep-teach' }, ...scenario.teach.map(t => h('li', {}, t)))));
  }

  // state: { exam, examId, mode, results: {windowId: {quality, answer}}, current, windows poses ok }
  function renderWindows(state) {
    const ids = state.examId === 'free' ? WINDOWS.map(w => w.id) : EXAMS[state.examId].windows;
    const learn = state.mode === 'learn';
    winList.replaceChildren(...ids.map(id => {
      const w = windowById(id);
      const r = state.results[id];
      const open = learn && state.current === id;
      const status = r ? h('span', { class: 'badge ok' }, learn ? `Quality ${pct(r.quality)}` : 'Saved') : h('span', { class: 'badge' }, w.group);
      return h('li', { class: `ep-win${r ? ' done' : ''}${state.current === id ? ' current' : ''}` },
        h('div', { class: 'ep-win-head' },
          h('span', { class: 'ep-win-name' }, w.name), status,
          learn ? h('button', { type: 'button', class: 'ep-show', disabled: !w.pose, title: `Move the probe to the ${w.name} window`, onclick: () => onGoto(id) }, 'Show me') : null),
        open ? h('p', { class: 'ep-where' }, w.where) : null,
        open ? h('ul', { class: 'ep-look' }, ...w.look.map(t => h('li', {}, t))) : null);
    }));
  }

  function renderInView(names, windowId, learn) {
    inView.replaceChildren();
    if (!learn) { inView.append(h('p', { class: 'muted' }, 'Hidden while you test yourself.')); return; }
    if (!names.length) { inView.append(h('p', { class: 'muted' }, 'Nothing in the picture yet. Is the probe on the skin, with the face flat against it?')); return; }
    for (const n of names) inView.append(h('span', { class: `chip${n.need ? ' need' : ''}` }, structureName(n.id)));
    void windowId;
  }

  function renderTimer(seconds, running) {
    timer.textContent = running ? `Time ${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '';
  }

  function renderReview(rec) {
    review.hidden = !rec;
    if (!rec) return;
    review.replaceChildren(
      h('h2', {}, rec.window ? `Saved: ${rec.window.name}` : 'Saved image'),
      h('p', {}, rec.window
        ? `This looks like the ${rec.window.short} view. Quality ${pct(rec.quality)}.${rec.missing.length ? ` Missing: ${rec.missing.map(structureName).join(', ')}.` : ''}`
        : 'This does not match any of the standard views yet.'),
      rec.window ? h('div', {},
        h('p', { class: 'ep-q' }, rec.window.question),
        h('div', { class: 'ep-answers', role: 'group', 'aria-label': 'Your answer' },
          ...['yes', 'no', 'unsure'].map(a => h('button', { type: 'button', class: `ep-ans${rec.answer === a ? ' on' : ''}`, 'aria-pressed': String(rec.answer === a), onclick: () => onAnswer(a) }, { yes: 'Yes', no: 'No', unsure: 'Not sure' }[a])))) : null,
      rec.feedback ? h('p', { class: rec.feedback.ok ? 'ep-fb ok' : 'ep-fb bad' }, rec.feedback.text) : null);
  }

  function renderGallery(items) {
    gallery.replaceChildren(...(items.length ? items.map(it => h('figure', { class: 'ep-shot' },
      h('img', { src: it.url, alt: `${it.name}, saved image` }),
      h('figcaption', {}, `${it.name}${it.answer ? ` · ${it.answer}` : ''}`))) : [h('p', { class: 'muted' }, 'Press Save on the machine (or S) to keep an image.')]));
  }

  function renderReport(r, scenario) {
    report.hidden = !r;
    if (!r) return;
    report.replaceChildren(
      h('h2', {}, `Result: ${Math.round(r.total)} / 100`),
      h('p', {}, scenario.story),
      h('table', { class: 'ep-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'View'), h('th', {}, 'Image'), h('th', {}, 'Your answer'), h('th', {}, 'Truth'))),
        h('tbody', {}, ...r.rows.map(row => h('tr', { class: row.missedPositive ? 'bad' : '' },
          h('td', {}, row.short), h('td', {}, row.acquired ? pct(row.acquisition) : 'not saved'),
          h('td', {}, row.answer ?? '–'), h('td', {}, row.truth ? 'Positive' : 'Negative'))))),
      r.missed.length ? h('p', { class: 'ep-fb bad' }, `Missed a positive finding in: ${r.missed.join(', ')}. A missed positive is the costly error in trauma.`) : null,
      r.falseAlarms.length ? h('p', { class: 'ep-fb' }, `Called positive but negative in: ${r.falseAlarms.join(', ')}.`) : null,
      h('h3', {}, 'What to learn'), h('ul', { class: 'ep-teach' }, ...scenario.teach.map(t => h('li', {}, t))));
  }

  function setMode(mode) {
    modeLearn.setAttribute('aria-checked', String(mode === 'learn'));
    modeExam.setAttribute('aria-checked', String(mode === 'exam'));
    finish.hidden = mode !== 'exam';
    restart.hidden = mode !== 'exam';
  }

  return { el, renderCase, renderWindows, renderInView, renderTimer, renderReview, renderGallery, renderReport, setMode, setExam: v => { examSelect.value = v; }, toggles: { cLabels, cCut, cBody } };
}
