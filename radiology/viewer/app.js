import { h } from '../core/dom.js';
import { disclaimer } from '../core/shell.js';
import { resolveRoute } from '../core/route.js';
import { loadCases } from './content.js';
import { caseList, REGION_NAMES } from './case-list.js';
import { icon } from './icons.js';
import { createScene } from './scene.js';
import { createSessions } from './session.js';
import { canDecompress } from './loader.js';
import { createThumbs, drawVolumeThumb } from './thumb.js';
import { initialState } from './state.js';
import { loadPrefs, savePrefs } from './prefs.js';
import { createLeft } from './left.js';
import { createRight } from './right.js';
import { createTopBar } from './topbar.js';
import { bindViewerKeys } from './keys.js';
import { tabsFor, renderTab } from './notes.js';

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
  const narrow = matchMedia('(max-width: 800px)');
  // The side panel opens by default only where it leaves the images enough room. What the reader chose overrides this.
  const roomy = matchMedia('(min-width: 1400px)');
  // The flags that are not about viewports. The viewports themselves are the scene's state object.
  const ui = { current: null, testing: false, tool: 'window', opacity: 0.4, cine: false, speed: 10, finding: null };
  const prefs = loadPrefs();
  const sessions = createSessions();
  const thumbs = createThumbs();
  let caseToken = 0;
  let chromeKey = '';
  let notesKey = '';
  let switching = false;

  const app = h('div', { class: 'app' });
  const dispatch = action => scene.dispatch(action);
  const panel = name => dispatch({ type: 'panel', name });
  const activeSeries = () => ui.current.series.find(s => s.id === (scene.state.viewports[scene.state.active]?.series ?? ui.current.series[0].id));

  const topbar = createTopBar({ on: {
    left: () => panel('left'), right: () => panel('right'),
    layout: layout => dispatch({ type: 'layout', layout }),
    link: () => dispatch({ type: 'link' }), annotate: () => dispatch({ type: 'annotations' }),
    imageOnly: () => dispatch({ type: 'imageOnly' }),
    test: () => setTesting(!ui.testing), fullscreen: toggleFullscreen, reveal: () => setTesting(false),
  } });
  const left = createLeft(list, { thumbs, on: {
    toggle: () => panel('left'),
    pick: id => dispatch({ type: 'assign', slot: scene.state.active, series: id }),
    drop: (slot, id) => dispatch({ type: 'assign', slot, series: id }),
  } });
  const right = createRight({
    on: { toggle: () => panel('right'), closeFinding: () => scene.changeUi({ finding: null }), reveal: () => setTesting(false) },
    render: id => renderTab(id, {
      c: ui.current, ui, series: activeSeries(), dims: scene.dims, spacing: scene.spacing, presets: scene.presets(),
      show: f => { scene.showFinding(f); dispatch({ type: 'closeDrawer' }); },
      jump: s => { scene.jumpTo(s); dispatch({ type: 'closeDrawer' }); },
    }),
  });

  const barToggle = h('button', { type: 'button', class: 'icon-btn', 'aria-controls': 'viewer-controls', onclick: () => panel('bar') }, icon('chev-down'));
  const findingChip = h('button', { type: 'button', class: 'finding-chip', hidden: true, onclick: () => {
    if (!scene.state.panels.right || scene.state.narrow) dispatch({ type: 'panel', name: 'right' });
  } });
  const notice = h('p', { class: 'notice', role: 'status', hidden: true });
  const announcer = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });
  const exitOnly = h('button', { type: 'button', class: 'exit-only', 'aria-label': 'Show the controls again (Z)', title: 'Show the controls again (Z)', onclick: () => dispatch({ type: 'imageOnly', on: false }) }, icon('restore'));
  const scrim = h('div', { class: 'scrim', onclick: () => dispatch({ type: 'closeDrawer' }) });

  const scene = createScene(ui, {
    app,
    initial: initialState({ narrow: narrow.matches, annotations: prefs.annotations, panels: { right: roomy.matches, ...prefs.panels } }),
    hooks: {
      changed: (prev, next) => {
        if (prev.panels !== next.panels || prev.annotations !== next.annotations) savePrefs(next);
        set();
      },
      progress(p) {
        topbar.setProgress(p);
        // The other cases' thumbnails come last, after the open case has everything on screen and in memory.
        if (p >= 1) thumbs.release();
      },
      error(text) {
        flash(text, 0);
        thumbs.release();
      },
      series(key) {
        const series = ui.current.series.find(s => s.id === key);
        left.seriesThumb(key, scene.volume(key), series);
        if (key === ui.current.series[0].id) {
          const canvas = left.caseThumb(ui.current.id);
          drawVolumeThumb(canvas, scene.volume(key), series);
          thumbs.skip(canvas);
        }
      },
    },
  });
  scene.controls.el.id = 'viewer-controls';
  const main = h('main', { class: 'main', 'aria-label': 'CT and MRI viewer' }, scene.el, notice, exitOnly);
  const foot = h('footer', { class: 'foot' }, scene.controls.el, h('div', { class: 'statusbar' }, barToggle, findingChip, disclaimer()));
  app.append(topbar.el, left.el, main, foot, right.el, scrim);
  document.body.replaceChildren(app, announcer);

  if (!list.cases.length) {
    app.classList.add('empty');
    scene.el.replaceChildren(h('div', { class: 'empty-state' },
      h('h2', {}, 'CT and MRI cases are on their way'),
      h('p', {}, 'Each case appears here as a scan is added, with window presets, three planes, structure names and teaching notes.'),
      h('a', { href: '../index.html' }, 'Back to Radiology'), disclaimer()));
  }

  function showStatus(text, problems) {
    scene.status.hidden = !text;
    scene.status.classList.toggle('failed', Boolean(problems));
    scene.status.setAttribute('role', problems ? 'alert' : 'status');
    scene.status.replaceChildren(...[h('p', {}, text), problems && h('ul', {}, problems.map(p => h('li', {}, p)))].filter(Boolean));
  }

  // Redraws the chrome from the viewport state and the flags. The images are drawn by the scene.
  function set() {
    const vs = scene.state;
    const c = ui.current;
    const leftOpen = vs.narrow ? vs.drawer === 'left' : vs.panels.left;
    const rightOpen = vs.narrow ? vs.drawer === 'right' : vs.panels.right;
    const key = [vs.layout, vs.link, vs.annotations, vs.imageOnly, vs.narrow, vs.drawer, vs.panels.left, vs.panels.right, vs.panels.bar, ui.testing, ui.finding?.id, c?.id, vs.active, scene.ready].join();
    if (key !== chromeKey) {
      chromeKey = key;
      for (const [name, on] of [['left-closed', !leftOpen], ['right-closed', !rightOpen], ['bar-closed', !vs.panels.bar], ['image-only', vs.imageOnly], ['testing', ui.testing], ['narrow', vs.narrow], ['drawer', Boolean(vs.drawer)]]) {
        app.classList.toggle(name, on);
      }
      topbar.sync({ layout: vs.layout, link: vs.link, annotations: vs.annotations, imageOnly: vs.imageOnly, leftOpen, rightOpen, testing: ui.testing });
      const barLabel = vs.panels.bar ? 'Hide the controls (B)' : 'Show the controls (B)';
      barToggle.setAttribute('aria-label', barLabel);
      barToggle.title = barLabel;
      barToggle.setAttribute('aria-expanded', String(vs.panels.bar));
      barToggle.replaceChildren(icon(vs.panels.bar ? 'chev-down' : 'chev-up'));
      // inert is ignored before 2023 browsers, where the scrim and Escape still close the drawer.
      main.inert = vs.narrow && Boolean(vs.drawer);
      left.setTesting(ui.testing);
      right.setTesting(ui.testing);
      findingChip.hidden = !ui.finding || ui.testing;
      if (ui.finding) findingChip.textContent = `Finding: ${ui.finding.title}`;
      right.setFinding(ui.finding, ui.testing);
    }
    if (c && !switching) {
      document.title = `${ui.testing ? 'Test mode' : c.title} · ${TITLE}`;
      const series = scene.ready ? activeSeries().id : '';
      const nk = `${c.id}|${series}|${scene.ready}|${scene.presets().map(p => p.name)}`;
      if (nk !== notesKey) {
        notesKey = nk;
        right.panel.refresh();
      }
      left.markShown([...new Set(vs.viewports.map(v => v.series))], vs.viewports[vs.active]?.series);
      for (const [i, li] of right.panel.el.querySelectorAll('.findings li').entries()) {
        const on = c.findings[i].id === ui.finding?.id;
        li.classList.toggle('on', on);
        if (on) li.setAttribute('aria-current', 'true');
        else li.removeAttribute('aria-current');
      }
    }
    // Focus inside something that just disappeared would otherwise fall back to the page body.
    const focused = document.activeElement;
    if (focused && focused !== document.body && !focused.getClientRects().length) main.focus({ preventScroll: true });
    scene.schedule();
  }

  function selectCase(c) {
    const mine = ++caseToken;
    thumbs.hold();
    dispatch({ type: 'closeDrawer' });
    topbar.setCase(c);
    left.select(c.id);
    left.setSeries(c);
    right.resetFinding();
    notesKey = '';
    chromeKey = '';
    // The tabs are built after the scene has swapped the viewports to this case, and set() must not draw them before that.
    switching = true;
    const opening = canDecompress ? scene.open(sessions.open(c), c) : null;
    if (!opening) {
      Object.assign(ui, { current: c });
      dispatch({ type: 'open' });
    }
    right.panel.show(tabsFor(c));
    switching = false;
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
    set();
  }

  function setTesting(on) {
    dispatch({ type: 'closeDrawer' });
    scene.changeUi({ testing: on });
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else app.requestFullscreen?.().catch(() => {});
  }
  document.addEventListener('fullscreenchange', () => topbar.setFullscreen(document.fullscreenElement === app));

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

  bindViewerKeys({ scene, ui, move, setTesting, toggleFullscreen });
  // Escape closes the menu or notes first, then image only, then a maximized viewport, then a drawer.
  addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.defaultPrevented || topbar.dismiss()) return;
    const vs = scene.state;
    if (vs.imageOnly) dispatch({ type: 'imageOnly', on: false });
    else if (vs.maximized !== null) dispatch({ type: 'restore' });
    else if (vs.drawer) dispatch({ type: 'closeDrawer' });
  });
  narrow.addEventListener('change', () => dispatch({ type: 'narrow', on: narrow.matches }));

  set();
  if (list.cases.length) {
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
