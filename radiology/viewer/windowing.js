// The window data that depends on loaded voxels: MR auto windows and the lookup tables that turn a window into gray levels.
import { windowLut, autoWindow, valueRange } from './window.js';
import { startSlice } from './chunks.js';
import { readyRange, isComplete } from './volume.js';

const LUTS_KEPT = 8;

// volOf(seriesId) returns that series' volume.
export function createWindowing(volOf) {
  const autos = new Map();
  const final = new Set();
  const luts = new Map();
  let lutId = 0;

  // Windows come from the slices that have arrived around the middle, and are redone once the series is complete.
  function measure(id) {
    const vol = volOf(id);
    const range = readyRange(vol, startSlice(vol.dims[2]));
    if (!range) return false;
    const size = vol.dims[0] * vol.dims[1];
    const values = vol.data.subarray(range[0] * size, (range[1] + 1) * size);
    const [min, max] = valueRange(values);
    autos.set(id, { ...autoWindow(values), min, max });
    return true;
  }

  return {
    autos,
    // A chunk of an MR series arrived. True when the auto window changed.
    chunk(id) {
      const vol = volOf(id);
      if (autos.has(id) && !(isComplete(vol) && !final.has(id))) return false;
      if (!measure(id)) return false;
      if (isComplete(vol)) final.add(id);
      return true;
    },
    // One table per distinct window. The oldest table is reused for a new window, so dragging allocates nothing.
    lut(win, invert) {
      const key = `${win.center}|${win.width}|${invert}`;
      let entry = luts.get(key);
      if (entry) return entry;
      const oldest = luts.size >= LUTS_KEPT ? luts.keys().next().value : null;
      const table = oldest ? luts.get(oldest).lut : undefined;
      if (oldest) luts.delete(oldest);
      entry = { lut: windowLut(win.center, win.width, invert, table), id: ++lutId };
      luts.set(key, entry);
      return entry;
    },
    clear() {
      autos.clear();
      final.clear();
    },
  };
}
