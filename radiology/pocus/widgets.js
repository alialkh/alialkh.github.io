// Console widgets: a rotary knob, a vertical fader, and a lit key. Each is an accessible control (role, keys, value text) and returns
// { el, set(value) } so the console can mirror state into it. They call onInput(value) only for the user's own changes.

import { h } from '../core/dom.js';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
}

// A rotary knob. Drag up or down, scroll, or use the arrow keys. The pointer sweeps 270 degrees from min to max.
export function knob({ label, min, max, value, step = 1, format = v => String(Math.round(v)), onInput, hint = '' }) {
  const wrap = h('div', { class: 'knob', role: 'slider', tabindex: '0', 'aria-label': label, 'aria-valuemin': min, 'aria-valuemax': max, title: hint || label });
  const dial = svg('svg', { viewBox: '0 0 64 64', class: 'knob-dial', 'aria-hidden': 'true' });
  const ring = svg('circle', { cx: 32, cy: 32, r: 29, class: 'knob-ring' });
  const cap = svg('circle', { cx: 32, cy: 32, r: 22, class: 'knob-cap' });
  const tick = svg('line', { x1: 32, y1: 32, x2: 32, y2: 13, class: 'knob-tick' });
  const arc = svg('path', { class: 'knob-arc', d: '' });
  dial.append(ring, arc, cap, tick);
  const readout = h('div', { class: 'knob-value' });
  wrap.append(dial, h('div', { class: 'knob-label' }, label), readout);

  let current = value;
  const angle = v => -135 + ((v - min) / (max - min)) * 270;
  const arcPath = a => {
    const r = 29;
    const pt = deg => [32 + r * Math.sin((deg * Math.PI) / 180), 32 - r * Math.cos((deg * Math.PI) / 180)];
    const [x0, y0] = pt(-135);
    const [x1, y1] = pt(a);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a + 135 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  const paint = () => {
    const a = angle(current);
    tick.setAttribute('transform', `rotate(${a} 32 32)`);
    arc.setAttribute('d', arcPath(a));
    readout.textContent = format(current);
    wrap.setAttribute('aria-valuenow', current);
    wrap.setAttribute('aria-valuetext', `${label} ${format(current)}`);
  };
  const apply = (v, user = true) => {
    const q = clamp(Math.round(v / step) * step, min, max);
    if (q === current && user) return;
    current = q;
    paint();
    if (user) onInput?.(q);
  };
  let drag = null;
  wrap.addEventListener('pointerdown', e => {
    wrap.setPointerCapture(e.pointerId);
    drag = { y: e.clientY, v: current };
    wrap.focus();
  });
  wrap.addEventListener('pointermove', e => {
    if (!drag) return;
    const span = (max - min) / 170; // about 170 px of travel for the whole range
    apply(drag.v + (drag.y - e.clientY) * span);
  });
  const end = () => { drag = null; };
  wrap.addEventListener('pointerup', end);
  wrap.addEventListener('pointercancel', end);
  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    apply(current + (e.deltaY < 0 ? 1 : -1) * Math.max(step, (max - min) / 50));
  }, { passive: false });
  wrap.addEventListener('keydown', e => {
    const big = (max - min) / 10;
    const delta = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: big, PageDown: -big }[e.key];
    if (e.key === 'Home') apply(min);
    else if (e.key === 'End') apply(max);
    else if (delta !== undefined) apply(current + delta);
    else return;
    e.preventDefault();
  });
  paint();
  return { el: wrap, set: v => { current = clamp(v, min, max); paint(); } };
}

// A vertical fader for the TGC. Top is more gain. Same controls as the knob.
export function fader({ label, min, max, value, step = 1, onInput, format = v => `${v > 0 ? '+' : ''}${Math.round(v)} dB` }) {
  const wrap = h('div', { class: 'fader', role: 'slider', tabindex: '0', 'aria-label': label, 'aria-valuemin': min, 'aria-valuemax': max, 'aria-orientation': 'vertical' });
  const track = h('div', { class: 'fader-track' });
  const mid = h('div', { class: 'fader-mid' });
  const thumb = h('div', { class: 'fader-thumb' });
  track.append(mid, thumb);
  wrap.append(track);
  let current = value;
  const paint = () => {
    const f = (current - min) / (max - min);
    thumb.style.top = `${(1 - f) * 100}%`;
    wrap.setAttribute('aria-valuenow', current);
    wrap.setAttribute('aria-valuetext', `${label} ${format(current)}`);
    wrap.title = `${label}: ${format(current)}`;
  };
  const apply = (v, user = true) => {
    const q = clamp(Math.round(v / step) * step, min, max);
    if (q === current && user) return;
    current = q;
    paint();
    if (user) onInput?.(q);
  };
  const fromPointer = e => {
    const r = track.getBoundingClientRect();
    apply(min + (1 - clamp((e.clientY - r.top) / r.height, 0, 1)) * (max - min));
  };
  let down = false;
  wrap.addEventListener('pointerdown', e => { wrap.setPointerCapture(e.pointerId); down = true; wrap.focus(); fromPointer(e); });
  wrap.addEventListener('pointermove', e => { if (down) fromPointer(e); });
  wrap.addEventListener('pointerup', () => { down = false; });
  wrap.addEventListener('pointercancel', () => { down = false; });
  wrap.addEventListener('dblclick', () => apply(0));
  wrap.addEventListener('keydown', e => {
    const delta = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: 5, PageDown: -5 }[e.key];
    if (e.key === 'Home') apply(max);
    else if (e.key === 'End') apply(min);
    else if (delta !== undefined) apply(current + delta);
    else return;
    e.preventDefault();
  });
  paint();
  return { el: wrap, set: v => { current = clamp(v, min, max); paint(); } };
}

// A key with a lamp. kind 'toggle' stays lit when on, 'momentary' just fires.
export function key({ label, kind = 'toggle', on = false, onClick, hint = '', wide = false }) {
  const b = h('button', { type: 'button', class: `key${wide ? ' wide' : ''}`, 'aria-pressed': kind === 'toggle' ? String(on) : null, title: hint || label });
  b.append(h('span', { class: 'lamp', 'aria-hidden': 'true' }), h('span', { class: 'key-label' }, label));
  b.addEventListener('click', () => onClick?.(kind === 'toggle' ? b.getAttribute('aria-pressed') !== 'true' : undefined));
  return { el: b, set: v => b.setAttribute('aria-pressed', String(!!v)), enable: v => { b.disabled = !v; } };
}

// A row of exclusive choices, shown as keys: segment([{ id, label }], value, onPick).
export function segment({ label, options, value, onPick }) {
  const row = h('div', { class: 'segment', role: 'radiogroup', 'aria-label': label });
  const buttons = options.map(o => {
    const b = h('button', { type: 'button', class: 'seg', role: 'radio', 'aria-checked': String(o.id === value), title: o.title ?? o.label }, o.label);
    b.addEventListener('click', () => onPick(o.id));
    row.append(b);
    return [o.id, b];
  });
  return {
    el: row,
    set: v => buttons.forEach(([id, b]) => b.setAttribute('aria-checked', String(id === v))),
  };
}
