// The B-mode pipeline. One call to frame() simulates one image of the current anatomy under the current probe and machine settings
// into beam space (one column per scan line), stores it in the cine ring, and display() scan converts a stored frame to the canvas.

import { Program, Target, requireContext, drawFull, dataTexture, updateTexture } from './gl.js';
import {
  lineShader, sampleShader, interfaceShader, scanInitShader, scanStepShader, axialShader, summaryShader, echoShader, levelShader, postShader, displayShader, mmodeShader, LABELS,
} from './shaders.js';
import { TISSUES, tissueUniform } from './tissues.js';
import { TEXELS, FLOATS, DEFAULT_EDGE } from './anatomy.js';
import { MAX_GROUPS } from './anatomy-glsl.js';
import { axialSigma, effectiveFrequency, THI, AVERAGE_ALPHA, LATERAL_SCALE, CLUTTER_DB } from './beam.js';

// Calibration. These fix where the grey levels land and are the only tuning constants of the image.
export const CAL = {
  specK: 22, // echo of a perfect reflector against liver speckle, as an amplitude ratio
  noiseDb: -74, // receiver noise before gain
  veil: 0.2,    // near field haze at the face, relative to liver speckle, after depth compensation
  veilMm: 9,    // and how far it reaches
  dgcMaxDb: 62, // a machine cannot make up for depth without limit
  whiteDb: 32, // the level that shows as white
  lines: 192,
  samples: 640,
  cineFrames: 160,
};

const hexColor = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);

export class Sim {
  constructor(canvas, { lines = CAL.lines, samples = CAL.samples, cine = CAL.cineFrames } = {}) {
    this.canvas = canvas;
    const gl = (this.gl = requireContext(canvas));
    this.NL = lines;
    this.NR = samples;
    this.cineFrames = cine;
    this.vao = gl.createVertexArray();
    this.programs = {
      line: new Program(gl, lineShader(), 'line'),
      sample: new Program(gl, sampleShader(), 'sample'),
      iface: new Program(gl, interfaceShader(), 'interface'),
      scanInit: new Program(gl, scanInitShader(), 'scanInit'),
      scanStep: new Program(gl, scanStepShader(), 'scanStep'),
      axial: new Program(gl, axialShader(), 'axial'),
      summary: new Program(gl, summaryShader(), 'summary'),
      echo: new Program(gl, echoShader(), 'echo'),
      level: new Program(gl, levelShader(), 'level'),
      post: new Program(gl, postShader(), 'post'),
      display: new Program(gl, displayShader(), 'display'),
    };
    const t = (w, h, f, o) => new Target(gl, w, h, f, o);
    const { NL, NR } = this;
    this.targets = {
      line: t(NL, 1, 'rgba32f'),
      A: t(NL, NR, ['rgba32f', 'rgba32f']),
      B: t(NL, NR, 'rgba32f'),
      scan: [t(NL, NR, 'r32f'), t(NL, NR, 'r32f')],
      D: t(NL, NR, 'rgba32f'),
      sum: t(NL, 1, ['rgba32f', 'rgba32f', 'rgba32f']),
      E: t(NL, NR, 'r32f'),
      level: t(NL, NR, 'r32f'),
      gray: [t(NL, NR, 'r8', { linear: true }), t(NL, NR, 'r8', { linear: true })],
    };
    this.grayIndex = 0;
    this.layer = 0;
    this.stored = 0;
    this.cine = this.makeCine();
    this.tissue = tissueUniform();
    this.tissueColors = new Float32Array(TISSUES.flatMap(x => hexColor(x.color)));
    this.anatomyTex = null;
    this.frameNo = 0;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
  }

  makeCine() {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.R8, this.NL, this.NR, this.cineFrames);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    tex.target = gl.TEXTURE_2D_ARRAY;
    return tex;
  }

  // Upload the resolved anatomy table. Cheap enough to do every frame.
  setAnatomy(res) {
    const gl = this.gl;
    if (!this.anatomyTex || this.anatomyRows !== res.count) {
      if (this.anatomyTex) gl.deleteTexture(this.anatomyTex);
      this.anatomyTex = dataTexture(gl, TEXELS, res.count, res.data);
      this.anatomyRows = res.count;
    } else {
      updateTexture(gl, this.anatomyTex, TEXELS, res.count, res.data);
    }
    const bounds = new Float32Array(MAX_GROUPS * 4);
    bounds.set(res.groupBound);
    const ranges = new Int32Array(MAX_GROUPS * 2);
    ranges.set(res.groupRange);
    this.anatomyUniforms = { uGBound: bounds, uGRange: ranges, uGCount: res.groupCount, uTissue: this.tissue, uHabitus: res.habitus };
    if (res.count * FLOATS !== res.data.length) throw new Error('anatomy table has the wrong size');
  }

  run(prog, target, uniforms, textures = {}) {
    const gl = this.gl;
    prog.use().set(uniforms).textures(textures);
    target.bind();
    drawFull(gl, this.vao);
  }

  // cfg: see machine.js for how the knobs become these numbers.
  frame(cfg) {
    const { NL, NR } = this;
    const P = this.programs;
    const T = this.targets;
    const probe = cfg.probe;
    const dr = cfg.depth / NR;
    const freq = cfg.freq;
    const thi = !!cfg.thi;
    const sigAxMm = axialSigma(freq, thi);
    const frameU = {
      uProbeType: probe.typeIndex,
      uProbeR: probe.radius,
      uProbeTheta: (probe.halfAngle * Math.PI) / 180,
      uProbeW: probe.width ?? probe.footprint,
      uO: cfg.frame.o, uE: cfg.frame.e, uN: cfg.frame.n, uH: cfg.frame.h,
      uDepth: cfg.depth, uNL: NL, uNR: NR,
      uFreqEff: effectiveFrequency(freq, thi),
      uAttF: freq * (thi ? THI.attenuation : 1),
      uAperture: probe.aperture, uElevation: probe.elevation, uElevFocus: probe.elevFocus,
      uFocus: cfg.focus, uZones: cfg.zones, uLatScale: LATERAL_SCALE,
    };
    const anat = this.anatomyUniforms;
    const lab = this.labels ??= {
      gel: LABELS.gel, air: LABELS.air, lung: LABELS.lung, ptx: LABELS.pleural_air, liver: LABELS.liver, spleen: LABELS.spleen,
    };

    // 1. where each line meets the skin
    this.run(P.line, T.line, { ...frameU, ...anat, uGapMax: cfg.gapMax }, { uAnat: this.anatomyTex });

    // 2. sample the anatomy under every point of every line
    this.run(P.sample, T.A, {
      ...frameU, ...anat, uCell: Math.min(0.45, Math.max(0.1, 1.5 * sigAxMm)), uLabGel: lab.gel, uLabAir: lab.air,
    }, { uAnat: this.anatomyTex, uLine: T.line.texture });

    // 3. interfaces, angle dependence and the loss of each sample
    this.run(P.iface, T.B, {
      uDepth: cfg.depth, uNR: NR, uLnZGel: Math.log(1.5), uSpecK: CAL.specK, uPowerAmp: 1,
    }, { uA: T.A.textures[0], uB: T.A.textures[1] });

    // 4. running sum of loss down each line, log2 steps
    this.run(P.scanInit, T.scan[0], {}, { uB: T.B.texture });
    let cur = 0;
    for (let stride = 1; stride < NR; stride *= 2) {
      this.run(P.scanStep, T.scan[1 - cur], { uStride: stride }, { uPrev: T.scan[cur].texture });
      cur = 1 - cur;
    }
    const scanTex = T.scan[cur].texture;

    // 5. the pulse
    this.run(P.axial, T.D, { uNR: NR, uSigAx: sigAxMm / dr, uEdge: DEFAULT_EDGE / dr }, { uA: T.A.textures[0], uB: T.B.texture, uScan: scanTex });

    // 6. first air interface per line
    this.run(P.summary, T.sum, {
      ...frameU, ...anat, uLabAir: lab.air, uLabLung: lab.lung, uLabPtx: lab.ptx, uLabLiver: lab.liver, uLabSpleen: lab.spleen, uSlide: cfg.slide, uBlines: cfg.blines,
    }, { uAnat: this.anatomyTex, uLine: T.line.texture, uB: T.B.texture, uD: T.D.texture });

    // 7. beam width across lines, artefacts, envelope
    this.run(P.echo, T.E, {
      ...frameU, ...anat, uSigAxMm: sigAxMm, uTime: cfg.time, uSlide: cfg.slide, uLungHaze: cfg.lungHaze, uMirror: cfg.mirror ?? 1,
      uCell: Math.min(0.45, Math.max(0.1, 1.5 * sigAxMm)),
      uClutter: 10 ** ((thi ? CLUTTER_DB.harmonic : CLUTTER_DB.fundamental) / 10),
      uDgcPerMm: (2 * AVERAGE_ALPHA * cfg.freq * (thi ? THI.attenuation : 1)) / 10, uDgcMax: CAL.dgcMaxDb,
    }, { uAnat: this.anatomyTex, uD: T.D.texture, uSumA: T.sum.textures[0], uSumB: T.sum.textures[1], uSumC: T.sum.textures[2], uB: T.B.texture });

    // 8 and 9. noise, gain, depth compensation, TGC, dynamic range, then smoothing, persistence and the grey map
    const prev = this.grayIndex;
    const next = 1 - prev;
    this.levelAndPost(cfg, prev, next, cfg.persist);
    this.grayIndex = next;

    // 10. into the cine ring
    this.layer = this.stored % this.cineFrames;
    this.storeLayer(this.layer);
    this.stored++;
    this.frameNo++;
    this.lastFrameU = frameU;
    this.lastCfg = cfg;
    return this.layer;
  }

  // The last two passes. They depend only on the envelope and the console, not on the patient, so they can run again on a frozen frame.
  levelAndPost(cfg, prevIndex, nextIndex, persist) {
    const T = this.targets;
    const P = this.programs;
    const { NL, NR } = this;
    const thi = !!cfg.thi;
    const attF = cfg.freq * (thi ? THI.attenuation : 1);
    this.run(P.level, T.level, {
      uDepth: cfg.depth, uNR: NR, uGainDb: cfg.gainDb, uTgc: cfg.tgc, uDr: cfg.dr, uWhite: CAL.whiteDb,
      uNoise: 10 ** (CAL.noiseDb / 20), uVeil: CAL.veil, uVeilMm: CAL.veilMm, uSigAmp: 10 ** ((cfg.power + (thi ? THI.signalDb : 0)) / 20),
      uDgcPerMm: (2 * AVERAGE_ALPHA * attF) / 10, uDgcMax: CAL.dgcMaxDb, uFrameSeed: this.frameNo & 0xffffff,
    }, { uEnv: T.E.texture });
    this.run(P.post, T.gray[nextIndex], {
      uNR: NR, uNL: NL, uSmooth: cfg.smooth, uSharp: cfg.sharp, uPersist: persist, uMap: cfg.map, uInvert: 0,
    }, { uLevel: T.level.texture, uPrev: T.gray[prevIndex].texture });
  }

  storeLayer(layer) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.targets.gray[this.grayIndex].fbo);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.cine);
    gl.copyTexSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, 0, 0, this.NL, this.NR);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  }

  // Start a new cine loop. The ring is overwritten from layer 0 as frames come in.
  resetCine() {
    this.stored = 0;
  }

  // Apply new gain, TGC, range or map to the newest frame, as the knobs do on a frozen image.
  reprocess(cfg) {
    if (!this.lastCfg) return;
    const prev = this.grayIndex;
    const next = 1 - prev;
    this.levelAndPost({ ...this.lastCfg, gainDb: cfg.gainDb, tgc: cfg.tgc, dr: cfg.dr, power: cfg.power, smooth: cfg.smooth, sharp: cfg.sharp, map: cfg.map }, prev, next, 0);
    this.grayIndex = next;
    this.storeLayer(this.layer);
  }

  // Brightness of the newest image: the median grey in each of `bands` depth bands over the lines that carry tissue, and overall.
  grayProfile(bands = 8) {
    const gl = this.gl;
    const { NL, NR } = this;
    const px = new Uint8Array(NL * NR * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.gray[this.grayIndex].fbo);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0, 0, NL, NR, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const per = NR / bands;
    const profile = [];
    const all = [];
    for (let b = 0; b < bands; b++) {
      const vals = [];
      for (let i = Math.floor(b * per); i < Math.floor((b + 1) * per); i += 2) {
        for (let k = 0; k < NL; k += 2) {
          const v = px[(i * NL + k) * 4] / 255;
          if (v > 0.03) vals.push(v);
        }
      }
      vals.sort((x, y) => x - y);
      profile.push(vals.length > 40 ? vals[vals.length >> 1] : NaN);
      all.push(...vals);
    }
    all.sort((x, y) => x - y);
    return { profile, mean: all.length ? all[all.length >> 1] : NaN };
  }

  // Clear the canvas to the screen background.
  clear(color = [0.02, 0.025, 0.03]) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(color[0], color[1], color[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // Scan convert one stored layer into rect = { x, y, w, h } (pixels, y down from the top of the canvas), default the whole canvas.
  // view: { u0, v0, mmPerPx } is the top left corner of the rect in probe mm.
  display(cfg, layer = this.layer, rect = null) {
    const gl = this.gl;
    const width = rect ? rect.w : this.canvas.width;
    const height = rect ? rect.h : this.canvas.height;
    const frameU = this.lastFrameU;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (rect) {
      const y = this.canvas.height - rect.y - rect.h;
      gl.viewport(rect.x, y, rect.w, rect.h);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(rect.x, y, rect.w, rect.h);
    } else {
      gl.disable(gl.SCISSOR_TEST);
      gl.viewport(0, 0, width, height);
    }
    const prog = this.programs.display;
    prog.use().set({
      ...frameU,
      uDepth: cfg.depth,
      uLayer: layer,
      uRes: [width, height],
      uView: [cfg.view.u0, cfg.view.v0, cfg.view.mmPerPx, 0],
      uFlip: [cfg.flipX ? -1 : 1, cfg.flipY ? -1 : 1],
      uTint: cfg.tint ?? [1, 1, 1],
      uInvert: cfg.invert ? 1 : 0,
      uLabelMix: cfg.labelMix ?? 0,
      uColors: this.tissueColors,
    }).textures({ uGray: this.cine, uLabels: this.targets.A.textures[1] });
    drawFull(gl, this.vao);
    gl.disable(gl.SCISSOR_TEST);
  }

  // ---- M-mode: the grey values along one scan line, scrolling sideways in time ----
  // One column per step of the sweep. Fast frames fill several columns, slow ones repeat the newest line, as a real strip does.
  initMMode(width = 640) {
    const gl = this.gl;
    this.mWidth = width;
    this.mHead = 0;
    this.mTime = 0;
    this.mTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.mTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, width, this.NR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.programs.mmode ??= new Program(gl, mmodeShader(), 'mmode');
  }

  resetMMode() {
    const gl = this.gl;
    const zero = new Uint8Array(this.mWidth * this.NR);
    gl.bindTexture(gl.TEXTURE_2D, this.mTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.mWidth, this.NR, gl.RED, gl.UNSIGNED_BYTE, zero);
    this.mTime = 0;
  }

  // Add `seconds` of time to the strip, taking the line at fraction s (0 to 1 across the fan) of the newest image.
  pushMMode(s, seconds, sweepSeconds) {
    const gl = this.gl;
    const colTime = sweepSeconds / this.mWidth;
    this.mTime += seconds;
    let n = Math.floor(this.mTime / colTime);
    if (n <= 0) return;
    this.mTime -= n * colTime;
    n = Math.min(n, this.mWidth);
    const line = Math.min(this.NL - 1, Math.max(0, Math.round(s * this.NL - 0.5)));
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.targets.gray[this.grayIndex].fbo);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindTexture(gl.TEXTURE_2D, this.mTex);
    for (let i = 0; i < n; i++) {
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, this.mHead, 0, line, 0, 1, this.NR);
      this.mHead = (this.mHead + 1) % this.mWidth;
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  }

  // Draw the strip into rect. The newest column is at the right edge. scroll shifts back in time, in columns.
  displayMMode(rect, { tint = [1, 1, 1], invert = false, scroll = 0 } = {}) {
    const gl = this.gl;
    const y = this.canvas.height - rect.y - rect.h;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(rect.x, y, rect.w, rect.h);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(rect.x, y, rect.w, rect.h);
    this.programs.mmode.use().set({ uHead: (this.mHead - scroll) / this.mWidth, uTint: tint, uInvert: invert ? 1 : 0 }).textures({ uStrip: { texture: this.mTex } });
    drawFull(gl, this.vao);
    gl.disable(gl.SCISSOR_TEST);
  }

  // For tests: the grey values of the newest beam space image, as bytes.
  readGray() {
    const gl = this.gl;
    const T = this.targets.gray[this.grayIndex];
    const out = new Uint8Array(this.NL * this.NR * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.fbo);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0, 0, this.NL, this.NR, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out;
  }
}
