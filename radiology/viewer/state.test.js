import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reduce, PANELS } from './state.js';
import { defaultFill } from './layouts.js';
import { HOME } from './view.js';

const run = (state, ...actions) => actions.reduce(reduce, state);
// Opens a case the way the scene does: open when it is chosen, ready once the volumes have said what they hold.
const open = (ids = ['ct'], cursor = [5, 6, 7], from = initialState(), { spacing = [1, 1, 1], labels = false } = {}) => run(from,
  { type: 'open' },
  { type: 'ready', cursor, fill: defaultFill({ series: ids.map(id => ({ id, windows: [], defaultWindow: '' })), spacing, labels }) });
const shape = s => s.viewports.map(v => `${v.series} ${v.plane}`);
const four = ['a', 'b', 'c', 'd'];

test('every case opens in 2 by 2 with no viewports until the volumes are known', () => {
  const s = run(initialState(), { type: 'open' });
  assert.deepEqual([s.layout, s.viewports], ['2x2', []]);
  assert.equal(open(['ct']).layout, '2x2');
  assert.equal(open(['a', 'b']).layout, '2x2');
  assert.equal(open(four).layout, '2x2');
});

test('ready fills the four viewports from the default fill, all at the first cursor', () => {
  assert.deepEqual(shape(open(['ct'])), ['ct axial', 'ct coronal', 'ct sagittal', 'ct axial']);
  assert.deepEqual(shape(open(['a', 'b'])), ['a axial', 'b axial', 'a coronal', 'b coronal']);
  assert.deepEqual(shape(open(four)), ['a axial', 'b axial', 'c axial', 'd axial']);
  assert.deepEqual(open(['ct'], [1, 2, 3]).viewports.map(v => v.cursor), Array(4).fill([1, 2, 3]));
});

test('an opened viewport is at home zoom with nothing inverted or measured, and the repeated one carries its own window or labels', () => {
  const s = open(['ct']);
  for (const v of s.viewports) assert.deepEqual([v.view, v.invert, v.measure], [HOME, false, null]);
  assert.deepEqual(s.viewports.map(v => [v.win, v.labels]), [[null, false], [null, false], [null, false], [{ name: 'Auto' }, false]]);
  assert.deepEqual(open(['ct'], [0, 0, 0], initialState(), { labels: true }).viewports.map(v => [v.win, v.labels]), [[null, false], [null, false], [null, false], [null, true]]);
});

test('the fill follows the volume: a sagittal acquisition opens sagittal in the first viewport', () => {
  assert.equal(open(['t1'], [0, 0, 0], initialState(), { spacing: [3.3, 0.6, 0.5] }).viewports[0].plane, 'sagittal');
});

test('opening the next case resets the viewports but keeps the panels and the annotation flag as the reader left them', () => {
  let s = run(open(['a']), { type: 'panel', name: 'left' }, { type: 'annotations' }, { type: 'maximize', slot: 1 }, { type: 'link' }, { type: 'layout', layout: '1x2' });
  s = open(four, [0, 0, 0], s);
  assert.deepEqual([s.layout, s.active, s.maximized, s.link, s.viewports.length], ['2x2', 0, null, true, 4]);
  assert.deepEqual([s.panels.left, s.annotations], [false, false]);
});

test('a layout chosen while the volumes are still loading holds, and ready fills that many viewports', () => {
  const loading = run(initialState(), { type: 'open' }, { type: 'layout', layout: '1x2' });
  assert.deepEqual([loading.layout, loading.viewports], ['1x2', []]);
  const ready = run(loading, { type: 'ready', cursor: [1, 1, 1], fill: defaultFill({ series: [{ id: 'a', windows: [], defaultWindow: '' }], spacing: [1, 1, 1] }) });
  assert.deepEqual(shape(ready), ['a axial', 'a coronal']);
});

test('swap moves whole viewports, with their zoom and window, and the active and maximized markers follow', () => {
  let s = open(['a', 'b']);
  s = run(s, { type: 'view', slot: 0, view: { zoom: 3, panX: 1, panY: 2 } }, { type: 'window', slot: 1, win: { name: 'Auto' } }, { type: 'maximize', slot: 0 });
  const [first, second] = s.viewports;
  const swapped = run(s, { type: 'swap', a: 0, b: 1 });
  assert.equal(swapped.viewports[0], second);
  assert.equal(swapped.viewports[1], first);
  assert.equal(swapped.active, 1, 'the active viewport went with its content');
  assert.equal(swapped.maximized, 1);
});

test('swapping a slot with itself, or with one that does not exist, changes nothing', () => {
  const s = open(['a', 'b']);
  assert.equal(reduce(s, { type: 'swap', a: 1, b: 1 }), s);
  assert.equal(reduce(s, { type: 'swap', a: 0, b: 5 }), s);
  assert.equal(reduce(s, { type: 'swap', a: 0, b: 4 }), s, 'four viewports means slots 0 to 3');
});

test('swap leaves an unrelated active viewport where it was', () => {
  const s = run(open(['a']), { type: 'activate', slot: 2 }, { type: 'swap', a: 0, b: 1 });
  assert.equal(s.active, 2);
});

test('assigning a plane keeps the window, and assigning a series gives the viewport that series default window', () => {
  let s = run(open(['a', 'b']), { type: 'window', slot: 0, win: { center: 10, width: 20 } }, { type: 'invert', slot: 0 });
  s = run(s, { type: 'assign', slot: 0, plane: 'coronal' });
  assert.deepEqual([s.viewports[0].plane, s.viewports[0].win], ['coronal', { center: 10, width: 20 }]);
  s = run(s, { type: 'assign', slot: 0, series: 'b' });
  assert.deepEqual([s.viewports[0].series, s.viewports[0].win, s.viewports[0].invert], ['b', null, true]);
});

test('assigning what is already there returns the same state, so nothing is redrawn', () => {
  const s = open(['a', 'b']);
  assert.equal(reduce(s, { type: 'assign', slot: 0, series: 'a', plane: 'axial' }), s);
  assert.equal(reduce(s, { type: 'assign', slot: 9, series: 'b' }), s);
});

test('maximize toggles one viewport and makes it active, restore and a layout change put the grid back', () => {
  const s = run(open(four), { type: 'maximize', slot: 2 });
  assert.deepEqual([s.maximized, s.active], [2, 2]);
  assert.equal(reduce(s, { type: 'maximize', slot: 2 }).maximized, null);
  assert.equal(reduce(s, { type: 'maximize', slot: 1 }).maximized, 1);
  assert.equal(reduce(s, { type: 'restore' }).maximized, null);
  assert.equal(reduce(s, { type: 'layout', layout: '1x2' }).maximized, null);
  assert.equal(run(open(['a']), { type: 'activate', slot: 2 }, { type: 'maximize' }).maximized, 2, 'with no slot it is the active one');
});

test('a larger layout adds viewports from the fill at the active cursor, and keeps the ones already there', () => {
  let s = run(open(['a', 'b'], [1, 1, 1]), { type: 'layout', layout: '1x2' }, { type: 'cursor', slot: 0, cursor: [4, 4, 4] }, { type: 'layout', layout: '2x2' });
  assert.deepEqual(shape(s), ['a axial', 'b axial', 'a coronal', 'b coronal']);
  assert.deepEqual(s.viewports[3].cursor, [4, 4, 4]);
  s = run(open(['a']), { type: 'layout', layout: '1x1' }, { type: 'assign', slot: 0, plane: 'sagittal' }, { type: 'layout', layout: '1x2' });
  assert.deepEqual(shape(s), ['a sagittal', 'a coronal']);
});

test('a smaller layout keeps the active viewport on screen in the last slot', () => {
  let s = run(open(four), { type: 'activate', slot: 3 }, { type: 'layout', layout: '1x2' });
  assert.deepEqual(shape(s), ['a axial', 'd axial']);
  assert.equal(s.active, 1);
  s = run(open(four), { type: 'activate', slot: 1 }, { type: 'layout', layout: '1x1' });
  assert.deepEqual([shape(s), s.active], [['b axial'], 0]);
  s = run(open(four), { type: 'activate', slot: 1 }, { type: 'layout', layout: '2x1' });
  assert.deepEqual([shape(s), s.active], [['a axial', 'b axial'], 1]);
});

test('an unknown layout, or the one already on, changes nothing', () => {
  const s = open(['a']);
  assert.equal(reduce(s, { type: 'layout', layout: '5x5' }), s);
  assert.equal(reduce(s, { type: 'layout', layout: '2x2' }), s);
});

test('linked, a cursor reaches every viewport. Unlinked, only the one that moved', () => {
  const s = open(['a', 'b'], [0, 0, 0]);
  assert.deepEqual(reduce(s, { type: 'cursor', slot: 1, cursor: [3, 3, 3] }).viewports.map(v => v.cursor), Array(4).fill([3, 3, 3]));
  const off = run(s, { type: 'link' }, { type: 'cursor', slot: 1, cursor: [3, 3, 3] });
  assert.deepEqual(off.viewports.map(v => v.cursor), [[0, 0, 0], [3, 3, 3], [0, 0, 0], [0, 0, 0]]);
});

test('turning Link back on pulls every viewport to where the active one is looking', () => {
  let s = run(open(['a', 'b'], [0, 0, 0]), { type: 'link' }, { type: 'cursor', slot: 0, cursor: [1, 1, 1] }, { type: 'cursor', slot: 1, cursor: [2, 2, 2] });
  s = run(s, { type: 'activate', slot: 1 }, { type: 'link' });
  assert.equal(s.link, true);
  assert.deepEqual(s.viewports.map(v => v.cursor), Array(4).fill([2, 2, 2]));
  assert.equal(reduce(s, { type: 'link' }).link, false);
});

test('turning Link off leaves the viewports exactly as they were', () => {
  const s = open(['a', 'b']);
  assert.equal(reduce(s, { type: 'link' }).viewports, s.viewports);
});

test('zoom, window, invert and measure belong to one viewport and reset puts that one back', () => {
  const view = { zoom: 2, panX: 5, panY: 6 };
  const ruler = { plane: 'axial', index: 1, a: [0, 0], b: [1, 1] };
  let s = run(open(['a', 'b']), { type: 'view', slot: 1, view }, { type: 'window', slot: 1, win: { name: 'Auto' } }, { type: 'invert', slot: 1 }, { type: 'measure', slot: 1, measure: ruler });
  assert.deepEqual([s.viewports[0].view, s.viewports[0].win, s.viewports[0].invert, s.viewports[0].measure], [HOME, null, false, null]);
  assert.deepEqual([s.viewports[1].view, s.viewports[1].win, s.viewports[1].invert, s.viewports[1].measure], [view, { name: 'Auto' }, true, ruler]);
  s = reduce(s, { type: 'reset', slot: 1 });
  assert.deepEqual([s.viewports[1].view, s.viewports[1].win, s.viewports[1].invert, s.viewports[1].measure], [HOME, null, false, null]);
  assert.equal(s.viewports[1].series, 'b', 'reset keeps what the viewport shows');
});

test('the label colours belong to one viewport, so a twin of the same plane can stay plain, and reset keeps them', () => {
  let s = open(['ct']);
  s = run(s, { type: 'labels', slot: 3 });
  assert.deepEqual(s.viewports.map(v => v.labels), [false, false, false, true]);
  assert.deepEqual(run(s, { type: 'labels', slot: 3 }).viewports.map(v => v.labels), [false, false, false, false]);
  assert.equal(run(s, { type: 'reset', slot: 3 }).viewports[3].labels, true);
  assert.equal(reduce(s, { type: 'labels', slot: 9 }), s);
});

const finding = (extra = {}) => ({ plane: 'coronal', index: 40, ...extra });

test('a finding opens in a viewport that shows its plane, moves the cursor everywhere when linked, and makes that viewport active', () => {
  const s = run(open(['ct'], [0, 0, 0]), { type: 'showFinding', finding: finding(), cursor: [7, 8, 9] });
  assert.equal(s.active, 1);
  assert.deepEqual(s.viewports.map(v => v.cursor), Array(4).fill([7, 8, 9]));
  assert.deepEqual(shape(s), ['ct axial', 'ct coronal', 'ct sagittal', 'ct axial'], 'no viewport had to change');
});

test('a finding with no matching plane turns the active viewport to that plane, and takes its series and window', () => {
  const s = run(open(four, [0, 0, 0]), { type: 'showFinding', finding: finding({ series: 'b', window: 'Auto' }), cursor: [1, 2, 3] });
  assert.equal(s.active, 0);
  assert.deepEqual(s.viewports[0], { ...s.viewports[0], series: 'b', plane: 'coronal', win: { name: 'Auto' } });
  assert.equal(s.viewports[1].plane, 'axial');
});

test('a finding for the same series keeps a window the reader chose, and only an explicit window replaces it', () => {
  const s = run(open(['ct']), { type: 'window', slot: 1, win: { center: 5, width: 6 } });
  assert.deepEqual(reduce(s, { type: 'showFinding', finding: finding(), cursor: [0, 0, 0] }).viewports[1].win, { center: 5, width: 6 });
  assert.deepEqual(reduce(s, { type: 'showFinding', finding: finding({ window: 'Bone' }), cursor: [0, 0, 0] }).viewports[1].win, { name: 'Bone' });
});

test('unlinked, a finding moves only the viewport it opens in', () => {
  const s = run(open(['ct'], [0, 0, 0]), { type: 'link' }, { type: 'showFinding', finding: finding(), cursor: [7, 8, 9] });
  assert.deepEqual(s.viewports.map(v => v.cursor), [[0, 0, 0], [7, 8, 9], [0, 0, 0], [0, 0, 0]]);
});

test('with a viewport maximized the finding opens in that one', () => {
  const s = run(open(['ct']), { type: 'maximize', slot: 0 }, { type: 'showFinding', finding: finding(), cursor: [1, 1, 1] });
  assert.deepEqual([s.active, s.maximized, s.viewports[0].plane], [0, 0, 'coronal']);
});

test('on a wide screen the panels toggle their own flags', () => {
  let s = run(initialState(), { type: 'panel', name: 'left' });
  assert.deepEqual(s.panels, { ...PANELS, left: false });
  s = run(s, { type: 'panel', name: 'bar' }, { type: 'panel', name: 'right' });
  assert.deepEqual(s.panels, { left: false, right: false, bar: false });
  assert.equal(s.drawer, null);
});

test('on a narrow screen the sidebars are drawers, one open at a time, and the bar keeps its flag', () => {
  let s = run(initialState({ narrow: true }), { type: 'panel', name: 'left' });
  assert.deepEqual([s.drawer, s.panels.left], ['left', true]);
  s = run(s, { type: 'panel', name: 'right' });
  assert.equal(s.drawer, 'right');
  s = run(s, { type: 'panel', name: 'right' });
  assert.equal(s.drawer, null);
  s = run(s, { type: 'panel', name: 'bar' });
  assert.deepEqual([s.drawer, s.panels.bar], [null, false]);
});

test('going narrow closes drawers, and closeDrawer closes the open one only', () => {
  const s = run(initialState({ narrow: true }), { type: 'panel', name: 'left' });
  assert.equal(reduce(s, { type: 'closeDrawer' }).drawer, null);
  assert.equal(reduce(s, { type: 'narrow', on: false }).drawer, null);
  const closed = initialState();
  assert.equal(reduce(closed, { type: 'closeDrawer' }), closed);
});

test('initial panels merge what was saved over the defaults', () => {
  assert.deepEqual(initialState({ panels: { right: false } }).panels, { left: true, right: false, bar: true });
});

test('image only and annotations toggle, and image only can be set off', () => {
  const s = run(initialState(), { type: 'imageOnly' });
  assert.equal(s.imageOnly, true);
  assert.equal(reduce(s, { type: 'imageOnly', on: false }).imageOnly, false);
  assert.equal(reduce(s, { type: 'imageOnly' }).imageOnly, false);
  assert.equal(reduce(initialState(), { type: 'annotations' }).annotations, false);
});

test('a slot past the last viewport is never accepted, so one past the end changes nothing', () => {
  const s = open(['a', 'b']);
  assert.equal(reduce(s, { type: 'activate', slot: 9 }), s);
  assert.equal(reduce(s, { type: 'maximize', slot: 9 }), s);
  assert.equal(reduce(s, { type: 'cursor', slot: 9, cursor: [1, 1, 1] }), s);
});

test('activating the active slot, or restoring when nothing is maximized, hands back the same state', () => {
  const s = open(['a']);
  assert.equal(reduce(s, { type: 'activate', slot: 0 }), s);
  assert.equal(reduce(s, { type: 'restore' }), s);
});

test('toggles come back: invert twice, annotations twice, a wide panel twice', () => {
  assert.equal(run(open(['a']), { type: 'invert', slot: 0 }, { type: 'invert', slot: 0 }).viewports[0].invert, false);
  assert.equal(run(initialState(), { type: 'annotations' }, { type: 'annotations' }).annotations, true);
  assert.equal(run(initialState(), { type: 'panel', name: 'left' }, { type: 'panel', name: 'left' }).panels.left, true);
});

test('image only can be set off from the start, and narrow can be set on', () => {
  assert.equal(reduce(initialState(), { type: 'imageOnly', on: false }).imageOnly, false);
  assert.equal(reduce(initialState(), { type: 'narrow', on: true }).narrow, true);
});

test('an action it does not know is an error, not a silent no-op', () => {
  assert.throws(() => reduce(initialState(), { type: 'nope' }), /Unknown viewer action "nope"/);
});

test('reducing never changes the state it was given', () => {
  const s = open(four);
  const before = JSON.stringify(s);
  run(s, { type: 'swap', a: 0, b: 3 }, { type: 'layout', layout: '1x1' }, { type: 'cursor', slot: 0, cursor: [9, 9, 9] }, { type: 'showFinding', finding: finding(), cursor: [1, 1, 1] }, { type: 'labels', slot: 0 });
  assert.equal(JSON.stringify(s), before);
});

test('opening a case drops the old viewports, the old fill and a maximized viewport until ready arrives', () => {
  const s = open(['a', 'b']);
  assert.deepEqual(reduce(s, { type: 'open' }).viewports, []);
  assert.deepEqual(run(s, { type: 'open' }, { type: 'layout', layout: '1x2' }).viewports, [], 'no fill left over from the last case');
  assert.equal(run(s, { type: 'maximize', slot: 1 }, { type: 'open' }).maximized, null);
});
