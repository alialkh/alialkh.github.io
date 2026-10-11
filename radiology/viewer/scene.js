// The image side of the page: three panes, the control bar and every action that moves the cursor, the window or the view.
// ui is the one shared state object. The page owns the chrome fields, the scene owns the rest. changed() asks the page to redraw its chrome.
import { h } from '../core/dom.js';
import { PLANES, planeInfo, indexToPosition, positionToIndex, cursorIndex, withIndex, findingCursor, imagePoint } from './planes.js';
import { windowLut, dragWindow, autoWindow, valueRange } from './window.js';
import { HOME, zoomAt, clampPan } from './view.js';
import { movePosition, accumulate } from './input.js';
import { startSlice } from './chunks.js';
import { readyRange, isComplete } from './volume.js';
import { centroidCursor } from './labels.js';
import { createPane } from './pane.js';
import { createControls } from './controls.js';

const CT_LIMITS = { min: -1024, max: 3071 };

export function createScene(ui, { stage, changed, onProgress }) {
  let session = null;
  let vol = null;
  let grid = null;
  let token = 0;
  let scheduled = false;
  let cineCarry = 0;
  let cineLast = 0;
  const lut = new Uint32Array(65536);
  let lutKey = '';
  let lutId = 0;
  const autos = new Map();
  // Keys and buttons can arrive before the scan has.
  const guard = fn => (...args) => (vol ? fn(...args) : undefined);

  const status = h('div', { class: 'status', role: 'status' });
  const panes = Object.fromEntries(PLANES.map(plane => [plane, createPane(plane, {
    tool: () => ui.tool,
    scroll: (p, steps) => scroll(p, steps),
    window: (dx, dy) => setWindow(dragWindow({ center: ui.center, width: ui.width }, dx, dy), true),
    view: onView,
    click: (p, voxel) => {
      if (voxel) ui.cursor = voxel;
      activate(p);
    },
    measure: onMeasure,
    reset: () => reset(),
    activate,
  })]));
  const el = h('div', { class: 'panes', 'data-layout': ui.layout }, Object.values(panes).map(p => p.el), status);

  const controls = createControls(stage, Object.fromEntries(Object.entries({
    cine: () => setCine(!ui.cine),
    speed: s => { ui.speed = s; },
    seek: position => seek(ui.active, position),
    plane: activate,
    series: setSeries,
    preset: i => setPreset(presets()[i]),
    invert: () => { ui.invert = !ui.invert; schedule(); },
    level: value => setWindow({ center: value, width: ui.width }, true),
    width: value => setWindow({ center: ui.center, width: value }, true),
    opacity: value => { ui.opacity = value; el.style.setProperty('--label-opacity', String(value)); schedule(); },
    labels: () => changeUi({ labels: !ui.labels }),
    ruler: () => changeUi({ tool: ui.tool === 'ruler' ? 'window' : 'ruler' }),
    layout: () => changeUi({ layout: ui.layout === 'mpr' ? 'stack' : 'mpr' }),
    reset: () => reset(),
    info: () => changeUi({ info: !ui.info }),
    test: () => scene.on.test(),
    fullscreen: () => scene.on.fullscreen(),
  }).map(([name, fn]) => [name, ['test', 'fullscreen', 'info'].includes(name) ? fn : guard(fn)])), () => ui.cine);

  const series = () => ui.current.series.find(s => s.id === ui.series);
  const infoOf = plane => grid[plane];
  const changeUi = patch => { Object.assign(ui, patch); changed(); };

  function presets() {
    const s = series();
    if (s.windows.length) return s.windows;
    const auto = autos.get(s.id);
    return auto ? [{ name: 'Auto', center: auto.center, width: auto.width }, { name: 'Full range', center: (auto.max + auto.min) / 2, width: auto.max - auto.min + 1 }] : [];
  }

  // MR windows come from the arrived slices around the middle. Redone once the series is complete, unless the reader has moved it.
  function measureAuto() {
    const range = readyRange(vol, startSlice(vol.dims[2]));
    if (!range) return false;
    const size = vol.dims[0] * vol.dims[1];
    const values = vol.data.subarray(range[0] * size, (range[1] + 1) * size);
    const [min, max] = valueRange(values);
    autos.set(series().id, { ...autoWindow(values), min, max });
    return true;
  }

  const limitsFor = s => (s.windows.length ? CT_LIMITS : { min: Math.min(0, autos.get(s.id).min), max: autos.get(s.id).max });

  function applyDefaultWindow() {
    const s = series();
    if (!s.windows.length && !measureAuto()) return false;
    ui.limits = limitsFor(s);
    ui.windowReady = true;
    setPreset(s.windows.length ? s.windows.find(w => w.name === s.defaultWindow) : presets()[0]);
    return true;
  }

  function setPreset(p) {
    if (!p) return;
    ui.center = p.center;
    ui.width = p.width;
    ui.windowName = p.name;
    ui.touched = false;
    schedule();
  }

  function setWindow({ center, width }, byHand) {
    ui.center = center;
    ui.width = width;
    ui.windowName = null;
    if (byHand) ui.touched = true;
    schedule();
  }

  function onChunk(key) {
    if (key === ui.series && !ui.windowReady) {
      applyDefaultWindow();
    } else if (key === ui.series && isComplete(vol) && !series().windows.length && measureAuto()) {
      ui.limits = limitsFor(series());
      if (!ui.touched) setPreset(presets().find(p => p.name === ui.windowName) ?? presets()[0]);
    }
    onProgress(session.progress());
    schedule();
  }

  // Chunks and errors from a case that has since been left must not touch the one on screen.
  function stream() {
    const mine = token;
    session.start(ui.series, { onChunk: key => mine === token && onChunk(key), onError: error => mine === token && onError(error) });
  }

  function setSeries(id) {
    if (id === ui.series) return;
    ui.series = id;
    vol = session.volume(id);
    ui.windowReady = false;
    applyDefaultWindow();
    stream();
    changed();
  }

  function onError(error) {
    console.error('Scan failed to load:', error);
    scene.on.error('Part of this scan could not be loaded. Reload the page to try again.');
  }

  function scroll(plane, steps, wrap = false) {
    const { count } = infoOf(plane);
    const position = movePosition(indexToPosition(plane, cursorIndex(plane, ui.cursor), count), steps, count, wrap);
    ui.cursor = withIndex(ui.cursor, plane, positionToIndex(plane, position, count));
    activate(plane);
  }
  function seek(plane, position) {
    const { count } = infoOf(plane);
    ui.cursor = withIndex(ui.cursor, plane, positionToIndex(plane, Math.min(count - 1, Math.max(0, position)), count));
    schedule();
  }
  function activate(plane) {
    ui.active = plane;
    schedule();
  }

  function onView(plane, { zoomBy, anchor, panBy }) {
    let v = ui.views[plane];
    if (zoomBy) v = zoomAt(v, zoomBy, anchor);
    if (panBy) v = { ...v, panX: v.panX + panBy[0], panY: v.panY + panBy[1] };
    const { widthMm, heightMm } = infoOf(plane);
    const fit = panes[plane].fit;
    ui.views[plane] = clampPan(v, widthMm * fit * v.zoom, heightMm * fit * v.zoom);
    schedule();
  }

  function onMeasure(plane, phase, point, index) {
    const { width, height } = infoOf(plane);
    const p = [Math.min(width, Math.max(0, point[0])), Math.min(height, Math.max(0, point[1]))];
    if (phase === 'start') {
      ui.measure = { plane, index, a: p, b: p };
      placing = false;
    }
    else if (ui.measure && phase === 'move') ui.measure = { ...ui.measure, b: p };
    else if (ui.measure && phase === 'end' && ui.measure.a[0] === ui.measure.b[0] && ui.measure.a[1] === ui.measure.b[1]) ui.measure = null;
    schedule();
  }

  // The keyboard way to measure: the first Enter drops one end at the crosshair, the second drops the other.
  let placing = false;
  function markAtCursor() {
    if (ui.tool !== 'ruler') return;
    const plane = ui.active;
    const point = imagePoint(plane, ui.cursor, vol.dims);
    ui.measure = placing ? { ...ui.measure, b: point } : { plane, index: cursorIndex(plane, ui.cursor), a: point, b: point };
    placing = !placing;
    schedule();
  }

  function reset() {
    ui.views = { axial: HOME, coronal: HOME, sagittal: HOME };
    ui.invert = false;
    ui.measure = null;
    applyDefaultWindow();
    schedule();
  }

  function setCine(on) {
    ui.cine = on;
    cineCarry = 0;
    cineLast = 0;
    if (on) requestAnimationFrame(tick);
    changed();
  }
  function tick(now) {
    if (!ui.cine) return;
    const r = accumulate(cineCarry, ((now - (cineLast || now)) / 1000) * ui.speed, 1);
    cineLast = now;
    cineCarry = r.carry;
    if (r.steps) scroll(ui.active, r.steps, true);
    requestAnimationFrame(tick);
  }

  function draw() {
    scheduled = false;
    if (!vol) return;
    const key = `${ui.center}|${ui.width}|${ui.invert}`;
    if (key !== lutKey) {
      lutKey = key;
      windowLut(ui.center, ui.width, ui.invert, lut);
      lutId++;
    }
    el.dataset.layout = ui.layout;
    for (const plane of PLANES) panes[plane].el.classList.toggle('active', plane === ui.active);
    const frame = { ui, vol, labelVol: session.volume('labels'), labelNames: ui.current.labels?.names ?? {}, lut, lutId };
    for (const plane of ui.layout === 'mpr' ? PLANES : [ui.active]) panes[plane].update(frame);
    const { count } = infoOf(ui.active);
    controls.sync({
      ui, count, case: ui.current, presets: presets(),
      position: indexToPosition(ui.active, cursorIndex(ui.active, ui.cursor), count),
    });
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(draw);
  }

  const scene = {
    el,
    controls,
    status,
    schedule,
    on: { test() {}, fullscreen() {}, error() {} },
    get ready() { return Boolean(vol); },
    get dims() { return vol?.dims ?? null; },
    get spacing() { return vol?.spacing ?? null; },
    presets: () => (vol ? presets() : []),
    step: guard((steps, wrap) => scroll(ui.active, steps, wrap)),
    ends: guard(last => seek(ui.active, last ? Infinity : 0)),
    setPreset: guard(i => setPreset(presets()[i])),
    reset: guard(reset),
    zoom: guard(factor => onView(ui.active, { zoomBy: factor, anchor: { x: 0, y: 0 } })),
    pan: guard((dx, dy) => onView(ui.active, { panBy: [dx, dy] })),
    markAtCursor: guard(markAtCursor),
    toggleCine: guard(() => setCine(!ui.cine)),
    showFinding(f) {
      if (f.series && f.series !== ui.series) setSeries(f.series);
      if (f.window) setPreset(presets().find(p => p.name === f.window));
      ui.cursor = findingCursor(f, vol.dims);
      ui.active = f.plane;
      changeUi({ finding: f });
    },
    jumpTo(structure) {
      ui.cursor = centroidCursor(structure.centroid, vol.dims);
      schedule();
    },
    // Opens a case from a session. Resolves when the first chunks are asked for, and rejects with problems when the case does not fit together.
    async open(next, c) {
      const mine = ++token;
      session?.stop();
      session = next;
      vol = null;
      autos.clear();
      Object.assign(ui, {
        current: c, series: c.series[0].id, active: 'axial', views: { axial: HOME, coronal: HOME, sagittal: HOME },
        invert: false, measure: null, finding: null, cine: false, windowReady: false, touched: false, windowName: null,
        limits: CT_LIMITS, center: 0, width: 1,
      });
      await next.ready();
      if (mine !== token) return;
      vol = next.volume(ui.series);
      grid = Object.fromEntries(PLANES.map(p => [p, planeInfo(p, vol.dims, vol.spacing)]));
      ui.cursor = [vol.dims[0] >> 1, vol.dims[1] >> 1, startSlice(vol.dims[2])];
      applyDefaultWindow();
      stream();
      // Draw now, so the page can drop its loading cover without a frame of the last case showing.
      scheduled = true;
      draw();
      changed();
    },
  };
  return scene;
}
