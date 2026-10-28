// Finds a probe pose for every standard window by searching the anatomy, and writes pocus/windows-poses.js.
//   node radiology/tools/make-windows.mjs [--only ruq,luq] [--refine 120]
// A pose is scored on the normal patient for the structures the view needs, and on the matching abnormal patient for the extras
// (so the Morison's pouch window is one where free fluid would show). Tidier hand positions and less shadow score a little higher.
import { parseArgs } from 'node:util';
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildPatient, DEFAULTS, restOf } from '../pocus/patient.js';
import { resolve, apply3, add3, scale3, cross3, norm3 } from '../pocus/anatomy.js';
import { HEART } from '../pocus/patient.js';
import { TISSUE_INDEX } from '../pocus/tissues.js';
import { PROBES } from '../pocus/probes.js';
import { poseFrame, skinPoint, compliance, pickSkin, solvePose } from '../pocus/geometry.js';
import { visibleStructures, scoreView } from '../pocus/visibility.js';
import { WINDOW_SPECS } from '../pocus/windows.js';
import { ORIENTATIONS, PRESETS } from '../pocus/machine.js';

const { values: o } = parseArgs({ options: { only: { type: 'string' }, refine: { type: 'string', default: '120' } } });
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

const MARGIN_NEED = spec => Object.fromEntries(Object.entries(spec.need).map(([k, v]) => [k, v * 1.3]));

// The search samples coarsely. A pose that beats the best so far is measured again with the lines and step the app and windows.test.js use.
const COARSE = { lines: 28, step: 4 };
const FINE = { lines: 36, step: 3 };
const STARTS = 4;

function evaluatePose(spec, probe, pose, positiveRes, sampling = COARSE) {
  const frame = poseFrame(pose, normal.P.habitus);
  const opts = { ...sampling, gapMax: compliance(pose.p[2]) };
  const view = visibleStructures(normal.res, probe, frame, spec.depth, opts);
  // the probe must sit on the body along most of its face: windows.test.js asks for two thirds of 36 lines
  if (view.coupled < 0.75 * opts.lines) return null;
  // ask for a margin over the need, because the test samples the image with other lines than the search does
  let score = scoreView(view, MARGIN_NEED(spec));
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

// A textbook plane written in the heart's own frame (or the world's) becomes poses: for a grid of targets across the plane, cast the beam
// back to the skin and solve the hand angles that give that beam direction and screen-right direction. These start the search where a
// sonographer would, instead of leaving the heart to whichever oblique cut covers the most chambers.
// aim: { at, n, s } in the heart frame, or { at, nWorld, sWorld }. n is the beam direction, s the direction that should be screen right.
function aimSeeds(spec, positiveRes) {
  const mirror = ORIENTATIONS[PRESETS[spec.preset]?.orient]?.flipX ?? false;
  const seeds = [];
  for (const aim of spec.aim ?? []) {
    const nW = aim.nWorld ? norm3(aim.nWorld) : norm3(apply3(HEART.M, aim.n));
    const sW = aim.sWorld ? norm3(aim.sWorld) : norm3(apply3(HEART.M, aim.s));
    // a mirrored display shows the probe's e axis on the screen's left
    const eW = mirror ? scale3(sW, -1) : sW;
    const b1 = norm3(cross3(nW, eW));
    const target = add3(HEART.c, apply3(HEART.M, aim.at));
    for (const i of [-30, -15, 0, 15, 30]) for (const j of [-30, -15, 0, 15, 30]) {
      const t = add3(add3(target, scale3(b1, i)), scale3(eW, j));
      const hit = pickSkin(add3(t, scale3(nW, -400)), nW, normal.P.habitus);
      if (!hit) continue;
      const sol = solvePose(hit.p, nW, eW, normal.P.habitus, 0);
      seeds.push({ p: hit.p, phi: sol.phi, fan: sol.fan, rock: sol.rock, press: 0 });
    }
  }
  return seeds;
}

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
  // 1. a coarse grid of poses, scored cheaply
  const grid = [];
  for (const a of range(s.a, 6)) {
    for (const z of range(s.z, 6)) {
      const p = skinPoint(a, z, s.from, normal.P.habitus);
      if (!p) continue;
      for (const phi of s.phi) for (const rock of s.rock) for (const fan of s.fan) for (const press of s.press) {
        const pose = { p, phi, rock, fan, press };
        const r = evaluatePose(spec, probe, pose, positiveRes);
        if (r) grid.push({ score: r.score, pose });
      }
    }
  }
  const aimed = [];
  for (const pose of aimSeeds(spec, positiveRes)) {
    const r = evaluatePose(spec, probe, pose, positiveRes);
    if (r) aimed.push({ score: r.score, pose });
  }
  aimed.sort((x, y) => y.score - x.score);
  grid.sort((x, y) => y.score - x.score);
  // 2. the best few starts that are not on top of each other
  const starts = [];
  for (const g of [...aimed.slice(0, 3), ...grid]) {
    if (starts.length >= STARTS + (aimed.length ? 2 : 0)) break;
    if (starts.every(t => Math.hypot(t.p[0] - g.pose.p[0], t.p[1] - g.pose.p[1], t.p[2] - g.pose.p[2]) > 12)) starts.push(g.pose);
  }
  // 3. hill climb from each start: move the contact point along the skin and nudge the angles. The landscape is spiky
  // (a rib edge or a gas pocket decides a view), so more than one start is worth the time.
  let best = null;
  for (const start of starts) {
    let cur = null;
    const consider = pose => {
      const r = evaluatePose(spec, probe, pose, positiveRes);
      if (!r || (cur && r.score <= cur.coarse - 0.05)) return;
      const f = evaluatePose(spec, probe, pose, positiveRes, FINE);
      if (f && (!cur || f.score > cur.score)) cur = { ...f, coarse: r.score, pose };
    };
    consider(start);
    if (!cur) continue;
    let step = 6;
    for (let i = 0; i < Number(o.refine); i++) {
      const b = cur.pose;
      const dz = (rnd() - 0.5) * 2 * step;
      const da = (rnd() - 0.5) * 2 * step;
      // contact point: cast again from the side the search used, near the current point
      // and stay inside the area the window is searched in, so a view cannot wander to another part of the body
      const clamp = (v, r) => Math.min(r[1] + 8, Math.max(r[0] - 8, v));
      const raw = s.from === 'front' ? [b.p[0] + da, b.p[2] + dz] : [b.p[1] + da, b.p[2] + dz];
      const guess = [clamp(raw[0], s.a), clamp(raw[1], s.z)];
      const p = skinPoint(guess[0], guess[1], s.from, normal.P.habitus);
      if (!p) continue;
      consider({ p, phi: b.phi + (rnd() - 0.5) * 10, rock: b.rock + (rnd() - 0.5) * 8, fan: b.fan + (rnd() - 0.5) * 8, press: Math.max(0, b.press + (rnd() - 0.5) * 6) });
      if (i % 50 === 49) step = Math.max(2, step * 0.7);
    }
    if (!best || cur.score > best.score) best = cur;
  }
  if (!best) { console.log(`${spec.id}: no coupled pose found`); continue; }
  const r = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
  results[spec.id] = {
    pose: { p: best.pose.p.map(v => r(v)), phi: r(best.pose.phi), fan: r(best.pose.fan), rock: r(best.pose.rock), press: r(best.pose.press) },
    areas: best.areas, extras: best.extras, score: r(best.score, 2),
  };
  const need = Object.entries(spec.need).map(([k, v]) => `${k} ${best.areas[k] ?? 0}/${v}`).join('  ');
  const check = visibleStructures(normal.res, probe, poseFrame(best.pose, normal.P.habitus), spec.depth, { lines: 36, step: 3, gapMax: compliance(best.pose.p[2]) });
  if (check.coupled < 24 || check.blocked / check.total >= 0.6) console.log(`WARNING ${spec.id}: coupled ${check.coupled}/36, shadow ${(100 * check.blocked / check.total).toFixed(0)}%`);
  console.log(`${spec.id.padEnd(13)} score ${best.score.toFixed(2)}  ${need}  extras ${JSON.stringify(best.extras)}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

writeFileSync(outFile, `// Generated by tools/make-windows.mjs from the anatomy. Do not edit by hand.\nexport const POSES = ${JSON.stringify(results, null, 2)};\n`);
console.log('wrote', outFile);
