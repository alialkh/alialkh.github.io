// Pure. The viewport grid layouts, the rule that picks a default one, and which slot sits next to which.
import { PLANES, planeInfo } from './planes.js';

// cells are [row, column, rowSpan, columnSpan]. cols and rows are relative track sizes. tall is the same layout turned for a phone held upright.
export const LAYOUTS = {
  '1x1': { name: '1 by 1', cols: [1], rows: [1], cells: [[0, 0, 1, 1]] },
  '1x2': { name: '1 by 2, side by side', cols: [1, 1], rows: [1], cells: [[0, 0, 1, 1], [0, 1, 1, 1]] },
  '2x1': { name: '2 by 1, stacked', cols: [1], rows: [1, 1], cells: [[0, 0, 1, 1], [1, 0, 1, 1]] },
  '2x2': { name: '2 by 2', cols: [1, 1], rows: [1, 1], cells: [[0, 0, 1, 1], [0, 1, 1, 1], [1, 0, 1, 1], [1, 1, 1, 1]] },
  '1p2': {
    name: '1 large plus 2', cols: [2, 1], rows: [1, 1], cells: [[0, 0, 2, 1], [0, 1, 1, 1], [1, 1, 1, 1]],
    tall: { cols: [1, 1], rows: [3, 2], cells: [[0, 0, 1, 2], [1, 0, 1, 1], [1, 1, 1, 1]] },
  },
};
export const LAYOUT_IDS = Object.keys(LAYOUTS);

export const geometry = (layout, tall = false) => (tall && LAYOUTS[layout].tall) || LAYOUTS[layout];
export const slotCount = layout => LAYOUTS[layout].cells.length;

// Every case opens in 2 by 2, as most PACS workstations do. The reader can pick another layout from the menu.
export const DEFAULT_LAYOUT = '2x2';

const close = (a, b) => Math.abs(a - b) <= 0.05 * Math.max(a, b);

// Millimetres between slices of each plane. A plane scrolls along the axis its image does not show.
const planeSteps = spacing => Object.fromEntries(PLANES.map(p => [p, planeInfo(p, [1, 1, 1], spacing).step]));

// The plane a series was acquired in, from its voxel spacing. The slice axis is the one that stands out from the other two, which is the
// largest spacing for a clinical stack (5 mm CT, a sagittal spine). When the two largest spacings match, the third axis is the slice axis
// (a CT whose in-plane pixels were averaged to 1.4 mm still opens axial). Near equal spacing on all three is axial.
export function nativePlane(spacing) {
  const step = planeSteps(spacing);
  const apart = PLANES.filter(p => PLANES.every(q => q === p || !close(step[p], step[q])));
  if (apart.length === 1) return apart[0];
  const top = Math.max(...PLANES.map(p => step[p]));
  return PLANES.every(p => close(step[p], top)) ? 'axial' : PLANES.reduce((best, p) => (step[p] > step[best] ? p : best));
}

// The native plane first, then the other two by the same spacing rule, ties in axial, coronal, sagittal order.
export function planeOrder(spacing) {
  const native = nativePlane(spacing);
  const step = planeSteps(spacing);
  return [native, ...PLANES.filter(p => p !== native).sort((a, b) => step[b] - step[a])];
}

// The four viewports of the default 2 by 2, as { series, plane, win?, labels? }. series: [{ id, windows: [{ name }], defaultWindow }].
// One series: its planes best first, then its native plane again with labels when the case has them, else with another window.
// Two series: each in its native plane on top, each in the next best plane below. Three or four: each in its native plane.
// A repeated viewport takes the first window that is not the default one, or an Auto window when there is no other preset.
export function defaultFill({ series, spacing, labels = false }) {
  const order = planeOrder(spacing);
  const [native, next] = order;
  const view = (s, plane) => ({ series: s.id, plane });
  const again = s => ({ ...view(s, native), ...(labels ? { labels: true } : { win: { name: s.windows.find(w => w.name !== s.defaultWindow)?.name ?? 'Auto' } }) });
  if (series.length === 1) return [...order.map(p => view(series[0], p)), again(series[0])];
  if (series.length === 2) return [view(series[0], native), view(series[1], native), view(series[0], next), view(series[1], next)];
  return [...series.slice(0, 4).map(s => view(s, native)), ...(series.length === 3 ? [again(series[0])] : [])];
}

const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

// The slot next to this one in a direction (left, right, up, down), or null at the edge. The most overlapping neighbour wins, then the lowest slot.
export function neighbour(layout, slot, dir, tall = false) {
  const rect = ([r, c, rs, cs]) => ({ r0: r, r1: r + rs, c0: c, c1: c + cs });
  const cells = geometry(layout, tall).cells.map(rect);
  const me = cells[slot];
  const best = cells
    .map((cell, i) => {
      const touching = { right: cell.c0 === me.c1, left: cell.c1 === me.c0, down: cell.r0 === me.r1, up: cell.r1 === me.r0 }[dir];
      const along = dir === 'left' || dir === 'right' ? overlap(me.r0, me.r1, cell.r0, cell.r1) : overlap(me.c0, me.c1, cell.c0, cell.c1);
      return { i, shared: touching ? along : 0 };
    })
    .filter(n => n.shared > 0)
    .sort((a, b) => b.shared - a.shared || a.i - b.i)[0];
  return best ? best.i : null;
}
