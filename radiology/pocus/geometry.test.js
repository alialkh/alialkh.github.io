import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poseFrame, pickSkin, skinPoint, solvePose, orientationName, compliance, LIMITS } from './geometry.js';
import { bodySdf, bodyNormal } from './anatomy.js';
import { buildPatient, DEFAULTS, restOf } from './patient.js';
import { resolve } from './anatomy.js';
import { TISSUE_INDEX } from './tissues.js';
import { PROBES } from './probes.js';
import { visibleStructures } from './visibility.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('skinPoint lands on the skin, and nothing is picked when the ray misses', () => {
  const p = skinPoint(0, -60, 'front');
  assert.ok(Math.abs(bodySdf(p)) < 0.3);
  assert.ok(p[1] < -90);
  const side = skinPoint(10, -60, 'right');
  assert.ok(side[0] < -140);
  assert.equal(pickSkin([0, -500, 2000], [0, 1, 0]), null);
});

test('the frame is orthonormal for any pose', () => {
  const p = skinPoint(0, -60, 'front');
  for (const [phi, fan, rock, press] of [[0, 0, 0, 0], [90, 20, -15, 10], [200, -40, 30, 0], [45, 59, 44, 44]]) {
    const f = poseFrame({ p, phi, fan, rock, press });
    for (const v of [f.e, f.n, f.h]) close(Math.hypot(...v), 1, 1e-9);
    close(dot(f.e, f.n), 0, 1e-9);
    close(dot(f.e, f.h), 0, 1e-9);
    close(dot(f.n, f.h), 0, 1e-9);
  }
});

test('at rest the beam goes straight into the body and a transverse plane shows the patient\'s left on screen right', () => {
  const p = skinPoint(0, -60, 'front');
  const f = poseFrame({ p, phi: 0, fan: 0, rock: 0, press: 0 });
  assert.ok(f.n[1] > 0.95, 'the beam heads posterior from the front');
  assert.ok(f.e[0] > 0.95, 'screen right is the patient\'s left, as in a CT');
  const sag = poseFrame({ p, phi: 90, fan: 0, rock: 0, press: 0 });
  assert.ok(sag.e[2] < -0.95, 'in a sagittal plane the marker, at screen left, points to the head');
});

test('pressing moves the face into the body along the beam', () => {
  const p = skinPoint(0, -60, 'front');
  const a = poseFrame({ p, phi: 0, fan: 0, rock: 0, press: 0 });
  const b = poseFrame({ p, phi: 0, fan: 0, rock: 0, press: 20 });
  close(Math.hypot(b.o[0] - a.o[0], b.o[1] - a.o[1], b.o[2] - a.o[2]), 20, 1e-9);
  assert.ok(bodySdf(b.o) < -15);
});

test('fan tilts the plane across its width and rock angles the beam within it', () => {
  const p = skinPoint(0, -60, 'front');
  const rest = poseFrame({ p, phi: 0, fan: 0, rock: 0, press: 0 });
  const fan = poseFrame({ p, phi: 0, fan: 30, rock: 0, press: 0 });
  const rock = poseFrame({ p, phi: 0, fan: 0, rock: 30, press: 0 });
  close(dot(fan.n, rest.n), Math.cos(Math.PI / 6), 1e-9);
  close(dot(fan.e, rest.e), 1, 1e-9); // fan keeps the lateral axis
  close(dot(rock.n, rest.n), Math.cos(Math.PI / 6), 1e-9);
  close(dot(rock.h, rest.h), 1, 1e-9); // rock keeps the elevation axis
  const over = poseFrame({ p, phi: 0, fan: 500, rock: 0, press: 0 });
  close(dot(over.n, rest.n), Math.cos((LIMITS.fan * Math.PI) / 180), 1e-9);
});

test('solvePose reproduces a requested beam and plane', () => {
  const p = skinPoint(-20, -40, 'front');
  const want = [0.3, 0.8, -0.2];
  const n = Math.hypot(...want);
  const only = solvePose(p, want, null, 0.3);
  assert.ok(dot(poseFrame(only, 0.3).n, want.map(v => v / n)) > 0.999);
  // with a screen axis at right angles to the beam both can be met
  const e = [0.8, -0.3, 0];
  const both = solvePose(p, want, e, 0.3);
  const f = poseFrame(both, 0.3);
  assert.ok(dot(f.n, want.map(v => v / n)) > 0.99);
  assert.ok(dot(f.e, e.map(v => v / Math.hypot(...e))) > 0.98);
});

test('orientation names and the softness of the abdominal wall', () => {
  assert.equal(orientationName(0), 'Transverse');
  assert.equal(orientationName(180), 'Transverse');
  assert.equal(orientationName(90), 'Sagittal');
  assert.equal(orientationName(45), 'Oblique');
  assert.ok(compliance(-120) > compliance(40));
  assert.ok(compliance(40) >= 4 && compliance(-300) <= 16);
});

test('a sagittal probe laid across the lower ribs sees them as shadows, a rotated one finds the liver and kidney', () => {
  const P = { ...DEFAULTS, fluidRUQ: 10 };
  const res = resolve(buildPatient(), TISSUE_INDEX, P, restOf(P));
  const p = skinPoint(12, -130, 'right', P.habitus);
  const good = visibleStructures(res, PROBES.C5, poseFrame({ p, phi: 105, rock: -20, fan: 25, press: 0 }, P.habitus), 180, { lines: 28, step: 4, gapMax: compliance(p[2]) });
  assert.ok((good.areas.get('liver') ?? 0) > 1500, 'liver in view');
  assert.ok((good.areas.get('right-kidney') ?? 0) > 800, 'kidney in view');
  assert.ok((good.areas.get('morison') ?? 0) > 100, 'the hepatorenal space is in view');
  // the same pose held well off the skin images nothing
  const nu = bodyNormal(p, P.habitus);
  const off = p.map((v, i) => v + nu[i] * 40);
  const lifted = visibleStructures(res, PROBES.C5, poseFrame({ p: off, phi: 105, rock: -20, fan: 25, press: 0 }, P.habitus), 180, { lines: 28, step: 4, gapMax: compliance(p[2]) });
  assert.equal(lifted.coupled, 0);
});
