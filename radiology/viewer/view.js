// Pure. Zoom and pan for one plane. pan is in pixels from the cell centre, an anchor is a point in pixels from the cell centre too.
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 32;
export const HOME = { zoom: 1, panX: 0, panY: 0 };

// Pixels per millimetre that fit a whole plane image inside a cell.
export const fitScale = (cellW, cellH, widthMm, heightMm) => Math.max(0, Math.min(cellW / widthMm, cellH / heightMm));

// The image point under the anchor stays under it.
export function zoomAt({ zoom, panX, panY }, factor, anchor) {
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
  const f = next / zoom;
  return { zoom: next, panX: anchor.x - (anchor.x - panX) * f, panY: anchor.y - (anchor.y - panY) * f };
}

// The image centre may leave the cell centre by half the image, so the picture can never be lost.
export const clampPan = (view, wrapW, wrapH) => ({
  ...view,
  panX: Math.min(wrapW / 2, Math.max(-wrapW / 2, view.panX)),
  panY: Math.min(wrapH / 2, Math.max(-wrapH / 2, view.panY)),
});

// Two touches before and after. The zoom factor, where to zoom about, and how far the midpoint moved.
export function pinch(prev, cur) {
  const mid = ([a, b]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const gap = ([a, b]) => Math.hypot(a.x - b.x, a.y - b.y);
  const from = mid(prev);
  const to = mid(cur);
  return { factor: gap(prev) > 0 ? gap(cur) / gap(prev) : 1, anchor: from, dx: to.x - from.x, dy: to.y - from.y };
}
