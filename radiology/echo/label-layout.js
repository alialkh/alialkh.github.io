// Where each marker's name chip goes on the frame. Pure: pixels in, chip offsets out.
// A chip sits beside its ring, clear of the chips placed before it and of every marker and pin center, inside the frame.
// A marker with no clear spot gets a numbered badge instead, so text never overlaps.

const GAP = 4;
const EDGE = 4;
// Marker centers stay clear for their badge, pin centers for their dot.
const BADGE_R = 9;
const PIN_R = 11;

// [ux, uy, ax, ay]: the chip sits GAP past the ring in direction (ux, uy), and (ax, ay) is the point of the chip
// that touches there, as fractions of its width and height. Best first, for a marker in the left half of the frame.
const SPOTS = [
  [1, 0, 0, 0.5], [-1, 0, 1, 0.5], [0, 1, 0.5, 0], [0, -1, 0.5, 1],
  [1, 0, 0, 1], [1, 0, 0, 0], [-1, 0, 1, 1], [-1, 0, 1, 0],
  [0, 1, 0, 0], [0, 1, 1, 0], [0, -1, 0, 1], [0, -1, 1, 1],
  [1, -1, 0, 1], [1, 1, 0, 0], [-1, -1, 1, 1], [-1, 1, 1, 0],
];

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const box = (left, top, w, h) => ({ left, top, right: left + w, bottom: top + h });
const grow = (b, d) => ({ left: b.left - d, top: b.top - d, right: b.right + d, bottom: b.bottom + d });
const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const crosses = (ring, b) => Math.hypot(ring.x - clamp(ring.x, b.left, b.right), ring.y - clamp(ring.y, b.top, b.bottom)) < ring.r;

// markers: [{ x, y, r, w, h }] ring center, ring radius and chip size in px. pins: [{ x, y }].
// Returns [{ x, y, badge }] per marker: the chip's top-left corner relative to the ring center.
// A badged marker's x and y are where its chip shows on hover and focus.
export function layoutLabels({ width, height, markers, pins = [] }) {
  const centers = [
    ...markers.map(m => grow(box(m.x, m.y, 0, 0), BADGE_R)),
    ...pins.map(p => grow(box(p.x, p.y, 0, 0), PIN_R)),
  ];
  const placed = [];
  return markers.map((m, i) => {
    // Chips open toward the middle of the frame first.
    const flip = m.x > width / 2;
    const spots = SPOTS.map(([ux, uy, ax, ay]) => {
      if (flip) [ux, ax] = [-ux, 1 - ax];
      const d = m.r * (ux && uy ? Math.SQRT1_2 : 1) + GAP;
      let left = m.x + ux * d - ax * m.w;
      let top = m.y + uy * d - ay * m.h;
      // Sliding along the side it is on keeps the chip beside its ring near an edge.
      if (!uy) top = clamp(top, EDGE, height - EDGE - m.h);
      if (!ux) left = clamp(left, EDGE, width - EDGE - m.w);
      return box(left, top, m.w, m.h);
    });
    const inside = spots.filter(b => b.left >= EDGE && b.top >= EDGE && b.right <= width - EDGE && b.bottom <= height - EDGE);
    const clear = inside.filter(b => !placed.some(p => overlaps(grow(p, GAP), b)) && !centers.some((c, j) => j !== i && overlaps(c, b)));
    // A chip over another ring hides part of its outline, so fewer crossings beats the preference order.
    const crossings = b => markers.filter((o, j) => j !== i && crosses(o, b)).length;
    const best = clear.reduce((a, b) => (crossings(b) < crossings(a) ? b : a), clear[0]);
    if (best) placed.push(best);
    const spot = best ?? inside[0] ?? spots[0];
    return { x: spot.left - m.x, y: spot.top - m.y, badge: !best };
  });
}
