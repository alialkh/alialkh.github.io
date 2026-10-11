// Small pictures of the middle axial slice for the sidebar. A series thumbnail is drawn from a volume that is already loaded.
// A case thumbnail fetches its first series' middle chunk alone, at low priority, when the queue asks for it.
import { fetchJson } from '../core/json.js';
import { startSlice } from './chunks.js';
import { streamVolume } from './loader.js';
import { createVolume } from './volume.js';
import { extractSlice } from './planes.js';
import { applyLut, autoWindow, windowLut } from './window.js';
import { createThumbQueue } from './thumb-queue.js';

// vol must hold its middle slice. CT uses the series' default window, MR a window from that one slice.
export function drawVolumeThumb(canvas, vol, series) {
  const [nx, ny, nz] = vol.dims;
  const slice = extractSlice(vol, 'axial', startSlice(nz));
  const win = series.windows.find(w => w.name === series.defaultWindow) ?? autoWindow(slice);
  Object.assign(canvas, { width: nx, height: ny });
  const image = new ImageData(nx, ny);
  applyLut(slice, windowLut(win.center, win.width), new Uint32Array(image.data.buffer));
  canvas.getContext('2d').putImageData(image, 0, 0);
}

const lowPriority = (url, options) => fetch(url, { ...options, priority: 'low' });

async function fetchThumb(c, canvas) {
  const series = c.series[0];
  const url = new URL('vol.json', series.url);
  const meta = await fetchJson(url);
  const vol = createVolume(meta);
  const done = await streamVolume(vol, meta, url, { signal: new AbortController().signal, limit: 1, fetchFn: lowPriority });
  if (done) drawVolumeThumb(canvas, vol, series);
}

export const createThumbs = () => createThumbQueue({ load: fetchThumb });
