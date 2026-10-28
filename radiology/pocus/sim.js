// The B-mode pipeline. One call to frame() simulates one image of the current anatomy under the current probe and machine settings
// into beam space (one column per scan line), stores it in the cine ring, and display() scan converts a stored frame to the canvas.

import { Program, Target, requireContext, drawFull, dataTexture, updateTexture } from './gl.js';
import {
  lineShader, sampleShader, interfaceShader, scanInitShader, scanStepShader, axialShader, summaryShader, echoShader, levelShader, postShader, displayShader, LABELS,
} from './shaders.js';
import { TISSUES, tissueUniform } from './tissues.js';
import { TEXELS, FLOATS } from './anatomy.js';
import { MAX_GROUPS } from './anatomy-glsl.js';
import { axialSigma, effectiveFrequency, THI, AVERAGE_ALPHA, LATERAL_SCALE, CLUTTER_DB } from './beam.js';

// Calibration. These fix where the grey levels land and are the only tuning constants of the image.
export const CAL = {
  specK: 22, // echo of a perfect reflector against liver speckle, as an amplitude ratio
  noiseDb: -66, // receiver noise before gain
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
      sum: t(NL, 1, ['rgba32f', 'rgba32f']),
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
    const gl = this.gl;
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
      gel: LABELS.gel, air: LABELS.air, lung: LABELS.lung, ptx: LABELS.pleural_air,
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
    this.run(P.axial, T.D, { uNR: NR, uSigAx: sigAxMm / dr }, { uA: T.A.textures[0], uB: T.B.texture, uScan: scanTex });

    // 6. first air interface per line
    this.run(P.summary, T.sum, {
      ...frameU, uLabAir: lab.air, uLabLung: lab.lung, uLabPtx: lab.ptx, uSlide: cfg.slide, uBlines: cfg.blines,
    }, { uLine: T.line.texture, uB: T.B.texture, uD: T.D.texture });

    // 7. beam width across lines, artefacts, envelope
    this.run(P.echo, T.E, {
      ...frameU, uSigAxMm: sigAxMm, uTime: cfg.time, uSlide: cfg.slide, uLungHaze: cfg.lungHaze,
      uClutter: 10 ** ((thi ? CLUTTER_DB.harmonic : CLUTTER_DB.fundamental) / 10),
    }, { uD: T.D.texture, uSumA: T.sum.textures[0], uSumB: T.sum.textures[1], uB: T.B.texture });

    // 8. noise, gain, depth compensation, TGC, dynamic range
    const attF = freq * (thi ? THI.attenuation : 1);
    this.run(P.level, T.level, {
      uDepth: cfg.depth, uNR: NR, uGainDb: cfg.gainDb, uTgc: cfg.tgc, uDr: cfg.dr, uWhite: CAL.whiteDb,
      uNoise: 10 ** (CAL.noiseDb / 20), uSigAmp: 10 ** ((cfg.power + (thi ? THI.signalDb : 0)) / 20),
      uDgcPerMm: (2 * AVERAGE_ALPHA * attF) / 10, uFrameSeed: this.frameNo & 0xffffff,
    }, { uEnv: T.E.texture });

    // 9. smoothing, sharpening, persistence, grey map
    const prev = this.grayIndex;
    const next = 1 - prev;
    this.run(P.post, T.gray[next], {
      uNR: NR, uNL: NL, uSmooth: cfg.smooth, uSharp: cfg.sharp, uPersist: cfg.persist, uMap: cfg.map, uInvert: 0,
    }, { uLevel: T.level.texture, uPrev: T.gray[prev].texture });
    this.grayIndex = next;

    // 10. into the cine ring
    this.layer = this.stored % this.cineFrames;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.gray[next].fbo);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.cine);
    gl.copyTexSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, this.layer, 0, 0, NL, NR);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    this.stored++;
    this.frameNo++;
    this.lastFrameU = frameU;
    return this.layer;
  }

  // Scan convert one stored layer to the canvas. view: { u0, v0, mmPerPx } with the top left corner of the canvas in probe mm.
  display(cfg, layer = this.layer) {
    const gl = this.gl;
    const { width, height } = this.canvas;
    const frameU = this.lastFrameU;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
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
