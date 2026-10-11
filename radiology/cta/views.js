// Pure. The C-arm picker and the projection table share one angle language:
// rot is the rotation, LAO positive and RAO negative. tilt is the angulation, cranial positive and caudal negative.
// The table stores one typical angle per view, so the picker matches the nearest listed view within TOLERANCE degrees.
export const TOLERANCE = 15;

export const entryAngle = p => ({
  rot: p.primary.side === 'RAO' ? -p.primary.angle : p.primary.angle,
  tilt: p.secondary.direction === 'caudal' ? -p.secondary.angle : p.secondary.angle,
});

// How far apart two angles are, as the larger of the two axis gaps. The picker and the case rules both use it.
export const angleDistance = (a, b) => Math.max(Math.abs(a.rot - b.rot), Math.abs(a.tilt - b.tilt));

// The tables store a lateral view as LAO 90 by convention, because no source gives its rotation.
export const isLateral = p => p.primary.side === 'LAO' && p.primary.angle === 90 && p.secondary.direction === 'none';

// "LAO 40, cranial 25", "AP, caudal 30", "RAO 30" or "AP".
export function describeAngle({ rot, tilt }) {
  const side = rot === 0 ? 'AP' : `${rot > 0 ? 'LAO' : 'RAO'} ${Math.abs(rot)}`;
  return tilt === 0 ? side : `${side}, ${tilt > 0 ? 'cranial' : 'caudal'} ${Math.abs(tilt)}`;
}

// The nearest listed view for this system, or null when none is within TOLERANCE on both axes.
// A view for both systems matches either. A tie goes to the view listed first.
export function matchProjection(angle, projections, system) {
  let best = null;
  for (const entry of projections) {
    if (entry.system !== system && entry.system !== 'both') continue;
    const a = entryAngle(entry);
    const distance = angleDistance(a, angle);
    if (distance <= TOLERANCE && (!best || distance < best.distance)) best = { entry, distance };
  }
  return best;
}

// Segment id -> roles, taken only from what the table lists for this view. A segment can hold two roles.
export function segmentRoles(entry) {
  const roles = new Map();
  if (!entry) return roles;
  for (const [role, list] of [['best', entry.bestSeen], ['foreshortened', entry.foreshortened], ['overlapped', entry.overlapped]]) {
    for (const id of list) roles.set(id, [...(roles.get(id) ?? []), role]);
  }
  return roles;
}

// Which coronary system a case shows, for the picker's left or right choice. A named view that is for one system decides it.
// Otherwise it is right when most outlines are RCA segments, and null when nothing says. content holds the projection and segment Maps.
export function caseSystem(c, content) {
  const view = c.projection && content.projection.get(c.projection);
  if (view && view.system !== 'both') return view.system;
  if (!c.regions?.length) return null;
  const rca = c.regions.filter(r => content.segment.get(r.segment).artery === 'rca').length;
  return rca * 2 > c.regions.length ? 'right' : 'left';
}
