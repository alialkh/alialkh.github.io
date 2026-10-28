// Calipers. All points are in the probe plane, in mm, so a measurement is true however the picture is zoomed or flipped.

export const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// An ellipse from the two ends of one axis and one point on the other. Returns the semi axes, area, and circumference (Ramanujan).
export function ellipse(a, b, c) {
  const centre = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const axis = [b[0] - a[0], b[1] - a[1]];
  const L = Math.hypot(...axis) / 2;
  if (L < 1e-6) return { centre, semiA: 0, semiB: 0, area: 0, circumference: 0 };
  const unit = [axis[0] / (2 * L), axis[1] / (2 * L)];
  const normal = [-unit[1], unit[0]];
  const semiB = Math.abs((c[0] - centre[0]) * normal[0] + (c[1] - centre[1]) * normal[1]);
  const h = ((L - semiB) / (L + semiB)) ** 2;
  return {
    centre, semiA: L, semiB, area: Math.PI * L * semiB,
    circumference: Math.PI * (L + semiB) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h))),
  };
}

// The text a caliper shows beside it.
export function label(m) {
  if (m.kind === 'distance') {
    const d = distance(m.points[0], m.points[1]);
    return d >= 100 ? `${(d / 10).toFixed(1)} cm` : `${d.toFixed(1)} mm`;
  }
  if (m.kind === 'ellipse' && m.points.length === 3) {
    const e = ellipse(...m.points);
    return `${(e.area / 100).toFixed(2)} cm²`;
  }
  return '';
}

// Which measurement tools exist and how many clicks each takes.
export const TOOLS = { distance: { clicks: 2, name: 'Distance' }, ellipse: { clicks: 3, name: 'Ellipse' } };
