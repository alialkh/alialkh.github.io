// The ultrasound machine's controls as plain state, the way a console keeps them, and how each knob changes the simulation.
// Pure: reduce() takes a state and an action and returns a new state, so every knob is testable without a screen.

import { PROBES, DEPTH_STEPS, depthSteps } from './probes.js';
import { frameRate, safetyIndices, THI } from './beam.js';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export const RANGES = Object.freeze({
  gain: [0, 100],
  tgc: [-15, 15], // dB per slider
  dr: [30, 90], // dB
  power: [10, 100], // percent
  persist: [0, 7],
  smooth: [0, 5],
  sharp: [0, 5],
  focus: [10, 340],
  zones: [1, 3],
  zoom: [1, 3],
  msweep: [2, 8], // seconds across the M-mode strip
});

export const MAPS = ['Linear', 'Contrast', 'Soft', 'Clipped'];
export const TINTS = { gray: [1, 1, 1], sepia: [1, 0.9, 0.72], blue: [0.8, 0.9, 1] };
export const FREQ_MODES = ['pen', 'gen', 'res'];
export const MODES = ['B', 'BM', 'M'];

// Exam presets: a probe, the frequency and depth that suit it, and the image processing a clinician expects for that exam.
export const PRESETS = {
  abdomen: { name: 'Abdomen', probe: 'C5', depth: 160, freqMode: 'gen', thi: false, dr: 64, gain: 50, persist: 2, smooth: 2, sharp: 2, map: 0, orient: 'abdominal', focusFrac: 0.45, zones: 1 },
  fast: { name: 'FAST / trauma', probe: 'C5', depth: 180, freqMode: 'gen', thi: false, dr: 66, gain: 52, persist: 2, smooth: 2, sharp: 2, map: 0, orient: 'abdominal', focusFrac: 0.45, zones: 1 },
  bladder: { name: 'Bladder and pelvis', probe: 'C5', depth: 120, freqMode: 'gen', thi: false, dr: 62, gain: 48, persist: 2, smooth: 2, sharp: 1, map: 0, orient: 'abdominal', focusFrac: 0.5, zones: 1 },
  cardiac: { name: 'Cardiac', probe: 'P4', depth: 160, freqMode: 'gen', thi: true, dr: 60, gain: 55, persist: 1, smooth: 1, sharp: 3, map: 1, orient: 'cardiac', focusFrac: 0.5, zones: 1 },
  lung: { name: 'Lung', probe: 'L12', depth: 70, freqMode: 'gen', thi: false, dr: 60, gain: 48, persist: 1, smooth: 1, sharp: 2, map: 0, orient: 'abdominal', focusFrac: 0.3, zones: 1 },
  vascular: { name: 'Vascular', probe: 'L12', depth: 40, freqMode: 'res', thi: false, dr: 66, gain: 50, persist: 2, smooth: 2, sharp: 2, map: 0, orient: 'abdominal', focusFrac: 0.4, zones: 1 },
};
export const PRESET_LIST = Object.entries(PRESETS).map(([id, p]) => ({ id, ...p }));

// Orientation conventions: abdominal puts the probe marker on the left of the screen, cardiac on the right.
export const ORIENTATIONS = { abdominal: { flipX: false }, cardiac: { flipX: true } };

export function presetState(id, previous = null) {
  const p = PRESETS[id];
  if (!p) throw new Error(`no preset ${id}`);
  const probe = PROBES[p.probe];
  const depth = nearestDepth(probe, p.depth);
  return {
    preset: id,
    probe: p.probe,
    mode: 'B',
    depth,
    gain: p.gain,
    tgc: new Array(8).fill(0),
    freqMode: p.freqMode,
    thi: p.thi,
    focus: clamp(Math.round(depth * p.focusFrac), RANGES.focus[0], depth),
    zones: p.zones,
    dr: p.dr,
    power: 100,
    persist: p.persist,
    smooth: p.smooth,
    sharp: p.sharp,
    map: p.map,
    tint: 'gray',
    invert: false,
    orient: p.orient,
    flipX: false,
    flipY: false,
    zoom: 1,
    frozen: false,
    mline: 0.5,
    msweep: 4,
    // what the console carries across presets: the exam bookkeeping
    label: previous?.label ?? '',
  };
}

export const nearestDepth = (probe, mm) => {
  const steps = depthSteps(probe);
  return steps.reduce((best, d) => (Math.abs(d - mm) < Math.abs(best - mm) ? d : best), steps[0]);
};

export function reduce(state, action) {
  const s = { ...state };
  const probe = PROBES[state.probe];
  switch (action.type) {
    case 'preset': return presetState(action.id, state);
    case 'probe': {
      // Changing the probe keeps the exam type but moves depth and frequency into the new probe's range.
      const np = PROBES[action.id];
      s.probe = action.id;
      s.depth = nearestDepth(np, state.depth);
      s.focus = clamp(s.focus, RANGES.focus[0], s.depth);
      return s;
    }
    case 'mode': s.mode = action.mode; return s;
    case 'depth': {
      const steps = depthSteps(probe);
      const i = steps.indexOf(state.depth);
      const j = clamp((i < 0 ? steps.indexOf(nearestDepth(probe, state.depth)) : i) + action.step, 0, steps.length - 1);
      s.depth = steps[j];
      s.focus = clamp(Math.round(state.focus * (s.depth / state.depth)), RANGES.focus[0], s.depth);
      return s;
    }
    case 'gain': s.gain = clamp(action.value, ...RANGES.gain); return s;
    case 'tgc': s.tgc = state.tgc.map((v, i) => (i === action.index ? clamp(action.value, ...RANGES.tgc) : v)); return s;
    case 'tgc-reset': s.tgc = new Array(8).fill(0); return s;
    case 'tgc-set': s.tgc = action.values.map(v => clamp(v, ...RANGES.tgc)); return s;
    case 'freq': s.freqMode = action.mode; return s;
    case 'thi': s.thi = !!action.on; return s;
    case 'focus': s.focus = clamp(action.value, RANGES.focus[0], state.depth); return s;
    case 'zones': s.zones = clamp(action.value, ...RANGES.zones); return s;
    case 'dr': s.dr = clamp(action.value, ...RANGES.dr); return s;
    case 'power': s.power = clamp(action.value, ...RANGES.power); return s;
    case 'persist': s.persist = clamp(action.value, ...RANGES.persist); return s;
    case 'smooth': s.smooth = clamp(action.value, ...RANGES.smooth); return s;
    case 'sharp': s.sharp = clamp(action.value, ...RANGES.sharp); return s;
    case 'map': s.map = ((action.value % MAPS.length) + MAPS.length) % MAPS.length; return s;
    case 'tint': s.tint = action.value; return s;
    case 'invert': s.invert = !state.invert; return s;
    case 'flipx': s.flipX = !state.flipX; return s;
    case 'flipy': s.flipY = !state.flipY; return s;
    case 'orient': s.orient = action.value; return s;
    case 'zoom': s.zoom = clamp(action.value, ...RANGES.zoom); return s;
    case 'freeze': s.frozen = action.on ?? !state.frozen; return s;
    case 'mline': s.mline = clamp(action.value, 0.02, 0.98); return s;
    case 'msweep': s.msweep = clamp(action.value, ...RANGES.msweep); return s;
    default: throw new Error(`unknown action ${action.type}`);
  }
}

// Gain knob to dB: 50 is neutral, the range is plus or minus 40 dB.
export const gainDb = g => (g - 50) * 0.8;
export const powerDb = pct => 20 * Math.log10(pct / 100);

export const frequency = state => PROBES[state.probe].freqs[state.freqMode];

// Whether the screen shows the image mirrored: the convention and the user's own flip combine.
export const mirrored = state => (ORIENTATIONS[state.orient]?.flipX ?? false) !== state.flipX;

// Everything the simulator needs from the console.
export function simConfig(state) {
  const probe = PROBES[state.probe];
  return {
    probe,
    depth: state.depth,
    freq: frequency(state),
    thi: state.thi,
    focus: state.focus,
    zones: state.zones,
    gainDb: gainDb(state.gain),
    tgc: Float32Array.from(state.tgc),
    dr: state.dr,
    power: powerDb(state.power),
    persist: (state.persist / 8) * 0.85,
    smooth: state.smooth / 5 * 0.6,
    sharp: state.sharp / 5,
    map: state.map,
  };
}

// What the header of the screen shows.
export function readouts(state) {
  const probe = PROBES[state.probe];
  const f = frequency(state);
  const fr = frameRate(state.depth, 128, state.zones);
  const { mi, tis } = safetyIndices(powerDb(state.power), f, state.depth);
  return {
    probe: probe.name,
    freq: state.thi ? `THI ${f.toFixed(1)}` : `${f.toFixed(1)} MHz`,
    fr: Math.round(fr),
    mi: mi.toFixed(1),
    tis: tis.toFixed(1),
    depthCm: (state.depth / 10).toFixed(state.depth % 10 === 0 ? 0 : 1),
    gain: Math.round(state.gain),
    dr: state.dr,
    map: MAPS[state.map],
  };
}

// An automatic TGC: flatten the brightness down the image the way the "auto" button does. `profile` is the mean level (dB) of the image in
// eight depth bands, from a recent frame. Returns slider values in dB, limited to the slider range.
export function autoTgc(profile, target = null) {
  const valid = profile.filter(Number.isFinite);
  if (!valid.length) return new Array(8).fill(0);
  const t = target ?? valid[Math.min(1, valid.length - 1)];
  return profile.map(v => (Number.isFinite(v) ? clamp(t - v, ...RANGES.tgc) : 0));
}

export { DEPTH_STEPS, THI };
