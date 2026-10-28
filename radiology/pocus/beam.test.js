import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wavelength, axialFwhm, lateralFwhm, sliceThickness, effectiveFrequency, frameRate, depthCompensationDb, attenuationDb, safetyIndices, THI,
} from './beam.js';
import { PROBES } from './probes.js';

const lat = (r, o) => lateralFwhm(r, { aperture: 22, freq: 3, focus: 70, zones: 1, ...o });

test('the wavelength is 0.5 mm at 3 MHz and halves when the frequency doubles', () => {
  assert.ok(Math.abs(wavelength(3) - 0.513) < 0.01);
  assert.ok(Math.abs(wavelength(6) - wavelength(3) / 2) < 1e-9);
});

test('higher frequency resolves finer along and across the beam', () => {
  assert.ok(axialFwhm(8) < axialFwhm(2) / 3);
  assert.ok(lat(70, { freq: 6 }) < lat(70, { freq: 3 }));
});

test('the beam widens with depth, and the focus keeps it narrow where it is set', () => {
  // dynamic receive focusing keeps the near field tight, so width rises with depth whatever the transmit focus
  assert.ok(lat(150, {}) > lat(70, {}) * 1.5);
  assert.ok(lat(200, {}) > lat(150, {}));
  // a focus set at 130 mm beats one set at 50 mm for a target at 130 mm, and the reverse for a target at 40 mm
  assert.ok(lat(130, { focus: 130 }) < lat(130, { focus: 50 }));
  assert.ok(lat(40, { focus: 40 }) < lat(40, { focus: 130 }));
});

test('more transmit zones keep the beam narrow over more depth', () => {
  assert.ok(lat(110, { zones: 3 }) < lat(110, { zones: 1 }));
  assert.ok(lat(70, { zones: 3 }) <= lat(70, { zones: 1 }) + 1e-9);
});

test('a wider aperture focuses tighter', () => {
  assert.ok(lat(70, { aperture: 30 }) < lat(70, { aperture: 12 }));
});

test('tissue harmonics sharpen the image and cost penetration', () => {
  assert.ok(axialFwhm(3, true) < axialFwhm(3, false));
  assert.ok(lat(100, { thi: true }) < lat(100, { thi: false }));
  assert.equal(effectiveFrequency(3, true), 3 * THI.resolution);
  assert.ok(depthCompensationDb(3, 100, true) > depthCompensationDb(3, 100, false));
});

test('attenuation grows with depth and frequency', () => {
  assert.equal(attenuationDb(0.5, 3, 100), 15);
  assert.ok(depthCompensationDb(5, 100) > depthCompensationDb(2, 100));
});

test('the slice is thinnest at the lens focus', () => {
  const o = { elevation: PROBES.C5.elevation, elevFocus: PROBES.C5.elevFocus, freq: 3 };
  assert.ok(sliceThickness(70, o) < sliceThickness(20, o));
  assert.ok(sliceThickness(70, o) < sliceThickness(200, o));
});

test('frame rate falls with depth, lines and zones, as the sound takes time to return', () => {
  assert.ok(frameRate(100, 128) > frameRate(300, 128));
  assert.ok(frameRate(150, 128, 3) < frameRate(150, 128, 1));
  assert.ok(Math.abs(frameRate(150, 128) - 1 / ((2 * 0.15) / 1540 * 128)) < 0.5);
});

test('lowering the output power lowers both safety indices', () => {
  const full = safetyIndices(0, 3, 150);
  const low = safetyIndices(-12, 3, 150);
  assert.ok(low.mi < full.mi && low.tis < full.tis);
  assert.ok(full.mi < 1.9);
});
