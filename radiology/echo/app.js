import { h } from '../core/dom.js';
import { mountShell } from '../core/shell.js';
import { loadContent } from './content.js';
import { renderAtlas } from './atlas.js';
import { renderCases } from './cases.js';
import { renderQuiz } from './quiz-screen.js';
import { parseRoute } from './route.js';

const SCREENS = new Map([
  ['', { title: 'Echocardiography', render: renderHome }],
  ['atlas', { title: 'Echo atlas', render: renderAtlas, label: 'Atlas' }],
  ['cases', { title: 'Echo cases', render: renderCases, label: 'Cases' }],
  ['quiz', { title: 'Echo quiz', render: renderQuiz, label: 'Quiz' }],
]);

const { nav, main } = mountShell('Echocardiography');
nav.append(...[...SCREENS].filter(([, s]) => s.label).map(([id, s]) => h('a', { href: `#/${id}`, 'data-screen': id }, s.label)));

function renderHome(root, content) {
  const withClips = content.views.filter(v => content.normalClips.has(v.id)).length;
  const card = (href, title, text, count) => h('li', {}, h('a', { class: 'card', href }, h('h3', {}, title), h('p', {}, text), h('p', { class: 'muted' }, count)));
  root.append(
    h('h2', {}, 'Learn to read echocardiograms'),
    h('p', {}, 'Start with the standard views and the anatomy in each, then work through pathologic loops, then test yourself.'),
    content.clips.length ? null : h('p', { class: 'empty' }, 'No clips have been added yet. All the teaching text is here, and loops appear as licensed clips are added.'),
    h('ul', { class: 'cards' },
      card('#/atlas', 'View atlas', 'Probe placement, screen layout and labeled structures for each standard view.', `${content.views.length} views, ${withClips} with a clip`),
      card('#/cases', 'Pathology cases', 'Watch a loop, name what you see, then reveal the findings one at a time.', `${content.conditions.length} conditions, ${content.caseClips.size} with a clip`),
      card('#/quiz', 'Quiz', 'Name the view, click the structure and make the diagnosis.', `${content.clips.length} clips in the deck`)));
}

function showProblems(error) {
  main.replaceChildren(h('section', { class: 'problems', role: 'alert' },
    h('h2', {}, 'The echo content did not load'),
    h('p', {}, 'Nothing is shown until these problems are fixed.'),
    h('ul', {}, (error.problems ?? [error.message]).map(p => h('li', {}, p)))));
}

let content;
try {
  content = await loadContent(location.href);
} catch (error) {
  showProblems(error);
}

let cleanup = null;
let routed = false;
function route() {
  const found = parseRoute(location.hash, SCREENS);
  const screen = found && SCREENS.get(found.id);
  cleanup?.();
  cleanup = null;
  main.replaceChildren();
  for (const a of nav.querySelectorAll('a')) a.setAttribute('aria-current', a.dataset.screen === found?.id ? 'page' : 'false');
  if (!screen) {
    main.append(h('h2', {}, 'Page not found'), h('p', {}, h('a', { href: '#/' }, 'Back to the start')));
  } else {
    document.title = `${screen.title} · Radiology teaching`;
    cleanup = screen.render(main, content, found.arg) ?? null;
  }
  window.scrollTo(0, 0);
  // Every route change after the first, so a sidebar link that was just replaced never drops focus to body.
  if (routed) main.focus({ preventScroll: true });
  routed = true;
}

if (content) {
  addEventListener('hashchange', route);
  route();
}
