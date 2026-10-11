// The slim title bar above one viewport: a drag handle, the label, a series and a plane dropdown, and the maximize button.
// It sits above the image, never over it. Drag it onto another viewport to swap, or hold Alt and press an arrow key.
import { h } from '../core/dom.js';
import { icon } from './icons.js';
import { PLANES, PLANE_NAMES } from './planes.js';
import { viewportTitle } from './annotate.js';
import { beginDrag } from './drag.js';

const ARROWS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
const put = (el, text) => {
  if (el.textContent !== text) el.textContent = text;
};

// on: activate(slot), maximize(slot), assign(slot, { series, plane }), swapWith(slot, targetSlot), swapKey(slot, direction).
export function createTitle(slot, on) {
  const n = slot + 1;
  const label = h('span', { class: 'vp-label' });
  const seriesSelect = h('select', { 'aria-label': `Series in viewport ${n}` });
  const planeSelect = h('select', { 'aria-label': `Plane in viewport ${n}` }, PLANES.map(p => h('option', { value: p }, PLANE_NAMES[p])));
  const pick = (select, glyph, text) => h('label', { class: 'vp-pick', title: text }, icon(glyph), select);
  const seriesPick = pick(seriesSelect, 'series', 'Series');
  const max = h('button', { type: 'button', class: 'icon-btn vp-max', 'aria-pressed': 'false', onclick: () => on.maximize(slot) });
  const el = h('div', { class: 'vp-title', role: 'group', tabindex: '0' },
    h('span', { class: 'grip', 'aria-hidden': 'true' }, icon('grip')), label, seriesPick, pick(planeSelect, 'plane', 'Plane'), max);
  let text = '';
  let wasMax = null;

  seriesSelect.addEventListener('change', () => on.assign(slot, { series: seriesSelect.value }));
  planeSelect.addEventListener('change', () => on.assign(slot, { plane: planeSelect.value }));
  el.addEventListener('dblclick', e => {
    if (!e.target.closest('select, button')) on.maximize(slot);
  });
  el.addEventListener('keydown', e => {
    if (!e.altKey || !(e.key in ARROWS)) return;
    e.preventDefault();
    on.swapKey(slot, ARROWS[e.key]);
  });
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('select, button, .vp-pick')) return;
    e.preventDefault();
    on.activate(slot);
    el.focus({ preventScroll: true });
    beginDrag(e, {
      label: text,
      targetAt: (x, y) => document.elementFromPoint(x, y)?.closest('.pane') ?? null,
      onDrop: pane => on.swapWith(slot, Number(pane.dataset.slot)),
    });
  });

  return {
    el,
    // series: [{ id, name }]. Rebuilt only when the case changes.
    setSeries(list) {
      seriesSelect.replaceChildren(...list.map(s => h('option', { value: s.id }, s.name)));
      seriesPick.hidden = list.length < 2;
    },
    // vp: the viewport, seriesName: its series name, maximized: whether it fills the grid.
    sync(vp, seriesName, maximized) {
      text = viewportTitle(seriesName, vp);
      put(label, text);
      if (seriesSelect.value !== vp.series) seriesSelect.value = vp.series;
      if (planeSelect.value !== vp.plane) planeSelect.value = vp.plane;
      el.setAttribute('aria-label', `Viewport ${n}, ${text}. Drag to swap with another viewport, or hold Alt and press an arrow key. Double click to maximize.`);
      if (maximized === wasMax) return;
      wasMax = maximized;
      const name = maximized ? `Restore viewport ${n} to the grid (Escape)` : `Maximize viewport ${n} (X)`;
      max.setAttribute('aria-label', name);
      max.title = name;
      max.setAttribute('aria-pressed', String(maximized));
      max.replaceChildren(icon(maximized ? 'restore' : 'maximize'));
    },
  };
}
