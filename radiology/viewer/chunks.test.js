import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkOrder, volumeProblems, startSlice, loadOrder } from './chunks.js';
import { createVolume, putChunk, isComplete, valueAt, chunkLength, readyRange } from './volume.js';

const chunksOf = (nz, size) => Array.from({ length: Math.ceil(nz / size) }, (_, i) => ({ file: `c${i}.gz`, z0: i * size, z1: Math.min(nz, (i + 1) * size) }));

test('the chunk holding the middle slice loads first, then the neighbours outward', () => {
  // 7 chunks of 16 over 100 slices. Slice 50 is in chunk 3 (48 to 64).
  assert.deepEqual(chunkOrder(chunksOf(100, 16), 100), [3, 2, 4, 1, 5, 0, 6]);
});

test('a single chunk and a volume of one slice still plan', () => {
  assert.deepEqual(chunkOrder(chunksOf(10, 16), 10), [0]);
  assert.deepEqual(chunkOrder(chunksOf(1, 16), 1), [0]);
});

test('the start slice is the middle one', () => {
  assert.equal(startSlice(100), 50);
  assert.equal(startSlice(49), 24);
});

test('putChunk copies slices into place and marks exactly those slices ready', () => {
  const meta = { dtype: 'int16', dims: [2, 2, 6], spacing: [1, 1, 1] };
  const vol = createVolume(meta);
  const chunk = { z0: 2, z1: 4 };
  const bytes = new Uint8Array(Int16Array.from([1, 2, 3, 4, 5, 6, 7, 8]).buffer);
  assert.equal(chunkLength(meta, chunk), bytes.length);
  putChunk(vol, chunk, bytes);
  assert.deepEqual(Array.from(vol.ready), [0, 0, 1, 1, 0, 0]);
  assert.deepEqual(Array.from(vol.data.slice(8, 16)), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(vol.data[0], 0);
  assert.equal(vol.readyCount, 2);
  putChunk(vol, chunk, bytes);
  assert.equal(vol.readyCount, 2, 'the same chunk twice is not counted twice');
  assert.equal(isComplete(vol), false);
  putChunk(vol, { z0: 0, z1: 2 }, new Uint8Array(16));
  putChunk(vol, { z0: 4, z1: 6 }, new Uint8Array(16));
  assert.equal(isComplete(vol), true);
});

test('putChunk reads a view that does not start at the buffer start', () => {
  const vol = createVolume({ dtype: 'uint8', dims: [2, 1, 2], spacing: [1, 1, 1] });
  const whole = Uint8Array.from([9, 9, 1, 2]);
  putChunk(vol, { z0: 0, z1: 1 }, whole.subarray(2));
  assert.deepEqual(Array.from(vol.data.slice(0, 2)), [1, 2]);
});

test('valueAt reads x fastest, then y, then z', () => {
  const vol = createVolume({ dtype: 'int16', dims: [3, 2, 2], spacing: [1, 1, 1] });
  vol.data.set(Int16Array.from({ length: 12 }, (_, i) => i));
  assert.equal(valueAt(vol, [2, 1, 1]), 11);
  assert.equal(valueAt(vol, [1, 0, 1]), 7);
});

const good = () => ({ dtype: 'int16', dims: [4, 4, 20], spacing: [1, 1, 2], chunkSlices: 16, chunks: chunksOf(20, 16) });

test('a good vol.json has no problems', () => {
  assert.deepEqual(volumeProblems(good()), []);
});

test('vol.json problems name the field', () => {
  assert.match(volumeProblems({ ...good(), dtype: 'float32' })[0], /dtype/);
  assert.match(volumeProblems({ ...good(), dims: [4, 4] })[0], /dims/);
  assert.match(volumeProblems({ ...good(), dims: [4, 0, 20] })[0], /dims/);
  assert.match(volumeProblems({ ...good(), dims: [4, 4.5, 20] })[0], /dims/);
  assert.match(volumeProblems({ ...good(), spacing: [1, 0, 1] })[0], /spacing/);
  assert.match(volumeProblems({ ...good(), chunks: [] })[0], /chunks/);
  assert.match(volumeProblems(null).join(), /dtype/);
});

test('chunks that leave a gap, overlap or stop short are rejected', () => {
  const gap = good();
  gap.chunks[1].z0 = 17;
  assert.match(volumeProblems(gap)[0], /chunk 1 must start at slice 16/);
  const short = good();
  short.chunks.pop();
  assert.match(volumeProblems(short)[0], /end at slice 16, expected 20/);
  const over = good();
  over.chunks[1].z1 = 24;
  assert.match(volumeProblems(over)[0], /end at slice 24, expected 20/);
});

test('readyRange is the run of arrived slices around a slice, and null when that slice is missing', () => {
  const vol = createVolume({ dtype: 'uint8', dims: [1, 1, 8], spacing: [1, 1, 1] });
  assert.equal(readyRange(vol, 4), null);
  for (const z of [2, 3, 4, 5, 7]) vol.ready[z] = 1;
  assert.deepEqual(readyRange(vol, 4), [2, 5]);
  assert.deepEqual(readyRange(vol, 7), [7, 7]);
  assert.equal(readyRange(vol, 6), null);
});

test('every volume has its own id, so a pane never reuses a cached picture for the wrong scan', () => {
  const meta = { dtype: 'uint8', dims: [1, 1, 1], spacing: [1, 1, 1] };
  assert.notEqual(createVolume(meta).id, createVolume(meta).id);
});

// Four chunks each. Slice 8 of 8 is chunk 2 (the middle), then 1 and 3, then 0.
const part = key => ({ key, chunks: chunksOf(8, 2), nz: 8 });
const label = ({ key, i }) => `${key}${i}`;

test('volumes on screen give their middle chunk first, in order of importance, then the others finish in turn', () => {
  const order = loadOrder([part('a'), part('b'), part('c'), part('labels')], ['b', 'a', 'labels']).map(label);
  assert.deepEqual(order.slice(0, 3), ['b2', 'a2', 'labels2']);
  assert.deepEqual(order.slice(3, 9), ['b1', 'b3', 'b0', 'a1', 'a3', 'a0']);
});

test('a volume that is not on screen waits for every shown one, and still goes middle first', () => {
  const order = loadOrder([part('a'), part('b'), part('c')], ['b']).map(label);
  assert.deepEqual(order, ['b2', 'b1', 'b3', 'b0', 'a2', 'a1', 'a3', 'a0', 'c2', 'c1', 'c3', 'c0']);
});

test('every chunk of every volume is listed exactly once, and an eager key that is not a volume is ignored', () => {
  const order = loadOrder([part('a'), part('b')], ['b', 'zzz', 'b', 'a']).map(label);
  assert.equal(order.length, 8);
  assert.equal(new Set(order).size, 8);
  assert.equal(order[0], 'b2');
});
