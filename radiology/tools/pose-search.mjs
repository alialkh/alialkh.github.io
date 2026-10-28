// Searches probe poses for the best view of a set of structures, using the anatomy directly. Prints the top few as dev.html query strings.
//   node radiology/tools/pose-search.mjs --from right --a=-20,40 --z=-110,-30 --want liver:1500,right-kidney:600 [--set fluidRUQ:12] [--probe C5] [--depth 180]
import { parseArgs } from 'node:util';
import { buildPatient, DEFAULTS, restOf } from '../pocus/patient.js';
import { resolve } from '../pocus/anatomy.js';
import { TISSUE_INDEX } from '../pocus/tissues.js';
import { PROBES } from '../pocus/probes.js';
import { poseFrame, skinPoint, compliance } from '../pocus/geometry.js';
import { visibleStructures, scoreView } from '../pocus/visibility.js';

const { values: o } = parseArgs({
  options: {
    from: { type: 'string', default: 'front' }, a: { type: 'string' }, z: { type: 'string' }, want: { type: 'string' }, set: { type: 'string', default: '' },
    probe: { type: 'string', default: 'C5' }, depth: { type: 'string', default: '180' }, phi: { type: 'string', default: '0,30,60,90,120,150' },
    rock: { type: 'string', default: '-30,-15,0,15,30' }, fan: { type: 'string', default: '-20,0,20' }, press: { type: 'string', default: '0,8' }, top: { type: 'string', default: '6' },
    steps: { type: 'string', default: '5' }, shadow: { type: 'string', default: '0' },
  },
});
const range = (s, n) => { const [lo, hi] = s.split(',').map(Number); return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1)); };
const list = s => s.split(',').map(Number);
const P = { ...DEFAULTS };
for (const kv of o.set.split(',').filter(Boolean)) { const [k, v] = kv.split(':'); P[k] = Number(v); }
const res = resolve(buildPatient(), TISSUE_INDEX, P, restOf(P));
const probe = PROBES[o.probe];
const wanted = Object.fromEntries(o.want.split(',').map(s => { const [k, v] = s.split(':'); return [k, Number(v)]; }));
const n = Number(o.steps);
const results = [];
for (const a of range(o.a, n)) for (const z of range(o.z, n)) {
  const p = skinPoint(a, z, o.from, P.habitus);
  if (!p) continue;
  for (const phi of list(o.phi)) for (const rock of list(o.rock)) for (const fan of list(o.fan)) for (const press of list(o.press)) {
    const pose = { p, phi, rock, fan, press };
    const frame = poseFrame(pose, P.habitus);
    const view = visibleStructures(res, probe, frame, Number(o.depth), { lines: 28, step: 4, gapMax: compliance(p[2]) });
    if (view.coupled < 14) continue;
    results.push({ score: scoreView(view, wanted) - Number(o.shadow) * (view.blocked / Math.max(view.total, 1)), a, z, phi, rock, fan, press, areas: Object.fromEntries([...view.areas].map(([k, v]) => [k, Math.round(v)])) });
  }
}
results.sort((x, y) => y.score - x.score);
for (const r of results.slice(0, Number(o.top))) {
  console.log(`score ${r.score.toFixed(2)}  from=${o.from}&a=${r.a.toFixed(0)}&z=${r.z.toFixed(0)}&phi=${r.phi}&rock=${r.rock}&fan=${r.fan}&press=${r.press}`);
  console.log('   ', JSON.stringify(Object.fromEntries(Object.keys(wanted).map(k => [k, r.areas[k] ?? 0]))));
}
console.log(`${results.length} poses tried`);
