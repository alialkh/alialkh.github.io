// Where the probe is and which way its image plane points.
//
// A pose is the contact point on the skin plus four hand motions, the way sonographers name them:
//   rotate (phi)  turn the probe about its own axis. 0 is a transverse plane, 90 a sagittal plane with the marker to the head.
//   fan           tilt the plane sideways, sweeping it through the tissue like a fan.
//   rock          tilt in the plane of the image, which angles every line to one side.
//   press         push into the patient. Soft tissue yields, so organs come nearer the face.
// The frame it returns is what the shader needs: the face centre, the screen-right axis e, the beam axis n and the elevation axis h.

import { bodySdf, bodyNormal, add3, sub3, scale3, dot3, cross3, norm3 } from './anatomy.js';

const D2R = Math.PI / 180;

export const DEFAULT_POSE = Object.freeze({ p: [0, -95, -60], phi: 0, fan: 0, rock: 0, press: 0 });
export const LIMITS = Object.freeze({ fan: 60, rock: 45, press: 45 });

const rotateAbout = (v, axis, deg) => {
  const c = Math.cos(deg * D2R);
  const s = Math.sin(deg * D2R);
  return add3(add3(scale3(v, c), scale3(cross3(axis, v), s)), scale3(axis, dot3(axis, v) * (1 - c)));
};

// Frame of a pose. Habitus changes the outline of the body and so the normal at a given point.
export function poseFrame(pose, habitus = 0) {
  const nu = bodyNormal(pose.p, habitus); // outward
  const head = norm3(sub3([0, 0, 1], scale3(nu, nu[2]))); // toward the head along the skin
  let e0 = cross3([0, 0, 1], nu); // horizontal, along the skin
  if (Math.hypot(...e0) < 1e-3) e0 = [1, 0, 0];
  e0 = norm3(e0);
  // Screen right. Rotating 90 degrees puts the marker (screen left) toward the head.
  let e = add3(scale3(e0, Math.cos(pose.phi * D2R)), scale3(head, -Math.sin(pose.phi * D2R)));
  let n = scale3(nu, -1);
  // Components perpendicular to e and n at rest
  let h = norm3(cross3(n, e));
  // Fan tilts about e, rock about h.
  const fan = Math.max(-LIMITS.fan, Math.min(LIMITS.fan, pose.fan));
  const rock = Math.max(-LIMITS.rock, Math.min(LIMITS.rock, pose.rock));
  n = norm3(rotateAbout(n, e, -fan));
  h = norm3(rotateAbout(h, e, -fan));
  n = norm3(rotateAbout(n, h, rock));
  e = norm3(rotateAbout(e, h, rock));
  const press = Math.max(0, Math.min(LIMITS.press, pose.press));
  const o = add3(pose.p, scale3(n, press));
  return { o, e, n, h, nu };
}

// Sphere trace the skin along a ray. Returns { p, d } or null. Only the trunk, head and thighs count.
export function pickSkin(origin, dir, habitus = 0, maxDist = 2500) {
  let t = 0;
  for (let i = 0; i < 160 && t < maxDist; i++) {
    const p = add3(origin, scale3(dir, t));
    const d = bodySdf(p, habitus);
    if (d < 0.05) return { p, t };
    t += Math.max(d * 0.9, 0.2);
  }
  return null;
}

// A point on the skin straight below (or beside) a given spot. from: 'front' casts along +y from the front, 'left' and 'right' cast from the sides.
export function skinPoint(a, z, from = 'front', habitus = 0) {
  const o = from === 'front' ? [a, -500, z] : from === 'left' ? [500, a, z] : [-500, a, z];
  const d = from === 'front' ? [0, 1, 0] : from === 'left' ? [-1, 0, 0] : [1, 0, 0];
  const hit = pickSkin(o, d, habitus);
  return hit ? hit.p : null;
}

// How much the tissue yields under the face, in mm: the abdominal wall is soft, the chest wall barely moves.
export const compliance = z => Math.max(4, Math.min(16, 4 + ((-z - 10) / 60) * 12));

// A description of the plane for the teaching readout.
export function orientationName(phi) {
  const a = ((phi % 180) + 180) % 180;
  if (a < 12 || a > 168) return 'Transverse';
  if (Math.abs(a - 90) < 12) return 'Sagittal';
  return 'Oblique';
}

// Find the pose at contact point p whose beam points along nWant and whose screen-right axis points as near eWant as the three hand
// motions allow (rotate, fan, rock). Used to build the standard windows and the "show me" hints. A coarse search, then a local one.
export function solvePose(p, nWant, eWant, habitus = 0, press = 0) {
  const nw = norm3(nWant);
  const ew = eWant ? norm3(eWant) : null;
  const cost = q => {
    const f = poseFrame({ p, phi: q[0], fan: q[1], rock: q[2], press }, habitus);
    let c = 1 - dot3(f.n, nw);
    if (ew) c += 0.35 * (1 - dot3(f.e, ew));
    return c;
  };
  let best = [0, 0, 0];
  let bestCost = Infinity;
  for (let phi = -180; phi < 180; phi += 15) {
    for (let fan = -60; fan <= 60; fan += 15) {
      for (let rock = -45; rock <= 45; rock += 15) {
        const c = cost([phi, fan, rock]);
        if (c < bestCost) { bestCost = c; best = [phi, fan, rock]; }
      }
    }
  }
  for (let step = 8; step > 0.05; step *= 0.6) {
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < 3; i++) for (const s of [-step, step]) {
        const q = best.slice();
        q[i] += s;
        const c = cost(q);
        if (c < bestCost - 1e-9) { bestCost = c; best = q; improved = true; }
      }
    }
  }
  const phi = ((best[0] + 540) % 360) - 180;
  return { p, phi, fan: best[1], rock: best[2], press, error: bestCost };
}
