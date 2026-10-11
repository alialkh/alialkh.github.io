// Pure helpers for add-cath.mjs. A COCO polygon is a flat [x, y, x, y, ...] list in pixels.

// Ramer-Douglas-Peucker on an open polyline. Keeps both end points.
export function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const [a, b] = [points[0], points.at(-1)];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const away = p => (len === 0 ? Math.hypot(p[0] - a[0], p[1] - a[1]) : Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / len);
  let worst = 0;
  let at = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = away(points[i]);
    if (d > worst) [worst, at] = [d, i];
  }
  if (worst <= tolerance) return [a, b];
  return [...simplify(points.slice(0, at + 1), tolerance).slice(0, -1), ...simplify(points.slice(at), tolerance)];
}

const round = v => Math.round(Math.min(1, Math.max(0, v)) * 1e4) / 1e4;

// Dataset segment names map to table ids as "seg-<name>". A name the table lacks is dropped and reported.
// Returns { regions, dropped } with polygons as fractions of the image.
export function regionsFromCoco(coco, fileName, segmentIds, tolerancePx = 0.7) {
  const image = coco.images.find(i => i.file_name === fileName);
  if (!image) throw new Error(`${fileName} is not in the annotation file`);
  const names = new Map(coco.categories.map(c => [c.id, c.name]));
  const regions = [];
  const dropped = [];
  for (const a of coco.annotations.filter(x => x.image_id === image.id)) {
    const name = names.get(a.category_id);
    const segment = `seg-${name}`;
    if (!segmentIds.has(segment)) {
      dropped.push(name);
      continue;
    }
    for (const flat of a.segmentation) {
      const points = [];
      for (let i = 0; i + 1 < flat.length; i += 2) points.push([flat[i], flat[i + 1]]);
      const polygon = simplify(points, tolerancePx).map(([x, y]) => [round(x / image.width), round(y / image.height)]);
      if (polygon.length < 3) dropped.push(name);
      else regions.push({ segment, polygon });
    }
  }
  return { regions, dropped };
}

// DICOM stores the primary angle positive toward LAO and the secondary angle positive toward cranial.
// CARDIAG says its metadata follows the DICOM standard. Returns the CathCase angles shape, or throws on text that is not two numbers.
export function anglesFromDicom(text) {
  const parts = text.split(',').map(t => t.trim());
  const [primary, secondary] = parts.map(Number);
  if (parts.length !== 2 || parts.some(t => t === '') || !Number.isFinite(primary) || !Number.isFinite(secondary)) {
    throw new Error(`expected "primary,secondary" as two numbers, got "${text}"`);
  }
  return {
    primary: { side: primary === 0 ? 'AP' : primary > 0 ? 'LAO' : 'RAO', angle: Math.abs(primary) },
    secondary: { direction: secondary === 0 ? 'none' : secondary > 0 ? 'cranial' : 'caudal', angle: Math.abs(secondary) },
  };
}
