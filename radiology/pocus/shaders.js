// The fragment shaders of the B-mode pipeline. Each is one pass over the beam space grid: one column per scan line, one row per sample in depth.
//
//   line       where each line enters the body, and whether the face is coupled to the skin by gel
//   sample     the anatomy under each sample: impedance, attenuation, and the random scatterers that make speckle
//   interface  reflection at impedance steps, with its dependence on the angle of incidence, and the loss each step costs
//   scan       running sum of that loss down each line, the attenuation seen by every depth
//   axial      the pulse: scatterers and echoes filtered over the pulse length
//   summary    per line, where the first air interface is, for the lung and gas artefacts
//   echo       the beam width across lines, the artefacts, and the envelope of the echo
//   level      noise, gain, depth compensation, TGC and the dynamic range
//   post       persistence, smoothing and the grey map
//   display    scan conversion to the screen
//
// Amplitudes are relative to the mean echo of liver parenchyma, which is 1.

import { anatomyGlsl } from './anatomy-glsl.js';
import { TISSUES, TISSUE_INDEX } from './tissues.js';

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DArray;
in vec2 vUv;
`;

const PROBE = `
uniform int uProbeType;
uniform float uProbeR;
uniform float uProbeTheta;
uniform float uProbeW;
uniform vec3 uO;
uniform vec3 uE;
uniform vec3 uN;
uniform vec3 uH;
uniform float uDepth;
uniform int uNL;
uniform int uNR;

void lineGeom(float k, out vec2 o, out vec2 d) {
  float s = (k + 0.5) / float(uNL);
  if (uProbeType == 0) {
    o = vec2(-0.5 * uProbeW + uProbeW * s, 0.0);
    d = vec2(0.0, 1.0);
  } else {
    float a = -uProbeTheta + 2.0 * uProbeTheta * s;
    d = vec2(sin(a), cos(a));
    o = (uProbeType == 1) ? vec2(uProbeR * sin(a), uProbeR * (cos(a) - 1.0)) : vec2(0.0);
  }
}

vec3 worldAt(vec2 uv) { return uO + uE * uv.x + uN * uv.y; }

float pitchAt(float r) {
  if (uProbeType == 0) return uProbeW / float(uNL);
  float R = (uProbeType == 1) ? uProbeR : 0.0;
  return (r + R) * 2.0 * uProbeTheta / float(uNL);
}
`;

const BEAM = `
uniform float uFreqEff;   // MHz, what the pulse resolves like
uniform float uAttF;      // MHz, what the attenuation is computed with
uniform float uAperture;
uniform float uElevation;
uniform float uElevFocus;
uniform float uFocus;
uniform int uZones;
uniform float uLatScale;

const float MIN_FN = 1.6;
float lamOf(float f) { return 1.54 / f; }

float txWidth(float r, float F, float D, float f) {
  float lam = lamOf(f);
  float Deff = min(D, F / MIN_FN);
  float fn = F / Deff;
  float w0 = 1.02 * lam * fn;
  float zR = 3.6 * lam * fn * fn;
  float q = (r - F) / zR;
  return min(w0 * sqrt(1.0 + q * q), D * 1.2);
}

float rxWidth(float r, float D, float f) {
  float lam = lamOf(f);
  float Deff = min(D, r / MIN_FN);
  return 1.02 * lam * (r / max(Deff, 0.5));
}

float beamWidth(float r) {
  float best = 1.0e9;
  for (int z = 0; z < 3; z++) {
    if (z >= uZones) break;
    float F = uFocus * (1.0 + 0.55 * float(z));
    best = min(best, txWidth(r, F, uAperture, uFreqEff));
  }
  float rx = rxWidth(r, uAperture, uFreqEff);
  return uLatScale * best * rx / length(vec2(best, rx));
}

float sliceT(float r) {
  float lam = lamOf(uFreqEff);
  float fn = uElevFocus / uElevation;
  float w0 = 1.02 * lam * fn;
  float zR = 3.6 * lam * fn * fn;
  float q = (r - uElevFocus) / zR;
  return min(w0 * sqrt(1.0 + q * q), uElevation * 1.1);
}
`;

const NOISE = `
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}

float byteOf(uint v, uint shift) { return float((v >> shift) & 255u); }

// Two independent unit gaussians from one hash, each the sum of six bytes (close enough to normal for speckle).
vec2 gpair(ivec3 c) {
  uvec3 h = pcg3d(uvec3(c + ivec3(100000)));
  float a = byteOf(h.x, 0u) + byteOf(h.x, 8u) + byteOf(h.x, 16u) + byteOf(h.x, 24u) + byteOf(h.y, 0u) + byteOf(h.y, 8u);
  float b = byteOf(h.y, 16u) + byteOf(h.y, 24u) + byteOf(h.z, 0u) + byteOf(h.z, 8u) + byteOf(h.z, 16u) + byteOf(h.z, 24u);
  return (vec2(a, b) / 255.0 - 3.0) * 1.4142136;
}

// Smooth noise with unit variance, so a point moves through it continuously.
vec2 cnoise(vec3 q) {
  vec3 i = floor(q);
  vec3 f = q - i;
  vec3 w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 acc = vec2(0.0);
  float w2 = 0.0;
  for (int c = 0; c < 8; c++) {
    ivec3 o = ivec3(c & 1, (c >> 1) & 1, (c >> 2) & 1);
    float wc = (o.x == 1 ? w.x : 1.0 - w.x) * (o.y == 1 ? w.y : 1.0 - w.y) * (o.z == 1 ? w.z : 1.0 - w.z);
    acc += wc * gpair(ivec3(i) + o);
    w2 += wc * wc;
  }
  return acc * inversesqrt(w2);
}

float hash11(uint x) {
  uvec3 h = pcg3d(uvec3(x, x * 7u + 13u, x ^ 0x9e3779b9u));
  return float(h.x & 65535u) / 65535.0;
}
`;

export const VERTEX_NAMES = ['line', 'sample'];

// ---- pass: line ----
export const lineShader = () => `${HEAD}
${PROBE}
${anatomyGlsl()}
uniform float uGapMax;
out vec4 outColor;
void main() {
  int k = int(gl_FragCoord.x);
  vec2 o, d;
  lineGeom(float(k), o, d);
  float gap = sdBody(worldAt(o));
  float rEntry = 1.0e4;
  if (gap < 0.0) {
    rEntry = 0.0;
  } else {
    float r = 0.0;
    for (int i = 0; i < 500; i++) {
      float s = sdBody(worldAt(o + d * r));
      if (s < 0.0) {
        float lo = max(r - 4.0, 0.0);
        float hi = r;
        for (int j = 0; j < 8; j++) {
          float mid = 0.5 * (lo + hi);
          if (sdBody(worldAt(o + d * mid)) < 0.0) hi = mid; else lo = mid;
        }
        rEntry = hi;
        break;
      }
      r += clamp(s * 0.6, 0.5, 4.0);
      if (r > uDepth + 4.0) break;
    }
  }
  outColor = vec4(rEntry, rEntry <= uGapMax ? 1.0 : 0.0, gap, 0.0);
}`;

// ---- pass: sample ----
export const sampleShader = () => `${HEAD}
${PROBE}
${BEAM}
${NOISE}
${anatomyGlsl()}
uniform sampler2D uLine;
uniform float uCell;       // mm, lattice spacing of the scatterer field
uniform int uLabGel;
uniform int uLabAir;
layout(location = 0) out vec4 outA;
layout(location = 1) out vec4 outB;

// The echo coming from one point: the scatterers there, with the tissue's own slow texture and its thin bright sheets.
vec2 scatter(Mat m, vec3 P) {
  vec3 q = P - m.disp;
  float mu = m.mu;
  if (m.het > 0.0 || m.septa > 0.0) {
    vec2 ns = cnoise(q * 0.22);
    mu += m.het * ns.x * 0.7;
    mu += m.septa * 13.0 * smoothstep(0.32, 0.0, abs(ns.y));
  }
  float amp = pow(10.0, mu * 0.05) * 0.7071068;
  return amp * cnoise(q / uCell);
}

void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  int k = ip.x;
  int i = ip.y;
  float dr = uDepth / float(uNR);
  float r = (float(i) + 0.5) * dr;
  vec4 L = texelFetch(uLine, ivec2(k, 0), 0);
  if (r < L.x) {
    // In front of the skin: gel when the face is coupled, air when it is not.
    if (L.y > 0.5) {
      outA = vec4(0.0, 0.0, uTissue[uLabGel * 2].x, 0.0);
      outB = vec4(0.0, 0.0, 0.0, float(uLabGel));
    } else {
      outA = vec4(0.0, 0.0, uTissue[uLabAir * 2].x, 0.0);
      outB = vec4(0.0, 0.0, 1.0, float(uLabAir));
    }
    return;
  }
  vec2 o, d;
  lineGeom(float(k), o, d);
  vec3 P = worldAt(o + d * r);
  vec3 latW = uE * d.y - uN * d.x;
  float sigEl = sliceT(r) / 2.355;
  // The point, a little to the side, and a little either way across the slice. One call in a loop, not four, so the driver builds the
  // large evaluator once (the count is read from a uniform so that it cannot unroll the loop again).
  Mat m0, ml, mp, mm;
  int nm = uGCount >= 0 ? 4 : 0;
  for (int s = 0; s < nm; s++) {
    vec3 q = s == 0 ? P : (s == 1 ? P + latW * 0.35 : (s == 2 ? P + uH * sigEl : P - uH * sigEl));
    Mat m = evalAnatomy(q);
    if (s == 0) m0 = m; else if (s == 1) ml = m; else if (s == 2) mp = m; else mm = m;
  }
  vec2 s = 0.6 * scatter(m0, P) + 0.566 * (scatter(mp, P + uH * sigEl) + scatter(mm, P - uH * sigEl));
  float att = m0.alpha * uAttF * (dr / 10.0) * 0.23026;
  float gl = (ml.lnz - m0.lnz) / 0.35;
  float ge = (mp.lnz - mm.lnz) / (2.0 * sigEl);
  outA = vec4(s, m0.lnz, att);
  outB = vec4(gl, ge, m0.gas, m0.lab);
}`;

// ---- pass: interface ----
export const interfaceShader = () => `${HEAD}
uniform sampler2D uA;
uniform sampler2D uB;
uniform float uDepth;
uniform int uNR;
uniform float uLnZGel;
uniform float uSpecK;     // echo of a perfect interface relative to liver speckle
uniform float uPowerAmp;
out vec4 outColor;
void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec4 a = texelFetch(uA, ip, 0);
  vec4 b = texelFetch(uB, ip, 0);
  float prev = (ip.y > 0) ? texelFetch(uA, ivec2(ip.x, ip.y - 1), 0).z : uLnZGel;
  float dl = a.z - prev;
  float rc = tanh(0.5 * dl);                 // amplitude reflection coefficient
  float R = min(rc * rc, 0.9999);
  float iface = -log(1.0 - R);               // round trip loss of a step, in nepers
  float dr = uDepth / float(uNR);
  float gb = dl / dr;
  float cosT = abs(gb) / sqrt(gb * gb + b.x * b.x + b.y * b.y + 1.0e-8);
  float th = acos(min(cosT, 1.0));
  float g = 0.12 + 0.88 * exp(-(th * th) / 0.04);   // returns to the probe only when the surface faces it
  outColor = vec4(a.w + iface, uSpecK * abs(rc) * g * uPowerAmp, b.z, b.w);
}`;

// ---- passes: scan (running sum of loss along each line) ----
export const scanInitShader = () => `${HEAD}
uniform sampler2D uB;
out vec4 outColor;
void main() { outColor = vec4(texelFetch(uB, ivec2(gl_FragCoord.xy), 0).x, 0.0, 0.0, 1.0); }`;

export const scanStepShader = () => `${HEAD}
uniform sampler2D uPrev;
uniform int uStride;
out vec4 outColor;
void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  float v = texelFetch(uPrev, ip, 0).x;
  if (ip.y >= uStride) v += texelFetch(uPrev, ivec2(ip.x, ip.y - uStride), 0).x;
  outColor = vec4(v, 0.0, 0.0, 1.0);
}`;

// ---- pass: axial (the pulse) ----
export const axialShader = () => `${HEAD}
uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uScan;
uniform int uNR;
uniform float uSigAx;     // pulse sigma in samples
uniform float uEdge;      // width of the soft edge of every shape, in samples
out vec4 outColor;
void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  int k = ip.x;
  int i = ip.y;
  float sa = max(uSigAx, 1.0e-3);
  int J = int(min(ceil(3.0 * sa), 24.0));
  vec2 acc = vec2(0.0);
  float sp = 0.0;
  float w2 = 0.0;
  for (int j = -24; j <= 24; j++) {
    if (abs(j) > J) continue;
    int ii = i + j;
    if (ii < 0 || ii >= uNR) continue;
    float w = exp(-0.5 * float(j * j) / (sa * sa));
    vec4 a = texelFetch(uA, ivec2(k, ii), 0);
    vec4 b = texelFetch(uB, ivec2(k, ii), 0);
    float C = texelFetch(uScan, ivec2(k, ii), 0).x - 0.5 * b.x;
    float tr = exp(-C);
    acc += w * a.xy * tr;
    sp += w * b.y * tr;
    w2 += w * w;
  }
  vec4 bc = texelFetch(uB, ip, 0);
  float Cc = texelFetch(uScan, ip, 0).x - 0.5 * bc.x;
  // A step in impedance is spread over uEdge samples by the soft edge, so a pulse shorter than that adds up only part of it. Real
  // interfaces are sharp, so give back what the pulse would have summed.
  float edgeGain = max(1.0, uEdge / (2.5066 * sa));
  outColor = vec4(acc * inversesqrt(w2), sp * edgeGain, Cc);
}`;

// ---- pass: summary (one row, per line) ----
export const summaryShader = () => `${HEAD}
${PROBE}
${NOISE}
${anatomyGlsl()}
uniform sampler2D uLine;
uniform sampler2D uB;
uniform sampler2D uD;
uniform float uLabAir;
uniform float uLabLung;
uniform float uLabPtx;
uniform float uLabLiver;
uniform float uLabSpleen;
uniform vec3 uSlide;       // how far the lung has slid against the chest wall
uniform float uBlines;     // 0 to 1, how many lung surface sites throw a B-line
layout(location = 0) out vec4 outA;
layout(location = 1) out vec4 outB;
layout(location = 2) out vec4 outC;

float lnzAt(vec3 p) { return evalAnatomy(p).lnz; }

void main() {
  int k = int(gl_FragCoord.x);
  vec4 L = texelFetch(uLine, ivec2(k, 0), 0);
  float dr = uDepth / float(uNR);
  vec4 res = vec4(-1.0, 0.0, 0.0, 0.0);
  float labBefore = 0.0;
  if (L.y > 0.5) {
    float prevGas = 0.0;
    for (int i = 0; i < 2048; i++) {
      if (i >= uNR) break;
      float r = (float(i) + 0.5) * dr;
      if (r < L.x + 1.5) continue;
      vec4 bb = texelFetch(uB, ivec2(k, i), 0);
      bool air = abs(bb.w - uLabAir) < 0.5;
      float gas = air ? 0.0 : bb.z;
      if (gas > 0.5 && prevGas <= 0.5) {
        float a = 0.0;
        for (int j = -3; j <= 3; j++) a = max(a, texelFetch(uD, ivec2(k, clamp(i + j, 0, uNR - 1)), 0).z);
        float cls = abs(bb.w - uLabLung) < 0.5 ? 1.0 : (abs(bb.w - uLabPtx) < 0.5 ? 3.0 : 2.0);
        res = vec4(r, a, texelFetch(uD, ivec2(k, i), 0).w, cls);
        labBefore = texelFetch(uB, ivec2(k, max(i - 3, 0)), 0).w;
        break;
      }
      prevGas = gas;
    }
  }
  vec4 res2 = vec4(0.0, 1.0, 0.0, 0.0);
  if (res.x > 0.0) {
    vec2 o, d;
    lineGeom(float(k), o, d);
    vec3 Pp = worldAt(o + d * res.x);
    float slides = res.w < 1.5 ? 1.0 : 0.0;           // only aerated lung slides on the chest wall
    vec3 qp = Pp - uSlide * slides;
    // The pleural line shimmers as the lung slides under it.
    res2.y = clamp(1.0 + 0.4 * cnoise(qp * 0.45).x * slides, 0.2, 2.0);
    if (res.w < 1.5 && uBlines > 0.0) {
      vec2 sc = abs(Pp.x) > 80.0 ? qp.yz : qp.xz;
      vec2 g = sc / 7.0;
      ivec2 c = ivec2(floor(g));
      float best = 0.0;
      for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
        ivec2 cc = c + ivec2(dx, dy);
        uvec3 h = pcg3d(uvec3(uint(cc.x + 5000), uint(cc.y + 5000), 77u));
        float u = float(h.x & 65535u) / 65535.0;
        if (u < uBlines) {
          vec2 jit = vec2(float((h.y >> 8u) & 255u), float(h.z & 255u)) / 255.0 - 0.5;
          vec2 ctr = (vec2(cc) + 0.5 + 0.4 * jit) * 7.0;
          float dd = length(sc - ctr);
          best = max(best, exp(-0.5 * dd * dd / (1.5 * 1.5)));
        }
      }
      res2.x = best;
    }
  }
  // Mirror: a solid organ against aerated lung reflects almost everything, so the beam turns back into the organ and what it
  // finds there is drawn behind the interface. Only a smooth organ surface does this: the diaphragm under the liver or spleen.
  vec4 res3 = vec4(0.0);
  if (res.x > 0.0 && res.w < 1.5 && (abs(labBefore - uLabLiver) < 0.5 || abs(labBefore - uLabSpleen) < 0.5)) {
    vec2 o, d;
    lineGeom(float(k), o, d);
    vec3 Pp = worldAt(o + d * res.x);
    vec3 dW = uE * d.x + uN * d.y;
    const float e = 1.6;
    // central differences along x, y and z: six evaluations through one call site (see the sample pass for why)
    vec3 g = vec3(0.0);
    int ns = uGCount >= 0 ? 6 : 0;
    for (int s = 0; s < ns; s++) {
      int ax = s >> 1;
      float sg = (s & 1) == 0 ? 1.0 : -1.0;
      vec3 d = ax == 0 ? vec3(e, 0.0, 0.0) : (ax == 1 ? vec3(0.0, e, 0.0) : vec3(0.0, 0.0, e));
      g[ax] += sg * lnzAt(Pp + sg * d);
    }
    if (length(g) > 0.5) {
      vec3 n = normalize(g);
      float cosI = abs(dot(dW, n));
      // grazing incidence sends the beam off sideways, out of the plane, rather than back
      res3 = vec4(dW - 2.0 * dot(dW, n) * n, smoothstep(0.25, 0.7, cosI));
    }
  }
  outA = res;
  outB = res2;
  outC = res3;
}`;

// ---- pass: echo (lateral beam, artefacts, envelope) ----
export const echoShader = () => `${HEAD}
${PROBE}
${BEAM}
${NOISE}
${anatomyGlsl()}
uniform sampler2D uD;
uniform sampler2D uSumA;
uniform sampler2D uSumB;
uniform sampler2D uSumC;
uniform sampler2D uB;
uniform float uMirror;
uniform float uSigAxMm;
uniform float uTime;
uniform vec3 uSlide;
uniform float uLungHaze;
uniform float uCell;
uniform float uClutter;    // power of the faint veil relative to the surrounding echo
uniform float uDgcPerMm;
uniform float uDgcMax;
out vec4 outColor;

void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  int k = ip.x;
  int i = ip.y;
  float dr = uDepth / float(uNR);
  float r = (float(i) + 0.5) * dr;
  float w = beamWidth(r);
  float sg = max((w / 2.355) / pitchAt(r), 0.0001);
  int M = int(min(ceil(3.0 * sg), 16.0));
  vec2 acc = vec2(0.0);
  float sp = 0.0;
  float wsum = 0.0;
  float w2 = 0.0;
  float bl = 0.0;
  for (int m = -16; m <= 16; m++) {
    if (abs(m) > M) continue;
    int kk = k + m;
    if (kk < 0 || kk >= uNL) continue;
    float wt = exp(-0.5 * float(m * m) / (sg * sg));
    vec4 d = texelFetch(uD, ivec2(kk, i), 0);
    acc += wt * d.xy;
    sp += wt * d.z;
    wsum += wt;
    w2 += wt * wt;
    bl += wt * texelFetch(uSumB, ivec2(kk, 0), 0).x;
  }
  vec2 iq = acc * inversesqrt(w2);
  float spec = sp / wsum;
  bl /= wsum;
  float env2 = dot(iq, iq) + spec * spec;

  // Veil in shadows and cysts: far side lobes carry a little of the echo of lines well away. (The haze of the first centimetres,
  // reverberation between the face, the skin and the fat, is added after depth compensation, in the level pass.)
  float wide = 0.0;
  float nw = 0.0;
  for (int m = -12; m <= 12; m++) {
    int kk = k + m * 4;
    if (kk < 0 || kk >= uNL) continue;
    vec4 d = texelFetch(uD, ivec2(kk, i), 0);
    wide += dot(d.xy, d.xy) + d.z * d.z;
    nw += 1.0;
  }
  vec2 hz0 = gpair(ivec3(k, i, 31)) * 0.7;
  env2 += uClutter * (wide / max(nw, 1.0)) * (0.5 + 0.5 * length(hz0));

  // Artefacts that hang off the first air interface of the line: reverberation, B-lines, and the haze of sliding lung.
  vec4 S = texelFetch(uSumA, ivec2(k, 0), 0);
  vec4 S2 = texelFetch(uSumB, ivec2(k, 0), 0);
  if (S.x > 0.0) {
    float sigP = max(uSigAxMm * 1.4, 0.35);
    float cls = S.w;
    float A = S.y * S2.y;
    float rho = 0.6 * exp(-S.z);
    float mask = 1.0 - clamp(bl * 1.3, 0.0, 1.0);
    float art = 0.0;
    for (int n = 2; n <= 6; n++) {
      float rn = S.x * float(n);
      if (rn > uDepth + 20.0) break;
      if (cls > 1.5 && cls < 2.5 && n > 3) break;       // gas in the bowel reverberates less regularly
      A *= rho;
      float dd = (r - rn) / sigP;
      art += A * exp(-0.5 * dd * dd);
    }
    if (cls < 2.5 || cls > 2.5) art *= (cls > 2.5 ? 1.0 : mask);
    float below = r - S.x;
    if (below > 0.0) {
      vec2 o, d;
      lineGeom(float(k), o, d);
      vec3 Pb = worldAt(o + d * r);
      float slides = cls < 1.5 ? 1.0 : 0.0;
      vec3 qb = Pb - uSlide * slides;
      // The haze below an air interface is not echo from tissue, so it is set against the pleural line as displayed: depth
      // compensation (which lifts what is deeper) is taken back out, leaving a fixed ratio that fades with distance.
      float comp = pow(10.0, -0.05 * (min(uDgcPerMm * r, uDgcMax) - min(uDgcPerMm * S.x, uDgcMax)));
      float hazeAmp = S.y * 0.04 * exp(-below / 30.0) * comp;
      if (cls > 1.5 && cls < 2.5) hazeAmp = S.y * 0.09 * exp(-below / 14.0) * comp;
      vec2 hz = cnoise(qb / 0.4);
      art += hazeAmp * length(hz) * 0.8 * uLungHaze;
      // B-lines run from the pleural line to the bottom of the screen
      art += S.y * 0.5 * bl * exp(-below / 260.0) * (cls < 1.5 ? 1.0 : 0.0);
    }
    env2 += art * art;

    // the mirror image of the organ, behind the interface
    vec4 Mg = texelFetch(uSumC, ivec2(k, 0), 0);
    if (Mg.w > 0.0 && below > 0.0 && cls < 1.5 && uMirror > 0.0) {
      vec2 o, d;
      lineGeom(float(k), o, d);
      vec3 Pp = worldAt(o + d * S.x);
      vec3 Pg = Pp + normalize(Mg.xyz) * below;
      if (sdBody(Pg) < -2.0) {
        Mat g = evalAnatomy(Pg);
        if (g.gas < 0.5) {
          vec2 sn = cnoise((Pg - g.disp) / max(uCell * 2.4, uSigAxMm * 3.2));
          float att = 0.2303 * 0.55 * uAttF * below / 10.0;
          float amp = pow(10.0, g.mu * 0.05) * 0.7071 * length(sn) * 0.55 * Mg.w * exp(-(S.z + att)) * uMirror;
          env2 += amp * amp;
        }
      }
    }
  }
  float fg = sqrt(beamWidth(uFocus) / w);
  outColor = vec4(sqrt(env2) * fg, 0.0, 0.0, 1.0);
}`;

// ---- pass: level ----
export const levelShader = () => `${HEAD}
uniform sampler2D uEnv;
uniform float uDepth;
uniform int uNR;
uniform float uGainDb;
uniform float uTgc[8];
uniform float uDr;
uniform float uWhite;
uniform float uNoise;      // receiver noise amplitude relative to liver speckle, before gain
uniform float uSigAmp;     // transmit power as an amplitude factor
uniform float uDgcPerMm;   // depth compensation, dB per mm
uniform float uDgcMax;     // the most it can add, dB
uniform float uVeil;       // amplitude of the near field haze at the face, relative to liver speckle, as displayed
uniform float uVeilMm;     // how fast it fades with depth, mm
uniform float uFrameSeed;
out vec4 outColor;

float tgcAt(float t) {
  float x = clamp(t, 0.0, 1.0) * 7.0;
  int a = int(floor(x));
  int b = min(a + 1, 7);
  return mix(uTgc[a], uTgc[b], smoothstep(0.0, 1.0, x - float(a)));
}

uvec3 pcg3dN(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}

void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  float dr = uDepth / float(uNR);
  float r = (float(ip.y) + 0.5) * dr;
  float env = texelFetch(uEnv, ip, 0).x * uSigAmp;
  uvec3 h = pcg3dN(uvec3(uint(ip.x), uint(ip.y), uint(uFrameSeed)));
  float na = (float(h.x & 65535u) + float(h.y & 65535u) + float((h.y >> 16u) & 65535u) + float(h.x >> 16u)) / 65535.0 - 2.0;
  float nb = (float(h.z & 65535u) + float(h.z >> 16u) + float(h.x >> 16u) + float((h.y >> 8u) & 65535u)) / 65535.0 - 2.0;
  float noise = uNoise * length(vec2(na, nb)) * 1.2247;
  float a2 = env * env + noise * noise;
  float user = uGainDb + tgcAt(r / uDepth);
  // Haze from reverberation near the face. It is not echo from tissue, so depth compensation does not lift it: it is a fixed
  // level on the screen that fades within the first centimetres, and only the user's gain and TGC move it.
  float veil = uVeil * exp(-r / uVeilMm) * (0.4 + 0.49 * length(vec2(na, nb)));
  float p = a2 * pow(10.0, 0.1 * (user + min(uDgcPerMm * r, uDgcMax))) + veil * veil * pow(10.0, 0.1 * user);
  float db = 10.0 * log(max(p, 1.0e-12)) * 0.4342945;
  float v = (db - (uWhite - uDr)) / uDr;
  outColor = vec4(v, 0.0, 0.0, 1.0);
}`;

// ---- pass: post (smoothing, sharpening, persistence, grey map) ----
export const postShader = () => `${HEAD}
uniform sampler2D uLevel;
uniform sampler2D uPrev;
uniform int uNR;
uniform int uNL;
uniform float uSmooth;     // 0 to 1, speckle reduction
uniform float uSharp;      // 0 to 1, edge enhancement
uniform float uPersist;    // 0 to 0.9
uniform int uMap;          // grey map curve
uniform float uInvert;
out vec4 outColor;

float lv(ivec2 p) { return texelFetch(uLevel, clamp(p, ivec2(0), ivec2(uNL - 1, uNR - 1)), 0).x; }

float curve(float v) {
  v = clamp(v, 0.0, 1.0);
  if (uMap == 1) return v * v * (3.0 - 2.0 * v);             // contrast
  if (uMap == 2) return pow(v, 0.72);                         // soft
  if (uMap == 3) return clamp((v - 0.12) / 0.8, 0.0, 1.0);   // clipped
  return v;
}

void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  float c = lv(ip);
  float n = lv(ip + ivec2(0, 1)) + lv(ip - ivec2(0, 1)) + lv(ip + ivec2(1, 0)) + lv(ip - ivec2(1, 0));
  float blur = (c * 2.0 + n * 0.5) / 4.0;
  float v = mix(c, blur, uSmooth);
  v += uSharp * 0.9 * (c - blur);
  v = curve(v);
  float prev = texelFetch(uPrev, ip, 0).x;
  v = mix(v, prev, uPersist);
  outColor = vec4(v, 0.0, 0.0, 1.0);
}`;

// ---- pass: display ----
export const displayShader = () => `${HEAD}
${PROBE}
uniform sampler2DArray uGray;
uniform sampler2D uLabels;
uniform int uLayer;
uniform vec2 uRes;
uniform vec4 uView;          // u of the left edge, v of the top edge (mm), mm per pixel, unused
uniform vec2 uFlip;
uniform vec3 uTint;
uniform float uInvert;
uniform float uLabelMix;
uniform vec3 uColors[${TISSUES.length}];
uniform float uMaskEdge;
out vec4 outColor;

void main() {
  vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  if (uFlip.x < 0.0) px.x = uRes.x - px.x;
  if (uFlip.y < 0.0) px.y = uRes.y - px.y;
  float u = uView.x + px.x * uView.z;
  float v = uView.y + px.y * uView.z;
  float s;
  float r;
  if (uProbeType == 0) {
    s = (u + 0.5 * uProbeW) / uProbeW;
    r = v;
  } else {
    float R = (uProbeType == 1) ? uProbeR : 0.0;
    float a = atan(u, v + R);
    s = (a + uProbeTheta) / (2.0 * uProbeTheta);
    r = length(vec2(u, v + R)) - R;
  }
  float edge = uView.z;
  // Inside the fan, with the edge a pixel wide so the sector outline is not stair-stepped.
  float inFan = 1.0;
  if (uProbeType == 0) {
    inFan = smoothstep(0.0, edge, u + 0.5 * uProbeW) * smoothstep(0.0, edge, 0.5 * uProbeW - u) * smoothstep(0.0, edge, v) * smoothstep(0.0, edge, uDepth - v);
  } else {
    float R = (uProbeType == 1) ? uProbeR : 0.0;
    float lateral = (uProbeTheta - abs(atan(u, v + R))) * (r + R);
    inFan = smoothstep(0.0, edge, lateral) * smoothstep(0.0, edge, r) * smoothstep(0.0, edge, uDepth - r);
  }
  vec3 col = vec3(0.0);
  if (inFan > 0.0) {
    vec2 tc = vec2(clamp(s, 0.0, 1.0), clamp(r / uDepth, 0.0, 1.0));
    float g = texture(uGray, vec3(tc, float(uLayer))).x;
    g = mix(g, 1.0 - g, uInvert);
    col = g * uTint;
    if (uLabelMix > 0.0) {
      float lab = texelFetch(uLabels, ivec2(clamp(int(tc.x * float(uNL)), 0, uNL - 1), clamp(int(tc.y * float(uNR)), 0, uNR - 1)), 0).w;
      col = mix(col, uColors[int(lab + 0.5)], uLabelMix);
    }
    col *= inFan;
  }
  outColor = vec4(col, 1.0);
}`;

// ---- M-mode strip ----
export const mmodeShader = () => `${HEAD}
uniform sampler2D uStrip;
uniform float uHead;       // column to show at the right edge, as a fraction of the strip width
uniform vec3 uTint;
uniform float uInvert;
out vec4 outColor;
void main() {
  // the newest column is the one just before uHead, so the strip reads oldest to newest from left to right
  vec2 tc = vec2(uHead - 1.0 + vUv.x * 1.0, 1.0 - vUv.y);
  float g = texture(uStrip, tc).x;
  g = mix(g, 1.0 - g, uInvert);
  outColor = vec4(g * uTint, 1.0);
}`;

export const LABELS = Object.fromEntries(['gel', 'air', 'lung', 'gas', 'pleural_air', 'liver', 'spleen'].map(k => [k, TISSUE_INDEX[k]]));
