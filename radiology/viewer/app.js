import { h } from '../core/dom.js';
import { disclaimer } from '../core/shell.js';
import { credit } from '../core/credit.js';
import { resolveRoute } from '../core/route.js';
import { bindKeys } from '../core/keys.js';
import { createSidebar } from '../core/sidebar.js';
import { createTabPanel } from '../core/tabs.js';
import { loadCases } from './content.js';
import { caseList, caseSubtitle, REGION_NAMES } from './case-list.js';
import { icon } from './icons.js';
import { createScene } from './scene.js';
import { createSessions } from './session.js';
import { canDecompress } from './loader.js';
import { lazyThumb } from './thumb.js';
import { tabsFor, renderTab } from './notes.js';
import { HOME } from './view.js';

// The notes panel opens by default only where it leaves the image enough room.
const roomy = matchMedia('(min-width: 1101px)');
const TITLE = 'CT and MRI';

function showProblems(error) {
  document.body.replaceChildren(h('main', { class: 'problems-page' },
    h('section', { class: 'problems', role: 'alert' },
      h('h1', {}, 'The CT and MRI content did not load'),
      h('p', {}, 'Nothing is shown until these problems are fixed.'),
      h('ul', {}, (error.problems ?? [error.message]).map(p => h('li', {}, p)))),
    disclaimer()));
}

function start(cases) {
  const list = caseList(cases);
  const ids = list.cases.map(c => c.id);
  const byId = new Map(list.cases.map(c => [c.id, c]));
  // set() redraws the chrome from this one object. The scene reads and writes its image fields too.
  const ui = {
    current: null, info: ids.length > 0 && roomy.matches, tab: 'overview', testing: false, rail: false, drawer: false,
    layout: 'stack', active: 'axial', cursor: [0, 0, 0], series: null, center: 0, width: 1, invert: false, windowName: null, limits: { min: 0, max: 1 },
    views: { axial: HOME, coronal: HOME, sagittal: HOME }, labels: false, opacity: 0.4, tool: 'window', measure: null, finding: null,
    cine: false, speed: 10, touched: false, windowReady: false,
  };
  const sessions = createSessions();
  let notesKey = '';
  let caseToken = 0;

  const item = c => {
    const thumb = h('canvas', { class: 'thumb', width: 56, height: 42, 'aria-hidden': 'true' });
    lazyThumb(c, thumb);
    return h('a', { class: 'case', href: `#/${c.id}`, title: `${c.title}, ${caseSubtitle(c)}` }, thumb,
      h('span', { class: 'case-text' }, h('span', { class: 'case-title' }, c.title), h('span', { class: 'case-sub' }, caseSubtitle(c))));
  };
  const sidebar = createSidebar(list, { title: TITLE, empty: 'Cases appear here as scans are added.', item, onRail: () => set({ rail: !ui.rail }), onClose: () => setDrawer(false) });
  const casesBtn = h('button', { type: 'button', class: 'cases-btn', 'aria-controls': 'case-list', 'aria-expanded': 'false', onclick: () => setDrawer(true) }, icon('cases'), 'Cases');
  const chip = h('div', { class: 'title-chip glass' });
  const note = h('aside', { class: 'finding-note glass', 'aria-label': 'Finding', hidden: true });
  const testBanner = h('div', { class: 'test-banner glass' },
    h('p', {}, h('strong', {}, 'Test mode. '), 'Scroll, window and measure, then reveal.'),
    h('button', { type: 'button', class: 'primary', onclick: () => setTesting(false) }, 'Reveal'));
  const notice = h('p', { class: 'notice glass', role: 'status', hidden: true });
  const announcer = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });
  const progress = h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Loading the scan', 'aria-valuemin': '0', 'aria-valuemax': '100', hidden: true });
  const credits = h('div', { class: 'credits' });
  const topBar = h('div', { class: 'top-bar' }, casesBtn, chip, note, testBanner);
  const viewport = h('div', { class: 'viewport' }, topBar, notice);
  const stage = h('section', { class: 'stage', tabindex: '-1', 'aria-label': 'CT and MRI viewer' }, progress, viewport, credits);
  const scrim = h('div', { class: 'scrim', onclick: () => setDrawer(false) });
  const app = h('div', { class: 'app' }, sidebar.el, stage, scrim);
  document.body.replaceChildren(app, announcer);

  const scene = createScene(ui, {
    stage,
    changed: () => set({}),
    onProgress: p => {
      progress.hidden = p >= 1;
      progress.style.setProperty('--p', String(p));
      progress.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    },
  });
  scene.on.test = () => setTesting(!ui.testing);
  scene.on.fullscreen = toggleFullscreen;
  scene.on.error = text => flash(text, 0);

  const panel = createTabPanel({
    label: 'Case information', handle: 'Case notes', closeLabel: 'Hide case notes (I)',
    onToggle: () => set({ info: !ui.info }),
    render: id => renderTab(id, {
      c: ui.current, ui, series: ui.current.series.find(s => s.id === ui.series), dims: scene.dims, spacing: scene.spacing, presets: scene.presets(),
      show: f => scene.showFinding(f), jump: s => scene.jumpTo(s),
    }),
  });

  if (!list.cases.length) {
    scene.el.replaceChildren(h('div', { class: 'empty-state' },
      h('h2', {}, 'CT and MRI cases are on their way'),
      h('p', {}, 'Each case appears here as a scan is added, with window presets, three planes, structure names and teaching notes.'),
      h('a', { href: '../index.html' }, 'Back to Radiology')));
    credits.append(disclaimer());
    chip.hidden = testBanner.hidden = true;
  }

  function showStatus(text, problems) {
    scene.status.hidden = !text;
    scene.status.classList.toggle('failed', Boolean(problems));
    scene.status.setAttribute('role', problems ? 'alert' : 'status');
    scene.status.replaceChildren(h('p', {}, text), problems && h('ul', {}, problems.map(p => h('li', {}, p))));
  }

  function set(patch) {
    Object.assign(ui, patch);
    app.classList.toggle('rail', ui.rail);
    app.classList.toggle('testing', ui.testing);
    app.classList.toggle('drawer-open', ui.drawer);
    stage.classList.toggle('info-open', ui.info && !ui.testing);
    panel.setOpen(ui.info);
    sidebar.setRail(ui.rail);
    casesBtn.setAttribute('aria-expanded', String(ui.drawer));
    // inert is ignored before 2023 browsers, where the scrim and Escape still close the drawer.
    stage.inert = ui.drawer;
    const c = ui.current;
    if (c) {
      document.title = `${ui.testing ? 'Test mode' : c.title} · ${TITLE}`;
      note.hidden = !ui.finding || ui.testing;
      if (ui.finding && note.dataset.id !== ui.finding.id) {
        note.dataset.id = ui.finding.id;
        note.replaceChildren(h('div', {}, h('h3', {}, ui.finding.title), h('p', {}, ui.finding.text)),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close the finding', title: 'Close the finding', onclick: () => set({ finding: null }) }, icon('close')));
      }
      const key = `${c.id}|${ui.series}|${scene.ready}|${scene.presets().map(p => p.name)}`;
      if (key !== notesKey) {
        notesKey = key;
        panel.refresh();
      }
      for (const [i, li] of panel.el.querySelectorAll('.findings li').entries()) {
        const on = c.findings[i].id === ui.finding?.id;
        li.classList.toggle('on', on);
        if (on) li.setAttribute('aria-current', 'true');
        else li.removeAttribute('aria-current');
      }
    }
    // Focus inside something that just disappeared would otherwise fall back to the page body.
    const focused = document.activeElement;
    if (focused && focused !== document.body && !focused.getClientRects().length) stage.focus({ preventScroll: true });
    scene.schedule();
  }

  function selectCase(c) {
    const mine = ++caseToken;
    closeDrawer();
    chip.replaceChildren(h('h2', { class: 'chip-title' }, c.title), h('p', { class: 'chip-sub' }, `${REGION_NAMES[c.region]} · ${c.modality}`));
    credits.replaceChildren(credit(c.source, { noun: 'Scan', changed: 'processed' }), disclaimer());
    sidebar.select(c.id);
    notesKey = '';
    note.dataset.id = '';
    // open() sets ui.current and ui.series before its first await, which the notes need.
    const opening = canDecompress ? scene.open(sessions.open(c), c) : null;
    if (!opening) Object.assign(ui, { current: c, series: c.series[0].id });
    panel.show(tabsFor(c));
    if (!opening) {
      showStatus('This browser cannot unpack the scan files.', ['Use a current Chrome, Edge, Firefox or Safari 16.4 or later.']);
    } else {
      showStatus('Loading the scan');
      opening
        .then(() => mine === caseToken && showStatus(''))
        .catch(error => {
          if (mine !== caseToken) return;
          console.error('Case failed to load:', error);
          showStatus('This case could not be loaded.', error.problems ?? [error.message]);
        });
    }
    announcer.textContent = ui.testing ? 'Next case' : `${c.title}. ${REGION_NAMES[c.region]}, ${c.modality}.`;
    set({});
  }

  function setTesting(on) {
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
  document.addEventListener('fullscreenchange', () => scene.controls.setFullscreen(document.fullscreenElement === stage));

  let noticeTimer = 0;
  function flash(text, ms = 6000) {
    clearTimeout(noticeTimer);
    notice.hidden = !text;
    notice.textContent = text;
    if (text && ms) noticeTimer = setTimeout(() => { notice.hidden = true; }, ms);
  }
  function route() {
    const { id, notice: unknown } = resolveRoute(location.hash, ids);
    if (id === null) return;
    if (location.hash !== `#/${id}`) history.replaceState(null, '', `#/${id}`);
    flash(unknown ? 'That link does not match a case, so the first case is shown.' : '');
    if (id !== ui.current?.id) selectCase(byId.get(id));
  }
  const move = d => {
    const next = ids[ids.indexOf(ui.current.id) + d];
    if (next) location.hash = `#/${next}`;
  };

  const inList = e => e.target.closest?.('.sidebar');
  const KEYS = {
    arrowup: e => (e.shiftKey ? scene.pan(0, 40) : scene.step(-1)),
    arrowleft: e => (e.shiftKey ? scene.pan(40, 0) : scene.step(-1)),
    arrowdown: e => (e.shiftKey ? scene.pan(0, -40) : scene.step(1)),
    arrowright: e => (e.shiftKey ? scene.pan(-40, 0) : scene.step(1)),
    '+': () => scene.zoom(1.25),
    '=': () => scene.zoom(1.25),
    '-': () => scene.zoom(0.8),
    enter: () => scene.markAtCursor(),
    pageup: e => (inList(e) ? move(-1) : scene.step(-10)),
    pagedown: e => (inList(e) ? move(1) : scene.step(10)),
    home: () => scene.ends(false),
    end: () => scene.ends(true),
    ' ': () => scene.toggleCine(),
    r: () => scene.reset(),
    m: () => set({ tool: ui.tool === 'ruler' ? 'window' : 'ruler' }),
    l: () => !ui.testing && set({ labels: !ui.labels }),
    i: () => !ui.testing && set({ info: !ui.info }),
    t: () => setTesting(!ui.testing),
    f: toggleFullscreen,
    j: () => move(1),
    k: () => move(-1),
    ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), () => scene.setPreset(i)])),
  };
  bindKeys(KEYS, {
    ready: () => ui.current,
    // The slice slider and the other range inputs use these keys themselves, and a focused button or link owns Space.
    skips: (key, target) => ((key === ' ' || key === 'enter') && target.matches('button, a, input, select, summary'))
      || (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'home', 'end', 'pageup', 'pagedown'].includes(key) && target.matches('input')),
  });
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && ui.drawer) closeDrawer();
  });
  roomy.addEventListener('change', () => set({ info: ids.length > 0 && roomy.matches, drawer: false }));

  viewport.insertBefore(scene.el, notice);
  set({});
  if (list.cases.length) {
    viewport.append(scene.controls.el, panel.el);
    addEventListener('hashchange', route);
    route();
  }
}

let cases;
try {
  cases = await loadCases(location.href);
} catch (error) {
  showProblems(error);
}
if (cases) start(cases);
