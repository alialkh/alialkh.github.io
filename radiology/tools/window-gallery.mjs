// Renders every standard window to PNG with the dev page, normal and with its abnormal finding, for checking by eye. Not shipped.
//   node radiology/tools/window-gallery.mjs --out <dir> [--only ruq,luq] [--labels]
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WINDOWS } from '../pocus/windows.js';

const { values: o } = parseArgs({ options: { out: { type: 'string' }, only: { type: 'string' }, labels: { type: 'boolean', default: false }, 'normal-only': { type: 'boolean', default: false } } });
if (!o.out) throw new Error('--out is required');
const only = o.only ? new Set(o.only.split(',')) : null;
const shots = {};
for (const w of WINDOWS) {
  if (!w.pose || (only && !only.has(w.id))) continue;
  const base = `probe=${w.probe}&p=${w.pose.p.join(',')}&phi=${w.pose.phi}&fan=${w.pose.fan}&rock=${w.pose.rock}&press=${w.pose.press}&depth=${w.depth}&focus=${Math.round(w.depth * 0.45)}`;
  shots[w.id] = base;
  if (o.labels) shots[`${w.id}-L`] = `${base}&labels=0.55`;
  if (!o['normal-only'] && w.positive) shots[`${w.id}-pos`] = `${base}&set=${Object.entries(w.positive).map(([k, v]) => `${k}:${v}`).join(',')}`;
}
const harness = fileURLToPath(new URL('./pocus-shot.mjs', import.meta.url));
execFileSync('node', [harness, '--out', o.out, '--wait', '600000', '--shots', JSON.stringify(shots)], { stdio: 'inherit' });
