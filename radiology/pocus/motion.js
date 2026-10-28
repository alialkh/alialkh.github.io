// The cardiac and respiratory cycles. Pure functions of time, so the picture can be frozen, scrubbed and tested.
// Timings follow a normal Wiggers diagram: ventricular systole after the QRS, the aortic valve open for most of it, the mitral and
// tricuspid valves open in diastole, the atria filling during systole and giving a small kick just before the next beat.

const clamp01 = x => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const bump = (a, peak, b, x) => (x < peak ? smooth(a, peak, x) : 1 - smooth(peak, b, x));

// Fraction of the beat taken by systole at a given heart rate. Systole shortens with rate, but less than the whole beat does.
export function systoleFraction(hr) {
  const seconds = Math.min(0.42, Math.max(0.2, 0.36 - 0.0013 * (hr - 60)));
  return Math.min(0.62, seconds / (60 / hr));
}

// phase in [0, 1): 0 is the R wave. Returns each moving quantity at that moment.
export function cardiacState(phase, hr = 70) {
  const ts = systoleFraction(hr);
  const p = ((phase % 1) + 1) % 1;
  // contraction: quick rise, plateau, relaxation that finishes just after the aortic valve shuts
  const sys = p < ts ? smooth(0, 0.28 * ts, p) : 1 - smooth(ts, ts + 0.25 * (1 - ts), p);
  const avOpen = p < 0.012 ? 0 : p < ts - 0.02 ? Math.min(1, smooth(0.012, 0.045, p)) : 1 - smooth(ts - 0.02, ts + 0.015, p);
  const mvOpen = p < ts + 0.02 ? 0 : p < 0.97 ? smooth(ts + 0.02, ts + 0.07, p) : 1 - smooth(0.97, 1.0, p) * 1;
  const kick = smooth(0.84, 0.91, p) - smooth(0.91, 0.97, p);
  const atria = p < ts + 0.02 ? smooth(0.03, ts, p) : Math.max(0, 1 - smooth(ts + 0.02, ts + 0.12, p)) * 1 - 0.12 * kick;
  // the pressure wave rises with ejection, falls to the dicrotic level when the valve shuts, then decays through diastole
  const pulse = p < ts + 0.04 ? 0.18 + 0.82 * bump(0, (0.1 * ts) / 0.35, ts + 0.04, p) : 0.18 * (1 - smooth(ts + 0.04, 0.8, p));
  return { sys, av: avOpen, mv: mvOpen, tv: mvOpen, atria: clamp01(atria), pulse: clamp01(pulse) };
}

// Breathing: a quiet breath is about 40% inspiration and 60% expiration. phase 0 is end expiration.
export function breathLevel(phase) {
  const p = ((phase % 1) + 1) % 1;
  return p < 0.4 ? Math.sin((p / 0.4) * Math.PI / 2) ** 2 : Math.cos(((p - 0.4) / 0.6) * Math.PI / 2) ** 2;
}

// The parameter set the anatomy needs at time t seconds. `base` carries the scenario (habitus, effusions and so on).
// opts: hr, rr (breaths per minute), breathHold (a level to hold at, or undefined), still (stop everything).
export function animate(base, t, { hr = 70, rr = 14, breathHold, still = false } = {}) {
  if (still) return { ...base, breath: breathHold ?? 0, sys: 0, atria: 0, mv: 0, tv: 0, av: 0, pulse: 0, peri: 0 };
  const beat = (t * hr) / 60;
  const c = cardiacState(beat, hr);
  const breath = breathHold ?? breathLevel((t * rr) / 60);
  return { ...base, breath, sys: c.sys, atria: c.atria, mv: c.mv, tv: c.tv, av: c.av, pulse: c.pulse, peri: (t / 7) % 1 };
}

// How far the lung slides against the chest wall at a breath level, in mm. Zero when the lung is stuck to the wall.
export const SLIDE_MM = 16;
export const lungSlide = (breath, sliding = 1) => [0, 0, -SLIDE_MM * breath * sliding];
