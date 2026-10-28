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
  return gl;
}

function compile(gl, type, src, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    const lines = src.split('\n').map((l, i) => `${String(i + 1).padStart(4)} ${l}`).join('\n');
    throw new Error(`Shader ${label} failed to compile:\n${log}\n${lines.split('\n').filter((l, i) => {
      const m = /ERROR: \d+:(\d+)/.exec(log);
      return m ? Math.abs(i + 1 - Number(m[1])) < 4 : i < 3;
    }).join('\n')}`);
  }
  return sh;
}

export class Program {
  constructor(gl, fragment, label = 'program') {
    this.gl = gl;
    this.label = label;
    const vs = compile(gl, gl.VERTEX_SHADER, FULLSCREEN_VS, `${label}.vs`);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragment, `${label}.fs`);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(`Program ${label} failed to link: ${gl.getProgramInfoLog(this.program)}`);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.uniforms = new Map();
    const n = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(this.program, i);
      const name = info.name.replace(/\[0\]$/, '');
      this.uniforms.set(name, { loc: gl.getUniformLocation(this.program, info.name), type: info.type, size: info.size });
    }
    this.units = new Map();
  }

  use() {
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
