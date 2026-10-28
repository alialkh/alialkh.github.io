// GLSL twin of anatomy.js. It interprets the resolved table from a float texture, so the shader stays small however many entries there are.
// Everything numeric that anatomy.js owns (the body profile, the rib tables, the entry layout) is written into the source from the JS side,
// so there is one copy of each number. Keep the two evaluators in step: tools/pocus-shot.mjs --selftest compares them point by point.

import { BODY_KNOTS, RIB, CAGE, HABITUS, TABLE_Y, FLOATS, KIND, FLAG } from './anatomy.js';
import { TISSUES } from './tissues.js';

export const MAX_GROUPS = 40;

const f = x => (Number.isInteger(x) ? `${x}.0` : String(x));
const arr = (name, a) => `const float ${name}[${a.length}] = float[${a.length}](${a.map(f).join(', ')});`;

// A smooth curve through knots, same maths as hermite() in anatomy.js.
function hermite(name, xs, ys) {
  const n = xs.length;
  return `
${arr(`${name}_X`, xs)}
${arr(`${name}_Y`, ys)}
float ${name}_tan(int k) {
  int a = max(k - 1, 0);
  int b = min(k + 1, ${n - 1});
  return (${name}_Y[b] - ${name}_Y[a]) / (${name}_X[b] - ${name}_X[a]);
}
float ${name}(float x) {
  if (x <= ${name}_X[0]) return ${name}_Y[0];
  if (x >= ${name}_X[${n - 1}]) return ${name}_Y[${n - 1}];
  int i = 0;
  for (int k = 0; k < ${n - 2}; k++) if (x > ${name}_X[k + 1]) i = k + 1;
  float h = ${name}_X[i + 1] - ${name}_X[i];
  float t = (x - ${name}_X[i]) / h;
  float t2 = t * t;
  float t3 = t2 * t;
  return (2.0 * t3 - 3.0 * t2 + 1.0) * ${name}_Y[i] + (t3 - 2.0 * t2 + t) * h * ${name}_tan(i)
       + (-2.0 * t3 + 3.0 * t2) * ${name}_Y[i + 1] + (t3 - t2) * h * ${name}_tan(i + 1);
}`;
}

export function anatomyGlsl() {
  const k = BODY_KNOTS;
  return `
// ---- anatomy interpreter (generated from anatomy.js) ----
uniform highp sampler2D uAnat;
uniform vec4 uGBound[${MAX_GROUPS}];
uniform ivec2 uGRange[${MAX_GROUPS}];
uniform int uGCount;
uniform vec4 uTissue[${TISSUES.length * 2}];
uniform float uHabitus;

#define K_ELL 0
#define K_CAP 1
#define K_BOX 2
#define K_BAND 3
#define K_RIBS 4
#define K_VERT 5
#define K_PLANE 6
#define K_CAGE 7
const float FAR = 1.0e4;
const float TABLE_Y = ${f(TABLE_Y)};
const float D2R = 0.017453292519943295;

${hermite('bodyA', k.z, k.A)}
${hermite('bodyB', k.z, k.B)}
${hermite('bodyYc', k.z, k.yc)}
${hermite('bodyN', k.z, k.n)}
${hermite('ribG', RIB.gPsi, RIB.gVal)}
${arr('RIB_BONE_END', RIB.boneEnd)}
${arr('RIB_CART_END', RIB.cartEnd)}

vec4 anat(int e, int t) { return texelFetch(uAnat, ivec2(t, e), 0); }

float sdEllipsoid(vec3 q, vec3 r) {
  float k0 = length(q / r);
  float k1 = length(q / (r * r));
  if (k1 < 1.0e-9) return -min(r.x, min(r.y, r.z));
  return k0 * (k0 - 1.0) / k1;
}

float sgn(float x) { return x > 0.0 ? 1.0 : (x < 0.0 ? -1.0 : 0.0); }

float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
  vec3 ba = b - a;
  vec3 pa = p - a;
  float l2 = dot(ba, ba);
  if (l2 < 1.0e-9) return length(pa) - max(r1, r2);
  float rr = r1 - r2;
  if (abs(rr) < 1.0e-4) {
    float h = clamp(dot(pa, ba) / l2, 0.0, 1.0);
    return length(pa - ba * h) - r1;
  }
  float a2 = l2 - rr * rr;
  if (a2 <= 0.0) return length(pa) - max(r1, r2);
  float il2 = 1.0 / l2;
  float y = dot(pa, ba);
  float z = y - l2;
  vec3 xv = pa * l2 - ba * y;
  float x2 = dot(xv, xv);
  float y2 = y * y * l2;
  float z2 = z * z * l2;
  float kk = sgn(rr) * rr * rr * x2;
  if (sgn(z) * a2 * z2 > kk) return sqrt(x2 + z2) * il2 - r2;
  if (sgn(y) * a2 * y2 < kk) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

// The trunk. habitus grows the outline, the back stays on the table.
void bodyAt(float z, out float A, out float B, out float yc, out float n) {
  z = clamp(z, ${f(k.z[0])}, ${f(k.z[k.z.length - 1])});
  float w = clamp((60.0 - z) / 120.0, 0.0, 1.0);
  float dB = uHabitus * (${f(HABITUS.chestB)} + (${f(HABITUS.abdB)} - ${f(HABITUS.chestB)}) * w);
  float dA = uHabitus * (${f(HABITUS.chestA)} + (${f(HABITUS.abdA)} - ${f(HABITUS.chestA)}) * w);
  B = bodyB(z) + dB;
  A = bodyA(z) + dA;
  yc = bodyYc(z) - dB;
  n = bodyN(z);
}

float sdSuperEllipse(float x, float y, float A, float B, float n) {
  float ax = abs(x) / A + 1.0e-6;
  float ay = abs(y) / B + 1.0e-6;
  float q = pow(ax, n) + pow(ay, n);
  float rho = pow(q, 1.0 / n);
  float g = pow(q, 1.0 / n - 1.0) * length(vec2(pow(ax, n - 1.0) / A, pow(ay, n - 1.0) / B));
  return (rho - 1.0) / max(g, 1.0e-6);
}

float sdTorso(vec3 p) {
  float A, B, yc, n;
  bodyAt(p.z, A, B, yc, n);
  float d = sdSuperEllipse(p.x, p.y - yc, A, B, n);
  d = max(d, max(p.z - 322.0, -392.0 - p.z));
  return max(d, p.y - TABLE_Y);
}

float sdBody(vec3 p) {
  float d = sdTorso(p);
  d = min(d, sdEllipsoid(p - vec3(0.0, 22.0, 415.0), vec3(88.0, 100.0, 118.0)));
  d = min(d, sdRoundCone(p, vec3(0.0, 18.0, 300.0), vec3(0.0, 22.0, 385.0), 52.0, 46.8));
  d = min(d, max(sdRoundCone(p, vec3(-88.0, 12.0, -385.0), vec3(-78.0, 30.0, -760.0), 76.0, 52.0), p.y - TABLE_Y));
  d = min(d, max(sdRoundCone(p, vec3(88.0, 12.0, -385.0), vec3(78.0, 30.0, -760.0), 76.0, 52.0), p.y - TABLE_Y));
  return d;
}

// ---- ribs and cage ----
void cageAt(float z, out float yc, out float Ar, out float Br) {
  float dz = z - ${f(CAGE.zc)};
  yc = ${f(CAGE.yc)} + ${f(CAGE.kYc)} * dz;
  Ar = ${f(CAGE.Ar)} - ${f(CAGE.kA)} * dz * dz;
  Br = ${f(CAGE.Br)} - ${f(CAGE.kB)} * dz * dz;
}

float barrel(vec3 p, out float psi, out float Ar, out float Br) {
  float yc;
  cageAt(p.z, yc, Ar, Br);
  float x = abs(p.x) / Ar;
  float y = (p.y - yc) / Br;
  float rho = length(vec2(x, y)) + 1.0e-6;
  float g = length(vec2(x / Ar, y / Br)) / rho;
  psi = atan(x, y) / D2R;
  return (rho - 1.0) / max(g, 1.0e-6);
}

float sdRibs(vec3 p, float part, float hz, float hr, float rnd) {
  float psi, Ar, Br;
  float d = barrel(p, psi, Ar, Br);
  float nCont = (${f(RIB.ztop)} - p.z + ${f(RIB.drop)} * ribG(psi)) / ${f(RIB.spacing)} + 1.0;
  float n = floor(nCont + 0.5);
  if (n < 1.0 || n > ${f(RIB.count)}) return FAR;
  int ni = int(n) - 1;
  float lo = part < 0.5 ? ${f(RIB.psi0)} : RIB_BONE_END[ni];
  float hi = part < 0.5 ? RIB_BONE_END[ni] : RIB_CART_END[ni];
  if (hi <= lo) return FAR;
  float dz = (nCont - n) * ${f(RIB.spacing)} * 0.85;
  float along = max(psi - hi, lo - psi) * D2R * sqrt(Ar * Br);
  vec2 q = vec2(abs(dz) - hz, abs(d) - hr);
  float box = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rnd;
  return max(box, along);
}

float sdVert(vec3 p, vec4 t1, vec4 t2, vec4 t3, vec4 t4) {
  float period = t1.w;
  float i = clamp(floor((t1.z - p.z) / period + 0.5), 0.0, t2.w - 1.0);
  float zc = t1.z - i * period;
  float cy = t1.y + t3.x * (zc - t3.y) * (zc - t3.y);
  return sdEllipsoid(vec3(p.x - t1.x - t3.z, p.y - cy - t3.w, p.z - zc - t4.x), t2.xyz);
}

struct BodyCtx { float body; float antP; float antN; float lat; };

BodyCtx bodyCtx(vec3 p) {
  BodyCtx c;
  c.body = sdBody(p);
  float A, B, yc, n;
  bodyAt(p.z, A, B, yc, n);
  float ant = clamp(-(p.y - yc) / B, -1.0, 1.0);
  c.antP = max(ant, 0.0);
  c.antN = max(-ant, 0.0);
  c.lat = clamp(abs(p.x) / A, 0.0, 1.0);
  return c;
}

float entrySdf(int e, vec3 p, BodyCtx ctx) {
  vec4 t0 = anat(e, 0);
  int kind = int(t0.x + 0.5);
  int flags = int(t0.z + 0.5);
  float s = FAR;
  if (kind == K_ELL) {
    vec3 d = p - anat(e, 1).xyz;
    vec3 q = vec3(dot(anat(e, 3).xyz, d), dot(anat(e, 4).xyz, d), dot(anat(e, 5).xyz, d));
    s = sdEllipsoid(q, anat(e, 2).xyz);
  } else if (kind == K_CAP) {
    vec4 t1 = anat(e, 1);
    vec4 t2 = anat(e, 2);
    vec4 t7 = anat(e, 7);
    float k = t7.z;
    if (k == 1.0) {
      s = sdRoundCone(p, t1.xyz, t2.xyz, t7.x, t7.y);
    } else {
      vec3 pp = vec3(p.x, t1.y + (p.y - t1.y) * k, p.z);
      vec3 bb = vec3(t2.x, t1.y + (t2.y - t1.y) * k, t2.z);
      s = sdRoundCone(pp, t1.xyz, bb, t7.x, t7.y) / (1.0 + (k - 1.0) * 0.5);
    }
  } else if (kind == K_BOX) {
    vec3 d = p - anat(e, 1).xyz;
    vec3 q = vec3(dot(anat(e, 3).xyz, d), dot(anat(e, 4).xyz, d), dot(anat(e, 5).xyz, d));
    float rnd = anat(e, 7).x;
    vec3 h = anat(e, 2).xyz - rnd;
    vec3 qq = abs(q) - h;
    s = length(max(qq, 0.0)) + min(max(qq.x, max(qq.y, qq.z)), 0.0) - rnd;
  } else if (kind == K_BAND) {
    vec4 lo4 = anat(e, 1);
    vec4 hi4 = anat(e, 2);
    vec4 t7 = anat(e, 7);
    float h = -ctx.body;
    float lo = lo4.x + lo4.y * ctx.antP + lo4.z * ctx.antN + lo4.w * ctx.lat;
    float hi = hi4.x + hi4.y * ctx.antP + hi4.z * ctx.antN + hi4.w * ctx.lat;
    s = max(max(lo - h, h - hi), max(max(t7.x - p.z, p.z - t7.y), abs(p.x) - t7.z));
  } else if (kind == K_RIBS) {
    vec4 t7 = anat(e, 7);
    s = sdRibs(p, t7.x, t7.y, t7.z, t7.w);
  } else if (kind == K_CAGE) {
    float psi, Ar, Br;
    s = barrel(p, psi, Ar, Br) + anat(e, 7).x;
  } else if (kind == K_VERT) {
    s = sdVert(p, anat(e, 1), anat(e, 2), anat(e, 3), anat(e, 4));
  } else if (kind == K_PLANE) {
    s = dot(anat(e, 2).xyz, p - anat(e, 1).xyz);
  }
  if ((flags & ${FLAG.SHELL}) != 0) s = abs(s) - anat(e, 5).w * 0.5;
  return s;
}

float cover(float s, float edge) { return clamp(0.5 - s / edge, 0.0, 1.0); }

// What the painter's algorithm leaves at a point.
struct Mat {
  float lnz;    // ln of the acoustic impedance in MRayl
  float alpha;  // dB per cm per MHz
  float mu;     // backscatter in dB re liver
  float het;
  float septa;
  float gas;
  float lab;    // tissue index of the winning entry
  vec3 disp;    // rigid motion of the winning entry since the rest pose
};

void tissueProps(int id, inout Mat m, float c) {
  vec4 a = uTissue[id * 2];
  vec4 b = uTissue[id * 2 + 1];
  m.lnz = mix(m.lnz, a.x, c);
  m.alpha = mix(m.alpha, a.y, c);
  m.mu = mix(m.mu, a.z, c);
  m.het = mix(m.het, a.w, c);
  m.septa = mix(m.septa, b.x, c);
  m.gas = mix(m.gas, b.y, c);
}

Mat evalAnatomy(vec3 p) {
  BodyCtx ctx = bodyCtx(p);
  Mat m;
  m.lnz = uTissue[0].x; m.alpha = uTissue[0].y; m.mu = uTissue[0].z; m.het = uTissue[0].w;
  m.septa = uTissue[1].x; m.gas = uTissue[1].y; m.lab = 0.0; m.disp = vec3(0.0);
  int win = -1;
  for (int g = 0; g < uGCount; g++) {
    vec4 bound = uGBound[g];
    vec3 dd = p - bound.xyz;
    if (dot(dd, dd) > bound.w * bound.w) continue;
    ivec2 range = uGRange[g];
    for (int e = range.x; e < range.x + range.y; e++) {
      vec4 t0 = anat(e, 0);
      int flags = int(t0.z + 0.5);
      if ((flags & ${FLAG.HIDDEN | FLAG.INACTIVE}) != 0) continue;
      float c = cover(entrySdf(e, p, ctx), t0.w);
      if (c <= 0.0) continue;
      vec4 t6 = anat(e, 6);
      int c0 = int(t6.x);
      if (c0 >= 0) {
        float cc = cover(entrySdf(c0, p, ctx), anat(c0, 0).w);
        c *= t6.y > 0.5 ? cc : 1.0 - cc;
      }
      int c1 = int(t6.z);
      if (c1 >= 0 && c > 0.0) {
        float cc = cover(entrySdf(c1, p, ctx), anat(c1, 0).w);
        c *= t6.w > 0.5 ? cc : 1.0 - cc;
      }
      if (c <= 0.0) continue;
      int tissue = int(t0.y + 0.5);
      tissueProps(tissue, m, c);
      if (c > 0.5) { m.lab = float(tissue); win = e; }
    }
  }
  if (win >= 0) m.disp = anat(win, 8).xyz;
  return m;
}
`;
}

// Layout facts the host needs when it uploads the table.
export const TABLE = { width: FLOATS / 4, kinds: KIND };
