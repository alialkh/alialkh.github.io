// Draws tissue-coloured cuts through the virtual patient, to check the anatomy by eye. Not shipped.
//   node radiology/tools/anatomy-slice.mjs --out <dir> [--axial=z,z,..] [--coronal y,..] [--sagittal x,..] [--set name=value,..] [--px 2]
//   node radiology/tools/anatomy-slice.mjs --out <dir> --plane "ox,oy,oz;ux,uy,uz;vx,vy,vz;halfU,halfV"   (any plane, u right and v down on the picture)
// Use the = form for values that may be negative, for example --axial=-40,60. Writes PPM files and converts them to PNG with ffmpeg when it is installed.
import { parseArgs } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { buildPatient, DEFAULTS } from '../pocus/patient.js';
import { resolve, evaluate, bodySdf } from '../pocus/anatomy.js';
import { TISSUES, TISSUE_INDEX } from '../pocus/tissues.js';

const { values: o } = parseArgs({
  options: {
    out: { type: 'string' }, axial: { type: 'string' }, coronal: { type: 'string' }, sagittal: { type: 'string' },
    plane: { type: 'string' }, set: { type: 'string' }, px: { type: 'string', default: '2' }, name: { type: 'string', default: 'plane' },
  },
});
if (!o.out) throw new Error('--out is required');
mkdirSync(o.out, { recursive: true });

const P = { ...DEFAULTS };
for (const kv of (o.set ?? '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  P[k] = Number(v);
}
const res = resolve(buildPatient(), TISSUE_INDEX, P);
const colors = TISSUES.map(t => [1, 3, 5].map(i => parseInt(t.color.slice(i, i + 2), 16)));
const px = Number(o.px);

function render(file, origin, u, v, halfU, halfV) {
  const w = Math.round((2 * halfU) / px);
  const h = Math.round((2 * halfV) / px);
  const buf = Buffer.alloc(w * h * 3);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const a = (i + 0.5) * px - halfU;
      const b = (j + 0.5) * px - halfV;
      const p = [origin[0] + u[0] * a + v[0] * b, origin[1] + u[1] * a + v[1] * b, origin[2] + u[2] * a + v[2] * b];
      let c = [10, 12, 16];
      if (bodySdf(p, P.habitus) < 0) {
        const r = evaluate(res, p);
        c = r.tissue >= 0 ? colors[r.tissue] : [40, 40, 40];
      }
      buf.set(c, (j * w + i) * 3);
    }
  }
  const ppm = `${file}.ppm`;
  writeFileSync(ppm, Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), buf]));
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', ppm, `${file}.png`]);
    execFileSync('rm', [ppm]);
  } catch {
    console.log('ffmpeg missing, left', ppm);
  }
  console.log('wrote', `${file}.png`, `${w}x${h}`);
}

const list = s => (s ?? '').split(',').filter(Boolean).map(Number);
// Axial: patient's right on the left of the picture, anterior up. Screen right is +x (patient's left), screen down is +y (posterior).
for (const z of list(o.axial)) render(join(o.out, `axial_z${z}`), [0, 20, z], [1, 0, 0], [0, 1, 0], 200, 150);
// Coronal: screen right is +x, screen down is -z.
for (const y of list(o.coronal)) render(join(o.out, `coronal_y${y}`), [0, y, -40], [1, 0, 0], [0, 0, -1], 200, 360);
// Sagittal: anterior on the left (-y), superior up.
for (const x of list(o.sagittal)) render(join(o.out, `sagittal_x${x}`), [x, 10, -40], [0, 1, 0], [0, 0, -1], 160, 360);
if (o.plane) {
  const [org, u, v, half] = o.plane.split(';').map(s => s.split(',').map(Number));
  render(join(o.out, o.name), org, u, v, half[0], half[1]);
}
