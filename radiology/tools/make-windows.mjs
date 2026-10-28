// Finds a probe pose for every standard window by searching the anatomy, and writes pocus/windows-poses.js.
//   node radiology/tools/make-windows.mjs [--only ruq,luq] [--refine 120]
// A pose is scored on the normal patient for the structures the view needs, and on the matching abnormal patient for the extras
// (so the Morison's pouch window is one where free fluid would show). Tidier hand positions and less shadow score a little higher.
import { parseArgs } from 'node:util';
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildPatient, DEFAULTS, restOf } from '../pocus/patient.js';
import { resolve } from '../pocus/anatomy.js';
import { HEART } from '../pocus/patient.js';
import { TISSUE_INDEX } from '../pocus/tissues.js';
import { PROBES } from '../pocus/probes.js';
import { poseFrame, skinPoint, compliance } from '../pocus/geometry.js';
import { visibleStructures, scoreView } from '../pocus/visibility.js';
import { WINDOW_SPECS } from '../pocus/windows.js';

const { values: o } = parseArgs({ options: { only: { type: 'string' }, refine: { type: 'string', default: '150' } } });
const outFile = fileURLToPath(new URL('../pocus/windows-poses.js', import.meta.url));

const builder = buildPatient();
const make = extra => { const P = { ...DEFAULTS, ...extra }; return { P, res: resolve(builder, TISSUE_INDEX, P, restOf(P)) }; };
const normal = make({});

// Heart axes in the world, for priors written in the heart's own frame.
const M = HEART.M;
const HEART_AXES = { hX: [M[0], M[3], M[6]], hY: [M[1], M[4], M[7]], hZ: [M[2], M[5], M[8]] };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = a => { const l = Math.hypot(...a); return a.map(v => v / l); };

// How far a pose is from the orientation a window should have: 0 when the plane or axis lines up as the prior says.
function priorPenalty(spec, frame) {
  let pen = 0;
  for (const pr of spec.prior ?? []) {
    const axis = typeof pr.axis === 'string' ? HEART_AXES[pr.axis] : unit(pr.axis);
    pen += pr.w * (1 - Math.abs(dot(frame[pr.role], axis)));
  }
  return pen;
}

function evaluatePose(spec, probe, pose, positiveRes) {
  const frame = poseFrame(pose, normal.P.habitus);
  const opts = { lines: 28, step: 4, gapMax: compliance(pose.p[2]) };
  const view = visibleStructures(normal.res, probe, frame, spec.depth, opts);
  if (view.coupled < 12) return null;
  let score = scoreView(view, spec.need);
  const extras = {};
  if (positiveRes && spec.extra?.length) {
    const pv = visibleStructures(positiveRes, probe, frame, spec.depth, opts);
    const wanted = Object.fromEntries(spec.extra.filter(k => ['morison', 'splenorenal', 'pelvic-fluid', 'pericardial-fluid', 'gallbladder', 'diaphragm'].includes(k)).map(k => [k, k === 'pericardial-fluid' ? 80 : 40]));
    if (Object.keys(wanted).length) score = 0.8 * score + 0.2 * scoreView(pv, wanted);
    for (const [k, v] of pv.areas) extras[k] = Math.round(v);
  }
  score -= 0.45 * (view.blocked / Math.max(view.total, 1));
  score -= priorPenalty(spec, frame);
  score -= 0.01 * (Math.abs(pose.fan) + Math.abs(pose.rock)) / 10 + 0.002 * pose.press;
  return { score, areas: Object.fromEntries([...view.areas].map(([k, v]) => [k, Math.round(v)])), extras };
}

// A small seeded generator, so a rerun on the same anatomy gives the same poses.
let seed = 20261028;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const range = (r, n) => Array.from({ length: n }, (_, i) => r[0] + ((r[1] - r[0]) * i) / Math.max(n - 1, 1));

const results = {};
try {
  const old = readFileSync(outFile, 'utf8');
  const m = /export const POSES = (\{[\s\S]*\});/.exec(old);
  if (m) Object.assign(results, JSON.parse(m[1]));
} catch { /* first run */ }

const only = o.only ? new Set(o.only.split(',')) : null;
for (const spec of WINDOW_SPECS) {
  if (only && !only.has(spec.id)) continue;
  const probe = PROBES[spec.probe];
  const s = spec.search;
  const positiveRes = spec.positive ? make(spec.positive).res : null;
  const t0 = Date.now();
  let best = null;
  const consider = pose => {
    const r = evaluatePose(spec, probe, pose, positiveRes);
    if (r && (!best || r.score > best.score)) best = { ...r, pose };
  };
  const nA = s.from === 'front' ? 6 : 6;
  for (const a of range(s.a, nA)) {
    for (const z of range(s.z, 6)) {
      const p = skinPoint(a, z, s.from, normal.P.habitus);
      if (!p) continue;
      for (const phi of s.phi) for (const rock of s.rock) for (const fan of s.fan) for (const press of s.press) consider({ p, phi, rock, fan, press });
    }
  }
  if (!best) { console.log(`${spec.id}: no coupled pose found`); continue; }
  // hill climb around the best: move the contact point along the skin and nudge the angles
  let step = 6;
  for (let i = 0; i < Number(o.refine); i++) {
    const b = best.pose;
    const dz = (rnd() - 0.5) * 2 * step;
    const da = (rnd() - 0.5) * 2 * step;
    // contact point: cast again from the side the search used, near the current point
    const guess = s.from === 'front' ? [b.p[0] + da, b.p[2] + dz] : [b.p[1] + da, b.p[2] + dz];
    const p = skinPoint(guess[0], guess[1], s.from, normal.P.habitus);
    if (!p) continue;
    consider({ p, phi: b.phi + (rnd() - 0.5) * 10, rock: b.rock + (rnd() - 0.5) * 8, fan: b.fan + (rnd() - 0.5) * 8, press: Math.max(0, b.press + (rnd() - 0.5) * 6) });
    if (i % 50 === 49) step = Math.max(2, step * 0.7);
  }
  const r = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
  results[spec.id] = {
    pose: { p: best.pose.p.map(v => r(v)), phi: r(best.pose.phi), fan: r(best.pose.fan), rock: r(best.pose.rock), press: r(best.pose.press) },
    areas: best.areas, extras: best.extras, score: r(best.score, 2),
  };
  const need = Object.entries(spec.need).map(([k, v]) => `${k} ${best.areas[k] ?? 0}/${v}`).join('  ');
  console.log(`${spec.id.padEnd(13)} score ${best.score.toFixed(2)}  ${need}  extras ${JSON.stringify(best.extras)}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

writeFileSync(outFile, `// Generated by tools/make-windows.mjs from the anatomy. Do not edit by hand.\nexport const POSES = ${JSON.stringify(results, null, 2)};\n`);
console.log('wrote', outFile);
