// The grid of viewports. Four panes are built once, and the layout shows the first few of them, or one when it is maximized.
import { h } from '../core/dom.js';
import { createPane } from './pane.js';
import { geometry } from './layouts.js';

const MAX_SLOTS = 4;
const tracks = weights => weights.map(w => `minmax(0, ${w}fr)`).join(' ');

// on is what createPane takes.
export function createGrid(on) {
  const panes = Array.from({ length: MAX_SLOTS }, (_, slot) => createPane(slot, on));
  const status = h('div', { class: 'status', role: 'status' });
  const el = h('div', { class: 'grid' }, panes.map(p => p.el), status);
  let key = '';

  return {
    el,
    panes,
    status,
    // Series names for the dropdown in every title bar.
    setSeries: list => panes.forEach(p => p.title.setSeries(list)),
    // Places the panes. The DOM is only touched when the layout, the maximized slot or the phone shape changed.
    apply({ layout, maximized, annotations }, tall) {
      el.dataset.annotations = annotations ? 'on' : 'off';
      const next = `${layout}|${maximized}|${tall}`;
      if (next === key) return;
      key = next;
      const g = geometry(layout, tall);
      Object.assign(el.style, { gridTemplateColumns: tracks(g.cols), gridTemplateRows: tracks(g.rows) });
      el.classList.toggle('maximized', maximized !== null);
      panes.forEach((pane, slot) => {
        const cell = g.cells[slot];
        pane.el.hidden = !cell || (maximized !== null && maximized !== slot);
        if (cell) pane.el.style.gridArea = maximized === slot ? '1 / 1 / -1 / -1' : `${cell[0] + 1} / ${cell[1] + 1} / span ${cell[2]} / span ${cell[3]}`;
      });
    },
  };
}
