// Pure. Every fact about the viewports and the panels around them lives in one state object, and reduce() is the only way it changes.
// A viewport is { series, plane, cursor, view, win, invert, measure, labels }. Slot i of the layout shows viewports[i], so a swap moves a whole viewport.
import { HOME } from './view.js';
import { LAYOUTS, DEFAULT_LAYOUT, slotCount } from './layouts.js';
import { applyCursor, findingSlot } from './link.js';

export const PANELS = { left: true, right: true, bar: true };

const viewport = ({ series, plane, win = null, labels = false }, cursor) => ({ series, plane, cursor, view: HOME, win, invert: false, measure: null, labels });
const inRange = (s, slot) => Number.isInteger(slot) && slot >= 0 && slot < s.viewports.length;

export const initialState = ({ narrow = false, panels = {}, annotations = true } = {}) => ({
  fill: [], layout: DEFAULT_LAYOUT, viewports: [], active: 0, maximized: null, link: true,
  annotations, imageOnly: false, narrow, panels: { ...PANELS, ...panels }, drawer: null,
});

// Changes one viewport. fn returns the new viewport, or the same one for no change, which keeps the state identical.
function patch(s, slot, fn) {
  if (!inRange(s, slot)) return s;
  const next = fn(s.viewports[slot]);
  return next === s.viewports[slot] ? s : { ...s, viewports: s.viewports.map((v, i) => (i === slot ? next : v)) };
}

// A series change drops a preset or hand window that belonged to the old series, so the new one starts on its own default.
const retarget = (v, series, plane) => (v.series === series && v.plane === plane ? v : { ...v, series, plane, win: series === v.series ? v.win : null });

const ACTIONS = {
  // A new case. It opens in the default layout with no viewports until its volumes say what they hold. Panels and the annotation flag stay.
  open: s => ({ ...s, layout: DEFAULT_LAYOUT, fill: [], viewports: [], active: 0, maximized: null, link: true }),
  // fill is defaultFill() for the case. The viewports of the current layout take its first entries, all at the first cursor.
  ready: (s, { cursor, fill }) => ({ ...s, fill, viewports: fill.slice(0, slotCount(s.layout)).map(v => viewport(v, cursor)), active: 0, maximized: null }),

  // Growing adds viewports from the fill. Shrinking keeps the active viewport on screen by moving it into the last slot.
  layout: (s, { layout }) => {
    if (!LAYOUTS[layout] || layout === s.layout) return s;
    if (!s.fill.length) return { ...s, layout };
    const n = slotCount(layout);
    const where = s.viewports[s.active]?.cursor ?? null;
    const viewports = Array.from({ length: n }, (_, i) => s.viewports[i] ?? viewport(s.fill[i], where));
    if (s.active >= n) viewports[n - 1] = s.viewports[s.active];
    return { ...s, layout, viewports, active: Math.min(s.active, n - 1), maximized: null };
  },
  assign: (s, { slot, series, plane }) => patch(s, slot, v => retarget(v, series ?? v.series, plane ?? v.plane)),
  swap: (s, { a, b }) => {
    if (a === b || !inRange(s, a) || !inRange(s, b)) return s;
    const viewports = [...s.viewports];
    [viewports[a], viewports[b]] = [viewports[b], viewports[a]];
    const follow = i => (i === a ? b : i === b ? a : i);
    return { ...s, viewports, active: follow(s.active), maximized: s.maximized === null ? null : follow(s.maximized) };
  },
  activate: (s, { slot }) => (inRange(s, slot) && slot !== s.active ? { ...s, active: slot } : s),
  maximize: (s, { slot = s.active }) => (inRange(s, slot) ? { ...s, active: slot, maximized: s.maximized === slot ? null : slot } : s),
  restore: s => (s.maximized === null ? s : { ...s, maximized: null }),

  // Turning Link on pulls every viewport to where the active one is looking.
  link: s => {
    const link = !s.link;
    const cursor = s.viewports[s.active]?.cursor;
    return { ...s, link, viewports: link && cursor ? applyCursor(s.viewports, s.active, cursor, true) : s.viewports };
  },
  cursor: (s, { slot, cursor }) => (inRange(s, slot) ? { ...s, viewports: applyCursor(s.viewports, slot, cursor, s.link) } : s),
  view: (s, { slot, view }) => patch(s, slot, v => ({ ...v, view })),
  window: (s, { slot, win }) => patch(s, slot, v => ({ ...v, win })),
  invert: (s, { slot }) => patch(s, slot, v => ({ ...v, invert: !v.invert })),
  // The label colours are drawn per viewport, so one can show the structures while its twin shows the plain scan.
  labels: (s, { slot }) => patch(s, slot, v => ({ ...v, labels: !v.labels })),
  measure: (s, { slot, measure }) => patch(s, slot, v => ({ ...v, measure })),
  reset: (s, { slot }) => patch(s, slot, v => ({ ...v, view: HOME, win: null, invert: false, measure: null })),

  // The finding opens in a viewport that can show its plane, on its series and window, with the cursor on the finding.
  showFinding: (s, { finding, cursor }) => {
    const slot = findingSlot(s, finding);
    const shown = patch(s, slot, v => {
      const moved = retarget(v, finding.series ?? v.series, finding.plane);
      return finding.window ? { ...moved, win: { name: finding.window } } : moved;
    });
    return { ...shown, active: slot, viewports: applyCursor(shown.viewports, slot, cursor, s.link) };
  },

  annotations: s => ({ ...s, annotations: !s.annotations }),
  imageOnly: (s, { on = !s.imageOnly }) => ({ ...s, imageOnly: on }),
  narrow: (s, { on }) => ({ ...s, narrow: on, drawer: null }),
  // On a narrow screen the two sidebars are drawers, only one open at a time. The bar keeps its own flag everywhere.
  panel: (s, { name }) => (s.narrow && name !== 'bar'
    ? { ...s, drawer: s.drawer === name ? null : name }
    : { ...s, panels: { ...s.panels, [name]: !s.panels[name] } }),
  closeDrawer: s => (s.drawer ? { ...s, drawer: null } : s),
};

export function reduce(state, action) {
  const handler = ACTIONS[action.type];
  if (!handler) throw new Error(`Unknown viewer action "${action.type}"`);
  return handler(state, action);
}
