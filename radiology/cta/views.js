// Pure. The C-arm picker and the projection table share one angle language:
// rot is the rotation, LAO positive and RAO negative. tilt is the angulation, cranial positive and caudal negative.
// The table stores one typical angle per view, so the picker matches the nearest listed view within TOLERANCE degrees.
export const TOLERANCE = 15;

export const entryAngle = p => ({
  rot: p.primary.side === 'RAO' ? -p.primary.angle : p.primary.angle,
  tilt: p.secondary.direction === 'caudal' ? -p.secondary.angle : p.secondary.angle,
});

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
    const distance = Math.max(Math.abs(a.rot - angle.rot), Math.abs(a.tilt - angle.tilt));
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
