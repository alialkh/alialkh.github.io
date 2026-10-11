// Pure. The order chunks download in, and the checks on a vol.json.
import { BYTES } from './volume.js';

const middle = nz => Math.floor(nz / 2);

// Nearest to the middle slice first, then outward. The first image is the middle slice, so one small chunk is enough to start.
export function chunkOrder(chunks, nz) {
  const mid = middle(nz);
  const distance = ({ z0, z1 }) => (mid >= z0 && mid < z1 ? 0 : Math.min(Math.abs(z0 - mid), Math.abs(z1 - 1 - mid)));
  return chunks.map((chunk, i) => ({ i, d: distance(chunk) })).sort((a, b) => a.d - b.d).map(c => c.i);
}

export const startSlice = nz => middle(nz);

// Problems in a vol.json, as text. Empty when it can be loaded.
export function volumeProblems(meta, where = 'vol.json') {
  const problems = [];
  const isDims = Array.isArray(meta?.dims) && meta.dims.length === 3 && meta.dims.every(n => Number.isInteger(n) && n > 0);
  if (!(meta?.dtype in BYTES)) problems.push(`${where} dtype must be int16 or uint8`);
  if (!isDims) problems.push(`${where} dims must be three whole numbers above 0`);
  if (!(Array.isArray(meta?.spacing) && meta.spacing.length === 3 && meta.spacing.every(s => Number.isFinite(s) && s > 0))) {
    problems.push(`${where} spacing must be three millimetre sizes above 0`);
  }
  if (!Array.isArray(meta?.chunks) || meta.chunks.length === 0) problems.push(`${where} chunks must be a list`);
  if (problems.length) return problems;
  let next = 0;
  for (const [i, c] of meta.chunks.entries()) {
    if (typeof c.file !== 'string' || c.z0 !== next || !(c.z1 > c.z0)) {
      problems.push(`${where} chunk ${i} must start at slice ${next} and end after it`);
      break;
    }
    next = c.z1;
  }
  if (!problems.length && next !== meta.dims[2]) problems.push(`${where} chunks end at slice ${next}, expected ${meta.dims[2]}`);
  return problems;
}
