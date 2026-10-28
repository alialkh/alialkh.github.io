import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitView, screenToProbe, probeToScreen, depthTicks, focusMarkers } from './view.js';
import { PROBES, extent, lineGeometry, toBeam } from './probes.js';
import { distance, ellipse, label } from './measure.js';
import { Cine } from './cine.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('screen and probe coordinates invert each other, flipped or not', () => {
  const view = fitView(PROBES.C5, 160, 800, 640);
  for (const flip of [{ x: false, y: false }, { x: true, y: false }, { x: true, y: true }]) {
    const [u, v] = screenToProbe(view, 800, 640, flip, 123, 456);
    const [x, y] = probeToScreen(view, 800, 640, flip, u, v);
    close(x, 123);
    close(y, 456);
  }
});

test('the fan fits the screen with room to spare, for every probe and depth', () => {
  for (const probe of Object.values(PROBES)) {
    for (const depth of [probe.depthMin, 100, probe.depthMax].filter(d => d >= probe.depthMin && d <= probe.depthMax)) {
      const view = fitView(probe, depth, 800, 640);
      const e = extent(probe, depth);
      const [x0, y0] = probeToScreen(view, 800, 640, {}, e.u0, e.v0);
      const [x1, y1] = probeToScreen(view, 800, 640, {}, e.u1, e.v1);
      assert.ok(x0 >= 0 && y0 >= 0 && x1 <= 800 && y1 <= 640, `${probe.id} ${depth}: ${x0} ${y0} ${x1} ${y1}`);
    }
  }
});

test('zoom magnifies about the chosen point', () => {
  const v1 = fitView(PROBES.C5, 160, 800, 640);
  const v2 = fitView(PROBES.C5, 160, 800, 640, { zoom: 2, centre: [0, 60] });
  close(v2.mmPerPx, v1.mmPerPx / 2);
  const [x, y] = probeToScreen(v2, 800, 640, {}, 0, 60);
  close(x, 400, 1e-6);
  close(y, 320, 1e-6);
});

test('depth ticks are a centimetre apart on screen scale and include the full depth', () => {
  const view = fitView(PROBES.C5, 160, 800, 640);
  const t = depthTicks(view, 800, 640, {}, 160, PROBES.C5);
  assert.equal(t.length, 17);
  close(t[1].y - t[0].y, 10 / view.mmPerPx, 1e-6);
  assert.equal(t[5].major, true);
  assert.equal(focusMarkers(view, 800, 640, {}, 70, 2).length, 2);
});

test('toBeam inverts lineGeometry for all three probe types', () => {
  for (const probe of Object.values(PROBES)) {
    for (const s of [0.1, 0.5, 0.9]) {
      const { o, d } = lineGeometry(probe, s);
      const r = 55;
      const back = toBeam(probe, o[0] + d[0] * r, o[1] + d[1] * r);
      assert.ok(back, `${probe.id} ${s}`);
      close(back.s, s, 1e-9);
      close(back.r, r, 1e-9);
    }
  }
});

test('a point outside the fan is not on any beam', () => {
  assert.equal(toBeam(PROBES.C5, 400, 10), null);
  assert.equal(toBeam(PROBES.L12, 40, 10), null);
  assert.equal(toBeam(PROBES.P4, 0, -5), null);
});

test('calipers measure true millimetres', () => {
  close(distance([0, 0], [30, 40]), 50);
  const e = ellipse([-20, 0], [20, 0], [0, 10]);
  close(e.area, Math.PI * 20 * 10);
  close(e.semiA, 20);
  close(e.semiB, 10);
  assert.ok(e.circumference > 2 * Math.PI * 10 && e.circumference < 2 * Math.PI * 20);
  assert.equal(label({ kind: 'distance', points: [[0, 0], [0, 25]] }), '25.0 mm');
  assert.equal(label({ kind: 'distance', points: [[0, 0], [0, 125]] }), '12.5 cm');
});

test('the cine ring keeps the newest frames and counts back from them', () => {
  const c = new Cine(4);
  assert.equal(c.layerAt(0), -1);
  for (let i = 0; i < 6; i++) c.push({ time: i * 0.1, i });
  assert.equal(c.length, 4);
  assert.equal(c.frameAt(0).meta.i, 5);
  assert.equal(c.frameAt(3).meta.i, 2);
  assert.equal(c.frameAt(99).meta.i, 2);
  close(c.duration(), 0.3);
  c.reset();
  assert.equal(c.length, 0);
});
