import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CT_LIMITS, presetsFor, resolveWindow, limitsFor } from './windows.js';

const ct = { windows: [{ name: 'Brain', center: 40, width: 80 }, { name: 'Bone', center: 400, width: 1800 }], defaultWindow: 'Bone' };
const mr = { windows: [], defaultWindow: '' };
const auto = { center: 300, width: 500, min: 0, max: 1200 };

test('a CT series lists its own windows and MR lists Auto and Full range once there is data', () => {
  assert.equal(presetsFor(ct), ct.windows);
  assert.deepEqual(presetsFor(mr), []);
  assert.deepEqual(presetsFor(mr, auto), [{ name: 'Auto', center: 300, width: 500 }, { name: 'Full range', center: 600, width: 1201 }]);
});

test('no window set means the series default, a name means that preset, hand values stay as given', () => {
  assert.deepEqual(resolveWindow(null, ct), { center: 400, width: 1800, name: 'Bone' });
  assert.deepEqual(resolveWindow({ name: 'Brain' }, ct), { center: 40, width: 80, name: 'Brain' });
  assert.deepEqual(resolveWindow({ center: 12, width: 34 }, ct), { center: 12, width: 34, name: null });
  assert.deepEqual(resolveWindow({ center: 0, width: 1 }, mr), { center: 0, width: 1, name: null }, 'a window by hand needs no data');
});

test('a preset the series does not have falls back to its default, and MR has no window until its data is in', () => {
  assert.equal(resolveWindow({ name: 'Lung' }, ct).name, 'Bone');
  assert.equal(resolveWindow(null, mr), null);
  assert.deepEqual(resolveWindow(null, mr, auto), { center: 300, width: 500, name: 'Auto' });
  assert.equal(resolveWindow({ name: 'Full range' }, mr, auto).width, 1201);
});

test('slider limits are fixed for CT and come from the data for MR', () => {
  assert.equal(limitsFor(ct), CT_LIMITS);
  assert.deepEqual(limitsFor(mr, auto), { min: 0, max: 1200 });
  assert.deepEqual(limitsFor(mr, { ...auto, min: -50 }), { min: -50, max: 1200 });
  assert.deepEqual(limitsFor(mr), { min: 0, max: 1 });
});

test('Full range centres on the midpoint of the data, below zero too, and the MR slider never starts above 0', () => {
  assert.equal(presetsFor(mr, { center: 0, width: 1, min: -50, max: 1200 })[1].center, 575);
  assert.equal(limitsFor(mr, { min: 100, max: 1200 }).min, 0);
});

test('the CT slider range is the Hounsfield range a scanner stores', () => {
  assert.deepEqual(CT_LIMITS, { min: -1024, max: 3071 });
});

test('a series with one preset gets an Auto window from the data after it, and two or more are left alone', () => {
  const one = { windows: [{ name: 'Soft', center: 40, width: 400 }], defaultWindow: 'Soft' };
  assert.deepEqual(presetsFor(one), one.windows);
  assert.deepEqual(presetsFor(one, auto).map(p => p.name), ['Soft', 'Auto']);
  assert.deepEqual(resolveWindow({ name: 'Auto' }, one, auto), { center: 300, width: 500, name: 'Auto' });
  assert.equal(resolveWindow({ name: 'Auto' }, one).name, 'Soft', 'before the data is in the default stands');
  assert.equal(presetsFor(ct, auto), ct.windows);
});
