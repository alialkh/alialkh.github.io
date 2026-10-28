// The three transducers a point of care machine ships with. Geometry is in the probe's own plane: u across the face, v into the patient.
//
//   linear       parallel lines, a flat face of `width` mm.
//   curvilinear  lines fan out from a centre `radius` mm behind the face, so the face is convex.
//   phased       every line starts at one point, a small footprint that fits between ribs.
//
// Frequencies are the centre frequency of each preset step (Pen, Gen, Res). `aperture` is the active aperture in mm that sets the
// lateral resolution, `elevation` the height of the face and `elevFocus` the depth of its fixed lens focus.

export const PROBES = {
  C5: {
    id: 'C5', name: 'C5-1', label: 'Curvilinear', type: 'curvilinear', typeIndex: 1,
    radius: 60, halfAngle: 36, aperture: 22, elevation: 12, elevFocus: 70,
    freqs: { pen: 2.0, gen: 3.0, res: 4.2 }, depthMin: 40, depthMax: 360, footprint: 74,
    use: 'Abdomen, FAST, pelvis, deep structures',
  },
  P4: {
    id: 'P4', name: 'P4-2', label: 'Phased array', type: 'phased', typeIndex: 2,
    radius: 0, halfAngle: 45, aperture: 19, elevation: 13, elevFocus: 80,
    freqs: { pen: 2.0, gen: 2.8, res: 3.6 }, depthMin: 40, depthMax: 360, footprint: 22,
    use: 'Heart through the ribs, lung between ribs',
  },
  L12: {
    id: 'L12', name: 'L12-4', label: 'Linear', type: 'linear', typeIndex: 0,
    radius: 0, halfAngle: 0, aperture: 36, elevation: 5, elevFocus: 25,
    freqs: { pen: 5.0, gen: 8.0, res: 11.0 }, depthMin: 10, depthMax: 90, footprint: 38,
    use: 'Pleura, vessels, superficial structures',
    width: 38,
  },
};

export const PROBE_LIST = Object.values(PROBES);

// Depth steps the depth knob walks through, in mm. Each probe uses the part inside its range.
export const DEPTH_STEPS = [10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 330, 360];

export const depthSteps = probe => DEPTH_STEPS.filter(d => d >= probe.depthMin && d <= probe.depthMax);

// Where line k of n starts and where it points, in (u, v). `s` is the fractional position across the aperture, 0 to 1.
export function lineGeometry(probe, s) {
  if (probe.type === 'linear') {
    const w = probe.width ?? probe.footprint;
    return { o: [-w / 2 + w * s, 0], d: [0, 1] };
  }
  const a = (-probe.halfAngle + 2 * probe.halfAngle * s) * Math.PI / 180;
  const d = [Math.sin(a), Math.cos(a)];
  if (probe.type === 'phased') return { o: [0, 0], d };
  return { o: [probe.radius * Math.sin(a), probe.radius * (Math.cos(a) - 1)], d };
}

// Inverse: a point (u, v) to the line fraction s and range r along it. Null outside the fan.
export function toBeam(probe, u, v) {
  if (probe.type === 'linear') {
    const w = probe.width ?? probe.footprint;
    const s = (u + w / 2) / w;
    return s < 0 || s > 1 || v < 0 ? null : { s, r: v };
  }
  const R = probe.type === 'curvilinear' ? probe.radius : 0;
  const a = Math.atan2(u, v + R);
  const s = (a * 180 / Math.PI + probe.halfAngle) / (2 * probe.halfAngle);
  const r = Math.hypot(u, v + R) - R;
  return s < 0 || s > 1 || r < 0 ? null : { s, r };
}

// The smallest rectangle in (u, v) that holds the fan down to `depth` mm: { u0, u1, v0, v1 }.
export function extent(probe, depth) {
  if (probe.type === 'linear') {
    const w = probe.width ?? probe.footprint;
    return { u0: -w / 2, u1: w / 2, v0: 0, v1: depth };
  }
  const R = probe.type === 'curvilinear' ? probe.radius : 0;
  const a = probe.halfAngle * Math.PI / 180;
  const far = R + depth;
  const u = far * Math.sin(a);
  // The face of a curvilinear probe sits above v = 0 at its edges, which is negative v.
  const vTop = R > 0 ? R * (Math.cos(a) - 1) : 0;
  return { u0: -u, u1: u, v0: vTop, v1: far - R };
}
