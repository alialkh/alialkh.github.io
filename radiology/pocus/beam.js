// The acoustic beam model, shared by the shader (through uniforms) and the interface (readouts, tests).
// Gaussian beam picture: a focused aperture has a narrowest width at its focus and widens beyond the depth of field.
// Lengths in mm, frequencies in MHz. Educational model, not a field simulation.

import { SOUND_SPEED } from './tissues.js';

export const wavelength = f => SOUND_SPEED / (f * 1000); // mm, since 1540 m/s = 1.54 mm per microsecond

// Tissue harmonic imaging transmits at f and listens at 2f. The image resolves like a frequency in between and loses depth to the
// extra attenuation of the returning half of the path.
export const THI = { resolution: 1.55, attenuation: 1.5, signalDb: -9 };

export const effectiveFrequency = (f, thi) => (thi ? f * THI.resolution : f);

// Axial pulse length. A broadband imaging pulse is about 1.6 cycles long, so the pulse-echo envelope is 0.8 wavelengths wide (FWHM).
export const axialFwhm = (f, thi) => 0.8 * wavelength(effectiveFrequency(f, thi));
export const axialSigma = (f, thi) => axialFwhm(f, thi) / 2.355;

// Narrowest practical receive f-number. Aperture growth stops there in the near field.
export const MIN_FNUMBER = 1.6;

// Lateral width (FWHM) of the transmit beam at range r for a focus at F, active aperture D.
export function transmitWidth(r, F, D, f) {
  const lam = wavelength(f);
  const Deff = Math.min(D, F / MIN_FNUMBER);
  const fn = F / Deff;
  const w0 = 1.02 * lam * fn;
  const zR = 3.6 * lam * fn * fn;
  const w = w0 * Math.sqrt(1 + ((r - F) / zR) ** 2);
  return Math.min(w, D * 1.2);
}

// Receive focusing follows the depth (dynamic focus) until the aperture stops growing.
export function receiveWidth(r, D, f) {
  const lam = wavelength(f);
  const Deff = Math.min(D, r / MIN_FNUMBER);
  return 1.02 * lam * (r / Math.max(Deff, 0.5));
}

// Two way beam width: the product of two Gaussians of widths a and b has FWHM a b / sqrt(a^2 + b^2).
// With several transmit zones the sharpest one at each depth wins.
export function lateralFwhm(r, { focus, zones = 1, aperture, freq, thi = false }) {
  const f = effectiveFrequency(freq, thi);
  let best = Infinity;
  for (let z = 0; z < zones; z++) {
    const F = focus * (1 + 0.55 * z); // extra zones sit deeper, spaced like a real machine's zone stack
    best = Math.min(best, transmitWidth(r, F, aperture, f));
  }
  const rx = receiveWidth(r, aperture, f);
  return (best * rx) / Math.hypot(best, rx);
}

// Slice thickness (elevation beam width) at range r: a fixed lens focus, so it grows quickly away from it.
export function sliceThickness(r, { elevation, elevFocus, freq, thi = false }) {
  const lam = wavelength(effectiveFrequency(freq, thi));
  const fn = elevFocus / elevation;
  const w0 = 1.02 * lam * fn;
  const zR = 3.6 * lam * fn * fn;
  return Math.min(w0 * Math.sqrt(1 + ((r - elevFocus) / zR) ** 2), elevation * 1.1);
}

// One way attenuation in dB at range r mm in tissue with coefficient alpha (dB per cm per MHz).
export const attenuationDb = (alpha, f, rMm, thi = false) => alpha * f * (thi ? THI.attenuation / 1 : 1) * (rMm / 10);

// The depth compensation every machine applies on top of the TGC sliders: the average soft tissue loss, both ways.
export const AVERAGE_ALPHA = 0.5;
export const depthCompensationDb = (f, rMm, thi = false) => 2 * AVERAGE_ALPHA * f * (thi ? THI.attenuation : 1) * (rMm / 10);

// Frame rate a real scanner would reach: lines are sent one at a time, each needs the sound to go to depth and back.
export function frameRate(depthMm, lines, zones = 1, compound = false) {
  const perLine = (2 * depthMm) / SOUND_SPEED / 1000; // seconds, with depth in mm and speed in m/s
  const fps = 1 / (perLine * lines * zones * (compound ? 3 : 1));
  return Math.max(4, Math.min(fps, 90));
}

// Mechanical and thermal index, in the form the screen shows. Output power is a dB setting from -30 to 0 relative to the maximum.
export function safetyIndices(power, f, depthMm) {
  const rel = 10 ** (power / 20);
  const mi = (1.35 * rel) / Math.sqrt(f) * (depthMm > 100 ? 1 : 0.8);
  const tis = 0.55 * rel * (f / 3) * (depthMm < 60 ? 1.15 : 0.8);
  return { mi: Math.max(0.05, mi), tis: Math.max(0.05, tis) };
}
