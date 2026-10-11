import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { streamVolume, runJobs } from './loader.js';
import { createVolume, isComplete } from './volume.js';

// 2 by 2 voxels, 8 slices, chunks of 2. Every voxel holds its slice number. Slice 4 is the middle one, in c2.
const meta = { dtype: 'uint8', dims: [2, 2, 8], spacing: [1, 1, 1], chunks: [0, 2, 4, 6].map((z0, i) => ({ file: `c${i}.gz`, z0, z1: z0 + 2 })) };
const raw = chunk => Uint8Array.from({ length: (chunk.z1 - chunk.z0) * 4 }, (_, i) => chunk.z0 + Math.floor(i / 4));
const server = ({ gz = true, log = [], badSize = null } = {}) => async (url, { signal }) => {
  signal.throwIfAborted();
  const name = new URL(url).pathname.split('/').pop();
  log.push(name);
  const chunk = meta.chunks.find(c => c.file === name);
  if (!chunk) return new Response('', { status: 404 });
  let bytes = raw(chunk);
  if (name === badSize) bytes = bytes.slice(1);
  return new Response(gz ? gzipSync(bytes) : bytes);
};
const base = 'http://x.test/cases/a/ct/';

test('every chunk lands in the right slices', async () => {
  const vol = createVolume(meta);
  assert.equal(await streamVolume(vol, meta, base, { signal: new AbortController().signal, fetchFn: server() }), true);
  assert.ok(isComplete(vol));
  for (let z = 0; z < 8; z++) assert.equal(vol.data[z * 4 + 3], z);
});

test('the chunk with the middle slice is requested first', async () => {
  const log = [];
  await streamVolume(createVolume(meta), meta, base, { signal: new AbortController().signal, fetchFn: server({ log }) });
  assert.equal(log[0], 'c2.gz');
});

test('onChunk fires once per chunk and the first image is possible after the first one', async () => {
  const vol = createVolume(meta);
  const seen = [];
  await streamVolume(vol, meta, base, { signal: new AbortController().signal, fetchFn: server(), onChunk: c => seen.push([c.file, vol.ready[5]]) });
  assert.equal(seen.length, 4);
  assert.deepEqual(seen.find(([file]) => file === 'c2.gz'), ['c2.gz', 1]);
});

test('a server that already undid the gzip still works', async () => {
  const vol = createVolume(meta);
  await streamVolume(vol, meta, base, { signal: new AbortController().signal, fetchFn: server({ gz: false }) });
  assert.ok(isComplete(vol));
  assert.equal(vol.data[7 * 4], 7);
});

test('aborting stops further requests and reports false', async () => {
  const controller = new AbortController();
  const log = [];
  const fetchFn = server({ log });
  const vol = createVolume(meta);
  const done = streamVolume(vol, meta, base, { signal: controller.signal, fetchFn: (u, o) => { controller.abort(); return fetchFn(u, o); } });
  assert.equal(await done, false);
  assert.ok(log.length <= 1);
  assert.ok(!isComplete(vol));
});

test('calling again resumes and does not fetch the chunks already in', async () => {
  const vol = createVolume(meta);
  const first = new AbortController();
  await streamVolume(vol, meta, base, { signal: first.signal, fetchFn: server(), onChunk: () => first.abort() });
  const have = meta.chunks.filter(c => vol.ready[c.z0]).map(c => c.file);
  assert.ok(have.length >= 1 && !isComplete(vol));
  const log = [];
  await streamVolume(vol, meta, base, { signal: new AbortController().signal, fetchFn: server({ log }) });
  assert.ok(isComplete(vol));
  assert.deepEqual(log.filter(name => have.includes(name)), []);
  assert.equal(log.length, 4 - have.length);
});

test('a missing chunk and a chunk of the wrong size both reject with the file in the message', async () => {
  await assert.rejects(streamVolume(createVolume(meta), { ...meta, chunks: [{ file: 'zz.gz', z0: 0, z1: 8 }] }, base, { signal: new AbortController().signal, fetchFn: server() }), /zz\.gz: HTTP 404/);
  await assert.rejects(streamVolume(createVolume(meta), meta, base, { signal: new AbortController().signal, fetchFn: server({ badSize: 'c0.gz' }) }), /c0\.gz holds 7 bytes, expected 8/);
});

test('limit stops after that many chunks, middle one first', async () => {
  const log = [];
  const vol = createVolume(meta);
  assert.equal(await streamVolume(vol, meta, base, { signal: new AbortController().signal, fetchFn: server({ log }), limit: 1 }), true);
  assert.deepEqual(log, ['c2.gz']);
  assert.equal(vol.readyCount, 2);
});

test('after one chunk fails no further chunks are requested', async () => {
  const log = [];
  await assert.rejects(streamVolume(createVolume(meta), meta, base, { signal: new AbortController().signal, fetchFn: server({ log, badSize: 'c2.gz' }) }), /c2\.gz holds 7 bytes/);
  // The other workers are still finishing their own chunks, so give them time to ask for more if they were going to.
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual([...log].sort(), ['c1.gz', 'c2.gz', 'c3.gz']);
});

// Counts how many requests are open when each one starts.
function counting(inner) {
  const started = [];
  let open = 0;
  const fetchFn = async (url, options) => {
    started.push(++open);
    await new Promise(resolve => setTimeout(resolve, 8));
    try {
      return await inner(url, options);
    } finally {
      open--;
    }
  };
  return { fetchFn, started };
}
const jobsFor = (vol, base = 'http://x.test/a/') => meta.chunks.map(chunk => ({ vol, meta, chunk, base }));

test('without ramp the first three chunks are requested together', async () => {
  const { fetchFn, started } = counting(server());
  await runJobs(jobsFor(createVolume(meta)), { signal: new AbortController().signal, fetchFn });
  assert.deepEqual(started.slice(0, 3), [1, 2, 3]);
});

test('with ramp the first chunk goes alone, then the others share the link three at a time', async () => {
  const log = [];
  const { fetchFn, started } = counting(server({ log }));
  const vol = createVolume(meta);
  const done = await runJobs(jobsFor(vol), { signal: new AbortController().signal, fetchFn, ramp: true });
  assert.equal(done, true);
  assert.equal(started[0], 1);
  assert.equal(started[1], 1, 'the second request waited for the first to finish');
  assert.equal(Math.max(...started), 3);
  assert.equal(log[0], 'c0.gz', 'jobs run in the order given');
  assert.ok(isComplete(vol));
});

test('jobs from two volumes land in their own volume and report their key', async () => {
  const a = createVolume(meta);
  const b = createVolume(meta);
  const keys = [];
  const jobs = [{ ...jobsFor(a)[0], key: 'a' }, { ...jobsFor(b)[1], key: 'b' }];
  await runJobs(jobs, { signal: new AbortController().signal, fetchFn: server(), onChunk: (chunk, job) => keys.push(`${job.key}${chunk.z0}`) });
  assert.deepEqual(keys.sort(), ['a0', 'b2']);
  assert.deepEqual([a.ready[0], a.ready[2], b.ready[0], b.ready[2]], [1, 0, 0, 1]);
});

test('with ramp, a failing first chunk stops everything and nothing else is requested', async () => {
  const log = [];
  await assert.rejects(runJobs(jobsFor(createVolume(meta)), { signal: new AbortController().signal, fetchFn: server({ log, badSize: 'c0.gz' }), ramp: true }), /c0\.gz holds 7 bytes/);
  assert.deepEqual(log, ['c0.gz']);
});

test('a stream that is aborted by its own first chunk resolves false', async () => {
  const controller = new AbortController();
  const vol = createVolume(meta);
  const done = await streamVolume(vol, meta, base, { signal: controller.signal, fetchFn: server(), limit: 1, onChunk: () => controller.abort() });
  assert.equal(done, false);
});
