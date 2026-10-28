// Mapping between the screen and the probe's own plane, in mm. The shader does the same maths per pixel (see displayShader).
// Calipers, the depth scale and the focus markers all live in this space so they stay on the anatomy when the image is zoomed or flipped.

import { extent } from './probes.js';

// A view that fits the fan in a W by H screen. zoom magnifies about `centre` (probe mm), by default the middle of the fan.
export function fitView(probe, depth, W, H, { margin = 0.05, zoom = 1, centre = null, top = 0 } = {}) {
  const e = extent(probe, depth);
  const usableH = H - top;
  const base = Math.max((e.u1 - e.u0) / (W * (1 - 2 * margin)), (e.v1 - e.v0) / (usableH * (1 - margin * 1.2)));
  const mmPerPx = base / zoom;
  const c = centre ?? [(e.u0 + e.u1) / 2, (e.v0 + e.v1) / 2];
  // Keep the fan centred when not zoomed, and place the top of the fan just under `top` pixels.
  const u0 = c[0] - (W * mmPerPx) / 2;
  const v0 = zoom === 1 ? e.v0 - (top + (usableH - (e.v1 - e.v0) / mmPerPx) / 2) * mmPerPx : c[1] - (H * mmPerPx) / 2;
  return { u0, v0, mmPerPx, zoom };
}

// Pixel (x, y), y down from the top, to probe mm (u, v). flip says whether the display mirrors left to right or top to bottom.
export function screenToProbe(view, W, H, flip, x, y) {
  const px = flip.x ? W - x : x;
  const py = flip.y ? H - y : y;
  return [view.u0 + px * view.mmPerPx, view.v0 + py * view.mmPerPx];
}

export function probeToScreen(view, W, H, flip, u, v) {
  const px = (u - view.u0) / view.mmPerPx;
  const py = (v - view.v0) / view.mmPerPx;
  return [flip.x ? W - px : px, flip.y ? H - py : py];
}

// The depth scale: tick marks every cm down the centre line, longer every 5 cm, with the screen y and the depth in cm.
export function depthTicks(view, W, H, flip, depth, probe) {
  const R = probe.type === 'curvilinear' ? probe.radius : 0;
  const ticks = [];
  for (let mm = 0; mm <= depth; mm += 10) {
    // depth runs along the centre line, so u is 0 and v is the range minus the curvature offset (a convex face sits above v = 0 at the edges only)
    const [, y] = probeToScreen(view, W, H, flip, 0, mm);
    ticks.push({ mm, cm: mm / 10, y, major: mm % 50 === 0, label: mm % 20 === 0 || mm % 50 === 0 });
  }
  void R;
  return ticks;
}

// Where the transmit focus markers sit on the screen (a small triangle per zone at the edge of the image).
export function focusMarkers(view, W, H, flip, focus, zones) {
  return Array.from({ length: zones }, (_, z) => {
    const mm = focus * (1 + 0.55 * z);
    return { mm, y: probeToScreen(view, W, H, flip, 0, mm)[1] };
  });
}
