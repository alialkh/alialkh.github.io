// One viewport: its title bar, the image and label canvases, the crosshair, ring and ruler, and the corner annotations over the image.
// It draws the frame it is given and reports input through `on`. Its viewport can show any series in any plane.
import { h } from '../core/dom.js';
import { planeInfo, extractSlice, voxelAt, imagePoint, indexToPosition, cursorIndex, PLANE_NAMES } from './planes.js';
import { applyLut } from './window.js';
import { labelPalette, labelAt } from './labels.js';
import { valueAt } from './volume.js';
import { fitScale } from './view.js';
import { niceScale, distanceMm, formatMm } from './measure.js';
import { imageText, locationText, spacingText, windowText, zoomText, valueText } from './annotate.js';
import { attachGestures } from './gestures.js';
import { createTitle } from './title.js';
import { createCorners } from './corners.js';

// Slices that have not arrived show this dark blue gray (packed as ABGR), never black.
const PENDING = 0xff2d241d;
const palette = labelPalette();
const percent = (v, n) => `${(v / n) * 100}%`;
const put = (el, text) => {
  if (el.textContent !== text) el.textContent = text;
};

function rulerOverlay() {
  const box = h('div', { class: 'ruler', hidden: true });
  box.innerHTML = '<svg><line/><circle class="a" r="4"/><circle class="b" r="4"/></svg><span class="ruler-text"></span>';
  return box;
}

// on: tool(), scroll(slot, steps), window(slot, dx, dy), view(slot, change), click(slot, voxel), measure(slot, phase, point, index), reset(slot), activate(slot),
// and the title bar's maximize, assign, swapWith and swapKey (see title.js).
export function createPane(slot, on) {
  let info = null;
  let gridKey = '';
  let cw = 0;
  let ch = 0;
  let geom = { wrapW: 1, wrapH: 1, perMm: 1 };
  let scale = { text: '', px: 0 };
  let layoutKey = '';
  let hover = null;
  let frame = null;
  let drawn = { image: '', labels: '' };
  let image, labelImage, imgPixels, labPixels, sliceBuf, labelBuf;

  const title = createTitle(slot, on);
  const corners = createCorners();
  const img = h('canvas', { class: 'img' });
  const lab = h('canvas', { class: 'lab' });
  const crossH = h('div', { class: 'cross cross-h' });
  const crossV = h('div', { class: 'cross cross-v' });
  const ring = h('div', { class: 'ring', hidden: true });
  const ruler = rulerOverlay();
  const wrap = h('div', { class: 'wrap' }, img, lab, crossH, crossV, ring, ruler);
  const view = h('div', { class: 'pane-view' }, wrap);
  const msg = h('p', { class: 'pane-msg', role: 'status', hidden: true });
  const el = h('section', { class: 'pane', 'data-slot': slot, tabindex: '0' }, title.el, h('div', { class: 'pane-body' }, view, corners.nodes, msg));

  const plane = () => frame.vp.plane;
  const index = () => cursorIndex(plane(), frame.vp.cursor);
  const toImage = ({ x, y }) => {
    const v = frame.vp.view;
    return [((x - cw / 2 - v.panX) / geom.wrapW + 0.5) * info.width, ((y - ch / 2 - v.panY) / geom.wrapH + 0.5) * info.height];
  };
  const fromCentre = ({ x, y }) => ({ x: x - cw / 2, y: y - ch / 2 });

  attachGestures(view, {
    tool: on.tool,
    size: () => ch,
    scroll: steps => on.scroll(slot, steps),
    window: (dx, dy) => on.window(slot, dx, dy),
    zoom: (factor, point) => on.view(slot, { zoomBy: factor, anchor: fromCentre(point) }),
    pan: (dx, dy) => on.view(slot, { panBy: [dx, dy] }),
    click: point => info && on.click(slot, voxelAt(plane(), index(), ...toImage(point), frame.vol.dims)),
    measure: (phase, point) => info && on.measure(slot, phase, toImage(point), index()),
    hover: point => {
      hover = point && info ? toImage(point) : null;
      if (frame) readout();
    },
    reset: () => on.reset(slot),
  }, () => info?.count ?? 1);
  el.addEventListener('pointerdown', e => {
    // The gesture handler cancels pointerdown, which also stops the browser focusing the pane.
    if (!e.target.closest('.vp-title')) el.focus({ preventScroll: true });
    on.activate(slot);
  });
  // Tabbing to a pane or its title bar makes it the active one, so the keyboard can scroll each viewport in turn.
  el.addEventListener('focusin', () => on.activate(slot));

  // Image and overlays follow the cell size, the zoom and the pan. Overlay positions are percentages of the image, so they track it.
  function layout() {
    const v = frame.vp.view;
    const key = `${cw}|${ch}|${v.zoom}|${v.panX}|${v.panY}|${gridKey}`;
    if (key === layoutKey) return;
    layoutKey = key;
    const fit = fitScale(cw, ch, info.widthMm, info.heightMm);
    geom = { wrapW: info.widthMm * fit * v.zoom, wrapH: info.heightMm * fit * v.zoom, perMm: fit * v.zoom };
    Object.assign(wrap.style, {
      width: `${Math.round(geom.wrapW)}px`,
      height: `${Math.round(geom.wrapH)}px`,
      transform: `translate(${Math.round(cw / 2 + v.panX - geom.wrapW / 2)}px, ${Math.round(ch / 2 + v.panY - geom.wrapH / 2)}px)`,
    });
    wrap.classList.toggle('nearest', v.zoom > 2);
    const bar = niceScale(geom.perMm);
    scale = { text: bar.mm ? `${bar.mm} mm` : '', px: bar.px };
  }
  new ResizeObserver(() => {
    cw = view.clientWidth;
    ch = view.clientHeight;
    // A small viewport drops the lines that would collide in its corners.
    el.classList.toggle('compact', cw < 340 || ch < 240);
    if (frame && info) layout();
  }).observe(view);

  function setGrid(f) {
    info = planeInfo(f.vp.plane, f.vol.dims, f.vol.spacing);
    gridKey = `${f.vp.plane}|${f.vol.dims}|${f.vol.spacing}`;
    for (const c of [img, lab]) Object.assign(c, { width: info.width, height: info.height });
    image = new ImageData(info.width, info.height);
    imgPixels = new Uint32Array(image.data.buffer);
    labelImage = new ImageData(info.width, info.height);
    labPixels = new Uint32Array(labelImage.data.buffer);
    sliceBuf = labelBuf = null;
    drawn = { image: '', labels: '' };
    layoutKey = '';
  }

  // Rows of a coronal or sagittal slice are axial slices, so rows that have not arrived are marked.
  function markPending(vol) {
    if (vol.readyCount === vol.dims[2] || plane() === 'axial') return;
    for (let row = 0; row < info.height; row++) {
      if (!vol.ready[vol.dims[2] - 1 - row]) imgPixels.fill(PENDING, row * info.width, (row + 1) * info.width);
    }
  }

  function drawImage(f) {
    const key = `${f.vol.id}|${plane()}|${index()}|${f.vol.readyCount}|${f.lutId}`;
    if (key === drawn.image) return;
    drawn.image = key;
    const arrived = f.lut && (plane() !== 'axial' || f.vol.ready[index()] === 1);
    if (arrived) {
      sliceBuf = extractSlice(f.vol, plane(), index(), sliceBuf);
      applyLut(sliceBuf, f.lut, imgPixels);
      markPending(f.vol);
    } else {
      imgPixels.fill(PENDING);
    }
    img.getContext('2d').putImageData(image, 0, 0);
    const missing = f.vol.dims[2] - f.vol.readyCount;
    msg.hidden = !missing || (plane() === 'axial' && arrived);
    put(msg, plane() === 'axial' ? 'This slice is still loading.' : `Loading, ${f.vol.readyCount} of ${f.vol.dims[2]} slices so far.`);
  }

  function drawLabels(f) {
    const shown = Boolean(f.labelVol) && f.vp.labels && !f.ui.testing;
    lab.hidden = !shown;
    if (!shown) {
      drawn.labels = '';
      return;
    }
    const key = `${f.labelVol.id}|${plane()}|${index()}|${f.labelVol.readyCount}`;
    if (key === drawn.labels) return;
    drawn.labels = key;
    labelBuf = extractSlice(f.labelVol, plane(), index(), labelBuf);
    for (let i = 0; i < labelBuf.length; i++) labPixels[i] = palette[labelBuf[i]];
    lab.getContext('2d').putImageData(labelImage, 0, 0);
  }

  function readout() {
    const f = frame;
    const voxel = hover && voxelAt(plane(), index(), hover[0], hover[1], f.vol.dims);
    if (!voxel) return corners.setValue('');
    if (!f.vol.ready[voxel[2]]) return corners.setValue('Not loaded yet');
    const id = f.labelVol && !f.ui.testing ? labelAt(f.labelVol, voxel) : 0;
    return corners.setValue(valueText(f.modality, valueAt(f.vol, voxel), id ? f.labelNames[id] : ''));
  }

  function drawMarks(f) {
    const { vp, ui: s } = f;
    const position = indexToPosition(plane(), index(), info.count);
    corners.set({
      name: f.series.name, plane: PLANE_NAMES[plane()],
      image: imageText(position, info.count), location: locationText(position, info.step), spacing: spacingText(info.step),
      window: f.win ? windowText(f.win) : '', zoom: zoomText(vp.view.zoom),
      scaleText: scale.text, scalePx: scale.px, credit: f.credit, letters: info.letters,
    });
    el.setAttribute('aria-label', `${f.series.name}, ${PLANE_NAMES[plane()]} images, slice ${position + 1} of ${info.count}`);
    el.classList.toggle('active', f.active);
    crossH.hidden = crossV.hidden = !f.crosshair;
    if (f.crosshair) {
      const [u, v] = imagePoint(plane(), vp.cursor, f.vol.dims);
      crossV.style.left = percent(u, info.width);
      crossH.style.top = percent(v, info.height);
    }
    const found = s.finding;
    ring.hidden = !(found && !s.testing && found.plane === plane() && found.index === index());
    if (!ring.hidden) Object.assign(ring.style, { left: percent(found.at[0], 1), top: percent(found.at[1], 1) });
    const m = vp.measure;
    ruler.hidden = !(m && m.plane === plane() && m.index === index());
    if (ruler.hidden) return;
    const line = ruler.querySelector('line');
    line.setAttribute('x1', percent(m.a[0], info.width));
    line.setAttribute('y1', percent(m.a[1], info.height));
    line.setAttribute('x2', percent(m.b[0], info.width));
    line.setAttribute('y2', percent(m.b[1], info.height));
    for (const end of ['a', 'b']) {
      const dot = ruler.querySelector(`circle.${end}`);
      dot.setAttribute('cx', percent(m[end][0], info.width));
      dot.setAttribute('cy', percent(m[end][1], info.height));
    }
    const text = ruler.querySelector('.ruler-text');
    put(text, formatMm(distanceMm(m.a, m.b, info.du, info.dv)));
    Object.assign(text.style, { left: percent(m.b[0], info.width), top: percent(m.b[1], info.height) });
  }

  return {
    el,
    title,
    // Pixels per millimetre when the whole image fits the cell.
    get fit() { return fitScale(cw, ch, info.widthMm, info.heightMm); },
    // f: vp, vol, labelVol, labelNames, win, lut, lutId, ui, crosshair, active, series, modality, credit, maximized.
    update(f) {
      frame = f;
      if (!info || gridKey !== `${f.vp.plane}|${f.vol.dims}|${f.vol.spacing}`) setGrid(f);
      title.sync(f.vp, f.series.name, f.maximized);
      layout();
      drawImage(f);
      drawLabels(f);
      drawMarks(f);
      readout();
    },
  };
}
