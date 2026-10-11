// Packs a raw LPS volume into the viewer's format: vol.json plus gzip chunks of whole slices.
import { parseArgs } from 'node:util';
import { gunzipSync, gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const BYTES = { int16: 2, uint8: 1 };
const USAGE = `Usage: node radiology/tools/pack-volume.mjs <raw file> --out <dir>
  (--dims nx,ny,nz --spacing sx,sy,sz --dtype int16|uint8 | --meta <json from to-lps.py>) [--chunk-slices 16]`;

function check(ok, message) {
  if (!ok) throw new Error(message);
}

const isTriple = (v, ok) => Array.isArray(v) && v.length === 3 && v.every(ok);

export function packVolume(raw, { dims, spacing, dtype, chunkSlices = 16 }) {
  check(Object.hasOwn(BYTES, dtype), `dtype must be int16 or uint8, got ${JSON.stringify(dtype)}`);
  check(isTriple(dims, n => Number.isInteger(n) && n > 0), `dims must be three positive integers, got ${JSON.stringify(dims)}`);
  check(isTriple(spacing, s => Number.isFinite(s) && s > 0), `spacing must be three positive numbers in mm, got ${JSON.stringify(spacing)}`);
  check(Number.isInteger(chunkSlices) && chunkSlices > 0, `chunkSlices must be a positive integer, got ${JSON.stringify(chunkSlices)}`);
  check(raw instanceof Uint8Array, 'raw must be a Uint8Array or Buffer of little-endian voxels');
  const [nx, ny, nz] = dims;
  const slice = nx * ny * BYTES[dtype];
  check(raw.length === slice * nz, `raw is ${raw.length} bytes but ${dims.join('x')} ${dtype} needs ${slice * nz}`);

  const chunks = [];
  const files = [];
  for (let z0 = 0; z0 < nz; z0 += chunkSlices) {
    const z1 = Math.min(z0 + chunkSlices, nz);
    const file = `c${String(chunks.length).padStart(4, '0')}.gz`;
    const bytes = gzipSync(raw.subarray(z0 * slice, z1 * slice), { level: 9 });
    bytes[9] = 255; // zlib stamps the build OS here, which would make the same volume differ between Windows and Linux.
    chunks.push({ file, z0, z1 });
    files.push({ name: file, bytes });
  }
  return { meta: { dtype, dims, spacing, chunkSlices, chunks }, files };
}

export function unpackVolume(meta, readFile) {
  const raw = Buffer.concat(meta.chunks.map(c => gunzipSync(readFile(c.file))));
  const [nx, ny, nz] = meta.dims;
  check(raw.length === nx * ny * nz * BYTES[meta.dtype], `chunks hold ${raw.length} bytes, dims and dtype say ${nx * ny * nz * BYTES[meta.dtype]}`);
  return raw;
}

export async function writeVolume(dir, raw, opts) {
  const packed = packVolume(raw, opts);
  await mkdir(dir, { recursive: true });
  const keep = new Set(packed.files.map(f => f.name));
  // A rerun with fewer slices must not leave unreferenced chunks behind.
  for (const name of await readdir(dir)) if (/^c\d{4,}\.gz$/.test(name) && !keep.has(name)) await rm(join(dir, name));
  await Promise.all(packed.files.map(f => writeFile(join(dir, f.name), f.bytes)));
  await writeFile(join(dir, 'vol.json'), `${JSON.stringify(packed.meta, null, 2)}\n`);
  return packed;
}

async function main() {
  const options = Object.fromEntries(['out', 'dims', 'spacing', 'dtype', 'meta', 'chunk-slices'].map(k => [k, { type: 'string' }]));
  const { values: o, positionals: [input] } = parseArgs({ allowPositionals: true, options });
  check(input && o.out, `Missing <raw file> or --out.\n${USAGE}`);
  check(!(o.meta && (o.dims || o.spacing || o.dtype)), `Give either --meta or --dims, --spacing and --dtype, not both.\n${USAGE}`);
  const list = s => s?.split(',').map(Number);
  const { dims, spacing, dtype } = o.meta ? JSON.parse(readFileSync(o.meta, 'utf8')) : { dims: list(o.dims), spacing: list(o.spacing), dtype: o.dtype };
  const chunkSlices = o['chunk-slices'] === undefined ? 16 : Number(o['chunk-slices']);
  const { files } = await writeVolume(o.out, readFileSync(input), { dims, spacing, dtype, chunkSlices });
  console.log(`Wrote ${files.length} chunks, ${files.reduce((n, f) => n + f.bytes.length, 0)} bytes, and vol.json to ${o.out}.`);
}

if (resolve(process.argv[1] ?? '') === import.meta.filename) {
  try {
    await main();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
