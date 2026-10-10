import { h } from '../core/dom.js';
import { disclaimer } from '../core/shell.js';
import { loadContent } from './content.js';
import { caseList } from './case-list.js';
import { resolveRoute } from './route.js';
import { createPlayer, credit } from './player.js';
import { createControls } from './controls.js';
import { createPanel } from './panel.js';
import { createSidebar } from './sidebar.js';
import { icon } from './icons.js';

const narrow = matchMedia('(max-width: 800px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function showProblems(error) {
  document.body.replaceChildren(h('main', { class: 'problems-page' },
    h('section', { class: 'problems', role: 'alert' },
      h('h1', {}, 'The echo content did not load'),
      h('p', {}, 'Nothing is shown until these problems are fixed.'),
      h('ul', {}, (error.problems ?? [error.message]).map(p => h('li', {}, p)))),
    disclaimer()));
}

function start(content) {
  const list = caseList(content);
  const ids = list.cases.map(c => c.id);
  const byId = new Map(list.cases.map(c => [c.id, c]));
  const nameOf = id => content.structure.get(id).name;
  // set() redraws every mode of the screen from this one object.
  const ui = { current: null, info: ids.length > 0 && !narrow.matches, infoBeforeCompare: null, labels: true, testing: false, comparing: false, rail: false, drawer: false };
  let player = null;
  let normal = null;

  const sidebar = createSidebar(list, { onRail: () => set({ rail: !ui.rail }), onClose: () => setDrawer(false) });
  const casesBtn = h('button', { type: 'button', class: 'cases-btn', 'aria-controls': 'case-list', 'aria-expanded': 'false', onclick: () => setDrawer(true) }, icon('cases'), 'Cases');
  const chip = h('div', { class: 'title-chip glass', 'aria-live': 'polite' });
  const testBanner = h('div', { class: 'test-banner glass' },
    h('p', {}, h('strong', {}, 'Test mode. '), 'Name the view and what you see, then reveal.'),
    h('button', { type: 'button', class: 'primary', onclick: () => setTesting(false) }, 'Reveal'));
  const notice = h('p', { class: 'notice glass', role: 'status', hidden: true });
  const players = h('div', { class: 'players' });
  const credits = h('div', { class: 'credits' });
  const viewport = h('div', { class: 'viewport' }, players, h('div', { class: 'top-bar' }, casesBtn, chip, testBanner), notice);
  const stage = h('section', { class: 'stage', tabindex: '-1', 'aria-label': 'Echo viewer' }, viewport, credits);
  const scrim = h('div', { class: 'scrim', onclick: () => setDrawer(false) });
  const app = h('div', { class: 'app' }, sidebar.el, stage, scrim);
  document.body.replaceChildren(app);

  if (!list.cases.length) {
    players.append(h('div', { class: 'empty-state' },
      h('h2', {}, 'Echo clips are on their way'),
      h('p', {}, 'Each case appears here as a licensed clip is added, with its probe placement, labeled structures and teaching notes.'),
      h('a', { href: '../index.html' }, 'Back to Radiology')));
    credits.append(disclaimer());
    chip.hidden = testBanner.hidden = true;
  }

  const controls = createControls(stage, [
    { name: 'labels', icon: 'labels', label: 'Labels (L)', onclick: () => set({ labels: !ui.labels }) },
    { name: 'info', icon: 'info', label: 'Case notes (I)', onclick: () => set({ info: !ui.info }) },
    { name: 'test', icon: 'test', label: 'Test mode, hide the answers (T)', onclick: () => setTesting(!ui.testing) },
    { name: 'compare', icon: 'compare', label: 'Compare with normal', onclick: () => setCompare(!ui.comparing) },
    { name: 'fullscreen', icon: 'fullscreen', label: 'Fullscreen (F)', onclick: toggleFullscreen },
  ]);
  controls.pressed.fullscreen.hidden = !document.fullscreenEnabled;
  const panel = createPanel({
    content,
    on: {
      find(selector) {
        set({ labels: true });
        player.pulse(selector);
      },
      hover: selector => player.highlight(selector),
    },
    onToggle: () => set({ info: !ui.info }),
  });

  function set(patch) {
    Object.assign(ui, patch);
    app.classList.toggle('rail', ui.rail);
    app.classList.toggle('testing', ui.testing);
    app.classList.toggle('no-labels', !ui.labels);
    app.classList.toggle('drawer-open', ui.drawer);
    stage.classList.toggle('info-open', ui.info);
    stage.classList.toggle('comparing', ui.comparing);
    panel.setOpen(ui.info);
    sidebar.setRail(ui.rail);
    casesBtn.setAttribute('aria-expanded', String(ui.drawer));
    // inert is ignored before 2023 browsers, where the scrim and Escape still close the drawer.
    stage.inert = ui.drawer;
    controls.setPressed('labels', ui.labels);
    controls.setPressed('info', ui.info);
    // Test mode owns labels and notes until Reveal.
    controls.pressed.labels.disabled = controls.pressed.info.disabled = ui.testing;
    controls.setPressed('test', ui.testing);
    controls.setPressed('compare', ui.comparing);
    if (ui.current) document.title = `${ui.testing ? 'Test mode' : ui.current.title} · Echocardiography`;
    // Focus inside something that just disappeared would otherwise fall back to the page body.
    const focused = document.activeElement;
    if (focused && focused !== document.body && !focused.getClientRects().length) stage.focus({ preventScroll: true });
  }

  function selectCase(c) {
    if (ui.comparing) setCompare(false);
    player?.destroy();
    player = createPlayer(c.clip, { nameOf, label: 'Echo clip', caption: 'This case' });
    player.onCommand((name, arg) => normal?.[name](arg));
    players.replaceChildren(player.el);
    controls.attach(player);
    panel.show(c);
    chip.replaceChildren(...[
      h('h2', { class: 'chip-title' }, c.title),
      h('p', { class: 'chip-sub' }, c.condition ? `${c.view.name} (${c.view.abbrev})` : c.view.name),
      c.draft && h('span', { class: 'badge draft' }, 'Draft, not yet medically reviewed'),
    ].filter(Boolean));
    credits.replaceChildren(credit(c.clip), disclaimer());
    const compareBtn = controls.pressed.compare;
    compareBtn.hidden = !c.compare;
    if (c.compare) {
      const label = `Compare with normal ${content.view.get(c.compare.view).abbrev}`;
      compareBtn.setAttribute('aria-label', label);
      compareBtn.title = label;
    }
    sidebar.select(c.id);
    closeDrawer();
    set({ current: c });
    if (!reducedMotion.matches) player.play();
  }

  function setCompare(on) {
    normal?.destroy();
    normal = null;
    const c = ui.current;
    if (!on || !c.compare) {
      set({ comparing: false, info: ui.infoBeforeCompare ?? ui.info, infoBeforeCompare: null });
      players.replaceChildren(player.el);
      credits.replaceChildren(credit(c.clip), disclaimer());
      return;
    }
    if (ui.testing) setTesting(false);
    normal = createPlayer(c.compare, { nameOf, label: 'Normal clip for comparison', caption: `Normal ${content.view.get(c.compare.view).abbrev}` });
    players.append(normal.el);
    credits.replaceChildren(credit(c.clip), credit(c.compare), disclaimer());
    set({ comparing: true, infoBeforeCompare: ui.info, info: false });
    normal.setRate(player.video.playbackRate);
    // seekStart is a command, so the normal clip restarts with the case.
    player.seekStart();
    if (!player.video.paused) normal.play();
  }

  function setTesting(on) {
    if (on && ui.comparing) setCompare(false);
    closeDrawer();
    set({ testing: on });
  }

  function setDrawer(open) {
    set({ drawer: open });
    if (open) sidebar.focusCurrent();
    else casesBtn.focus({ preventScroll: true });
  }
  const closeDrawer = () => ui.drawer && setDrawer(false);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else stage.requestFullscreen?.().catch(() => {});
  }
  document.addEventListener('fullscreenchange', () => controls.setPressed('fullscreen', document.fullscreenElement === stage));

  let noticeTimer = 0;
  function route() {
    const { id, notice: unknown } = resolveRoute(location.hash, ids);
    if (id === null) return;
    if (location.hash !== `#/${id}`) history.replaceState(null, '', `#/${id}`);
    clearTimeout(noticeTimer);
    notice.hidden = !unknown;
    if (unknown) {
      notice.textContent = 'That link does not match a case, so the first case is shown.';
      noticeTimer = setTimeout(() => { notice.hidden = true; }, 6000);
    }
    if (id !== ui.current?.id) selectCase(byId.get(id));
  }
  const move = d => {
    const next = ids[ids.indexOf(ui.current.id) + d];
    if (next) location.hash = `#/${next}`;
  };

  const KEYS = {
    ' ': () => player.toggle(),
    arrowleft: e => player.step(e.shiftKey ? -10 : -1),
    arrowright: e => player.step(e.shiftKey ? 10 : 1),
    home: () => player.seekStart(),
    '[': () => controls.changeSpeed(-1),
    ']': () => controls.changeSpeed(1),
    l: () => !ui.testing && set({ labels: !ui.labels }),
    i: () => !ui.testing && set({ info: !ui.info }),
    t: () => setTesting(!ui.testing),
    f: toggleFullscreen,
    j: () => move(1),
    pagedown: () => move(1),
    k: () => move(-1),
    pageup: () => move(-1),
  };
  addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (key === 'escape' && ui.drawer) return closeDrawer();
    if (!KEYS[key] || !ui.current || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    const target = e.target;
    // Leave typing alone, and the keys a focused control already uses.
    if (target.matches('select, textarea, input:not([type="range"]), [contenteditable]')) return;
    if (key === ' ' && target.matches('button, a, input')) return;
    if (['arrowleft', 'arrowright', 'home', 'pageup', 'pagedown'].includes(key) && target.matches('input')) return;
    e.preventDefault();
    KEYS[key](e);
  });
  narrow.addEventListener('change', () => set({ info: ids.length > 0 && !narrow.matches && !ui.comparing, drawer: false }));

  set({});
  if (list.cases.length) {
    viewport.append(controls.el, panel.el);
    addEventListener('hashchange', route);
    route();
  }
}

let content;
try {
  content = await loadContent(location.href);
} catch (error) {
  showProblems(error);
}
if (content) start(content);
