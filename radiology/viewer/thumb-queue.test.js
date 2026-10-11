import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createThumbQueue } from './thumb-queue.js';

// A stand-in for IntersectionObserver that the test drives by hand.
class FakeObserver {
  constructor(callback) {
    this.callback = callback;
    this.watched = new Set();
    FakeObserver.last = this;
  }
  observe(el) { this.watched.add(el); }
  unobserve(el) { this.watched.delete(el); }
  show(...els) { this.callback(els.map(target => ({ isIntersecting: true, target }))); }
  hide(...els) { this.callback(els.map(target => ({ isIntersecting: false, target }))); }
}
const later = () => new Promise(resolve => setTimeout(resolve, 5));
function recorder() {
  const log = [];
  let open = 0;
  let peak = 0;
  const load = async (item) => {
    log.push(item);
    peak = Math.max(peak, ++open);
    await later();
    open--;
  };
  return { log, load, peak: () => peak };
}

test('nothing loads before release, even for items that are on screen', async () => {
  const r = recorder();
  const q = createThumbQueue({ load: r.load, Observer: FakeObserver });
  q.add('a', 'ka');
  FakeObserver.last.show('ka');
  await later();
  assert.deepEqual(r.log, []);
  q.release();
  await later();
  assert.deepEqual(r.log, ['a']);
});

test('only the items an observer reports as visible are loaded, one at a time', async () => {
  const r = recorder();
  const q = createThumbQueue({ load: r.load, Observer: FakeObserver });
  q.release();
  for (const k of ['a', 'b', 'c']) q.add(k, k);
  FakeObserver.last.show('a', 'c');
  await later();
  await later();
  await later();
  assert.deepEqual(r.log, ['a', 'c']);
  assert.equal(q.pending, 1, 'b is still waiting for the reader to scroll to it');
  assert.equal(r.peak(), 1);
  FakeObserver.last.show('b');
  await later();
  await later();
  assert.deepEqual(r.log, ['a', 'c', 'b']);
});

test('an item that scrolled away before its turn is not loaded', async () => {
  const r = recorder();
  const q = createThumbQueue({ load: r.load, Observer: FakeObserver });
  q.add('a', 'a');
  q.add('b', 'b');
  FakeObserver.last.show('a', 'b');
  FakeObserver.last.hide('a');
  q.release();
  await later();
  await later();
  assert.deepEqual(r.log, ['b']);
});

test('skip removes an item whose picture came from somewhere else, and stops watching it', async () => {
  const r = recorder();
  const q = createThumbQueue({ load: r.load, Observer: FakeObserver });
  q.add('open', 'open');
  q.add('other', 'other');
  FakeObserver.last.show('open', 'other');
  q.skip('open');
  assert.ok(!FakeObserver.last.watched.has('open'));
  q.release();
  await later();
  await later();
  assert.deepEqual(r.log, ['other']);
});

test('without an observer every item counts as visible, in the order added', async () => {
  const r = recorder();
  const q = createThumbQueue({ load: r.load, Observer: null });
  q.add('a', 'a');
  q.add('b', 'b');
  q.release();
  await later();
  await later();
  await later();
  assert.deepEqual(r.log, ['a', 'b']);
  assert.equal(r.peak(), 1);
});

test('a failing thumbnail is logged and the next one still loads', async () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = (...a) => warnings.push(a.join(' '));
  try {
    const log = [];
    const q = createThumbQueue({ load: async item => { log.push(item); if (item === 'a') throw new Error('HTTP 500'); }, Observer: null });
    q.add('a', 'a');
    q.add('b', 'b');
    q.release();
    await later();
    await later();
    assert.deepEqual(log, ['a', 'b']);
    assert.match(warnings.join(), /HTTP 500/);
  } finally {
    console.warn = warn;
  }
});

test('hold stops further thumbnails after the one in flight, and release carries on with the rest', async () => {
  const r = recorder();
  const q = createThumbQueue({ load: r.load, Observer: null });
  q.release();
  q.add('a', 'a');
  q.add('b', 'b');
  q.add('c', 'c');
  q.hold();
  await later();
  await later();
  assert.deepEqual(r.log, ['a'], 'a was already on its way, b and c wait');
  assert.equal(q.pending, 2);
  q.release();
  await later();
  await later();
  await later();
  assert.deepEqual(r.log, ['a', 'b', 'c']);
});

test('items added while held wait for the release', async () => {
  const r = recorder();
  const q = createThumbQueue({ load: r.load, Observer: null });
  q.release();
  q.hold();
  q.add('a', 'a');
  await later();
  assert.deepEqual(r.log, []);
  q.release();
  await later();
  assert.deepEqual(r.log, ['a']);
});

test('two items that become visible while one is loading still load one after the other', async () => {
  let open = 0;
  let peak = 0;
  const q = createThumbQueue({ load: async () => { peak = Math.max(peak, ++open); await later(); open--; }, Observer: FakeObserver });
  q.release();
  q.add('a', 'a');
  q.add('b', 'b');
  FakeObserver.last.show('a');
  FakeObserver.last.show('b');
  for (let i = 0; i < 4; i++) await later();
  assert.equal(peak, 1);
});

test('an item added after the release starts loading without a second release', async () => {
  const r = recorder();
  const q = createThumbQueue({ load: r.load, Observer: null });
  q.release();
  q.add('a', 'a');
  await later();
  assert.deepEqual(r.log, ['a']);
});
