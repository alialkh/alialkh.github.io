// Pure. Window center and width to an 8-bit gray lookup table, plus the helpers around it.
export const LUT_SIZE = 65536;
// Samples are int16, so a value indexes the table as value + OFFSET.
export const OFFSET = 32768;
export const MAX_WIDTH = 65535;

// The DICOM linear window (PS3.3 C.11.2.1.2). Width 1 or less is a plain threshold.
export function windowGray(value, center, width) {
  const w = Math.max(1, width);
  if (value <= center - 0.5 - (w - 1) / 2) return 0;
  if (value > center - 0.5 + (w - 1) / 2) return 255;
  return Math.round(((value - (center - 0.5)) / (w - 1) + 0.5) * 255);
}

// Packed as little endian RGBA, opaque gray, so a Uint32Array view of ImageData takes it directly.
export function windowLut(center, width, invert = false, lut = new Uint32Array(LUT_SIZE)) {
  for (let i = 0; i < LUT_SIZE; i++) {
    const g0 = windowGray(i - OFFSET, center, width);
    const g = invert ? 255 - g0 : g0;
    lut[i] = 0xff000000 | (g << 16) | (g << 8) | g;
  }
  return lut;
}

// Pixels of one slice through the table. out is a Uint32Array over the ImageData buffer.
export function applyLut(slice, lut, out) {
  for (let i = 0; i < slice.length; i++) out[i] = lut[slice[i] + OFFSET];
}

// Dragging right widens the window, dragging up brightens (lowers the level). A px moves more when the window is wide.
export function dragWindow({ center, width }, dx, dy) {
  const k = Math.max(1, width / 200);
  return {
    center: Math.min(OFFSET - 1, Math.max(-OFFSET, Math.round(center + dy * k))),
    width: Math.min(MAX_WIDTH, Math.max(1, Math.round(width + dx * k))),
  };
}

// For MR, where there is no standard window. Low and high percentile of a sample of the voxels.
export function autoWindow(values, low = 0.02, high = 0.995) {
  const step = Math.max(1, Math.floor(values.length / 200000));
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i += step) {
    if (values[i] < min) min = values[i];
    if (values[i] > max) max = values[i];
  }
  if (!(max > min)) return { center: min || 0, width: 1 };
  const bins = new Uint32Array(4096);
  const scale = bins.length / (max - min + 1);
  let n = 0;
  for (let i = 0; i < values.length; i += step, n++) bins[Math.floor((values[i] - min) * scale)]++;
  const percentile = p => {
    let seen = 0;
    for (let b = 0; b < bins.length; b++) {
      seen += bins[b];
      if (seen > p * n) return min + b / scale;
    }
    return max;
  };
  const lo = percentile(low);
  const hi = Math.max(percentile(high), lo + 1);
  return { center: Math.round((lo + hi) / 2), width: Math.round(hi - lo) };
}

// The values a window shows as black and as white, for the Tips text.
export const windowEnds = ({ center, width }) => [center - width / 2, center + width / 2];

// Lowest and highest value of a run of samples. MR slider limits come from here.
export function valueRange(values) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    if (values[i] < min) min = values[i];
    if (values[i] > max) max = values[i];
  }
  return [min, max];
}
