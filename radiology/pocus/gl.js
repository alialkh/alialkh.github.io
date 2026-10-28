// Thin WebGL2 helpers: programs with typed uniform setters, render targets, a full screen triangle.

export const FORMATS = {
  rgba32f: { internal: 'RGBA32F', format: 'RGBA', type: 'FLOAT' },
  rg32f: { internal: 'RG32F', format: 'RG', type: 'FLOAT' },
  r32f: { internal: 'R32F', format: 'RED', type: 'FLOAT' },
  rgba16f: { internal: 'RGBA16F', format: 'RGBA', type: 'FLOAT' },
  rgba8: { internal: 'RGBA8', format: 'RGBA', type: 'UNSIGNED_BYTE' },
  r8: { internal: 'R8', format: 'RED', type: 'UNSIGNED_BYTE' },
};

const FULLSCREEN_VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export function requireContext(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  if (!gl) throw new Error('This browser has no WebGL 2, which the ultrasound simulation needs.');
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('This device cannot render to floating point textures, which the ultrasound simulation needs.');
  gl.getExtension('OES_texture_float_linear');
  gl.getExtension('KHR_parallel_shader_compile'); // lets the page ask whether a program is built without waiting for it
  return gl;
}

function submit(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return sh;
}

// Reading the result makes the page wait for the driver, so it is only done once the program is built or first needed.
function verify(gl, sh, src, label) {
  if (gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return;
  const log = gl.getShaderInfoLog(sh);
  const lines = src.split('\n').map((l, i) => `${String(i + 1).padStart(4)} ${l}`).join('\n');
  throw new Error(`Shader ${label} failed to compile:\n${log}\n${lines.split('\n').filter((l, i) => {
    const m = /ERROR: \d+:(\d+)/.exec(log);
    return m ? Math.abs(i + 1 - Number(m[1])) < 4 : i < 3;
  }).join('\n')}`);
}

export class Program {
  // The constructor only hands the source to the driver. Compiling and linking go on in the background, so many programs can be
  // built at once and the page can keep drawing. finish() collects the result, and runs on its own the first time the program is used.
  constructor(gl, fragment, label = 'program') {
    this.gl = gl;
    this.label = label;
    this.fragment = fragment;
    this.vs = submit(gl, gl.VERTEX_SHADER, FULLSCREEN_VS);
    this.fs = submit(gl, gl.FRAGMENT_SHADER, fragment);
    this.program = gl.createProgram();
    gl.attachShader(this.program, this.vs);
    gl.attachShader(this.program, this.fs);
    gl.linkProgram(this.program);
    this.finished = false;
    this.reflected = null;
    this.units = new Map();
  }

  // True once the driver has built the program, without waiting for it. Without the extension it is always true, and finish() waits.
  built() {
    const gl = this.gl;
    const ext = gl.getExtension('KHR_parallel_shader_compile');
    return this.finished || !ext || gl.getProgramParameter(this.program, ext.COMPLETION_STATUS_KHR) === true;
  }

  finish() {
    if (this.finished) return this;
    const gl = this.gl;
    verify(gl, this.vs, FULLSCREEN_VS, `${this.label}.vs`);
    verify(gl, this.fs, this.fragment, `${this.label}.fs`);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(`Program ${this.label} failed to link: ${gl.getProgramInfoLog(this.program)}`);
    gl.deleteShader(this.vs);
    gl.deleteShader(this.fs);
    this.vs = this.fs = this.fragment = null;
    this.reflected = new Map();
    const n = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(this.program, i);
      const name = info.name.replace(/\[0\]$/, '');
      this.reflected.set(name, { loc: gl.getUniformLocation(this.program, info.name), type: info.type, size: info.size });
    }
    this.finished = true;
    return this;
  }

  get uniforms() {
    return this.finish().reflected;
  }

  use() {
    this.finish();
    this.gl.useProgram(this.program);
    return this;
  }

  // Set uniforms by name. Numbers, arrays and typed arrays are matched to the declared type. Unknown names are ignored,
  // since the shader compiler removes unused uniforms.
  set(values) {
    const gl = this.gl;
    for (const [name, v] of Object.entries(values)) {
      const u = this.uniforms.get(name);
      if (!u) continue;
      switch (u.type) {
        case gl.FLOAT: u.size > 1 ? gl.uniform1fv(u.loc, v) : gl.uniform1f(u.loc, v); break;
        case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, v); break;
        case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, v); break;
        case gl.FLOAT_VEC4: gl.uniform4fv(u.loc, v); break;
        case gl.INT: case gl.BOOL: u.size > 1 ? gl.uniform1iv(u.loc, v) : gl.uniform1i(u.loc, v === true ? 1 : v === false ? 0 : v); break;
        case gl.INT_VEC2: gl.uniform2iv(u.loc, v); break;
        case gl.INT_VEC3: gl.uniform3iv(u.loc, v); break;
        case gl.INT_VEC4: gl.uniform4iv(u.loc, v); break;
        default: throw new Error(`uniform ${name} of type ${u.type} is not handled`);
      }
    }
    return this;
  }

  // Bind textures by sampler name, to consecutive units.
  textures(map) {
    const gl = this.gl;
    let unit = 0;
    for (const [name, tex] of Object.entries(map)) {
      const u = this.uniforms.get(name);
      if (!u) { unit++; continue; }
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(tex.target ?? gl.TEXTURE_2D, tex.texture ?? tex);
      gl.uniform1i(u.loc, unit);
      unit++;
    }
    return this;
  }
}

// Waits for a set of programs to build, calling onProgress(done, total, label) as each one lands, and lets the page paint in between.
// With the parallel compile extension the driver works on all of them at once and the page never blocks. Without it each one is
// collected in turn, one per frame.
export async function programsReady(programs, onProgress = () => {}) {
  const frame = () => new Promise(r => requestAnimationFrame(() => r()));
  const pending = new Set(programs.filter(p => !p.finished));
  const total = programs.length;
  const waitingSince = performance.now();
  let done = total - pending.size;
  onProgress(done, total, '');
  while (pending.size) {
    let collected = false;
    for (const p of pending) {
      // a driver that never says it is done would hold the page for ever, so after a minute just wait for the result
      if (!p.built() && performance.now() - waitingSince < 60000) continue;
      p.finish();
      pending.delete(p);
      done++;
      collected = true;
      onProgress(done, total, p.label);
      // without the extension finish() blocks, so hand the page back after each one
      if (!p.gl.getExtension('KHR_parallel_shader_compile')) break;
    }
    if (pending.size) await frame();
    else if (collected) await frame();
  }
}

export class Target {
  // formats: one format name or an array for multiple render targets.
  constructor(gl, width, height, formats = 'rgba32f', { linear = false, wrap = 'clamp' } = {}) {
    this.gl = gl;
    this.width = width;
    this.height = height;
    const list = Array.isArray(formats) ? formats : [formats];
    this.textures = list.map(name => {
      const F = FORMATS[name];
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl[F.internal], width, height);
      const filter = linear ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      const w = wrap === 'clamp' ? gl.CLAMP_TO_EDGE : gl.REPEAT;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w);
      return tex;
    });
    this.texture = this.textures[0];
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    this.textures.forEach((tex, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tex, 0));
    gl.drawBuffers(this.textures.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`framebuffer ${list.join(',')} ${width}x${height} is incomplete (0x${status.toString(16)})`);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  bind() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.width, this.height);
  }

  dispose() {
    const gl = this.gl;
    this.textures.forEach(t => gl.deleteTexture(t));
    gl.deleteFramebuffer(this.fbo);
  }
}

// Draw the full screen triangle with whatever program and target are bound.
export function drawFull(gl, vao) {
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

export function dataTexture(gl, width, height, data, format = 'rgba32f') {
  const F = FORMATS[format];
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl[F.internal], width, height);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl[F.format], gl[F.type], data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

export function updateTexture(gl, tex, width, height, data, format = 'rgba32f') {
  const F = FORMATS[format];
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl[F.format], gl[F.type], data);
}
