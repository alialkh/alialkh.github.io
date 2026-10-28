// The 3D view of the patient and the probe. A separate WebGL context ray-marches the skin, draws the transducer and shows the imaging
// plane as a coloured anatomical cross-section, so a student sees where the beam is going. Dragging the probe on the body and
// orbiting the camera are handled here; the CPU picks the skin with the same outline function the shader marches.

import { Program, requireContext, drawFull, dataTexture, updateTexture, Target, programsReady } from './gl.js';
import { anatomyGlsl, MAX_GROUPS } from './anatomy-glsl.js';
import { TEXELS } from './anatomy.js';
import { TISSUES, tissueUniform, TISSUE_INDEX } from './tissues.js';
import { pickSkin } from './geometry.js';
import { PROBES } from './probes.js';

const D2R = Math.PI / 180;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => mul(a, 1 / Math.hypot(...a));

const UP = [0, -1, 0]; // anterior is up on the screen: the patient lies supine

export const VIEWS = {
  overview: { yaw: -58, pitch: 42, dist: 820, target: [0, -20, -90] },
  side: { yaw: 0, pitch: 14, dist: 860, target: [0, -20, -100] },
  top: { yaw: -90, pitch: 82, dist: 800, target: [0, -20, -90] },
  closeChest: { yaw: -80, pitch: 55, dist: 560, target: [20, -60, 20] },
  closeAbdomen: { yaw: -80, pitch: 55, dist: 560, target: [0, -60, -140] },
};

const FRAG = () => `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
${anatomyGlsl()}
uniform vec2 uRes;
uniform vec3 uEye;
uniform vec3 uRight;
uniform vec3 uUpV;
uniform vec3 uFwd;
uniform float uTanHalf;
uniform vec3 uO;
uniform vec3 uE;
uniform vec3 uN;
uniform vec3 uH;
uniform int uProbeType;
uniform float uProbeR;
uniform float uProbeTheta;
uniform float uProbeW;
uniform float uDepth;
uniform float uFace;      // width of the face in mm
uniform float uThick;     // height of the face across the plane in mm
uniform vec3 uColors[${TISSUES.length}];
uniform float uAlpha[${TISSUES.length}];
uniform float uCut;       // draw the anatomical cross-section in the imaging plane
uniform float uLit;       // 0 to 1, how much the probe is highlighted

const float TABLE = 115.0;

float sdBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a;
  vec3 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

// probe in its own frame: the face is the plane y = 0 and the body of the probe lies at negative y
vec3 toProbe(vec3 p) { vec3 d = p - uO; return vec3(dot(d, uE), dot(d, uN), dot(d, uH)); }

float sdProbe(vec3 p, out float part) {
  vec3 q = toProbe(p);
  float body = sdBox(q - vec3(0.0, -46.0, 0.0), vec3(uFace * 0.5 + 3.0, 46.0, uThick * 0.5 + 4.0), 9.0);
  float lens = sdBox(q - vec3(0.0, 1.0, 0.0), vec3(uFace * 0.5 + 1.0, 2.5, uThick * 0.5 + 2.0), 2.0);
  float neck = sdCapsule(q, vec3(0.0, -90.0, 0.0), vec3(0.0, -118.0, 0.0), 8.0);
  float cable = sdCapsule(q, vec3(0.0, -118.0, 0.0), vec3(0.0, -170.0, 40.0), 4.2);
  float cable2 = sdCapsule(q, vec3(0.0, -170.0, 40.0), vec3(0.0, -230.0, 190.0), 4.2);
  float mark = length(q - vec3(-uFace * 0.5 - 3.0, -20.0, 0.0)) - 3.6;
  float d = min(min(body, neck), min(cable, cable2));
  part = 0.0;
  if (lens < d) { d = lens; part = 1.0; }
  if (mark < d) { d = mark; part = 2.0; }
  if (min(cable, cable2) < min(body, neck)) part = 3.0;
  return d;
}

float sdTable(vec3 p) { return sdBox(p - vec3(0.0, TABLE + 34.0, -150.0), vec3(330.0, 30.0, 700.0), 10.0); }

// nearest of the body, the probe and the table: x is the distance, y says which one
vec2 map(vec3 p, out float part) {
  float db = sdBody(p);
  float dp = sdProbe(p, part);
  float dt = sdTable(p);
  vec2 r = vec2(db, 0.0);
  if (dp < r.x) r = vec2(dp, 1.0);
  if (dt < r.x) r = vec2(dt, 2.0);
  return r;
}

vec3 normalAt(vec3 p) {
  float part;
  const float e = 0.8;
  return normalize(vec3(
    map(p + vec3(e, 0, 0), part).x - map(p - vec3(e, 0, 0), part).x,
    map(p + vec3(0, e, 0), part).x - map(p - vec3(0, e, 0), part).x,
    map(p + vec3(0, 0, e), part).x - map(p - vec3(0, 0, e), part).x));
}

bool boxHit(vec3 ro, vec3 rd, out float t0, out float t1) {
  vec3 lo = vec3(-420.0, -260.0, -900.0);
  vec3 hi = vec3(420.0, 260.0, 560.0);
  vec3 inv = 1.0 / rd;
  vec3 a = (lo - ro) * inv;
  vec3 b = (hi - ro) * inv;
  vec3 tmin = min(a, b);
  vec3 tmax = max(a, b);
  t0 = max(max(tmin.x, tmin.y), max(tmin.z, 0.0));
  t1 = min(min(tmax.x, tmax.y), tmax.z);
  return t1 > t0;
}

// inside the fan of the imaging plane? returns s (0 to 1 across) and r (range, mm)
bool inFan(vec3 P, out float s, out float r) {
  vec3 d = P - uO;
  float u = dot(d, uE);
  float v = dot(d, uN);
  if (uProbeType == 0) {
    s = (u + 0.5 * uProbeW) / uProbeW;
    r = v;
  } else {
    float R = (uProbeType == 1) ? uProbeR : 0.0;
    float a = atan(u, v + R);
    s = (a + uProbeTheta) / (2.0 * uProbeTheta);
    r = length(vec2(u, v + R)) - R;
  }
  return s >= 0.0 && s <= 1.0 && r >= 0.0 && r <= uDepth;
}

void main() {
  vec2 ndc = vec2(vUv.x * 2.0 - 1.0, vUv.y * 2.0 - 1.0);
  float aspect = uRes.x / uRes.y;
  vec3 rd = normalize(uFwd + uRight * ndc.x * uTanHalf * aspect + uUpV * ndc.y * uTanHalf);
  vec3 ro = uEye;
  vec3 col = mix(vec3(0.05, 0.065, 0.085), vec3(0.09, 0.11, 0.14), vUv.y);
  float t0, t1;
  float tHit = -1.0;
  float which = -1.0;
  float part = 0.0;
  if (boxHit(ro, rd, t0, t1)) {
    float t = t0;
    for (int i = 0; i < 110; i++) {
      vec3 p = ro + rd * t;
      float pt;
      vec2 m = map(p, pt);
      if (m.x < 0.4) { tHit = t; which = m.y; part = pt; break; }
      t += max(m.x * 0.9, 0.5);
      if (t > t1) break;
    }
  }
  if (tHit > 0.0) {
    vec3 p = ro + rd * tHit;
    vec3 n = normalAt(p);
    vec3 base = vec3(0.78, 0.64, 0.56);
    if (which > 1.5) base = vec3(0.11, 0.14, 0.2);
    if (which > 0.5 && which < 1.5) {
      base = vec3(0.12, 0.13, 0.15);
      if (part > 0.5 && part < 1.5) base = vec3(0.45, 0.5, 0.56);
      if (part > 1.5 && part < 2.5) base = vec3(0.4, 1.0, 0.6);
      if (part > 2.5) base = vec3(0.07, 0.07, 0.08);
      base = mix(base, base + vec3(0.25, 0.22, 0.05), uLit * 0.6);
    }
    vec3 L = normalize(vec3(-0.3, -1.0, -0.45));
    float diff = max(dot(n, L), 0.0);
    float hemi = 0.5 + 0.5 * dot(n, vec3(0.0, -1.0, 0.0));
    vec3 H = normalize(L - rd);
    float spec = pow(max(dot(n, H), 0.0), which > 0.5 && which < 1.5 ? 40.0 : 14.0) * (which > 1.5 ? 0.05 : 0.35);
    col = base * (0.28 + 0.38 * hemi + 0.62 * diff) + spec;
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    col += vec3(0.18, 0.25, 0.35) * rim * 0.5;
  }
  // The imaging plane, seen through the skin.
  float dn = dot(rd, uH);
  if (abs(dn) > 1.0e-4) {
    float tp = dot(uO - ro, uH) / dn;
    if (tp > 0.0) {
      vec3 P = ro + rd * tp;
      float s, r;
      if (inFan(P, s, r)) {
        float behind = (tHit > 0.0 && tHit < tp && which < 0.5) ? 1.0 : 0.0;
        vec3 fan = vec3(0.35, 0.8, 0.95);
        float a = 0.16;
        if (uCut > 0.5) {
          Mat m = evalAnatomy(P);
          int lab = int(m.lab + 0.5);
          fan = mix(fan, uColors[lab], uAlpha[lab] > 0.2 ? 0.92 : 0.2);
          a = 0.2 + 0.7 * uAlpha[lab];
        }
        a *= mix(1.0, 0.82, behind);
        col = mix(col, fan, a);
        float edge = min(min(s, 1.0 - s) * 40.0, min(r, uDepth - r) * 0.5);
        col += vec3(0.1, 0.45, 0.5) * (1.0 - smoothstep(0.0, 1.2, edge)) * 0.9;
      }
    }
  }
  outColor = vec4(pow(col, vec3(0.92)), 1.0);
}`;

export class PatientView {
  constructor(canvas, { scale = 0.8 } = {}) {
    this.canvas = canvas;
    this.scale = scale;
    const gl = (this.gl = requireContext(canvas));
    this.vao = gl.createVertexArray();
    this.prog = new Program(gl, FRAG(), 'patient');
    this.tissue = tissueUniform();
    this.colors = new Float32Array(TISSUES.flatMap(t => [1, 3, 5].map(i => parseInt(t.color.slice(i, i + 2), 16) / 255)));
    // how opaque each tissue looks in the cross-section: organs and bone strongly, soft wall and fat faintly, gas and gel hardly
    const faint = new Set(['fat_sc', 'fat_visc', 'muscle', 'skin', 'fascia']);
    const none = new Set(['air', 'gel']);
    this.alpha = new Float32Array(TISSUES.map(t => (none.has(t.key) ? 0.05 : faint.has(t.key) ? 0.35 : 0.95)));
    this.cam = { ...VIEWS.overview };
    this.cut = true;
    this.lit = 0;
    this.anatomyTex = null;
    this.frame = null;
    this.probe = PROBES.C5;
    this.depth = 160;
    this.dirty = true;
  }

  ready(onProgress) {
    return programsReady([this.prog], onProgress);
  }

  setAnatomy(res) {
    const gl = this.gl;
    if (!this.anatomyTex || this.rows !== res.count) {
      if (this.anatomyTex) gl.deleteTexture(this.anatomyTex);
      this.anatomyTex = dataTexture(gl, TEXELS, res.count, res.data);
      this.rows = res.count;
    } else {
      updateTexture(gl, this.anatomyTex, TEXELS, res.count, res.data);
    }
    const bounds = new Float32Array(MAX_GROUPS * 4);
    bounds.set(res.groupBound);
    const ranges = new Int32Array(MAX_GROUPS * 2);
    ranges.set(res.groupRange);
    this.anatomyUniforms = { uGBound: bounds, uGRange: ranges, uGCount: res.groupCount, uTissue: this.tissue, uHabitus: res.habitus };
    this.dirty = true;
  }

  setProbe(frame, probe, depth) {
    this.frame = frame;
    this.probe = probe;
    this.depth = depth;
    this.dirty = true;
  }

  setCamera(patch) {
    Object.assign(this.cam, patch);
    this.cam.pitch = Math.max(-89, Math.min(89, this.cam.pitch));
    this.cam.dist = Math.max(250, Math.min(1800, this.cam.dist));
    this.dirty = true;
  }

  // Eye position and camera axes for the orbit camera.
  basis() {
    const { yaw, pitch, dist, target } = this.cam;
    const cp = Math.cos(pitch * D2R);
    const h = [Math.cos(yaw * D2R), 0, Math.sin(yaw * D2R)];
    const dir = add(mul(h, cp), mul(UP, Math.sin(pitch * D2R))); // from the target to the eye
    const eye = add(target, mul(dir, dist));
    const fwd = norm(sub(target, eye));
    const right = norm(cross(fwd, UP));
    const up = cross(right, fwd);
    return { eye, fwd, right, up };
  }

  fov = 38 * D2R;

  // The ray under a pixel, in world space, for picking.
  rayAt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const nx = ((clientX - r.left) / r.width) * 2 - 1;
    const ny = 1 - ((clientY - r.top) / r.height) * 2;
    const b = this.basis();
    const t = Math.tan(this.fov / 2);
    const aspect = r.width / r.height;
    const dir = norm(add(add(b.fwd, mul(b.right, nx * t * aspect)), mul(b.up, ny * t)));
    return { o: b.eye, d: dir };
  }

  // Where on the skin a pointer is, or null. The table and the probe do not count.
  pickSkin(clientX, clientY, habitus) {
    const ray = this.rayAt(clientX, clientY);
    const hit = pickSkin(ray.o, ray.d, habitus, 3000);
    return hit && hit.p[1] < 114 ? hit.p : null;
  }

  // Screen position (CSS px, relative to the canvas) of a world point, or null when behind the camera.
  project(p) {
    const b = this.basis();
    const d = sub(p, b.eye);
    const z = dot(d, b.fwd);
    if (z < 1) return null;
    const r = this.canvas.getBoundingClientRect();
    const t = Math.tan(this.fov / 2);
    const aspect = r.width / r.height;
    return [(0.5 + (dot(d, b.right) / (z * t * aspect)) * 0.5) * r.width, (0.5 - (dot(d, b.up) / (z * t)) * 0.5) * r.height];
  }

  resize(w, h, dpr = 1) {
    const f = this.scale * dpr;
    this.canvas.width = Math.max(2, Math.round(w * f));
    this.canvas.height = Math.max(2, Math.round(h * f));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.dirty = true;
  }

  render() {
    if (!this.dirty || !this.anatomyTex || !this.frame) return false;
    const gl = this.gl;
    const b = this.basis();
    const probe = this.probe;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.prog.use().set({
      ...this.anatomyUniforms,
      uRes: [this.canvas.width, this.canvas.height],
      uEye: b.eye, uRight: b.right, uUpV: b.up, uFwd: b.fwd, uTanHalf: Math.tan(this.fov / 2),
      uO: this.frame.o, uE: this.frame.e, uN: this.frame.n, uH: this.frame.h,
      uProbeType: probe.typeIndex, uProbeR: probe.radius, uProbeTheta: probe.halfAngle * D2R, uProbeW: probe.width ?? probe.footprint,
      uDepth: this.depth, uFace: probe.footprint, uThick: probe.elevation,
      uColors: this.colors, uAlpha: this.alpha, uCut: this.cut ? 1 : 0, uLit: this.lit,
    }).textures({ uAnat: this.anatomyTex });
    drawFull(gl, this.vao);
    this.dirty = false;
    return true;
  }
}

export { Target, TISSUE_INDEX };
