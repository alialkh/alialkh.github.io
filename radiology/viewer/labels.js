// Pure. Label ids, the structure under a point, and where a structure sits.
import { valueAt } from './volume.js';

// Golden angle steps keep neighbouring ids far apart in hue.
export const hue = id => (id * 137.508) % 360;
export const cssColor = id => `hsl(${hue(id).toFixed(0)} 75% 58%)`;

function hslToRgb(h, s, l) {
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map(v => Math.round(v * 255));
}

// One opaque colour per id as a packed little endian RGBA word. Id 0 is clear. Opacity is applied by the page.
export function labelPalette() {
  const palette = new Uint32Array(256);
  for (let id = 1; id < 256; id++) {
    const [r, g, b] = hslToRgb(hue(id), 0.75, 0.58);
    palette[id] = 0xff000000 | (b << 16) | (g << 8) | r;
  }
  return palette;
}

export const labelAt = (labelVolume, voxel) => valueAt(labelVolume, voxel);

// Structures in id order. names and centroids are keyed by id strings, and integer-like keys always come back ascending.
export const structuresPresent = labels => Object.keys(labels.names)
  .map(Number)
  .map(id => ({ id, name: labels.names[id], centroid: labels.centroids[id] }));

// Centroids are fractional voxel coordinates. The cursor is a whole voxel inside the volume.
export const centroidCursor = (centroid, dims) => centroid.map((c, i) => Math.min(dims[i] - 1, Math.max(0, Math.round(c))));
