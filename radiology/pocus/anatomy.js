// The virtual patient engine: a declarative table of shapes that is resolved per frame into flat numbers.
// The JS evaluator here and the GPU interpreter in anatomy-glsl.js read that same resolved table, so they cannot drift apart.
//
// Coordinates are mm, in the same LPS order the rest of the module uses: x toward the patient's left, y posterior, z superior.
// Origin: the midline, the mid anteroposterior plane, and the xiphisternal joint (about the T9 level). The patient lies supine.
// The patient's right is therefore -x, anterior is -y, and the table is the plane y = TABLE_Y.
//
// An entry paints one tissue wherever its shape is, later entries over earlier ones (painter's order), with a soft edge of a fraction
// of a millimetre so the impedance step at an organ boundary is smooth enough to differentiate. An entry may be clipped by up to
// two other entries (kept inside or outside them), which is how a lung stops at the diaphragm without a boolean tree.

export const KIND = { ELL: 0, CAP: 1, BOX: 2, BAND: 3, RIBS: 4, VERT: 5, PLANE: 6, CAGE: 7 };
export const FLAG = { SHELL: 1, HIDDEN: 2, INACTIVE: 4 }; // hidden entries are only ever clips, inactive ones are switched off by the scenario
export const TEXELS = 9; // RGBA texels per entry in the packed table. The ninth holds the entry's rigid motion since the rest pose.
export const FLOATS = TEXELS * 4;
export const TABLE_Y = 115; // the back rests on the table here
export const NO_CLIP = -1;
export const FAR = 1e4;
export const DEFAULT_EDGE = 0.5;

const D2R = Math.PI / 180;

// ---------- small vector helpers (plain arrays) ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => scale(a, 1 / (len(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export { sub as sub3, add as add3, scale as scale3, dot as dot3, cross as cross3, norm as norm3, len as len3 };

export const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1]; // row major

// Object to world rotation from Euler degrees, applied about x, then y, then z.
export function rotMatrix(rx = 0, ry = 0, rz = 0) {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(rx * D2R), Math.sin(rx * D2R), Math.cos(ry * D2R), Math.sin(ry * D2R), Math.cos(rz * D2R), Math.sin(rz * D2R)];
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return mul3(Rz, mul3(Ry, Rx));
}

export function mul3(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}

export const transpose3 = m => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
export const apply3 = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];

// Object to world rotation whose local x points along xdir and whose local y is as near ydir as it can be.
export function basis(xdir, ydir = [0, 0, 1]) {
  const x = norm(xdir);
  let z = cross(x, ydir);
  if (len(z) < 1e-6) z = cross(x, [1, 0, 0].map((v, i) => v + 0.3 * [0, 1, 0][i]));
  z = norm(z);
  const y = cross(z, x);
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}

// A rotation spec is Euler degrees, a nine number matrix, or { x, y } for basis().
function rotSpec(spec) {
  if (!spec) return IDENTITY;
  if (Array.isArray(spec) && spec.length === 9) return spec;
  if (Array.isArray(spec)) return rotMatrix(...spec);
  return basis(spec.x, spec.y);
}

// ---------- Hermite tables ----------
// A smooth curve through knots with three point tangents. The GPU twin is generated from the same arrays.
export function hermite(xs, ys, x) {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let i = 0;
  while (i < n - 2 && x > xs[i + 1]) i++;
  const tan = k => {
    const a = Math.max(k - 1, 0);
    const b = Math.min(k + 1, n - 1);
    return (ys[b] - ys[a]) / (xs[b] - xs[a]);
  };
  const h = xs[i + 1] - xs[i];
  const t = (x - xs[i]) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * tan(i) + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * tan(i + 1);
}

// ---------- the torso ----------
// Cross section of the trunk at height z, a superellipse with its back flattened on the table.
// Columns: z, half width A, half depth B, centre y, exponent n.
export const BODY_KNOTS = {
  z: [-380, -330, -260, -200, -130, -60, 0, 110, 180, 240, 280, 305, 322],
  A: [165, 170, 168, 155, 148, 152, 158, 165, 175, 188, 150, 85, 55],
  B: [95, 100, 108, 112, 108, 105, 105, 108, 100, 85, 68, 58, 50],
  yc: [5, 5, 8, 9, 10, 10, 10, 14, 18, 25, 28, 24, 16],
  n: [2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.5, 2.8, 3, 3, 2.4, 2.2],
};

// Fat gained at full habitus 1, in mm of half depth and half width. More in the abdomen than the chest.
export const HABITUS = { chestB: 6, abdB: 26, chestA: 6, abdA: 24 };

export function bodyAt(z, habitus = 0) {
  const k = BODY_KNOTS;
  const w = clamp((60 - z) / 120, 0, 1); // 0 over the chest, 1 below the costal margin
  const dB = habitus * (HABITUS.chestB + (HABITUS.abdB - HABITUS.chestB) * w);
  const dA = habitus * (HABITUS.chestA + (HABITUS.abdA - HABITUS.chestA) * w);
  const B = hermite(k.z, k.B, z) + dB;
  const A = hermite(k.z, k.A, z) + dA;
  // The back stays on the table, so the extra depth all goes to the front.
  const yc = hermite(k.z, k.yc, z) - dB;
  return { A, B, yc, n: hermite(k.z, k.n, z) };
}

// Head, neck and thighs are there so the 3D view reads as a person. They carry no organs.
const HEAD = { c: [0, 22, 415], r: [88, 100, 118] };
const NECK = { a: [0, 18, 300], b: [0, 22, 385], r: 52 };
const THIGH = [{ a: [-88, 12, -385], b: [-78, 30, -760], r1: 76, r2: 52 }, { a: [88, 12, -385], b: [78, 30, -760], r1: 76, r2: 52 }];

function sdEllipsoid(q, r) {
  const k0 = Math.hypot(q[0] / r[0], q[1] / r[1], q[2] / r[2]);
  const k1 = Math.hypot(q[0] / (r[0] * r[0]), q[1] / (r[1] * r[1]), q[2] / (r[2] * r[2]));
  if (k1 < 1e-9) return -Math.min(r[0], r[1], r[2]);
  return (k0 * (k0 - 1)) / k1;
}

export function sdRoundCone(p, a, b, r1, r2) {
  const ba = sub(b, a);
  const pa = sub(p, a);
  const l2 = dot(ba, ba);
  if (l2 < 1e-9) return len(pa) - Math.max(r1, r2);
  const rr = r1 - r2;
  if (Math.abs(rr) < 1e-4) {
    const h = clamp(dot(pa, ba) / l2, 0, 1);
    return len(sub(pa, scale(ba, h))) - r1;
  }
  const a2 = l2 - rr * rr;
  if (a2 <= 0) return len(pa) - Math.max(r1, r2);
  const il2 = 1 / l2;
  const y = dot(pa, ba);
  const z = y - l2;
  const xv = sub(scale(pa, l2), scale(ba, y));
  const x2 = dot(xv, xv);
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

// Distance to the superellipse of the trunk, negative inside. First order: implicit value over its gradient.
function sdSuperEllipse(x, y, A, B, n) {
  const ax = Math.abs(x) / A + 1e-6;
  const ay = Math.abs(y) / B + 1e-6;
  const q = ax ** n + ay ** n;
  const rho = q ** (1 / n);
  const g = q ** (1 / n - 1) * Math.hypot(ax ** (n - 1) / A, ay ** (n - 1) / B);
  return (rho - 1) / Math.max(g, 1e-6);
}

export function sdTorso(p, habitus = 0) {
  const { A, B, yc, n } = bodyAt(clamp(p[2], BODY_KNOTS.z[0], BODY_KNOTS.z[BODY_KNOTS.z.length - 1]), habitus);
  let d = sdSuperEllipse(p[0], p[1] - yc, A, B, n);
  // Past the ends of the profile the torso is capped by a plane, then the neck and thighs take over.
  d = Math.max(d, p[2] - 322, -392 - p[2]);
  return Math.max(d, p[1] - TABLE_Y);
}

export function bodySdf(p, habitus = 0) {
  let d = sdTorso(p, habitus);
  d = Math.min(d, sdEllipsoid(sub(p, HEAD.c), HEAD.r));
  d = Math.min(d, sdRoundCone(p, NECK.a, NECK.b, NECK.r, NECK.r * 0.9));
  for (const t of THIGH) d = Math.min(d, Math.max(sdRoundCone(p, t.a, t.b, t.r1, t.r2), p[1] - TABLE_Y));
  return d;
}

// Outward unit normal of the skin, by central differences.
export function bodyNormal(p, habitus = 0) {
  const e = 0.75;
  const g = [
    bodySdf([p[0] + e, p[1], p[2]], habitus) - bodySdf([p[0] - e, p[1], p[2]], habitus),
    bodySdf([p[0], p[1] + e, p[2]], habitus) - bodySdf([p[0], p[1] - e, p[2]], habitus),
    bodySdf([p[0], p[1], p[2] + e], habitus) - bodySdf([p[0], p[1], p[2] - e], habitus),
  ];
  return norm(g);
}

// ---------- the rib cage ----------
// Ribs live on a barrel (an ellipse that changes with height) as sloped bands. Rib n has its lateral point at z = ztop - (n-1) * spacing.
// psi is the angle round the barrel from the back (0) through the side (90) to the front (180).
export const CAGE = { yc: 8, Ar: 128, Br: 83, zc: -30, kA: 0.001, kB: 0.0007, kYc: 0.02 };
export const RIB = {
  ztop: 157, spacing: 26, drop: 100, count: 12, psi0: 16,
  // End of the bony rib and of its cartilage, per rib 1..12, in degrees. Ribs 11 and 12 are floating and have no cartilage.
  boneEnd: [150, 146, 143, 140, 138, 136, 134, 128, 118, 110, 92, 76],
  cartEnd: [172, 172, 172, 172, 172, 172, 172, 159, 141, 125, 92, 76],
  // How far a rib sits above (+) or below (-) its lateral height at each angle, as a fraction of drop. Ribs fall toward the front axillary line, then their cartilage rises.
  gPsi: [0, 16, 50, 80, 100, 125, 150, 172, 180],
  gVal: [0.5, 0.5, 0.42, 0.2, -0.1, -0.45, -0.42, -0.05, 0.05],
};

const ribG = psiDeg => hermite(RIB.gPsi, RIB.gVal, psiDeg);

function cageAt(z) {
  const dz = z - CAGE.zc;
  return { yc: CAGE.yc + CAGE.kYc * dz, Ar: CAGE.Ar - CAGE.kA * dz * dz, Br: CAGE.Br - CAGE.kB * dz * dz };
}

// Distance from the barrel surface, negative inside. Also returns the angle round the barrel in degrees.
function barrel(p) {
  const { yc, Ar, Br } = cageAt(p[2]);
  const x = Math.abs(p[0]) / Ar;
  const y = (p[1] - yc) / Br;
  const rho = Math.hypot(x, y) + 1e-6;
  const g = Math.hypot(x / Ar, y / Br) / rho;
  return { d: (rho - 1) / Math.max(g, 1e-6), psi: Math.atan2(x, y) / D2R, Ar, Br };
}

function sdRibs(p, part, hz, hr, rnd) {
  const { d, psi, Ar, Br } = barrel(p);
  const nCont = (RIB.ztop - p[2] + RIB.drop * ribG(psi)) / RIB.spacing + 1;
  const n = Math.round(nCont);
  if (n < 1 || n > RIB.count) return FAR;
  const lo = part === 0 ? RIB.psi0 : RIB.boneEnd[n - 1];
  const hi = part === 0 ? RIB.boneEnd[n - 1] : RIB.cartEnd[n - 1];
  if (hi <= lo) return FAR;
  const dz = (nCont - n) * RIB.spacing * 0.85;
  const along = Math.max(psi - hi, lo - psi) * D2R * Math.sqrt(Ar * Br);
  const q = [Math.abs(dz) - hz, Math.abs(d) - hr];
  const box = Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0)) + Math.min(Math.max(q[0], q[1]), 0) - rnd;
  return Math.max(box, along);
}

function sdCage(p, inset) {
  return barrel(p).d + inset;
}

function sdVert(p, a) {
  // a: cx, cy0, zTop, period, rx, ry, rz, count, ky, zRef, ox, oy, oz
  const i = clamp(Math.round((a.zTop - p[2]) / a.period), 0, a.count - 1);
  const zc = a.zTop - i * a.period;
  const cy = a.cy0 + a.ky * (zc - a.zRef) ** 2;
  return sdEllipsoid([p[0] - a.cx - a.ox, p[1] - cy - a.oy, p[2] - zc - a.oz], [a.rx, a.ry, a.rz]);
}

// ---------- the builder ----------
export class Builder {
  constructor() {
    this.groups = [];
    this.entries = [];
    this.byName = new Map();
    this.current = null;
  }

  // bound: { c, r } in world mm, or functions of P. frame: { c, rot } puts the entries of the group in a local frame.
  group(name, bound, frame = null) {
    this.current = { name, bound, frame, first: this.entries.length, count: 0 };
    this.groups.push(this.current);
    return this;
  }

  add(kind, name, tissue, o = {}) {
    if (!this.current) throw new Error('add a group before the first entry');
    if (this.byName.has(name)) throw new Error(`duplicate entry name ${name}`);
    const e = { kind, name, tissue, o, group: this.groups.length - 1 };
    this.byName.set(name, this.entries.length);
    this.entries.push(e);
    this.current.count++;
    return this;
  }

  ell(name, tissue, o) { return this.add(KIND.ELL, name, tissue, o); }
  cap(name, tissue, o) { return this.add(KIND.CAP, name, tissue, o); }
  box(name, tissue, o) { return this.add(KIND.BOX, name, tissue, o); }
  band(name, tissue, o) { return this.add(KIND.BAND, name, tissue, o); }
  ribs(name, tissue, o) { return this.add(KIND.RIBS, name, tissue, o); }
  vert(name, tissue, o) { return this.add(KIND.VERT, name, tissue, o); }
  plane(name, tissue, o) { return this.add(KIND.PLANE, name, tissue, o); }
  cage(name, tissue, o) { return this.add(KIND.CAGE, name, tissue, o); }

  // A chain of capsules through the points, as one run of entries. radius: number or [r0, r1] along the chain.
  tube(name, tissue, pts, radius, o = {}) {
    const n = pts.length - 1;
    const [r0, r1] = Array.isArray(radius) ? radius : [radius, radius];
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const rad = k => (typeof r0 === 'function' || typeof r1 === 'function' ? P => {
        const a = typeof r0 === 'function' ? r0(P) : r0;
        const b = typeof r1 === 'function' ? r1(P) : r1;
        return a + (b - a) * k;
      } : r0 + (r1 - r0) * k);
      this.cap(`${name}.${i}`, tissue, { ...o, a: pts[i], b: pts[i + 1], r1: rad(t0), r2: rad(t1) });
    }
    return this;
  }

  index(name) {
    if (!this.byName.has(name)) throw new Error(`no entry named ${name}`);
    return this.byName.get(name);
  }
}

const val = (f, P) => (typeof f === 'function' ? f(P) : f);
const vec = (f, P, dflt) => {
  const v = val(f, P) ?? dflt;
  return v.map(x => val(x, P));
};

// ---------- resolving ----------
// Returns { data, groups, count, names } where data holds FLOATS numbers per entry and groups the bounding spheres and entry ranges.
export function resolve(builder, tissueIndex, P, Prest = null) {
  const n = builder.entries.length;
  const data = new Float32Array(n * FLOATS);
  const groupBound = new Float32Array(builder.groups.length * 4);
  const groupRange = new Int32Array(builder.groups.length * 2);
  const frames = builder.groups.map(g => {
    if (!g.frame) return null;
    const c = vec(g.frame.c, P, [0, 0, 0]);
    return { c, M: rotSpec(val(g.frame.rot, P)) };
  });

  builder.groups.forEach((g, gi) => {
    const b = g.bound;
    groupBound.set([...vec(b.c, P, [0, 0, 0]), val(b.r, P)], gi * 4);
    groupRange.set([g.first, g.count], gi * 2);
  });

  const restFrames = Prest ? builder.groups.map(g => (g.frame ? { c: vec(g.frame.c, Prest, [0, 0, 0]), M: rotSpec(val(g.frame.rot, Prest)) } : null)) : null;
  // Where an entry sits in the world for a parameter set, for the entry kinds that have a position.
  const anchor = (e, PP, f) => {
    const toW = v => (f ? add(f.c, apply3(f.M, v)) : v);
    if (e.kind === KIND.ELL || e.kind === KIND.BOX) return toW(vec(e.o.c, PP));
    if (e.kind === KIND.CAP) return toW(vec(e.o.a, PP));
    return null;
  };

  builder.entries.forEach((e, ei) => {
    const o = e.o;
    const f = frames[e.group];
    if (Prest) {
      const now = anchor(e, P, f);
      const then = anchor(e, Prest, restFrames[e.group]);
      if (now && then) data.set(sub(now, then), ei * FLOATS + 32);
    }
    const toWorld = v => (f ? add(f.c, apply3(f.M, v)) : v);
    const row = ei * FLOATS;
    const T = k => row + k * 4;
    const tissue = tissueIndex[e.tissue];
    if (tissue === undefined) throw new Error(`entry ${e.name} names unknown tissue ${e.tissue}`);
    const shell = val(o.shell, P) ?? 0;
    const active = o.active === undefined ? true : val(o.active, P);
    const flags = (shell ? FLAG.SHELL : 0) | (o.hidden ? FLAG.HIDDEN : 0) | (active ? 0 : FLAG.INACTIVE);
    data.set([e.kind, tissue, flags, val(o.edge, P) ?? DEFAULT_EDGE], T(0));
    data[T(5) + 3] = shell; // the spare float of the third rotation row

    const setRot = M => {
      // q = R (p - c) with R the transpose of the object to world matrix, composed with the group frame.
      const Mw = f ? mul3(f.M, M) : M;
      const R = transpose3(Mw);
      data.set([R[0], R[1], R[2]], T(3));
      data.set([R[3], R[4], R[5]], T(4));
      data.set([R[6], R[7], R[8]], T(5));
    };

    switch (e.kind) {
      case KIND.ELL:
      case KIND.BOX: {
        data.set(toWorld(vec(o.c, P)), T(1));
        data.set(vec(o.r, P), T(2));
        setRot(rotSpec(val(o.rot, P)));
        data[T(7)] = val(o.round, P) ?? 0;
        break;
      }
      case KIND.CAP: {
        data.set(toWorld(vec(o.a, P)), T(1));
        data.set(toWorld(vec(o.b, P)), T(2));
        const r1 = val(o.r1, P);
        const r2 = val(o.r2, P) ?? r1;
        data[T(7)] = r1;
        data[T(7) + 1] = r2;
        data[T(7) + 2] = val(o.ysq, P) ?? 1; // stretches y so an oval section counts as a circle
        break;
      }
      case KIND.PLANE: {
        data.set(toWorld(vec(o.c, P)), T(1));
        const nrm = f ? apply3(f.M, norm(vec(o.n, P))) : norm(vec(o.n, P));
        data.set(nrm, T(2));
        break;
      }
      case KIND.BAND: {
        data.set(vec(o.lo, P, [0, 0, 0, 0]), T(1));
        data.set(vec(o.hi, P, [FAR, 0, 0, 0]), T(2));
        data.set([val(o.zlo, P) ?? -FAR, val(o.zhi, P) ?? FAR, val(o.xmax, P) ?? FAR, 0], T(7));
        break;
      }
      case KIND.RIBS: {
        data.set([val(o.part, P) ?? 0, val(o.hz, P) ?? 6, val(o.hr, P) ?? 3.5, val(o.round, P) ?? 1.5], T(7));
        break;
      }
      case KIND.CAGE: {
        data[T(7)] = val(o.inset, P) ?? 6;
        break;
      }
      case KIND.VERT: {
        const r = vec(o.r, P);
        const off = vec(o.off, P, [0, 0, 0]);
        data.set([val(o.cx, P) ?? 0, val(o.cy0, P), val(o.zTop, P), val(o.period, P)], T(1));
        data.set([...r, val(o.count, P)], T(2));
        data.set([val(o.ky, P) ?? 0, val(o.zRef, P) ?? 0, off[0], off[1]], T(3));
        data[T(4)] = off[2];
        break;
      }
      default: throw new Error(`unknown kind ${e.kind}`);
    }

    // Clips: up to two other entries, kept inside or outside.
    const clips = o.clip ?? [];
    const c0 = clips[0] ? builder.index(clips[0][0]) : NO_CLIP;
    const c1 = clips[1] ? builder.index(clips[1][0]) : NO_CLIP;
    data.set([c0, clips[0] ? (clips[0][1] === 'inside' ? 1 : 0) : 0, c1, clips[1] ? (clips[1][1] === 'inside' ? 1 : 0) : 0], T(6));
  });

  return { data, count: n, groupBound, groupRange, groupCount: builder.groups.length, names: builder.entries.map(e => e.name), habitus: P.habitus ?? 0 };
}

// ---------- evaluating the resolved table in JS ----------
function entrySdf(d, e, p, ctx) {
  const o = e * FLOATS;
  const kind = d[o];
  const flags = d[o + 2];
  let s;
  switch (kind) {
    case KIND.ELL: {
      const q = applyRows(d, o, sub(p, [d[o + 4], d[o + 5], d[o + 6]]));
      s = sdEllipsoid(q, [d[o + 8], d[o + 9], d[o + 10]]);
      break;
    }
    case KIND.BOX: {
      const q = applyRows(d, o, sub(p, [d[o + 4], d[o + 5], d[o + 6]]));
      const rnd = d[o + 28];
      const h = [d[o + 8] - rnd, d[o + 9] - rnd, d[o + 10] - rnd];
      const qq = [Math.abs(q[0]) - h[0], Math.abs(q[1]) - h[1], Math.abs(q[2]) - h[2]];
      s = Math.hypot(Math.max(qq[0], 0), Math.max(qq[1], 0), Math.max(qq[2], 0)) + Math.min(Math.max(qq[0], qq[1], qq[2]), 0) - rnd;
      break;
    }
    case KIND.CAP: {
      const a = [d[o + 4], d[o + 5], d[o + 6]];
      const b = [d[o + 8], d[o + 9], d[o + 10]];
      const k = d[o + 30];
      if (k === 1) { s = sdRoundCone(p, a, b, d[o + 28], d[o + 29]); break; }
      const st = v => [v[0], a[1] + (v[1] - a[1]) * k, v[2]];
      s = sdRoundCone(st(p), a, st(b), d[o + 28], d[o + 29]) / (1 + (k - 1) * 0.5);
      break;
    }
    case KIND.PLANE:
      s = dot([d[o + 8], d[o + 9], d[o + 10]], sub(p, [d[o + 4], d[o + 5], d[o + 6]]));
      break;
    case KIND.BAND: {
      const h = -ctx.body;
      const lo = d[o + 4] + d[o + 5] * ctx.antP + d[o + 6] * ctx.antN + d[o + 7] * ctx.lat;
      const hi = d[o + 8] + d[o + 9] * ctx.antP + d[o + 10] * ctx.antN + d[o + 11] * ctx.lat;
      s = Math.max(lo - h, h - hi, d[o + 28] - p[2], p[2] - d[o + 29], Math.abs(p[0]) - d[o + 30]);
      break;
    }
    case KIND.RIBS:
      s = sdRibs(p, d[o + 28], d[o + 29], d[o + 30], d[o + 31]);
      break;
    case KIND.CAGE:
      s = sdCage(p, d[o + 28]);
      break;
    case KIND.VERT:
      s = sdVert(p, {
        cx: d[o + 4], cy0: d[o + 5], zTop: d[o + 6], period: d[o + 7], rx: d[o + 8], ry: d[o + 9], rz: d[o + 10], count: d[o + 11],
        ky: d[o + 12], zRef: d[o + 13], ox: d[o + 14], oy: d[o + 15], oz: d[o + 16],
      });
      break;
    default: s = FAR;
  }
  if (flags & FLAG.SHELL) s = Math.abs(s) - d[o + 23] * 0.5;
  return s;
}

function applyRows(d, o, v) {
  return [
    d[o + 12] * v[0] + d[o + 13] * v[1] + d[o + 14] * v[2],
    d[o + 16] * v[0] + d[o + 17] * v[1] + d[o + 18] * v[2],
    d[o + 20] * v[0] + d[o + 21] * v[1] + d[o + 22] * v[2],
  ];
}

export function bodyContext(p, habitus) {
  const body = bodySdf(p, habitus);
  const z = clamp(p[2], BODY_KNOTS.z[0], BODY_KNOTS.z[BODY_KNOTS.z.length - 1]);
  const { A, B, yc } = bodyAt(z, habitus);
  const ant = clamp(-(p[1] - yc) / B, -1, 1);
  return { body, antP: Math.max(ant, 0), antN: Math.max(-ant, 0), lat: clamp(Math.abs(p[0]) / A, 0, 1) };
}

const cover = (s, edge) => clamp(0.5 - s / edge, 0, 1);

function coverage(res, e, p, ctx) {
  const d = res.data;
  const o = e * FLOATS;
  let c = cover(entrySdf(d, e, p, ctx), d[o + 3]);
  for (let k = 0; k < 2 && c > 0; k++) {
    const ref = d[o + 24 + k * 2];
    if (ref < 0) continue;
    const inside = d[o + 25 + k * 2] > 0.5;
    const cc = cover(entrySdf(d, ref, p, ctx), d[ref * FLOATS + 3]);
    c *= inside ? cc : 1 - cc;
  }
  return c;
}

// The tissue index and entry at a point, by painter's order. Returns { tissue, entry, cover } with cover the paint weight of the winner.
export function evaluate(res, p) {
  const ctx = bodyContext(p, res.habitus);
  const d = res.data;
  let tissue = -1;
  let entry = -1;
  let weight = 0;
  for (let g = 0; g < res.groupCount; g++) {
    const bx = res.groupBound[g * 4] - p[0];
    const by = res.groupBound[g * 4 + 1] - p[1];
    const bz = res.groupBound[g * 4 + 2] - p[2];
    const br = res.groupBound[g * 4 + 3];
    if (bx * bx + by * by + bz * bz > br * br) continue;
    const first = res.groupRange[g * 2];
    for (let e = first; e < first + res.groupRange[g * 2 + 1]; e++) {
      if (d[e * FLOATS + 2] & (FLAG.HIDDEN | FLAG.INACTIVE)) continue;
      const c = coverage(res, e, p, ctx);
      if (c > 0.5) {
        tissue = d[e * FLOATS + 1];
        entry = e;
        weight = c;
      }
    }
  }
  return { tissue, entry, cover: weight };
}

// Is the point inside the entry's shape (clips included)? Used by the scorer and tests for named structures.
export function inside(res, name, p) {
  const e = res.names.indexOf(name);
  if (e < 0) throw new Error(`no entry named ${name}`);
  return coverage(res, e, p, bodyContext(p, res.habitus)) > 0.5;
}
