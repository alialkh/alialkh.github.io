import { h } from '../core/dom.js';
import { disclaimer } from '../core/shell.js';
import { resolveRoute } from '../core/route.js';
import { bindKeys } from '../core/keys.js';
import { createSidebar } from '../core/sidebar.js';
import { createPlayer } from '../echo/player.js';
import { createControls } from '../echo/controls.js';
import { loadContent } from './content.js';
import { screenList, isClip, isRef } from './cases.js';
import { createStill } from './still.js';
import { createPanel, shortCredit, nounOf } from './panel.js';
import { createSegmentsRef } from './ref-segments.js';
import { createProjectionsRef } from './ref-projections.js';
import { createIvusRef } from './ref-ivus.js';
import { icon } from './icons.js';
import { stackWhenNarrow } from './ui.js';
import { caseSystem, entryAngle } from './views.js';

const narrow = matchMedia('(max-width: 800px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const REFS = { 'ref-segments': createSegmentsRef, 'ref-projections': createProjectionsRef, 'ref-ivus': createIvusRef };
const THUMBS = { 'ref-segments': 'tree', 'ref-projections': 'carm', 'ref-ivus': 'ivus' };
const REF_CREDIT = {
  'ref-segments': 'Original schematic. Segment definitions: SYNTAX Score website and Sianos G et al. 2005.',
  'ref-projections': 'Original schematic. Projection notes from the sources listed in Credits.',
  'ref-ivus': 'Original schematic. Concepts: CVIT 2025 IVUS consensus, Saito Y et al.',
};

function showProblems(error) {
  document.body.replaceChildren(h('main', { class: 'problems-page' },
    h('section', { class: 'problems', role: 'alert' },
      h('h1', {}, 'The cath lab content did not load'),
      h('p', {}, 'Nothing is shown until these problems are fixed.'),
      h('ul', {}, (error.problems ?? [error.message]).map(p => h('li', {}, p)))),
    disclaimer()));
}

function start(content) {
  const list = screenList(content);
  const ids = list.cases.map(s => s.id);
  const byId = new Map(list.cases.map(s => [s.id, s]));
  // set() redraws every mode of the screen from this one object.
  const ui = { current: null, info: !narrow.matches, labels: true, testing: false, rail: false, drawer: false };
  let player = null;
  let still = null;
  let ref = null;
  let stackObserver = null;
  // The picker opens on this when a case sends it there, then forgets it.
  let pick = null;

  const caseLink = s => h('a', { class: 'case', href: `#/${s.id}`, title: `${s.title}, ${s.subtitle}` },
    s.c ? h('img', { class: 'thumb', src: s.c.poster, alt: '', loading: 'lazy', width: s.c.width, height: s.c.height }) : h('span', { class: 'thumb refthumb' }, icon(THUMBS[s.kind])),
    h('span', { class: 'case-text' }, h('span', { class: 'case-title' }, s.title), h('span', { class: 'case-sub' }, s.subtitle)));
  const sidebar = createSidebar(list, {
    title: 'Cath lab', empty: 'Cases appear here as they are added.', item: caseLink,
    onRail: () => set({ rail: !ui.rail }), onClose: () => setDrawer(false),
  });
  const casesBtn = h('button', { type: 'button', class: 'cases-btn', 'aria-controls': 'case-list', 'aria-expanded': 'false', onclick: () => setDrawer(true) }, icon('cases'), 'Cases');
  const chip = h('div', { class: 'title-chip glass', 'aria-live': 'polite' });
  const testBanner = h('div', { class: 'test-banner glass' },
    h('p', {}, h('strong', {}, 'Test mode. '), 'Name the vessel and what you see, then reveal.'),
    h('button', { type: 'button', class: 'primary', onclick: () => setTesting(false) }, 'Reveal'));
  const notice = h('p', { class: 'notice glass', role: 'status', hidden: true });
  const players = h('div', { class: 'players' });
  const credits = h('div', { class: 'credits' });
  const viewport = h('div', { class: 'viewport' }, h('div', { class: 'top-bar' }, casesBtn, chip, testBanner), players, notice);
  const stage = h('section', { class: 'stage', tabindex: '-1', 'aria-label': 'Cath lab viewer' }, viewport, credits);
  const scrim = h('div', { class: 'scrim', onclick: () => setDrawer(false) });
  const app = h('div', { class: 'app' }, sidebar.el, stage, scrim);
  document.body.replaceChildren(app);

  const controls = createControls(stage, [
    { name: 'labels', icon: 'labels', label: 'Labels (L)', onclick: () => canLabel() && set({ labels: !ui.labels }) },
    { name: 'info', icon: 'info', label: 'Notes (I)', onclick: () => set({ info: !ui.info }) },
    { name: 'test', icon: 'test', label: 'Test mode, hide the answers (T)', onclick: () => setTesting(!ui.testing) },
    { name: 'fullscreen', icon: 'fullscreen', label: 'Fullscreen (F)', onclick: toggleFullscreen },
  ]);
  controls.pressed.fullscreen.hidden = !document.fullscreenEnabled;
  const panel = createPanel({
    content,
    on: {
      // A pin selector goes to the clip, a segment id to the still.
      find: target => (player ? player.pulse(target) : still?.pulse(target)),
      hover: target => (player ? player.highlight(target) : still?.highlight(target)),
      pick: c => {
        pick = { angle: entryAngle(c.angles), system: caseSystem(c, content) ?? 'left', title: c.title };
        location.hash = '#/ref-projections';
      },
    },
    onToggle: () => set({ info: !ui.info }),
  });
  viewport.append(controls.el, panel.el);

  // Labels toggles the outlines and pins, or the numbers on the segment diagram. Other screens have nothing to hide.
  const canLabel = () => ui.current && (ui.current.kind === 'ref-segments' || ui.current.c?.regions?.length > 0 || ui.current.c?.pins?.length > 0);
  const canTest = () => ui.current && !isRef(ui.current);

  function set(patch) {
    Object.assign(ui, patch);
    const s = ui.current;
    app.classList.toggle('rail', ui.rail);
    app.classList.toggle('testing', ui.testing);
    app.classList.toggle('no-labels', !ui.labels);
    app.classList.toggle('drawer-open', ui.drawer);
    stage.classList.toggle('info-open', ui.info);
    panel.setOpen(ui.info);
    sidebar.setRail(ui.rail);
    casesBtn.setAttribute('aria-expanded', String(ui.drawer));
    // inert is ignored before 2023 browsers, where the scrim and Escape still close the drawer.
    stage.inert = ui.drawer;
    controls.el.classList.toggle('static', !s || !isClip(s));
    ref?.setLabels?.(ui.labels);
    controls.setPressed('labels', ui.labels);
    controls.setPressed('info', ui.info);
    // Test mode owns labels and notes until Reveal.
    controls.pressed.labels.disabled = ui.testing;
    controls.pressed.info.disabled = ui.testing;
    controls.pressed.labels.hidden = !canLabel();
    controls.pressed.test.hidden = !canTest();
    controls.setPressed('test', ui.testing);
    if (s) document.title = `${ui.testing ? 'Test mode' : s.title} · Cath lab`;
    // Focus inside something that just disappeared would otherwise fall back to the page body.
    const focused = document.activeElement;
    if (focused && focused !== document.body && !focused.getClientRects().length) stage.focus({ preventScroll: true });
  }

  function selectScreen(s) {
    player?.destroy();
    still?.destroy();
    stackObserver?.disconnect();
    [player, still, ref] = [null, null, null];
    const clip = isClip(s);
    if (isRef(s)) {
      ref = REFS[s.kind]({ content, refresh: () => panel.refresh(), start: pick });
      pick = null;
      stackObserver = stackWhenNarrow(ref.el);
      players.replaceChildren(ref.el);
    } else if (clip) {
      player = createPlayer(s.c, { nameOf: id => id, label: s.kind === 'ivus-clip' ? 'IVUS cine loop' : 'Angiogram cine loop', caption: s.title });
      // A long clip fetches what it needs as it plays, so the poster shows at once.
      if (s.c.durationSec > 20) player.video.preload = 'metadata';
      players.replaceChildren(player.el);
      controls.attach(player);
    } else {
      still = createStill(s.c, id => content.segment.get(id));
      players.replaceChildren(still.el);
    }
    panel.show(s, ref);
    chip.replaceChildren(h('h2', { class: 'chip-title' }, s.title), h('p', { class: 'chip-sub' }, s.subtitle));
    credits.replaceChildren(...[
      s.c ? shortCredit(s.c.source, nounOf(s.c)) : h('p', {}, REF_CREDIT[s.kind]),
      s.c?.regions?.length > 0 && h('p', { class: 'outline-note' }, "Outlines are the dataset's own labels and may be incomplete."),
      disclaimer(),
    ].filter(Boolean));
    sidebar.select(s.id);
    closeDrawer();
    set({ current: s, testing: ui.testing && !isRef(s) });
    if (player && !reducedMotion.matches) player.play();
  }

  function setTesting(on) {
    if (on && !canTest()) return;
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
      notice.textContent = 'That link does not match a screen, so the first one is shown.';
      noticeTimer = setTimeout(() => { notice.hidden = true; }, 6000);
    }
    if (id !== ui.current?.id) selectScreen(byId.get(id));
  }
  const move = d => {
    const next = ids[ids.indexOf(ui.current.id) + d];
    if (next) location.hash = `#/${next}`;
  };

  const KEYS = {
    ' ': () => player?.toggle(),
    arrowleft: e => player?.step(e.shiftKey ? -10 : -1),
    arrowright: e => player?.step(e.shiftKey ? 10 : 1),
    home: () => player?.seekStart(),
    '[': () => player && controls.changeSpeed(-1),
    ']': () => player && controls.changeSpeed(1),
    l: () => !ui.testing && canLabel() && set({ labels: !ui.labels }),
    i: () => !ui.testing && set({ info: !ui.info }),
    t: () => setTesting(!ui.testing),
    f: toggleFullscreen,
    j: () => move(1),
    pagedown: () => move(1),
    k: () => move(-1),
    pageup: () => move(-1),
  };
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && ui.drawer) closeDrawer();
  });
  bindKeys(KEYS, {
    ready: () => ui.current,
    // A focused button, link, slider or summary owns Space and Enter. A slider also owns the arrows, Home and the page keys.
    skips: (key, target) => (key === ' ' && target.matches('button, a, input, summary, [role="button"]'))
      || (['arrowleft', 'arrowright', 'home', 'pageup', 'pagedown'].includes(key) && target.matches('input')),
  });
  narrow.addEventListener('change', () => set({ info: !narrow.matches, drawer: false }));

  set({});
  addEventListener('hashchange', route);
  route();
}

let content;
try {
  content = await loadContent(location.href);
} catch (error) {
  showProblems(error);
}
if (content) start(content);
