import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowGray, windowLut, applyLut, dragWindow, autoWindow, windowEnds, valueRange, OFFSET } from './window.js';

const gray = (lut, v) => lut[v + OFFSET] & 0xff;

test('a CT soft tissue window of 40 over 400 is black up to -160 and white from 239', () => {
  const lut = windowLut(40, 400);
  assert.equal(gray(lut, -1000), 0);
  assert.equal(gray(lut, -160), 0);
  assert.equal(gray(lut, -159), 1);
  assert.equal(gray(lut, 40), 128);
  assert.equal(gray(lut, 238), 254);
  assert.equal(gray(lut, 239), 255);
  assert.equal(gray(lut, 3000), 255);
});

test('the table is opaque gray, and the extremes of int16 are still inside it', () => {
  const lut = windowLut(40, 400);
  assert.equal(lut[40 + OFFSET], 0xff808080);
  assert.equal(lut[0], 0xff000000);
  assert.equal(lut[lut.length - 1], 0xffffffff);
});

test('invert swaps black and white and nothing else', () => {
  const lut = windowLut(40, 400);
  const inv = windowLut(40, 400, true);
  for (const v of [-32768, -300, -159, 0, 40, 239, 32767]) assert.equal(gray(inv, v), 255 - gray(lut, v));
});

test('a width of 1 is a threshold at the level, and a width below 1 behaves as 1', () => {
  assert.deepEqual([windowGray(99, 100, 1), windowGray(100, 100, 1)], [0, 255]);
  assert.deepEqual([windowGray(99, 100, 0), windowGray(100, 100, -5)], [0, 255]);
});

test('gray never falls as the value rises, for a wide and a narrow window', () => {
  for (const [c, w] of [[-600, 1500], [50, 100], [300, 600], [0, 1]]) {
    const lut = windowLut(c, w);
    for (let i = 1; i < lut.length; i++) assert.ok((lut[i] & 0xff) >= (lut[i - 1] & 0xff), `${c}/${w} at ${i - OFFSET}`);
  }
});

test('MR intensities window the same way, from a level and width that are not HU', () => {
  const lut = windowLut(300, 600);
  assert.deepEqual([0, 300, 600, 1800].map(v => gray(lut, v)), [0, 128, 255, 255]);
  assert.equal(gray(lut, 1), 0);
});

test('applyLut maps every sample through the table', () => {
  const out = new Uint32Array(3);
  applyLut(Int16Array.of(-1000, 40, 500), windowLut(40, 400), out);
  assert.deepEqual(Array.from(out), [0xff000000, 0xff808080, 0xffffffff]);
});

test('dragging right widens, dragging up lowers the level, and a wide window moves faster', () => {
  assert.deepEqual(dragWindow({ center: 40, width: 400 }, 10, 0), { center: 40, width: 420 });
  assert.deepEqual(dragWindow({ center: 40, width: 400 }, 0, -10), { center: 20, width: 400 });
  assert.deepEqual(dragWindow({ center: 40, width: 400 }, 0, 10), { center: 60, width: 400 });
  assert.equal(dragWindow({ center: -600, width: 1500 }, 10, 0).width, 1575);
  assert.equal(dragWindow({ center: 50, width: 100 }, 10, 0).width, 110);
});

test('dragging never makes the width zero or leaves the int16 range', () => {
  assert.equal(dragWindow({ center: 0, width: 50 }, -500, 0).width, 1);
  assert.equal(dragWindow({ center: 32000, width: 400 }, 0, 100000).center, 32767);
  assert.equal(dragWindow({ center: -32000, width: 400 }, 0, -100000).center, -32768);
  assert.equal(dragWindow({ center: 0, width: 60000 }, 5000, 0).width, 65535);
});

test('autoWindow spans the tissue and ignores a few very bright outliers', () => {
  const values = new Int16Array(100000);
  for (let i = 30000; i < 99900; i++) values[i] = 100 + ((i * 7) % 400);
  for (let i = 99900; i < 100000; i++) values[i] = 4000;
  const { center, width } = autoWindow(values);
  assert.ok(width > 420 && width < 520, `width ${width}`);
  assert.ok(center > 220 && center < 270, `center ${center}`);
});

test('autoWindow on a flat volume gives a width of 1', () => {
  assert.deepEqual(autoWindow(new Int16Array(1000).fill(7)), { center: 7, width: 1 });
});

test('the ends of a window are the values shown as black and as white', () => {
  assert.deepEqual(windowEnds({ center: 40, width: 400 }), [-160, 240]);
});

test('valueRange is the lowest and highest sample', () => {
  assert.deepEqual(valueRange(Int16Array.of(5, -3, 900, 12)), [-3, 900]);
});
