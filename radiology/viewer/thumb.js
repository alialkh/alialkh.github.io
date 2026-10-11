// A small picture of the middle axial slice for the sidebar. It fetches only the middle chunk, and only once the item is on screen.
import { fetchJson } from '../core/json.js';
import { chunkOrder, startSlice } from './chunks.js';
import { streamVolume } from './loader.js';
import { createVolume } from './volume.js';
import { extractSlice } from './planes.js';
import { applyLut, autoWindow, windowLut } from './window.js';

async function draw(c, canvas) {
  const series = c.series[0];
  const url = new URL('vol.json', series.url);
  const meta = await fetchJson(url);
  const vol = createVolume(meta);
  const done = await streamVolume(vol, meta, url, { signal: new AbortController().signal, limit: 1 });
  if (!done) return;
  const [nx, ny, nz] = vol.dims;
  const chunk = meta.chunks[chunkOrder(meta.chunks, nz)[0]];
  const win = series.windows.find(w => w.name === series.defaultWindow) ?? autoWindow(vol.data.subarray(chunk.z0 * nx * ny, chunk.z1 * nx * ny));
  Object.assign(canvas, { width: nx, height: ny });
  const image = new ImageData(nx, ny);
  applyLut(extractSlice(vol, 'axial', startSlice(nz)), windowLut(win.center, win.width), new Uint32Array(image.data.buffer));
  canvas.getContext('2d').putImageData(image, 0, 0);
}

const seen = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries, observer) => {
  for (const { isIntersecting, target } of entries) {
    if (!isIntersecting) continue;
    observer.unobserve(target);
    target.drawThumb().catch(error => console.warn('Thumbnail failed:', error.message));
  }
}) : null;

// Draws when the canvas first scrolls into view. Browsers without IntersectionObserver draw at once.
export function lazyThumb(c, canvas) {
  canvas.drawThumb = () => draw(c, canvas);
  if (seen) seen.observe(canvas);
  else canvas.drawThumb().catch(() => {});
}
