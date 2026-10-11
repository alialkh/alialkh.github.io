// Pure. A volume is one typed array plus a per-slice flag for what has arrived so far.
export const BYTES = { int16: 2, uint8: 1 };
const ARRAYS = { int16: Int16Array, uint8: Uint8Array };

let nextId = 0;

export function createVolume({ dtype, dims, spacing }) {
  return {
    // A pane tells one volume's picture from another's by this, so a cached image never shows for the wrong scan.
    id: ++nextId,
    dtype, dims, spacing,
    data: new ARRAYS[dtype](dims[0] * dims[1] * dims[2]),
    ready: new Uint8Array(dims[2]),
    readyCount: 0,
  };
}

export const chunkLength = (meta, { z0, z1 }) => (z1 - z0) * meta.dims[0] * meta.dims[1] * BYTES[meta.dtype];

// bytes are the little endian voxels of slices z0 up to z1. Every browser runs little endian, so the typed array view is exact.
export function putChunk(vol, chunk, bytes) {
  const { z0, z1 } = chunk;
  const sliceSize = vol.dims[0] * vol.dims[1];
  const buffer = bytes.buffer ?? bytes;
  const view = new ARRAYS[vol.dtype](buffer, bytes.byteOffset ?? 0, (z1 - z0) * sliceSize);
  vol.data.set(view, z0 * sliceSize);
  for (let z = z0; z < z1; z++) {
    if (!vol.ready[z]) vol.readyCount++;
    vol.ready[z] = 1;
  }
}

export const isComplete = vol => vol.readyCount === vol.dims[2];
export const valueAt = (vol, [x, y, z]) => vol.data[x + vol.dims[0] * (y + vol.dims[1] * z)];

// The run of arrived slices around one slice, as [first, last]. Auto windowing reads only what is there.
export function readyRange(vol, around) {
  if (!vol.ready[around]) return null;
  let lo = around;
  let hi = around;
  while (lo > 0 && vol.ready[lo - 1]) lo--;
  while (hi < vol.dims[2] - 1 && vol.ready[hi + 1]) hi++;
  return [lo, hi];
}
