// The virtual patient: an adult, supine, with the anatomy a point of care exam needs.
// Every number is a position in mm in the frame described in anatomy.js (x left, y posterior, z superior, origin at the xiphisternal joint).
// Sizes follow average adult figures (Gray's; Netter; the usual textbook organ dimensions) and were checked against slices, see tools/anatomy-slice.mjs.
// Everything that moves or changes with disease is a function of the parameter object P, so one table serves every scenario.

import { Builder, KIND, basis, rotMatrix, apply3, transpose3, norm3 } from './anatomy.js';
import { TISSUE_INDEX } from './tissues.js';

// ---------- parameters ----------
export const DEFAULTS = Object.freeze({
  habitus: 0.3, // 0 slim to 1 obese
  breath: 0, // 0 end expiration to 1 full inspiration
  // Cardiac state, set each frame by motion.js
  sys: 0, // 0 end diastole to 1 end systole
  atria: 0, // 0 empty to 1 full
  mv: 0, tv: 0, av: 0, // valve openness 0 closed to 1 open
  pulse: 0, // aortic pressure wave 0 to 1
  peri: 0, // peristalsis phase 0 to 1
  // Patient
  ef: 0.6, // ejection fraction
  rvDil: 1, // RV size relative to normal
  lvDil: 1,
  ivcDiam: 20, // mm, maximum
  ivcCollapse: 0.45, // fraction of the diameter lost at the end of a sniff
  bladder: 280, // mL
  aaa: 0, // mm added to the radius of the infrarenal aorta
  hydro: 0, // 0 to 1
  stones: 0, // 0 or 1, gallstones
  // Free fluid, thickness in mm (0 for none)
  fluidRUQ: 0, fluidLUQ: 0, fluidPelvis: 0, ascites: 0,
  pericardial: 0, pleuralR: 0, pleuralL: 0,
  ptxR: 0, ptxL: 0, // mm of air between lung and chest wall
});

const T = TISSUE_INDEX;

// The pose everything is measured from: no breath, diastole, valves shut. Tissue moves from here, and speckle moves with it.
export const restOf = P => ({ ...P, breath: 0, sys: 0, atria: 0, mv: 0, tv: 0, av: 0, pulse: 0, peri: 0 });

// ---------- the heart frame ----------
// Local x runs from the base of the left ventricle to its apex, y from the septum to the lateral wall, z is normal to the four chamber plane.
export const HEART = (() => {
  const apex = [88, -58, -14];
  const axis = norm3([0.62, -0.44, -0.65]);
  const Lo = 56;
  const c = [apex[0] - Lo * axis[0], apex[1] - Lo * axis[1], apex[2] - Lo * axis[2]];
  const M = basis(axis, [0.7, 0.7, 0.15]);
  return { c, M, R: transpose3(M) };
})();

const heartPoint = ([x, y, z]) => {
  const w = apply3(HEART.M, [x, y, z]);
  return [HEART.c[0] + w[0], HEART.c[1] + w[1], HEART.c[2] + w[2]];
};

const lerp = (a, b, t) => a + (b - a) * t;
const both = fn => { fn(-1, 'R'); fn(1, 'L'); }; // -1 is the patient's right
const mirrorX = (v, s) => [v[0] * s, v[1], v[2]];

// Depth of the peritoneum below the skin. The body outline grows with habitus by twice the extra depth at the front and by the extra
// half width at the sides, and the back stays on the table, so the extra is all fat.
const wallLo = offset => P => [30 + offset, -3 + 52 * P.habitus, 33, 24 * P.habitus];

// ---------- building ----------
export function buildPatient() {
  const B = new Builder();

  // --- 1. the whole body, muscle by default
  B.group('body', { c: [0, 0, 0], r: 1300 });
  B.band('body-fill', 'muscle', { lo: [0, 0, 0, 0], hi: [1e4, 0, 0, 0] });
  // A film of gel that overlaps the skin, so the surface is never a blend with air (that would read as a total reflector).
  B.band('gel-coat', 'gel', { lo: [-4, 0, 0, 0], hi: [1.2, 0, 0, 0] });

  // --- 2. the abdominal cavity: visceral fat inside the abdominal wall, from the pelvis to the domes
  // Wall depth below the skin: 27 at the front, about 30 at the side, 63 at the back (paraspinal muscle).
  B.group('abdomen', { c: [0, 0, -110], r: 230 });
  B.band('abd-cavity', 'fat_visc', { lo: wallLo(0), hi: [1e4, 0, 0, 0], zlo: -300, zhi: -20 });

  // --- 3. the thorax: mediastinal fat and the lungs
  B.group('thorax', { c: [0, 10, 50], r: 250 });
  B.cage('cage', 'muscle', { inset: 7, hidden: true });
  B.ell('mediastinum', 'fat_visc', { c: [-2, 14, 85], r: [40, 62, 140] });
  both((s, n) => {
    const x = s;
    // Oversized on purpose and clipped to the inside of the rib cage, so the lung reaches the chest wall wherever the wall is.
    B.ell(`lung-${n}`, 'lung', { c: [x * 72, 10, 50], r: [66, 84, 162], clip: [['cage', 'inside']] });
    B.ell(`lung-${n}-base`, 'lung', { c: [x * 68, 40, -25], r: [64, 62, 90], clip: [['cage', 'inside']] });
  });
  // Pleural effusion layers posteriorly in a supine patient. The lung above it floats on the fluid and is compressed.
  both((s, n) => {
    const eff = n === 'R' ? P => P.pleuralR : P => P.pleuralL;
    B.ell(`atelectasis-${n}`, 'collapsed_lung', { c: [s * 66, P => 80 - eff(P) - 22, -22], r: [40, 26, 78], active: P => eff(P) > 1, clip: [['cage', 'inside']] });
    B.ell(`pleural-fluid-${n}`, 'fluid', { c: [s * 68, P => 86 - eff(P) / 2 * 1.0 + eff(P) * 0.0, -20], r: [48, P => eff(P) / 2 + 12, 100], active: P => eff(P) > 1, clip: [['cage', 'inside']] });
  });
  // Pneumothorax: air between the lung and the chest wall, collecting at the front in a supine patient.
  both((s, n) => {
    const ptx = n === 'R' ? P => P.ptxR : P => P.ptxL;
    B.ell(`pneumothorax-${n}`, 'pleural_air', { c: [s * 70, P => -64 + ptx(P) / 2 + 4, 62], r: [44, P => ptx(P) / 2 + 3, 92], active: P => ptx(P) > 0.5, clip: [['cage', 'inside']] });
  });

  // --- 4. the diaphragm: fat below each dome with a muscle rim, clipped to the chest wall
  // Each dome is a big ellipsoid, the abdominal contents lie inside it. Breathing lowers it.
  B.group('diaphragm', { c: [0, 0, -60], r: 230 });
  // The muscle only lines the upper surface of each dome, not the whole ellipsoid.
  B.plane('dome-floor', 'muscle', { c: [0, 0, -85], n: [0, 0, -1], hidden: true });
  both((s, n) => {
    const c = P => [s * 48, -10, (s < 0 ? -133 : -141) - 26 * P.breath];
    const r = s < 0 ? [105, 100, 155] : [98, 100, 150];
    B.ell(`dome-${n}-muscle`, 'muscle', { c, r: r.map(v => v + 3), clip: [['cage', 'inside'], ['dome-floor', 'inside']] });
    B.ell(`dome-${n}`, 'fat_visc', { c, r, clip: [['cage', 'inside']] });
  });

  // --- 5. the skeleton: spine, ribs, sternum, pelvis
  B.group('spine', { c: [0, 70, -60], r: 300 });
  const ky = -0.00035;
  const spine = { cx: 0, cy0: 72, ky, zRef: 60 };
  B.vert('discs-t', 'disc', { ...spine, zTop: 180, period: 24, count: 11, r: [19, 14, 3.2] });
  B.vert('discs-l', 'disc', { ...spine, zTop: -114, period: 28, count: 5, r: [23, 16, 3.4] });
  B.vert('body-t', 'bone', { ...spine, zTop: 192, period: 24, count: 12, r: [20, 15, 10.5] });
  B.vert('body-l', 'bone', { ...spine, zTop: -100, period: 28, count: 5, r: [25, 18, 13] });
  for (const [k, per, zTop, count] of [['t', 24, 192, 12], ['l', 28, -100, 5]]) {
    B.vert(`arch-${k}`, 'bone', { ...spine, zTop, period: per, count, r: [17, 6, 8], off: [0, 27, -2] });
    B.vert(`spinous-${k}`, 'bone', { ...spine, zTop, period: per, count, r: [3.5, 14, 7], off: [0, 41, -5] });
    B.vert(`transverse-${k}R`, 'bone', { ...spine, zTop, period: per, count, r: [14, 5, 5], off: [-29, 24, 0] });
    B.vert(`transverse-${k}L`, 'bone', { ...spine, zTop, period: per, count, r: [14, 5, 5], off: [29, 24, 0] });
  }
  B.ell('sacrum', 'bone', { c: [0, 84, -262], r: [50, 22, 52], rot: [-22, 0, 0] });
  B.cap('coccyx', 'bone', { a: [0, 98, -308], b: [0, 104, -346], r1: 7, r2: 5 });
  both((s, n) => {
    const c = [s * 96, 8, -228];
    B.ell(`ilium-${n}`, 'bone', { c, r: [5, 64, 86], rot: { x: [-s * 0.9, -0.44, 0], y: [0, 0, 1] } });
    B.cap(`pubic-ramus-${n}`, 'bone', { a: [s * 10, -70, -338], b: [s * 78, -22, -312], r1: 8, r2: 9 });
    B.cap(`ischium-${n}`, 'bone', { a: [s * 78, -22, -312], b: [s * 76, 52, -332], r1: 9, r2: 10 });
  });
  B.box('pubic-symphysis', 'bone', { c: [0, -68, -340], r: [14, 8, 18], round: 3 });
  B.group('psoas', { c: [0, 55, -170], r: 150 });
  both((s, n) => B.ell(`psoas-${n}`, 'muscle', { c: [s * 42, 58, -150], r: [18, 21, 100], rot: [8, 0, s * -4], edge: 0.8 }));

  // --- 6. liver, gallbladder
  B.group('liver', { c: [-60, 0, -45], r: 140 });
  // The liver sits under the right dome, kept a little below it so fluid can collect between them. Breathing moves it down.
  const liverDrop = P => 24 * P.breath;
  const gap = P => 0.55 * P.fluidRUQ;
  B.ell('dome-liver', 'liver', { c: P => [-48, -10, -133 - 26 * P.breath], r: P => [105 - gap(P), 100 - gap(P), 155 - gap(P)], hidden: true });
  // halo of free fluid around the liver
  B.ell('liver-halo-r', 'fluid', { c: P => [-68, -2, -50 - liverDrop(P)], r: P => [60 + gap(P), 66 + gap(P), 72 + gap(P)], active: P => P.fluidRUQ > 0.5, clip: [['dome-R', 'inside'], ['abd-cavity', 'inside']] });
  B.ell('liver-r', 'liver', { c: P => [-68, -2, -48 - liverDrop(P)], r: [60, 66, 72], clip: [['dome-liver', 'inside']] });
  B.ell('liver-r2', 'liver', { c: P => [-70, -36, -74 - liverDrop(P)], r: [52, 32, 50], clip: [['dome-liver', 'inside']] });
  B.ell('liver-l', 'liver', { c: P => [22, -50, -18 - liverDrop(P) * 0.8], r: [64, 28, 44], rot: [0, 0, 8], clip: [['dome-L', 'inside']] });
  B.ell('caudate', 'liver', { c: P => [-22, 38, -35 - liverDrop(P)], r: [14, 14, 24], clip: [['dome-liver', 'inside']] });
  const ldz = P => -liverDrop(P);
  // hepatic veins converge on the IVC below the dome
  const hv = (n, pts, r) => B.tube(n, 'blood', pts.map(p => P => [p[0], p[1], p[2] + ldz(P)]), r);
  hv('hv-right', [[-100, 4, -22], [-72, 14, -12], [-48, 20, -2], [-27, 14, 6]], [4.5, 7]);
  hv('hv-middle', [[-44, -40, -34], [-36, -20, -16], [-29, 0, 2]], [3.5, 6]);
  hv('hv-left', [[8, -46, -22], [-4, -30, -8], [-22, -8, 4]], [3, 5.5]);
  // portal vein with bright walls, and its branches
  const pv = (n, pts, r) => {
    const p = pts.map(q => P => [q[0], q[1], q[2] + ldz(P)]);
    B.tube(`${n}-wall`, 'vessel_wall', p, r.map(v => v + 1.4));
    B.tube(n, 'blood', p, r);
  };
  pv('pv-main', [[-8, 22, -100], [-20, 16, -92], [-30, 8, -86]], [6.5, 6.5]);
  pv('pv-right', [[-30, 8, -86], [-56, 8, -78], [-88, 6, -68]], [6, 3.5]);
  pv('pv-right-ant', [[-62, 8, -78], [-70, -20, -72], [-76, -44, -66]], [3.5, 2.5]);
  pv('pv-right-post', [[-66, 8, -76], [-80, 34, -64], [-86, 48, -60]], [3.5, 2.5]);
  pv('pv-left', [[-30, 8, -86], [-18, -14, -82], [6, -34, -72]], [5.5, 3.5]);
  // gallbladder on the underside of the liver
  B.ell('gb-wall', 'gb_wall', { c: P => [-50, -42, -86 - liverDrop(P)], r: [18, 37, 16], rot: [12, 0, 0] });
  B.ell('gb', 'bile', { c: P => [-50, -42, -86 - liverDrop(P)], r: [15.5, 34.5, 13.5], rot: [12, 0, 0] });
  B.ell('gallstone-1', 'stone', { c: P => [-50, -30, -97 - liverDrop(P)], r: [4, 4, 3.5], active: P => P.stones > 0.5 });
  B.ell('gallstone-2', 'stone', { c: P => [-47, -37, -97 - liverDrop(P)], r: [3.2, 3.2, 3], active: P => P.stones > 0.5 });
  B.tube('cbd', 'bile', [[-28, 14, -90], [-22, 18, -104], [-16, 22, -122]].map(p => P => [p[0], p[1], p[2] + ldz(P)]), 2.4);

  // --- 7. kidneys
  const kidney = (s, n, cz) => {
    const c = P => [s * 62, 52, cz - 12 * P.breath];
    const axis = [s * -0.17, -0.12, -0.98];
    B.group(`kidney-${n}`, { c: [s * 62, 52, cz], r: 90 }, { c, rot: basis(axis, [-s, 0, 0]) });
    B.ell(`kidney-${n}`, 'kidney_cortex', { c: [0, 0, 0], r: [55, 27, 23] });
    for (const x of [-34, -17, 0, 17, 34]) {
      const k = 1 - Math.abs(x) / 70;
      B.ell(`pyr-${n}-${x}-a`, 'kidney_medulla', { c: [x, -9.5, 11 * k], r: [6.5, 7.5, 5.5], rot: [0, 0, 0] });
      B.ell(`pyr-${n}-${x}-p`, 'kidney_medulla', { c: [x, -9.5, -11 * k], r: [6.5, 7.5, 5.5] });
    }
    B.ell(`sinus-${n}`, 'kidney_sinus', { c: [0, 10, 0], r: [27, 15, 11.5] });
    B.ell(`calyx-${n}`, 'urine', { c: [0, 6, 0], r: [P => 3 + 20 * P.hydro, P => 2 + 9 * P.hydro, P => 2 + 7 * P.hydro], active: P => P.hydro > 0.05 });
    B.ell(`pelvis-${n}`, 'urine', { c: [-2, 16, 0], r: [P => 3 + 12 * P.hydro, P => 3 + 8 * P.hydro, P => 3 + 6 * P.hydro], active: P => P.hydro > 0.05 });
  };
  kidney(-1, 'R', -126);
  kidney(1, 'L', -110);

  // --- 8. spleen and stomach
  B.group('luq', { c: [80, -20, -50], r: 130 });
  B.ell('dome-spleen', 'spleen', { c: P => [50, -10, -141 - 26 * P.breath], r: P => [98 - 0.55 * P.fluidLUQ, 100 - 0.55 * P.fluidLUQ, 150 - 0.55 * P.fluidLUQ], hidden: true });
  const spleenC = P => [108, 40, -52 - 20 * P.breath];
  const spleenRot = { x: [0.1, -0.55, -0.83], y: [0, 1, 0] };
  B.ell('spleen-halo', 'fluid', { c: spleenC, r: P => [62 + 0.55 * P.fluidLUQ, 40 + 0.55 * P.fluidLUQ, 24 + 0.55 * P.fluidLUQ], rot: spleenRot, active: P => P.fluidLUQ > 0.5, clip: [['dome-L', 'inside'], ['abd-cavity', 'inside']] });
  B.ell('spleen', 'spleen', { c: spleenC, r: [62, 40, 24], rot: spleenRot, clip: [['dome-spleen', 'inside']] });
  B.tube('splenic-hilum', 'blood', [[70, 34, -72], [84, 32, -62], [98, 36, -56]].map(p => P => [p[0], p[1], p[2] - 20 * P.breath]), 3.2);
  const stomachC = P => [56, -30, -44 - 20 * P.breath];
  B.ell('stomach-wall', 'bowel_wall', { c: stomachC, r: [52, 33, 48], rot: [0, 0, -10], clip: [['dome-L', 'inside']] });
  B.ell('stomach', 'bowel_content', { c: stomachC, r: [47, 28, 43], rot: [0, 0, -10], clip: [['dome-L', 'inside']] });
  B.ell('stomach-gas', 'gas', { c: P => [54, -44, -36 - 20 * P.breath], r: [30, 11, 22], rot: [0, 0, -10], clip: [['dome-L', 'inside']] });
  B.tube('antrum-wall', 'bowel_wall', [[24, -32, -62], [4, -36, -84], [-16, -32, -98]].map(p => P => [p[0], p[1], p[2] - 14 * P.breath]), 18);
  B.tube('antrum', 'bowel_content', [[24, -32, -62], [4, -36, -84], [-16, -32, -98]].map(p => P => [p[0], p[1], p[2] - 14 * P.breath]), 13.5);

  // --- 9. pancreas, retroperitoneal vessels
  B.group('retro', { c: [0, 30, -120], r: 170 });
  const bz = P => -14 * P.breath;
  B.ell('pancreas-head', 'pancreas', { c: P => [-20, 22, -104 + bz(P)], r: [20, 14, 18] });
  B.ell('pancreas-body', 'pancreas', { c: P => [26, 20, -86 + bz(P)], r: [52, 10.5, 9], rot: [0, 0, 8] });
  B.ell('pancreas-tail', 'pancreas', { c: P => [82, 30, -68 + bz(P)], r: [20, 9, 8.5], rot: [0, 0, -18] });
  B.tube('splenic-vein', 'blood', [[86, 32, -68], [50, 30, -80], [10, 28, -92], [-6, 26, -98]].map(p => P => [p[0], p[1], p[2] + bz(P)]), 4.2);
  B.tube('smv', 'blood', [[-7, 24, -98], [-8, 18, -130], [-6, 12, -160]].map(p => P => [p[0], p[1], p[2] + bz(P)]), 5);
  B.tube('sma-wall', 'vessel_wall', [[3, 38, -92], [5, 28, -118], [3, 18, -150]].map(p => P => [p[0], p[1], p[2] + bz(P)]), 5);
  B.tube('sma', 'blood', [[3, 38, -92], [5, 28, -118], [3, 18, -150]].map(p => P => [p[0], p[1], p[2] + bz(P)]), 3.6);

  // aorta: from the hiatus to the bifurcation, then the iliacs. Pulsation widens it a little in systole.
  const pulse = P => 1 + 0.045 * P.pulse;
  const aortaR = (r0, r1) => [P => r0 * pulse(P), P => r1 * pulse(P)];
  const vessel = (name, pts, r0, r1, wall = 1.7) => {
    B.tube(`${name}-wall`, 'vessel_wall', pts, [P => (r0) * pulse(P) + wall, P => (r1) * pulse(P) + wall]);
    B.tube(name, 'blood', pts, aortaR(r0, r1));
  };
  vessel('aorta-abd', [[9, 40, -76], [8, 40, -100], [6, 40, -130], [4, 39, -160], [3, 40, -186]], 11, 9.4);
  // The aneurysm swells the infrarenal segment.
  B.ell('aaa-wall', 'vessel_wall', { c: [4, 38, -158], r: [P => 11 + P.aaa + 1.7, P => 11 + P.aaa + 1.7, 36], active: P => P.aaa > 2 });
  B.ell('aaa-thrombus', 'clot', { c: [4, 38, -158], r: [P => 11 + P.aaa, P => 11 + P.aaa, 35], active: P => P.aaa > 2 });
  B.ell('aaa-lumen', 'blood', { c: [4, 38, -158], r: [P => 9.5 * pulse(P), P => 9.5 * pulse(P), 36], active: P => P.aaa > 2 });
  vessel('iliac-R', [[3, 40, -186], [-18, 38, -212], [-40, 28, -250]], 6, 5.2);
  vessel('iliac-L', [[3, 40, -186], [24, 38, -212], [46, 28, -250]], 6, 5.2);
  // IVC, oval and compliant. Sniffing narrows it from the front to back and side to side.
  const ivcPts = [[-24, -6, 14], [-25, 2, -2], [-28, 14, -24], [-30, 26, -56], [-31, 34, -96], [-32, 38, -140], [-26, 40, -184], [-18, 40, -206]];
  const ivcR = (P, f) => (P.ivcDiam / 2) * (1 - P.ivcCollapse * P.breath) * f;
  for (let i = 0; i < ivcPts.length - 1; i++) {
    const f0 = i < 2 ? 1.12 : 1;
    B.cap(`ivc-wall.${i}`, 'vessel_wall', { a: ivcPts[i], b: ivcPts[i + 1], r1: P => ivcR(P, f0) + 1.2, r2: P => ivcR(P, 1) + 1.2, ysq: 1.35 });
    B.cap(`ivc.${i}`, 'blood', { a: ivcPts[i], b: ivcPts[i + 1], r1: P => ivcR(P, f0), r2: P => ivcR(P, 1), ysq: 1.35 });
  }
  const renal = (name, pts, r) => B.tube(name, 'blood', pts.map(p => P => [p[0], p[1], p[2] - 12 * P.breath]), r);
  renal('renal-vein-R', [[-50, 44, -120], [-40, 40, -118], [-33, 38, -116]], 4.5);
  renal('renal-vein-L', [[48, 44, -106], [26, 40, -110], [8, 31, -112], [-26, 36, -114]], 4.5);
  renal('renal-artery-R', [[6, 42, -114], [-20, 46, -120], [-46, 46, -124]], 2.6);
  renal('renal-artery-L', [[10, 42, -108], [30, 46, -110], [46, 46, -112]], 2.6);

  // --- 10. bowel
  B.group('bowel', { c: [0, -20, -170], r: 210 });
  const bowelTube = (name, pts, r, lumenR, content = 'bowel_content', gasAt = null) => {
    const pp = pts.map(p => P => [p[0], p[1], p[2] - 14 * P.breath]);
    B.tube(`${name}-wall`, 'bowel_wall', pp, r);
    B.tube(name, content, pp, lumenR);
    if (gasAt) for (const [i, g] of gasAt.entries()) B.ell(`${name}-gas${i}`, 'gas', { c: P => [g[0], g[1], g[2] - 14 * P.breath], r: g.slice(3), clip: [['abd-cavity', 'inside']] });
  };
  bowelTube('colon-asc', [[-100, 10, -100], [-104, 12, -150], [-100, 12, -205]], 24, 20, 'bowel_content', [[-102, -4, -140, 14, 8, 20], [-100, -2, -190, 12, 7, 14]]);
  bowelTube('colon-trans', [[-96, -26, -108], [-60, -58, -132], [0, -66, -140], [60, -58, -126], [96, -28, -88]], 21, 17, 'bowel_content', [[-40, -68, -134, 16, 6, 8], [30, -66, -134, 14, 6, 8]]);
  bowelTube('colon-desc', [[100, 24, -86], [98, 28, -150], [92, 30, -214]], 20, 16, 'bowel_content', [[100, 14, -130, 10, 7, 18]]);
  bowelTube('colon-sig', [[92, 30, -214], [50, 16, -270], [10, 22, -310], [4, 50, -318]], 20, 15);
  // small bowel, loops in the centre of the abdomen, with peristalsis
  const loop = (name, c, r, rot) => {
    const ang = P => (P.peri * 2 * Math.PI);
    B.ell(`${name}-wall`, 'bowel_wall', { c, r: [r[0] + 3.5, r[1] + 3.5, r[2] + 3.5], rot });
    B.ell(name, 'fluid', { c, r: P => [r[0] * (1 - 0.1 * Math.sin(ang(P))), r[1], r[2]], rot });
    void ang;
  };
  loop('sb1', [-30, -46, -170], [34, 11, 12], [0, 0, 14]);
  loop('sb2', [20, -42, -184], [30, 10, 12], [0, 0, -16]);
  loop('sb3', [-4, -30, -210], [38, 11, 11], [0, 0, 6]);
  loop('sb4', [40, -26, -160], [24, 10, 11], [0, 0, -30]);
  loop('sb5', [-52, -22, -184], [20, 10, 11], [0, 0, 40]);
  loop('sb6', [-20, -14, -236], [32, 11, 12], [0, 0, -8]);
  loop('sb7', [32, -18, -228], [26, 10, 11], [0, 0, 22]);
  // more loops, so the abdomen is crowded as it is: some distended with fluid, some collapsed with a bright mucosal centre
  loop('sb8', [-62, -34, -140], [26, 10, 11], [0, 0, -35]);
  loop('sb9', [58, -36, -196], [24, 10, 11], [0, 0, 28]);
  loop('sb10', [-14, -52, -150], [30, 9, 10], [0, 0, 5]);
  loop('sb11', [-72, -16, -214], [22, 9, 10], [0, 0, -55]);
  loop('sb12', [10, -44, -252], [30, 10, 11], [0, 0, 12]);
  const collapsed = (name, c, r, rot) => {
    B.ell(`${name}-wall`, 'bowel_wall', { c, r: [r[0] + 4, r[1] + 4, r[2] + 4], rot });
    B.ell(name, 'bowel_content', { c, r: [r[0] - 2, r[1] - 3, r[2] - 3], rot });
  };
  collapsed('cb1', [-44, -50, -172], [22, 8, 9], [0, 0, 20]);
  collapsed('cb2', [34, -50, -150], [24, 8, 9], [0, 0, -18]);
  collapsed('cb3', [-6, -22, -190], [20, 8, 9], [0, 0, 70]);
  collapsed('cb4', [46, -22, -226], [22, 8, 9], [0, 0, -40]);
  collapsed('cb5', [-36, -30, -240], [20, 8, 9], [0, 0, 35]);
  collapsed('cb6', [-18, -50, -216], [24, 8, 9], [0, 0, -10]);
  collapsed('cb7', [24, -28, -250], [18, 8, 9], [0, 0, 55]);
  collapsed('cb8', [-60, -42, -250], [20, 8, 9], [0, 0, -25]);

  // --- 11. pelvis: bladder, prostate, rectum, and fluid
  B.group('pelvis-organs', { c: [0, 0, -320], r: 100 });
  const bladderS = P => Math.cbrt(Math.max(P.bladder, 20) / 300);
  const bladderC = P => [0, -30, -352 + 42 * bladderS(P)];
  const bladderR = (P, extra = 0) => [45 * bladderS(P) + extra, 38 * bladderS(P) + extra, 42 * bladderS(P) + extra];
  B.ell('pelvic-halo', 'fluid', { c: P => [0, -6, -318], r: P => [64 + P.fluidPelvis * 0.5, 46 + P.fluidPelvis, 44 + P.fluidPelvis * 0.6], active: P => P.fluidPelvis > 0.5, clip: [['abd-cavity', 'inside']] });
  B.ell('bladder-wall', 'gb_wall', { c: bladderC, r: P => bladderR(P, 2.2) });
  B.ell('bladder', 'urine', { c: bladderC, r: P => bladderR(P, -0.2) });
  B.ell('prostate', 'prostate', { c: [0, 6, -372], r: [22, 17, 16] });
  B.tube('rectum-wall', 'bowel_wall', [[0, 52, -290], [0, 56, -330], [0, 54, -366]], 22);
  B.tube('rectum', 'bowel_content', [[0, 52, -290], [0, 56, -330], [0, 54, -366]], 17);

  // --- 12. ascites: a general halo of fluid between loops, clipped to the cavity
  B.group('ascites', { c: [0, 0, -170], r: 220 });
  B.ell('ascites-pool', 'fluid', { c: [0, -34, -190], r: P => [P.ascites * 3.2 + 40, 34, 70], active: P => P.ascites > 0.5, clip: [['abd-cavity', 'inside']] });

  // --- 13. the heart, in its own frame
  B.group('heart', { c: [50, -30, 20], r: 110 }, { c: P => [HEART.c[0], HEART.c[1], HEART.c[2] - 8 * P.breath], rot: HEART.M });
  heartParts(B);

  // --- 14. thoracic vessels (world frame), over the heart where they meet
  B.group('great-vessels', { c: [0, 20, 100], r: 150 });
  thoracicVessels(B);

  // --- 15. Morison's pouch, the splenorenal recess: free fluid between organs, painted over them
  B.group('free-fluid', { c: [0, 20, -100], r: 200 });
  B.ell('morison', 'fluid', { c: P => [-80, 40, -100 - 14 * P.breath], r: P => [P.fluidRUQ / 2 + 0.1, 34, 42], rot: { x: [0, 0.9, 0.4], y: [0, 0, 1] }, active: P => P.fluidRUQ > 0.5 });
  B.ell('splenorenal', 'fluid', { c: P => [82, 48, -78 - 14 * P.breath], r: P => [P.fluidLUQ / 2 + 0.1, 34, 36], rot: { x: [0, 0.9, 0.35], y: [0, 0, 1] }, active: P => P.fluidLUQ > 0.5 });

  // --- 16. ribs, cartilage, sternum
  B.group('chest-wall', { c: [0, 10, 40], r: 260 });
  B.ribs('ribs', 'bone', { part: 0, hz: 6.5, hr: 1.9, round: 1.6 });
  B.ribs('costal-cartilage', 'cartilage', { part: 1, hz: 6, hr: 2.4, round: 1.6 });
  B.box('sternum', 'bone', { c: [0, -77, 45], r: [17, 6, 49], round: 2 });
  B.box('manubrium', 'bone', { c: [0, -74, 120], r: [27, 6.5, 24], round: 2 });
  B.ell('xiphoid', 'cartilage', { c: [0, -78, -18], r: [8, 3.5, 18] });

  // --- 17. the skin layers over everything: skin, fat, and the fascial lines of the wall
  B.group('wall', { c: [0, 0, 0], r: 1300 });
  const fatAbd = (extra = 0) => P => [10.2 + extra, 5 + 52 * P.habitus, -3, 1 + 24 * P.habitus];
  B.band('fat-chest', 'fat_sc', { lo: [2.2, 0, 0, 0], hi: P => [8.2, 1 + 12 * P.habitus, -1, 2 + 6 * P.habitus], zlo: 8, zhi: 400 });
  B.band('fat-abd', 'fat_sc', { lo: [2.2, 0, 0, 0], hi: fatAbd(), zlo: -400, zhi: 8 });
  B.band('skin', 'skin', { lo: [0, 0, 0, 0], hi: [2.2, 0, 0, 0] });
  // Fascial lines: the sheath on top of the abdominal muscle, and the peritoneum under it.
  B.band('sheath', 'fascia', { lo: fatAbd(-0.5), hi: fatAbd(0.5), zlo: -250, zhi: 8 });
  B.band('peritoneum', 'fascia', { lo: wallLo(-0.8), hi: wallLo(0.8), zlo: -270, zhi: 8 });

  return B;
}

// Heart chambers, valves, vessels stubs, in the heart frame.
function heartParts(B) {
  // Scale factors from the cardiac state. ef 0.6 shortens the long axis about 18% and the short axes about 30%.
  const eff = P => Math.min(1.35, Math.max(0.25, P.ef / 0.6));
  const sysS = P => 1 - 0.3 * P.sys * eff(P); // short axis
  const sysL = P => 1 - 0.18 * P.sys * eff(P);
  const wall = P => 10 + 3.5 * P.sys * eff(P);
  const lvc = P => [46 * sysL(P) * P.lvDil, 27 * sysS(P) * P.lvDil, 27 * sysS(P) * P.lvDil];
  const lvo = P => { const c = lvc(P); const w = wall(P); return [c[0] + w * 0.75, c[1] + w, c[2] + w]; };
  const rvs = P => P.rvDil * (1 - 0.2 * P.sys);
  const rav = P => 0.88 + 0.12 * P.atria; // atria fill in systole

  // pericardial space: heart shapes grown by the effusion, thicker behind (world +y)
  const effIn = P => P.pericardial;
  const backShift = P => { const w = apply3(HEART.R, [0, 1, 0]); return [w[0] * effIn(P) * 0.35, w[1] * effIn(P) * 0.35, w[2] * effIn(P) * 0.35]; };
  const inflated = (name, c, r, rot) => {
    const cs = P => c(P).map((v, i) => v + backShift(P)[i]);
    B.ell(`pc-${name}`, 'fluid', { c: cs, r: P => r(P).map(v => v + effIn(P)), rot, active: P => effIn(P) > 0.5 });
    // the bright pericardial line, 1 mm outside the fluid
    B.ell(`pcl-${name}`, 'pericardium', { c: cs, r: P => r(P).map(v => v + effIn(P) + 1.6), rot, shell: 1.3 });
  };
  const rvC = P => [-4, -36 * Math.sqrt(P.rvDil), 12];
  const rvR = P => [48 * rvs(P), 32 * Math.sqrt(P.rvDil) * (1 - 0.1 * P.sys), 36];
  const raC = [-50, -38, -2];
  const laC = [-52, 14, -10];
  const raR = P => [26 * rav(P), 27 * rav(P), 28 * rav(P)];
  const laR = P => [27 * rav(P), 29 * rav(P), 25 * rav(P)];

  inflated('rv', rvC, rvR);
  inflated('ra', () => raC, raR);
  inflated('la', () => laC, laR);
  inflated('lv', () => [0, 0, 0], lvo);

  // right ventricle: wall first, blood inset by 3.5 mm, painted before the left ventricle so the septum is the left wall
  B.ell('rv-wall', 'myocardium', { c: rvC, r: rvR });
  B.ell('rv', 'blood', { c: rvC, r: P => rvR(P).map(v => v - 3.5) });
  // atria
  B.ell('ra-wall', 'myocardium', { c: () => raC, r: P => raR(P).map(v => v + 2) });
  B.ell('ra', 'blood', { c: () => raC, r: raR });
  B.ell('la-wall', 'myocardium', { c: () => laC, r: P => laR(P).map(v => v + 2) });
  B.ell('la', 'blood', { c: () => laC, r: laR });
  // left ventricle: myocardium then cavity
  B.ell('lv-wall', 'myocardium', { c: [0, 0, 0], r: lvo });
  B.ell('lv', 'blood', { c: [0, 0, 0], r: lvc });
  // papillary muscles
  B.ell('papillary-ant', 'myocardium', { c: P => [lvc(P)[0] * -0.1, lvc(P)[1] * 0.78, lvc(P)[2] * 0.4], r: [11, 4.5, 4.5], rot: [0, 0, 20] });
  B.ell('papillary-post', 'myocardium', { c: P => [lvc(P)[0] * -0.1, lvc(P)[1] * 0.55, -lvc(P)[2] * 0.62], r: [10, 4.2, 4.2], rot: [0, 0, 20] });

  // valve leaflets: thin sheets that swing between a closed and an open position
  const leaflet = (name, hinge, closedTip, openTip, open) => {
    const tip = P => closedTip.map((v, i) => lerp(v, openTip[i], open(P)));
    B.ell(name, 'valve', {
      c: P => { const t = tip(P); return [(hinge[0] + t[0]) / 2, (hinge[1] + t[1]) / 2, 0]; },
      r: P => { const t = tip(P); return [Math.hypot(t[0] - hinge[0], t[1] - hinge[1]) / 2, 12, 0.85]; },
      rot: P => { const t = tip(P); return basis([t[0] - hinge[0], t[1] - hinge[1], 0], [0, 0, 1]); },
    });
  };
  leaflet('mv-ant', [-36, -14], [-25, 6], [-8, -17], P => P.mv);
  leaflet('mv-post', [-36, 22], [-25, 6], [-24, 26], P => P.mv);
  leaflet('tv-sept', [-27, -26], [-18, -38], [-3, -27], P => P.tv);
  leaflet('tv-ant', [-27, -50], [-18, -38], [-16, -54], P => P.tv);
}

// Great vessels in the world frame: the aortic root and arch, descending aorta, the vena cavae and the pulmonary trunk.
function thoracicVessels(B) {
  const pulse = P => 1 + 0.04 * P.pulse;
  const vessel = (name, pts, r0, r1, wall = 1.8) => {
    B.tube(`${name}-wall`, 'vessel_wall', pts, [P => r0 * pulse(P) + wall, P => r1 * pulse(P) + wall]);
    B.tube(name, 'blood', pts, [P => r0 * pulse(P), P => r1 * pulse(P)]);
  };
  const lowered = (pts, k = 6) => pts.map(p => P => [p[0], p[1], p[2] - k * P.breath]);
  // root, ascending aorta, arch, descending
  vessel('aorta-asc', lowered([[28, -42, 62], [24, -40, 80], [10, -34, 100], [-4, -22, 112], [-6, -4, 114], [4, 22, 106], [24, 46, 96]]), 17, 15);
  vessel('aorta-desc', lowered([[24, 46, 96], [26, 54, 80], [24, 58, 40], [20, 56, 0], [14, 50, -40], [9, 42, -76]], 4), 13.5, 11.5);
  // aortic cusps, two of the three seen in a long axis cut
  B.ell('av-cusp-a', 'valve', { c: P => [26 + 1.6 * (1 - P.av) - 5 * P.av, -42 + 3 * (1 - P.av), 63 + 7 * (1 - P.av)], r: [9, 8, 0.8], rot: P => [20 + 40 * P.av, 25, 0] });
  B.ell('av-cusp-p', 'valve', { c: P => [30 - 1.6 * (1 - P.av) + 5 * P.av, -39 - 2 * (1 - P.av), 63 + 7 * (1 - P.av)], r: [9, 8, 0.8], rot: P => [-20 - 40 * P.av, 25, 0] });
  // pulmonary trunk and its branches, anterior and to the left of the aorta
  vessel('pulm-trunk', lowered([[46, -56, 50], [36, -52, 76], [22, -34, 96]]), 15, 13);
  vessel('pulm-right', lowered([[22, -34, 96], [-8, -2, 96], [-50, 10, 92]]), 11, 8);
  vessel('pulm-left', lowered([[22, -34, 96], [44, 8, 90], [70, 28, 84]]), 10, 7);
  // superior vena cava into the right atrium, inferior cava joins from below (see the abdomen)
  vessel('svc', lowered([[-20, -16, 150], [-22, -8, 100], [-26, -8, 56], [-30, -16, 28]], 4), 10, 11, 1.2);
  // pulmonary veins into the left atrium
  B.tube('pulm-vein-r', 'blood', lowered([[-64, 24, 26], [-62, 30, 6]], 4), 5);
  B.tube('pulm-vein-l', 'blood', lowered([[36, 36, 18], [-8, 28, 10]], 4), 5);
  // oesophagus behind the left atrium, a little bowel-like tube
  B.tube('oesophagus-wall', 'bowel_wall', lowered([[0, 52, 120], [6, 52, 60], [14, 54, 10], [20, 50, -26]], 3), 8.5);
  B.tube('oesophagus', 'bowel_content', lowered([[0, 52, 120], [6, 52, 60], [14, 54, 10], [20, 50, -26]], 3), 4);
}



// The named structures a student is asked to find. An entry belongs to a structure when its name starts with one of the prefixes.
export const STRUCTURES = [
  { id: 'liver', name: 'Liver', match: ['liver-r', 'liver-l', 'caudate'] },
  { id: 'hepatic-veins', name: 'Hepatic veins', match: ['hv-'] },
  { id: 'portal-vein', name: 'Portal vein', match: ['pv-'] },
  { id: 'gallbladder', name: 'Gallbladder', match: ['gb', 'gallstone'] },
  { id: 'right-kidney', name: 'Right kidney', match: ['kidney-R', 'pyr-R', 'sinus-R', 'calyx-R', 'pelvis-R'] },
  { id: 'left-kidney', name: 'Left kidney', match: ['kidney-L', 'pyr-L', 'sinus-L', 'calyx-L', 'pelvis-L'] },
  { id: 'spleen', name: 'Spleen', match: ['spleen'] },
  { id: 'stomach', name: 'Stomach', match: ['stomach', 'antrum'] },
  { id: 'pancreas', name: 'Pancreas', match: ['pancreas'] },
  { id: 'bladder', name: 'Bladder', match: ['bladder'] },
  { id: 'prostate', name: 'Prostate', match: ['prostate'] },
  { id: 'aorta', name: 'Aorta', match: ['aorta', 'aaa'] },
  { id: 'ivc', name: 'Inferior vena cava', match: ['ivc'] },
  { id: 'lv', name: 'Left ventricle', match: ['lv', 'papillary'] },
  { id: 'rv', name: 'Right ventricle', match: ['rv'] },
  { id: 'la', name: 'Left atrium', match: ['la', 'la-wall'] },
  { id: 'ra', name: 'Right atrium', match: ['ra', 'ra-wall'] },
  { id: 'mitral', name: 'Mitral valve', match: ['mv-'] },
  { id: 'tricuspid', name: 'Tricuspid valve', match: ['tv-'] },
  { id: 'aortic-valve', name: 'Aortic valve', match: ['av-'] },
  { id: 'pericardial-fluid', name: 'Pericardial fluid', match: ['pc-'] },
  { id: 'lung-r', name: 'Right lung', match: ['lung-R'] },
  { id: 'lung-l', name: 'Left lung', match: ['lung-L'] },
  { id: 'pleural-fluid', name: 'Pleural fluid', match: ['pleural-fluid'] },
  { id: 'pneumothorax', name: 'Air in the pleural space', match: ['pneumothorax'] },
  { id: 'diaphragm', name: 'Diaphragm', match: ['dome-R-muscle', 'dome-L-muscle'] },
  { id: 'morison', name: "Hepatorenal space (Morison's pouch)", match: ['morison', 'liver-halo'] },
  { id: 'splenorenal', name: 'Splenorenal space', match: ['splenorenal', 'spleen-halo'] },
  { id: 'pelvic-fluid', name: 'Free fluid in the pelvis', match: ['pelvic-halo'] },
  { id: 'ascites', name: 'Ascites', match: ['ascites'] },
  { id: 'bowel', name: 'Bowel', match: ['colon', 'sb', 'rectum'] },
  { id: 'rib', name: 'Rib', match: ['ribs'] },
  { id: 'cartilage', name: 'Costal cartilage', match: ['costal-cartilage', 'xiphoid'] },
  { id: 'sternum', name: 'Sternum', match: ['sternum', 'manubrium'] },
  { id: 'spine', name: 'Spine', match: ['body-t', 'body-l', 'discs', 'arch', 'spinous', 'transverse'] },
  { id: 'pelvic-bone', name: 'Pelvic bone', match: ['ilium', 'pubic', 'sacrum', 'ischium'] },
  { id: 'muscle-psoas', name: 'Psoas muscle', match: ['psoas'] },
];

// For each entry index, the index of its structure in STRUCTURES, or -1. Longest matching prefix wins, so 'lv' does not swallow 'lv-wall' siblings wrongly.
export function structureMap(names) {
  return names.map(n => {
    let best = -1;
    let bestLen = 0;
    STRUCTURES.forEach((s, i) => {
      for (const m of s.match) if (n.startsWith(m) && m.length > bestLen) { best = i; bestLen = m.length; }
    });
    return best;
  });
}
