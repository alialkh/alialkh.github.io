// Development page: renders the simulator from URL parameters so a headless browser can photograph it. Not linked from anywhere.
//   dev.html?from=right&a=10&z=-70&phi=90&fan=0&rock=0&press=0&depth=180&probe=C5&gain=0&thi=0&frames=2&set=fluidRUQ:12,breath:0.3
import { Sim } from './sim.js';
import { buildPatient, DEFAULTS, restOf } from './patient.js';
import { resolve } from './anatomy.js';
import { TISSUE_INDEX } from './tissues.js';
import { PROBES, extent } from './probes.js';
import { poseFrame, compliance, skinPoint } from './geometry.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
const log = s => { document.getElementById('log').textContent += `${s}\n`; };

try {
  const canvas = document.getElementById('c');
  const sim = new Sim(canvas, { lines: num('lines', 192), samples: num('samples', 640) });
  const builder = buildPatient();
  const P = { ...DEFAULTS };
  for (const kv of (q.get('set') ?? '').split(',').filter(Boolean)) {
    const [k, v] = kv.split(':');
    P[k] = Number(v);
  }
  const res = resolve(builder, TISSUE_INDEX, P, restOf(P));
  sim.setAnatomy(res);

  const probe = PROBES[q.get('probe') ?? 'C5'];
  // The probe goes where a ray from the front (or side) meets the skin at a given across position a and height z.
  const p = q.has('p') ? q.get('p').split(',').map(Number) : skinPoint(num('a', 0), num('z', -60), q.get('from') ?? 'front', P.habitus);
  if (!p) throw new Error('no skin there');
  const pose = { p, phi: num('phi', 0), fan: num('fan', 0), rock: num('rock', 0), press: num('press', 0) };
  const frame = poseFrame(pose, P.habitus);
  const depth = num('depth', 160);
  const freq = num('freq', probe.freqs.gen);
  const tgc = new Float32Array(8).fill(num('tgc', 0));
  const cfg = {
    probe, frame, depth, freq, thi: num('thi', 0) > 0, focus: num('focus', depth * 0.45), zones: num('zones', 1),
    gainDb: num('gain', 0), tgc, dr: num('dr', 64), power: num('power', 0), persist: 0, smooth: num('smooth', 0), sharp: num('sharp', 0), map: num('map', 0),
    gapMax: compliance(pose.p[2]), slide: [0, 0, -18 * P.breath], blines: num('blines', 0), lungHaze: 1, time: 0,
  };
  const t0 = performance.now();
  const frames = num('frames', 2);
  for (let i = 0; i < frames; i++) sim.frame(cfg);
  sim.gl.finish();
  log(`rendered ${frames} frames in ${(performance.now() - t0).toFixed(0)} ms`);

  const ext = extent(probe, depth);
  const W = canvas.width;
  const H = canvas.height;
  const mmPerPx = Math.max((ext.u1 - ext.u0) / (W * 0.94), (ext.v1 - ext.v0) / (H * 0.94));
  const view = { u0: (ext.u0 + ext.u1) / 2 - (W * mmPerPx) / 2, v0: ext.v0 - (H * mmPerPx - (ext.v1 - ext.v0)) / 2, mmPerPx };
  sim.display({ ...cfg, view, flipX: false, flipY: false, labelMix: num('labels', 0) }, sim.layer);
  sim.gl.finish();
  log(`probe ${probe.name} at ${pose.p.map(v => v.toFixed(0))} depth ${depth} mm freq ${freq} MHz`);
  window.__ready = true;
} catch (e) {
  log(String(e.stack ?? e));
  window.__error = String(e.message ?? e);
  window.__ready = true;
}
