// Poses from a textbook plane, for tools/make-windows.mjs and for looking at the plane itself.
import { apply3, add3, scale3, cross3, norm3 } from '../pocus/anatomy.js';
import { HEART } from '../pocus/patient.js';
import { pickSkin, solvePose } from '../pocus/geometry.js';
import { ORIENTATIONS, PRESETS } from '../pocus/machine.js';

// A textbook plane written in the heart's own frame (or the world's) becomes poses: for a grid of targets across the plane, cast the beam
// back to the skin and solve the hand angles that give that beam direction and screen-right direction. These start the search where a
// sonographer would, instead of leaving the heart to whichever oblique cut covers the most chambers.
// aim: { at, n, s } in the heart frame, or { at, nWorld, sWorld }. n is the beam direction, s the direction that should be screen right.
// The beam direction and the probe's e axis an aim asks for, in the world frame.
export function aimDirs(spec) {
  const mirror = ORIENTATIONS[PRESETS[spec.preset]?.orient]?.flipX ?? false;
  return (spec.aim ?? []).map(aim => {
    const nW = aim.nWorld ? norm3(aim.nWorld) : norm3(apply3(HEART.M, aim.n));
    const sW = aim.sWorld ? norm3(aim.sWorld) : norm3(apply3(HEART.M, aim.s));
    // a mirrored display shows the probe's e axis on the screen's left
    return { aim, nW, eW: mirror ? scale3(sW, -1) : sW };
  });
}

export function aimSeeds(spec, habitus) {
  const seeds = [];
  for (const { aim, nW, eW } of aimDirs(spec)) {
    const b1 = norm3(cross3(nW, eW));
    const target = add3(HEART.c, apply3(HEART.M, aim.at));
    for (const i of [-30, -15, 0, 15, 30]) for (const j of [-30, -15, 0, 15, 30]) {
      const t = add3(add3(target, scale3(b1, i)), scale3(eW, j));
      const hit = pickSkin(add3(t, scale3(nW, -400)), nW, habitus);
      if (!hit) continue;
      const sol = solvePose(hit.p, nW, eW, habitus, 0);
      seeds.push({ p: hit.p, phi: sol.phi, fan: sol.fan, rock: sol.rock, press: 0 });
    }
  }
  return seeds;
}
