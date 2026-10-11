// Pure polygon geometry for region labels. Points are [x, y].
const inside = (poly, [x, y]) => {
  let on = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) on = !on;
  }
  return on;
};

const toEdge = (poly, [x, y]) => {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j];
    const [bx, by] = poly[i];
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / len2));
    best = Math.min(best, Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))));
  }
  return best;
};

// A point inside the polygon that is as far from its edges as a coarse search finds. A vessel outline is a thin curved tube,
// so its centroid often lies outside it, and this lands on the tube instead.
export function polygonAnchor(poly, steps = 24, rounds = 3) {
  let [x0, y0, x1, y1] = [Math.min(...poly.map(p => p[0])), Math.min(...poly.map(p => p[1])), Math.max(...poly.map(p => p[0])), Math.max(...poly.map(p => p[1]))];
  let best = poly[0];
  let room = -1;
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; j <= steps; j++) {
        const p = [x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * j) / steps];
        const d = inside(poly, p) ? toEdge(poly, p) : -1;
        if (d > room) [best, room] = [p, d];
      }
    }
    const [w, h] = [(x1 - x0) / steps, (y1 - y0) / steps];
    [x0, y0, x1, y1] = [best[0] - w, best[1] - h, best[0] + w, best[1] + h];
  }
  return best;
}

// Pushes points apart until none is closer than min to another, or until the passes run out. Points stay inside the box.
// Used for number badges, so two segments that start in the same corner still get a badge each.
export function spreadPoints(points, min, width, height, passes = 40) {
  const out = points.map(p => [...p]);
  const edge = min / 2;
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const [dx, dy] = [out[j][0] - out[i][0], out[j][1] - out[i][1]];
        const d = Math.hypot(dx, dy);
        if (d >= min) continue;
        // Two points on one spot are pushed apart along x, in index order, so the result is the same every time.
        const [ux, uy] = d === 0 ? [1, 0] : [dx / d, dy / d];
        const push = (min - d) / 2 + 0.01;
        out[i] = [out[i][0] - ux * push, out[i][1] - uy * push];
        out[j] = [out[j][0] + ux * push, out[j][1] + uy * push];
        moved = true;
      }
    }
    for (const p of out) [p[0], p[1]] = [Math.min(width - edge, Math.max(edge, p[0])), Math.min(height - edge, Math.max(edge, p[1]))];
    if (!moved) break;
  }
  return out;
}
