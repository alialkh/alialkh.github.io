// The image side of the page: the grid of viewports, the control bar and every action that moves a cursor, a window or a view.
// All viewport state is one object, `vs`, changed only through dispatch() and the pure reducer in state.js. ui holds the flags that are not about viewports.
import { PLANES, planeInfo, indexToPosition, cursorIndex, findingCursor, imagePoint } from './planes.js';
import { dragWindow } from './window.js';
import { zoomAt, clampPan } from './view.js';
import { accumulate } from './input.js';
import { startSlice } from './chunks.js';
import { centroidCursor } from './labels.js';
import { reduce } from './state.js';
import { scrollCursor, seekCursor, crosshairShown } from './link.js';
import { resolveWindow, presetsFor, limitsFor } from './windows.js';
import { neighbour, defaultFill } from './layouts.js';
import { creditShort } from './annotate.js';
import { createGrid } from './grid.js';
import { createControls } from './controls.js';
import { createWindowing } from './windowing.js';

// hooks: changed(prev, next) after every state change, progress(fraction), error(text), series(key) when a series has its middle slices.
export function createScene(ui, { app, initial, hooks }) {
  let vs = initial;
  let session = null;
  let dims = null;
  let spacing = null;
  let infos = null;
  let token = 0;
  let scheduled = false;
  let streamKey = '';
  let placing = false;
  let cineCarry = 0;
  let cineLast = 0;
  let autoVersion = 0;
  const thumbed = new Set();
  const last = [];
  const tall = matchMedia('(max-width: 800px) and (orientation: portrait)');
  // Keys and buttons can arrive before the scan has.
  const guard = fn => (...args) => (dims ? fn(...args) : undefined);

  const seriesOf = id => ui.current.series.find(s => s.id === id);
  const volOf = id => session.volume(id);
  const windowing = createWindowing(volOf);
  const infoOf = plane => infos[plane];
  const active = () => vs.viewports[vs.active];
  const windowOf = vp => resolveWindow(vp.win, seriesOf(vp.series), windowing.autos.get(vp.series));
  const presets = () => (dims ? presetsFor(seriesOf(active().series), windowing.autos.get(active().series)) : []);

  function dispatch(...actions) {
    const prev = vs;
    vs = actions.flat().reduce(reduce, vs);
    if (vs === prev) return;
    if (dims) restream();
    schedule();
    hooks.changed(prev, vs);
  }
  const changeUi = patch => {
    Object.assign(ui, patch);
    schedule();
    hooks.changed(vs, vs);
  };

  // The series on screen, the active viewport's first, are fetched before the rest of the case.
  const shown = () => [...new Set([active().series, ...vs.viewports.map(v => v.series)])];
  function restream() {
    const key = shown().join();
    if (key === streamKey) return;
    streamKey = key;
    if (session.progress() < 1) stream();
  }
  // Chunks and errors from a case that has since been left must not touch the one on screen.
  function stream() {
    const mine = token;
    session.start(shown(), { onChunk: key => mine === token && onChunk(key), onError: error => mine === token && onError(error) });
  }
  function onError(error) {
    console.error('Scan failed to load:', error);
    hooks.error('Part of this scan could not be loaded. Reload the page to try again.');
  }

  function onChunk(key) {
    if (key !== 'labels') {
      if (seriesOf(key).windows.length < 2 && windowing.chunk(key)) autoVersion++;
      if (!thumbed.has(key) && volOf(key).ready[startSlice(dims[2])]) {
        thumbed.add(key);
        hooks.series(key);
      }
    }
    hooks.progress(session.progress());
    schedule();
  }

  function scroll(slot, steps, wrap = false) {
    const vp = vs.viewports[slot];
    dispatch({ type: 'cursor', slot, cursor: scrollCursor(vp, steps, infoOf(vp.plane).count, wrap) }, { type: 'activate', slot });
  }
  function seek(slot, position) {
    const vp = vs.viewports[slot];
    dispatch({ type: 'cursor', slot, cursor: seekCursor(vp, position, infoOf(vp.plane).count) });
  }
  function onView(slot, { zoomBy, anchor, panBy }) {
    const vp = vs.viewports[slot];
    let v = vp.view;
    if (zoomBy) v = zoomAt(v, zoomBy, anchor);
    if (panBy) v = { ...v, panX: v.panX + panBy[0], panY: v.panY + panBy[1] };
    const { widthMm, heightMm } = infoOf(vp.plane);
    const fit = grid.panes[slot].fit;
    dispatch({ type: 'view', slot, view: clampPan(v, widthMm * fit * v.zoom, heightMm * fit * v.zoom) });
  }
  function onMeasure(slot, phase, point, index) {
    const vp = vs.viewports[slot];
    const { width, height } = infoOf(vp.plane);
    const p = [Math.min(width, Math.max(0, point[0])), Math.min(height, Math.max(0, point[1]))];
    let m = vp.measure;
    if (phase === 'start') {
      m = { plane: vp.plane, index, a: p, b: p };
      placing = false;
    } else if (m && phase === 'move') {
      m = { ...m, b: p };
    } else if (m && phase === 'end' && m.a[0] === m.b[0] && m.a[1] === m.b[1]) {
      m = null;
    }
    dispatch({ type: 'measure', slot, measure: m });
  }
  // The keyboard way to measure: the first Enter drops one end at the crosshair, the second drops the other.
  function markAtCursor() {
    if (ui.tool !== 'ruler') return;
    const vp = active();
    const point = imagePoint(vp.plane, vp.cursor, dims);
    const measure = placing && vp.measure ? { ...vp.measure, b: point } : { plane: vp.plane, index: cursorIndex(vp.plane, vp.cursor), a: point, b: point };
    placing = !placing;
    dispatch({ type: 'measure', slot: vs.active, measure });
  }
  function windowDrag(slot, dx, dy) {
    const win = windowOf(vs.viewports[slot]);
    if (win) dispatch({ type: 'window', slot, win: dragWindow(win, dx, dy) });
  }
  const setHand = patch => {
    const win = windowOf(active());
    if (win) dispatch({ type: 'window', slot: vs.active, win: { center: win.center, width: win.width, ...patch } });
  };
  function setPreset(i) {
    const p = presets()[i];
    if (p) dispatch({ type: 'window', slot: vs.active, win: { name: p.name } });
  }

  function setCine(on) {
    ui.cine = on;
    cineCarry = 0;
    cineLast = 0;
    if (on) requestAnimationFrame(tick);
    changeUi({});
  }
  function tick(now) {
    if (!ui.cine) return;
    const r = accumulate(cineCarry, ((now - (cineLast || now)) / 1000) * ui.speed, 1);
    cineLast = now;
    cineCarry = r.carry;
    if (r.steps) scroll(vs.active, r.steps, true);
    requestAnimationFrame(tick);
  }

  // The title bar and the gestures report here.
  const on = {
    tool: () => ui.tool,
    scroll: guard(scroll),
    window: guard(windowDrag),
    view: guard(onView),
    click: guard((slot, voxel) => dispatch(voxel ? [{ type: 'cursor', slot, cursor: voxel }, { type: 'activate', slot }] : { type: 'activate', slot })),
    measure: guard(onMeasure),
    reset: slot => dispatch({ type: 'reset', slot }),
    activate: slot => dispatch({ type: 'activate', slot }),
    maximize: slot => dispatch({ type: 'maximize', slot }),
    assign: (slot, patch) => dispatch({ type: 'assign', slot, ...patch }),
    swapWith: (a, b) => dispatch({ type: 'swap', a, b }),
    swapKey(slot, direction) {
      const to = neighbour(vs.layout, slot, direction, tall.matches);
      if (to === null) return;
      dispatch({ type: 'swap', a: slot, b: to });
      grid.panes[to].title.el.focus({ preventScroll: true });
    },
  };
  const grid = createGrid(on);
  const controls = createControls(app, {
    cine: () => setCine(!ui.cine),
    speed: s => { ui.speed = s; },
    seek: guard(position => seek(vs.active, position)),
    preset: guard(setPreset),
    invert: guard(() => dispatch({ type: 'invert', slot: vs.active })),
    level: guard(value => setHand({ center: value })),
    width: guard(value => setHand({ width: value })),
    opacity: value => { ui.opacity = value; grid.el.style.setProperty('--label-opacity', String(value)); schedule(); },
    labels: guard(() => dispatch({ type: 'labels', slot: vs.active })),
    ruler: () => changeUi({ tool: ui.tool === 'ruler' ? 'window' : 'ruler' }),
    reset: guard(() => dispatch({ type: 'reset', slot: vs.active })),
  }, () => ui.cine);

  // Draws one viewport when its state or anything it shows has changed, and skips it otherwise.
  function paint(slot) {
    const vp = vs.viewports[slot];
    const vol = volOf(vp.series);
    const labelVol = volOf('labels');
    const win = windowOf(vp);
    const table = win && windowing.lut(win, vp.invert);
    const first = slot === (vs.maximized ?? 0);
    const frame = {
      vp, vol, labelVol, labelNames: ui.current.labels?.names ?? {}, win, lut: table?.lut, lutId: table?.id ?? 0, ui,
      crosshair: crosshairShown(vs, slot), active: slot === vs.active, maximized: vs.maximized === slot, series: seriesOf(vp.series),
      modality: ui.current.modality, credit: first ? creditShort(ui.current.source) : null,
    };
    const key = [vol.readyCount, labelVol?.readyCount, frame.lutId, ui.opacity, ui.testing, ui.finding?.id, frame.crosshair, frame.active, frame.maximized, vs.annotations, frame.credit, autoVersion].join('|');
    if (last[slot]?.vp === vp && last[slot].key === key) return;
    last[slot] = { vp, key };
    grid.panes[slot].update(frame);
  }

  function draw() {
    scheduled = false;
    if (!dims) return;
    grid.apply(vs, tall.matches);
    for (const slot of vs.maximized === null ? vs.viewports.keys() : [vs.maximized]) paint(slot);
    const vp = active();
    const s = seriesOf(vp.series);
    const a = windowing.autos.get(vp.series);
    const { count } = infoOf(vp.plane);
    controls.sync({
      ui, vp, count, presets: presetsFor(s, a), win: windowOf(vp), limits: limitsFor(s, a), c: ui.current,
      position: indexToPosition(vp.plane, cursorIndex(vp.plane, vp.cursor), count),
    });
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(draw);
  }
  tall.addEventListener('change', schedule);

  return {
    el: grid.el,
    status: grid.status,
    controls,
    schedule,
    dispatch,
    changeUi,
    get state() { return vs; },
    get ready() { return Boolean(dims); },
    get dims() { return dims; },
    get spacing() { return spacing; },
    presets,
    step: guard((steps, wrap) => scroll(vs.active, steps, wrap)),
    ends: guard(lastOne => seek(vs.active, lastOne ? Infinity : 0)),
    setPreset: guard(setPreset),
    reset: guard(() => dispatch({ type: 'reset', slot: vs.active })),
    zoom: guard(factor => onView(vs.active, { zoomBy: factor, anchor: { x: 0, y: 0 } })),
    pan: guard((dx, dy) => onView(vs.active, { panBy: [dx, dy] })),
    markAtCursor: guard(markAtCursor),
    toggleCine: guard(() => setCine(!ui.cine)),
    toggleLabels: guard(() => dispatch({ type: 'labels', slot: vs.active })),
    assign: on.assign,
    showFinding: guard(f => {
      ui.finding = f;
      dispatch({ type: 'showFinding', finding: f, cursor: findingCursor(f, dims) });
    }),
    jumpTo: guard(structure => dispatch({ type: 'cursor', slot: vs.active, cursor: centroidCursor(structure.centroid, dims) })),
    // The series' middle slice as a picture for the sidebar, once that slice is in.
    volume: id => (dims ? volOf(id) : null),
    // Opens a case from a session. Resolves when the first chunks are asked for, and rejects with problems when the case does not fit together.
    async open(next, c) {
      const mine = ++token;
      session?.stop();
      session = next;
      dims = null;
      windowing.clear();
      thumbed.clear();
      last.length = 0;
      streamKey = '';
      placing = false;
      Object.assign(ui, { current: c, finding: null, cine: false });
      dispatch({ type: 'open' });
      grid.setSeries(c.series.map(({ id, name }) => ({ id, name })));
      await next.ready();
      if (mine !== token) return;
      const vol = next.volume(c.series[0].id);
      dispatch({
        type: 'ready', cursor: [vol.dims[0] >> 1, vol.dims[1] >> 1, startSlice(vol.dims[2])],
        fill: defaultFill({ series: c.series, spacing: vol.spacing, labels: Boolean(c.labels) }),
      });
      [dims, spacing] = [vol.dims, vol.spacing];
      infos = Object.fromEntries(PLANES.map(p => [p, planeInfo(p, dims, spacing)]));
      streamKey = shown().join();
      stream();
      hooks.progress(session.progress());
      // Draw now, so the page can drop its loading cover without a frame of the last case showing.
      scheduled = true;
      draw();
      hooks.changed(vs, vs);
    },
  };
}
