// What a given probe position can see, worked out directly from the anatomy without drawing an image.
// Lines are marched in coarse steps. Bone, aerated lung and gas stop a line: nothing behind them is imaged. Used to score exams, to
// check that every standard window really shows what it should, and to tell a student which way to move.

import { evaluate, bodySdf, TABLE_Y } from './anatomy.js';
import { lineGeometry } from './probes.js';
import { TISSUE_INDEX } from './tissues.js';
import { structureMap, STRUCTURES } from './patient.js';

const BLOCKERS = new Set(['bone', 'lung', 'gas', 'pleural_air', 'air'].map(k => TISSUE_INDEX[k]));
const GEL = TISSUE_INDEX.gel;

// res: the resolved anatomy. Returns { areas, leftAreas, blocked, total, lines, coupled } where areas maps structure id to mm^2 of image.
export function visibleStructures(res, probe, frame, depth, { lines = 48, step = 3, gapMax = 12 } = {}) {
  const map = res.structureMap ??= structureMap(res.names);
  const areas = new Map();
  const leftAreas = new Map(); // the same, for the left half of the lines, to tell how well centred a view is
  let blocked = 0;
  let total = 0;
  let coupled = 0;
  const R = probe.type === 'curvilinear' ? probe.radius : 0;
  const halfAngle = (probe.halfAngle * Math.PI) / 180;
  for (let k = 0; k < lines; k++) {
    const s = (k + 0.5) / lines;
    const { o, d } = lineGeometry(probe, s);
    const world = r => {
      const u = o[0] + d[0] * r;
      const v = o[1] + d[1] * r;
      return [frame.o[0] + frame.e[0] * u + frame.n[0] * v, frame.o[1] + frame.e[1] * u + frame.n[1] * v, frame.o[2] + frame.e[2] * u + frame.n[2] * v];
    };
    // where the line meets the skin
    let entry = null;
    for (let r = 0; r <= gapMax + 1; r += 1) {
      if (bodySdf(world(r), res.habitus) < 0) { entry = r; break; }
    }
    if (entry === null || entry > gapMax) continue;
    coupled++;
    let shadow = false;
    for (let r = entry + step / 2; r < depth; r += step) {
      const pitch = probe.type === 'linear' ? (probe.width ?? probe.footprint) / lines : (r + R) * 2 * halfAngle / lines;
      const area = pitch * step;
      total += area;
      if (shadow) { blocked += area; continue; }
      const hit = evaluate(res, world(r));
      if (hit.tissue < 0) continue;
      const sid = hit.entry >= 0 ? map[hit.entry] : -1;
      if (sid >= 0) {
        const id = STRUCTURES[sid].id;
        areas.set(id, (areas.get(id) ?? 0) + area);
        if (k < lines / 2) leftAreas.set(id, (leftAreas.get(id) ?? 0) + area);
      }
      if (BLOCKERS.has(hit.tissue) && hit.tissue !== GEL) shadow = true;
    }
  }
  return { areas, leftAreas, blocked, total, lines, coupled };
}

// Score a view against the structures it should show. Each wanted structure counts up to `need` mm^2, so one huge organ cannot hide a missing one.
export function scoreView(view, wanted) {
  let score = 0;
  for (const [id, need] of Object.entries(wanted)) score += Math.min(1, (view.areas.get(id) ?? 0) / need);
  return score / Object.keys(wanted).length;
}

export { TABLE_Y };

// 0 when the wanted structures lie evenly either side of the middle of the sector, 1 when all on one side.
export function imbalance(view, wanted) {
  let all = 0;
  let left = 0;
  for (const id of Object.keys(wanted)) {
    all += view.areas.get(id) ?? 0;
    left += view.leftAreas?.get(id) ?? 0;
  }
  return all > 0 ? Math.abs(2 * left - all) / all : 1;
}
