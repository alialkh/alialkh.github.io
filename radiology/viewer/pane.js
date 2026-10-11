// One plane of the stage: the image canvas, the label canvas and every overlay drawn on it. It reads the frame it is given and reports input through `on`.
import { h } from '../core/dom.js';
import { planeInfo, extractSlice, voxelAt, imagePoint, indexToPosition, cursorIndex, PLANE_NAMES } from './planes.js';
import { applyLut } from './window.js';
import { labelPalette, labelAt } from './labels.js';
import { valueAt } from './volume.js';
import { fitScale } from './view.js';
import { niceScale, distanceMm, formatMm } from './measure.js';
import { attachGestures } from './gestures.js';

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

// on: tool(), scroll(plane, steps), window(dx, dy), view(plane, change), click(plane, voxel), measure(plane, phase, point, index), reset(plane), activate(plane).
export function createPane(plane, on) {
  let info = null;
  let gridKey = '';
  let cw = 0;
  let ch = 0;
  let geom = { wrapW: 1, wrapH: 1, perMm: 1 };
  let layoutKey = '';
  let hover = null;
  let frame = null;
  let drawn = { image: '', labels: '' };
  let image, labelImage, imgPixels, labPixels, sliceBuf, labelBuf;

  const img = h('canvas', { class: 'img' });
  const lab = h('canvas', { class: 'lab' });
  const crossH = h('div', { class: 'cross cross-h' });
  const crossV = h('div', { class: 'cross cross-v' });
  const ring = h('div', { class: 'ring', hidden: true });
  const ruler = rulerOverlay();
  const wrap = h('div', { class: 'wrap' }, img, lab, crossH, crossV, ring, ruler);
  const view = h('div', { class: 'pane-view' }, wrap);
  const msg = h('p', { class: 'pane-msg', role: 'status', hidden: true });
  const name = h('strong');
  const sliceNumber = h('span');
  const slice = h('span', {}, h('span', { class: 'word' }, 'Slice '), sliceNumber);
  const wl = h('span');
  const zoomText = h('span');
  const readoutText = h('div', { class: 'corner bl' });
  const scaleText = h('span');
  const scaleBar = h('span', { class: 'scale-bar' });
  const letters = Object.fromEntries(['top', 'bottom', 'left', 'right'].map(side => [side, h('span', { class: `letter ${side}`, 'aria-hidden': 'true' })]));
  const el = h('section', { class: 'pane', 'data-plane': plane, tabindex: '0' },
    view,
    h('div', { class: 'corner tl' }, name, slice),
    h('div', { class: 'corner tr' }, wl, zoomText),
    readoutText,
    h('div', { class: 'corner br' }, scaleText, scaleBar),
    msg, Object.values(letters));

  const ui = () => frame.ui;
  const index = () => cursorIndex(plane, ui().cursor);
  const toImage = ({ x, y }) => {
    const v = ui().views[plane];
    return [((x - cw / 2 - v.panX) / geom.wrapW + 0.5) * info.width, ((y - ch / 2 - v.panY) / geom.wrapH + 0.5) * info.height];
  };
  const fromCentre = ({ x, y }) => ({ x: x - cw / 2, y: y - ch / 2 });

  attachGestures(view, {
    tool: on.tool,
    size: () => ch,
    scroll: steps => on.scroll(plane, steps),
    window: on.window,
    zoom: (factor, point) => on.view(plane, { zoomBy: factor, anchor: fromCentre(point) }),
    pan: (dx, dy) => on.view(plane, { panBy: [dx, dy] }),
    click: point => info && on.click(plane, voxelAt(plane, index(), ...toImage(point), frame.vol.dims)),
    measure: (phase, point) => info && on.measure(plane, phase, toImage(point), index()),
    hover: point => {
      hover = point && info ? toImage(point) : null;
      if (frame) readout();
    },
    reset: () => on.reset(plane),
  }, () => info?.count ?? 1);
  el.addEventListener('pointerdown', () => {
    // The gesture handler cancels pointerdown, which also stops the browser focusing the pane.
    el.focus({ preventScroll: true });
    on.activate(plane);
  });
  // Tabbing to a pane makes it the active one, so the keyboard can scroll each plane of the three in turn.
  el.addEventListener('focusin', () => on.activate(plane));

  // Image and overlays follow the cell size, the zoom and the pan. Overlay positions are percentages of the image, so they track it.
  function layout() {
    const v = ui().views[plane];
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
    put(scaleText, bar.mm ? `${bar.mm} mm` : '');
    scaleBar.style.width = `${Math.round(bar.px)}px`;
  }
  new ResizeObserver(() => {
    cw = view.clientWidth;
    ch = view.clientHeight;
    // A narrow pane drops the window and zoom text and the word Slice, so its corners do not collide.
    el.classList.toggle('compact', cw < 300);
    if (frame) layout();
  }).observe(view);

  function setGrid(volume) {
    info = planeInfo(plane, volume.dims, volume.spacing);
    gridKey = `${volume.dims}|${volume.spacing}`;
    for (const c of [img, lab]) Object.assign(c, { width: info.width, height: info.height });
    image = new ImageData(info.width, info.height);
    imgPixels = new Uint32Array(image.data.buffer);
    labelImage = new ImageData(info.width, info.height);
    labPixels = new Uint32Array(labelImage.data.buffer);
    sliceBuf = labelBuf = null;
    for (const side of Object.keys(letters)) put(letters[side], info.letters[side]);
    drawn = { image: '', labels: '' };
    layoutKey = '';
  }

  // Rows of a coronal or sagittal slice are axial slices, so rows that have not arrived are marked.
  function markPending(vol) {
    if (vol.readyCount === vol.dims[2] || plane === 'axial') return;
    for (let row = 0; row < info.height; row++) {
      if (!vol.ready[vol.dims[2] - 1 - row]) imgPixels.fill(PENDING, row * info.width, (row + 1) * info.width);
    }
  }

  function drawImage(f) {
    const key = `${f.vol.id}|${index()}|${f.vol.readyCount}|${f.lutId}`;
    if (key === drawn.image) return;
    drawn.image = key;
    const arrived = plane !== 'axial' || f.vol.ready[index()] === 1;
    if (arrived) {
      sliceBuf = extractSlice(f.vol, plane, index(), sliceBuf);
      applyLut(sliceBuf, f.lut, imgPixels);
      markPending(f.vol);
    } else {
      imgPixels.fill(PENDING);
    }
    img.getContext('2d').putImageData(image, 0, 0);
    const missing = f.vol.dims[2] - f.vol.readyCount;
    msg.hidden = !missing || (plane === 'axial' && arrived);
    put(msg, plane === 'axial' ? 'This slice is still loading.' : `Loading, ${f.vol.readyCount} of ${f.vol.dims[2]} slices so far.`);
  }

  function drawLabels(f) {
    const shown = Boolean(f.labelVol) && f.ui.labels && !f.ui.testing;
    lab.hidden = !shown;
    if (!shown) {
      drawn.labels = '';
      return;
    }
    const key = `${f.labelVol.id}|${index()}|${f.labelVol.readyCount}`;
    if (key === drawn.labels) return;
    drawn.labels = key;
    labelBuf = extractSlice(f.labelVol, plane, index(), labelBuf);
    for (let i = 0; i < labelBuf.length; i++) labPixels[i] = palette[labelBuf[i]];
    lab.getContext('2d').putImageData(labelImage, 0, 0);
  }

  function readout() {
    const f = frame;
    const voxel = hover && voxelAt(plane, index(), hover[0], hover[1], f.vol.dims);
    if (!voxel) return put(readoutText, '');
    if (!f.vol.ready[voxel[2]]) return put(readoutText, 'Not loaded yet');
    const value = valueAt(f.vol, voxel);
    const text = f.ui.current.modality === 'CT' ? `HU ${value}` : `Intensity ${value}`;
    const id = f.labelVol && !f.ui.testing ? labelAt(f.labelVol, voxel) : 0;
    put(readoutText, id ? `${text} · ${f.labelNames[id] ?? ''}` : text);
  }

  function drawMarks({ ui: s }) {
    const position = indexToPosition(plane, index(), info.count);
    put(name, PLANE_NAMES[plane]);
    put(sliceNumber, `${position + 1} / ${info.count}`);
    put(wl, `W ${Math.round(s.width)} L ${Math.round(s.center)}`);
    put(zoomText, `Zoom ${s.views[plane].zoom.toFixed(1)}×`);
    el.setAttribute('aria-label', `${PLANE_NAMES[plane]} images, slice ${position + 1} of ${info.count}`);
    crossH.hidden = crossV.hidden = s.layout !== 'mpr';
    if (!crossH.hidden) {
      const [u, v] = imagePoint(plane, s.cursor, frame.vol.dims);
      crossV.style.left = percent(u, info.width);
      crossH.style.top = percent(v, info.height);
    }
    const found = s.finding;
    ring.hidden = !(found && !s.testing && found.plane === plane && found.index === index());
    if (!ring.hidden) Object.assign(ring.style, { left: percent(found.at[0], 1), top: percent(found.at[1], 1) });
    const m = s.measure;
    ruler.hidden = !(m && m.plane === plane && m.index === index());
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
    plane,
    // Pixels per millimetre when the whole image fits the cell.
    get fit() { return fitScale(cw, ch, info.widthMm, info.heightMm); },
    // f: ui, vol, labelVol, labelNames, lut, lutId.
    update(f) {
      frame = f;
      if (!info || gridKey !== `${f.vol.dims}|${f.vol.spacing}`) setGrid(f.vol);
      layout();
      drawImage(f);
      drawLabels(f);
      drawMarks(f);
      readout();
    },
  };
}
