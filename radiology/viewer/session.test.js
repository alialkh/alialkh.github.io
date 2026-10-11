import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { createSession, createSessions } from './session.js';
import { isComplete } from './volume.js';

// The session uses the page's fetch, so each test swaps it.
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const DIMS = [2, 2, 6];
const meta = dtype => ({ dtype, dims: DIMS, spacing: [1, 1, 2], chunkSlices: 2, chunks: [0, 2, 4].map((z0, i) => ({ file: `c${i}.gz`, z0, z1: z0 + 2 })) });
const mk = id => ({
  id, modality: 'MR', region: 'head', title: id, summary: 's',
  series: [{ id: 't1', name: 'T1', url: `http://x.test/${id}/t1/`, windows: [] }, { id: 't2', name: 'T2', url: `http://x.test/${id}/t2/`, windows: [] }],
  labels: { url: `http://x.test/${id}/labels/`, names: { 1: 'A' }, centroids: { 1: [1, 1, 3] } },
  findings: [], source: {},
});
// Serves vol.json and chunk files for any case id. tweak edits a folder's vol.json, log collects every path asked for.
function serve({ log = [], tweak = m => m } = {}) {
  globalThis.fetch = async (url, opts) => {
    opts?.signal?.throwIfAborted();
    const { pathname } = new URL(url);
    log.push(pathname);
    const [, , folder, file] = pathname.split('/');
    const dtype = folder === 'labels' ? 'uint8' : 'int16';
    if (file === 'vol.json') return new Response(JSON.stringify(tweak(meta(dtype), folder)));
    if (file === 'c1.gz' && serve.failC1) return new Response('', { status: 500 });
    return new Response(gzipSync(new Uint8Array((dtype === 'int16' ? 2 : 1) * 4 * 2).fill(7)));
  };
}
const gz = log => log.filter(p => p.endsWith('.gz'));
const quiet = { onChunk() {}, onError: e => assert.fail(e.message) };

test('ready loads and checks every vol.json, then start fills the shown series, the labels and the other series', async () => {
  serve();
  const session = createSession(mk('a'));
  await session.ready();
  assert.equal(session.volume('t2').dims.join(), '2,2,6');
  assert.equal(session.progress(), 0);
  const keys = new Set();
  await session.start('t2', { ...quiet, onChunk: key => keys.add(key) });
  assert.deepEqual([...keys].sort(), ['labels', 't1', 't2']);
  for (const key of ['t1', 't2', 'labels']) assert.ok(isComplete(session.volume(key)), key);
  assert.equal(session.progress(), 1);
});

test('the shown series finishes before the other one starts', async () => {
  const log = [];
  serve({ log });
  await createSession(mk('a')).start('t2', quiet);
  const folders = gz(log).map(p => p.split('/')[2]);
  assert.ok(folders.lastIndexOf('t2') < folders.indexOf('t1'));
});

test('stop before the vol.json files arrive means nothing is ever downloaded', async () => {
  const log = [];
  serve({ log });
  const session = createSession(mk('a'));
  const started = session.start('t1', quiet);
  session.stop();
  await started;
  assert.deepEqual(gz(log), []);
});

test('stop in the middle of a download halts it, and a second start resumes without refetching what is in', async () => {
  const log = [];
  serve({ log });
  const session = createSession(mk('a'));
  let stopped = false;
  await session.start('t1', { ...quiet, onChunk() { if (!stopped) { stopped = true; session.stop(); } } });
  const before = gz(log).length;
  assert.ok(before < 9, `${before} chunk requests before the stop took hold`);
  assert.ok(!isComplete(session.volume('t2')));
  await session.start('t1', quiet);
  for (const key of ['t1', 't2', 'labels']) assert.ok(isComplete(session.volume(key)), key);
  assert.ok(gz(log).length < before + 9, 'resumed work, not a full reload');
});

test('a case whose series are on different grids is rejected with its problems, and reopening tries again', async () => {
  let broken = true;
  serve({ tweak: (m, folder) => (broken && folder === 't2' ? { ...m, dims: [2, 2, 8], chunks: [{ file: 'c0.gz', z0: 0, z1: 8 }] } : m) });
  const session = createSession(mk('a'));
  await assert.rejects(session.ready(), e => e.problems.some(p => /series "t2" dims 2x2x8 differ/.test(p)));
  broken = false;
  await session.ready();
  assert.ok(session.volume('t2'));
});

test('a failed chunk reaches onError and not the page as an unhandled rejection', async () => {
  serve();
  serve.failC1 = true;
  const errors = [];
  try {
    await createSession(mk('a')).start('t1', { onChunk() {}, onError: e => errors.push(e.message) });
  } finally {
    serve.failC1 = false;
  }
  assert.equal(errors.length, 1);
  assert.match(errors[0], /c1\.gz: HTTP 500/);
});

test('only the last two cases stay open, and the oldest is stopped when a third arrives', async () => {
  serve();
  const sessions = createSessions();
  const a = sessions.open(mk('a'));
  const b = sessions.open(mk('b'));
  assert.equal(sessions.open(mk('a')), a, 'reopening gives the same session back');
  const started = b.start('t1', quiet);
  const c = sessions.open(mk('c'));
  await started;
  assert.ok(sessions.has('a') && sessions.has('c'), 'a was touched after b, so b is the oldest');
  assert.ok(!sessions.has('b'));
  assert.notEqual(c, b);
  assert.ok(!isComplete(b.volume('t2')), 'the evicted case was stopped before it finished');
});

test('start takes the series on screen: the first one then the other shown one and the labels get their middle chunk before any second chunk', async () => {
  const log = [];
  serve({ log });
  await createSession(mk('a')).start(['t2', 't1'], quiet);
  const files = gz(log).map(p => p.split('/').slice(2).join('/'));
  assert.deepEqual(files.slice(0, 3), ['t2/c1.gz', 't1/c1.gz', 'labels/c1.gz']);
  assert.equal(files.length, 9);
});

test('a series that is not on screen is fetched after every chunk of the ones that are', async () => {
  const log = [];
  serve({ log });
  await createSession(mk('a')).start(['t1'], quiet);
  const folders = gz(log).map(p => p.split('/')[2]);
  assert.ok(folders.lastIndexOf('t1') < folders.indexOf('t2'));
  assert.ok(folders.lastIndexOf('labels') < folders.indexOf('t2'));
});

test('starting again with another series on top skips what is in and puts the new series first', async () => {
  const log = [];
  serve({ log });
  const session = createSession(mk('a'));
  let stopped = false;
  await session.start(['t1'], { ...quiet, onChunk() { if (!stopped) { stopped = true; session.stop(); } } });
  const before = gz(log).length;
  await session.start(['t2', 't1'], quiet);
  const again = gz(log).slice(before).map(p => p.split('/')[2]);
  assert.equal(again[0], 't2');
  for (const key of ['t1', 't2', 'labels']) assert.ok(isComplete(session.volume(key)), key);
});

test('the first chunk of a start goes alone, so the first image does not share the link with the rest', async () => {
  const started = [];
  let busy = 0;
  const inner = globalThis.fetch;
  serve();
  const served = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (!new URL(url).pathname.endsWith('.gz')) return served(url, opts);
    started.push(++busy);
    await new Promise(resolve => setTimeout(resolve, 8));
    busy--;
    return served(url, opts);
  };
  try {
    await createSession(mk('a')).start(['t1'], quiet);
  } finally {
    globalThis.fetch = inner;
  }
  assert.equal(started[1], 1, 'the second chunk request waited for the first');
});
