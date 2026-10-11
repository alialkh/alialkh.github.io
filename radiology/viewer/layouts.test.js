import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_IDS, DEFAULT_LAYOUT, geometry, slotCount, nativePlane, planeOrder, defaultFill, neighbour } from './layouts.js';

const one = id => ({ id, windows: [{ name: 'Lung' }, { name: 'Mediastinum' }], defaultWindow: 'Lung' });
const mr = id => ({ id, windows: [], defaultWindow: '' });
const fill = (series, spacing, labels = false) => defaultFill({ series, spacing, labels }).map(v => `${v.series} ${v.plane}${v.win ? ` ${v.win.name}` : ''}${v.labels ? ' labels' : ''}`);

test('every case opens in 2 by 2', () => {
  assert.equal(DEFAULT_LAYOUT, '2x2');
});

test('the native plane is the one the slice axis stands out from, so a thick CT stack opens axial and a sagittal spine opens sagittal', () => {
  assert.equal(nativePlane([0.8, 0.8, 5]), 'axial');
  assert.equal(nativePlane([3.32, 0.63, 0.5]), 'sagittal');
  assert.equal(nativePlane([0.7, 3, 0.7]), 'coronal');
  assert.equal(nativePlane([1.37, 1.25, 1.25]), 'sagittal', 'a 10 percent odd axis is the slice axis');
});

test('equal spacing on all three axes, or nearly, opens axial', () => {
  assert.equal(nativePlane([1.5, 1.5, 1.5]), 'axial');
  assert.equal(nativePlane([0.98, 0.98, 1]), 'axial');
  assert.equal(nativePlane([1.95, 1.95, 2]), 'axial');
});

test('when the two largest spacings match the third axis is the slice axis, so a CT averaged to 1.4 mm in plane still opens axial', () => {
  assert.equal(nativePlane([1.42, 1.42, 1]), 'axial');
  assert.equal(nativePlane([1, 1.42, 1.42]), 'sagittal');
});

test('the other planes follow by spacing, ties in axial, coronal, sagittal order', () => {
  assert.deepEqual(planeOrder([0.8, 0.8, 5]), ['axial', 'coronal', 'sagittal']);
  assert.deepEqual(planeOrder([3.32, 0.63, 0.5]), ['sagittal', 'coronal', 'axial']);
  assert.deepEqual(planeOrder([1, 3, 2]), ['coronal', 'axial', 'sagittal']);
});

test('one series opens in its three planes best first, then its native plane again with another window', () => {
  assert.deepEqual(fill([one('ct')], [0.8, 0.8, 5]), ['ct axial', 'ct coronal', 'ct sagittal', 'ct axial Mediastinum']);
  assert.deepEqual(fill([one('ct')], [3.3, 0.6, 0.5]), ['ct sagittal', 'ct coronal', 'ct axial', 'ct sagittal Mediastinum']);
});

test('the repeated viewport skips the default window, and with only one preset or none it takes an Auto window', () => {
  assert.equal(fill([{ ...one('ct'), defaultWindow: 'Mediastinum' }], [1, 1, 1])[3], 'ct axial Lung');
  assert.equal(fill([{ id: 'ct', windows: [{ name: 'Soft' }], defaultWindow: 'Soft' }], [1, 1, 1])[3], 'ct axial Auto');
  assert.equal(fill([mr('t1')], [1, 1, 1])[3], 't1 axial Auto');
});

test('with labels the repeated viewport shows them, on the default window, and not another window', () => {
  assert.deepEqual(fill([one('ct')], [0.8, 0.8, 5], true), ['ct axial', 'ct coronal', 'ct sagittal', 'ct axial labels']);
});

test('two series open with each in its native plane on top and in the next best plane below', () => {
  assert.deepEqual(fill([mr('t1'), mr('t2')], [1, 1, 1]), ['t1 axial', 't2 axial', 't1 coronal', 't2 coronal']);
  assert.deepEqual(fill([mr('t1'), mr('t2')], [3.3, 0.6, 0.5]), ['t1 sagittal', 't2 sagittal', 't1 coronal', 't2 coronal']);
  assert.deepEqual(fill([mr('t1'), mr('t2')], [1, 1, 1], true), ['t1 axial', 't2 axial', 't1 coronal', 't2 coronal'], 'labels do not change the two series fill');
});

test('four series open one per viewport in the native plane, and a third series leaves the fourth viewport a second look at the first', () => {
  assert.deepEqual(fill(['a', 'b', 'c', 'd'].map(mr), [1, 1, 1]), ['a axial', 'b axial', 'c axial', 'd axial']);
  assert.deepEqual(fill(['a', 'b', 'c'].map(mr), [1, 1, 1]), ['a axial', 'b axial', 'c axial', 'a axial Auto']);
  assert.deepEqual(fill(['a', 'b', 'c'].map(one), [1, 1, 1], true), ['a axial', 'b axial', 'c axial', 'a axial labels']);
  assert.deepEqual(fill(['a', 'b', 'c', 'd', 'e'].map(mr), [1, 1, 1]).length, 4, 'a fifth series has no viewport');
});

test('the five layouts have 1, 2, 2, 4 and 3 slots', () => {
  assert.deepEqual(LAYOUT_IDS.map(slotCount), [1, 2, 2, 4, 3]);
  assert.deepEqual(LAYOUT_IDS, ['1x1', '1x2', '2x1', '2x2', '1p2']);
});

test('the cells of every layout tile its tracks exactly once, upright and on a tall phone', () => {
  for (const id of LAYOUT_IDS) {
    for (const tall of [false, true]) {
      const { cols, rows, cells } = geometry(id, tall);
      const used = rows.map(() => cols.map(() => 0));
      for (const [r, c, rs, cs] of cells) for (let i = r; i < r + rs; i++) for (let j = c; j < c + cs; j++) used[i][j]++;
      assert.deepEqual(used.flat(), used.flat().map(() => 1), `${id} tall ${tall}`);
    }
  }
});

test('the tall phone layout stacks the large viewport over the other two', () => {
  assert.deepEqual(geometry('1p2', true).cells, [[0, 0, 1, 2], [1, 0, 1, 1], [1, 1, 1, 1]]);
  assert.deepEqual(geometry('2x2', true), geometry('2x2', false));
});

test('neighbours in 2 by 2', () => {
  const at = (slot, dir) => neighbour('2x2', slot, dir);
  assert.deepEqual([at(0, 'right'), at(0, 'down'), at(3, 'left'), at(3, 'up'), at(1, 'down'), at(2, 'right')], [1, 2, 2, 1, 3, 3]);
  assert.deepEqual([at(0, 'left'), at(0, 'up'), at(3, 'right'), at(3, 'down')], [null, null, null, null]);
});

test('neighbours around the large viewport reach the right slot from both sides', () => {
  const at = (slot, dir, tall) => neighbour('1p2', slot, dir, tall);
  assert.equal(at(0, 'right'), 1, 'the top one wins a tie');
  assert.equal(at(2, 'left'), 0);
  assert.equal(at(1, 'left'), 0);
  assert.equal(at(1, 'down'), 2);
  assert.equal(at(2, 'up'), 1);
  assert.equal(at(0, 'down'), null);
  assert.equal(at(0, 'down', true), 1, 'upright on a phone the large one sits above the other two');
  assert.equal(at(2, 'up', true), 0);
});

test('side by side and stacked neighbours', () => {
  assert.equal(neighbour('1x2', 0, 'right'), 1);
  assert.equal(neighbour('1x2', 1, 'left'), 0);
  assert.equal(neighbour('1x2', 0, 'down'), null);
  assert.equal(neighbour('2x1', 0, 'down'), 1);
  assert.equal(neighbour('2x1', 1, 'up'), 0);
  assert.equal(neighbour('1x1', 0, 'right'), null);
});

test('the large viewport is the wider column, and on a phone the taller row', () => {
  assert.deepEqual(geometry('1p2').cols, [2, 1]);
  assert.deepEqual(geometry('1p2', true).rows, [3, 2]);
});

test('spacing within 5 percent counts as equal, but a chain of near equal spacings is judged against its largest', () => {
  assert.equal(nativePlane([1, 0.98, 0.98]), 'axial');
  assert.equal(nativePlane([1.08, 1.04, 1]), 'sagittal', 'the two ends are 8 percent apart');
});

test('a fifth series has no viewport, and the first four are the ones shown', () => {
  assert.deepEqual(defaultFill({ series: ['a', 'b', 'c', 'd', 'e'].map(mr), spacing: [1, 1, 1] }).map(v => v.series), ['a', 'b', 'c', 'd']);
});

test('labels default to off, so a two window CT repeats its native plane on the other window', () => {
  assert.deepEqual(defaultFill({ series: [one('ct')], spacing: [0.8, 0.8, 5] })[3], { series: 'ct', plane: 'axial', win: { name: 'Mediastinum' } });
});

test('the repeated window is the first one that is not the default, wherever the default sits in the list', () => {
  const ct = { id: 'ct', windows: [{ name: 'Brain' }, { name: 'Subdural' }, { name: 'Bone' }], defaultWindow: 'Bone' };
  assert.deepEqual(defaultFill({ series: [ct], spacing: [1, 1, 1] })[3].win, { name: 'Brain' });
});
