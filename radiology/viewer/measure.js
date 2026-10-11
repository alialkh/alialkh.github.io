// Pure. Millimetres from image coordinates. du and dv are the voxel sizes along the plane's screen x and y.
export const distanceMm = (a, b, du, dv) => Math.hypot((b[0] - a[0]) * du, (b[1] - a[1]) * dv);

export const formatMm = mm => (mm >= 100 ? `${Math.round(mm)} mm` : `${mm.toFixed(1)} mm`);

// The longest 1, 2 or 5 times a power of ten of millimetres that fits in maxPx, for the scale bar.
export function niceScale(pxPerMm, maxPx = 140) {
  if (!(pxPerMm > 0)) return { mm: 0, px: 0 };
  const target = maxPx / pxPerMm;
  const decade = 10 ** Math.floor(Math.log10(target));
  const mm = Number([5, 2, 1].map(m => m * decade).find(v => v <= target * (1 + 1e-9)).toPrecision(6));
  return { mm, px: mm * pxPerMm };
}
