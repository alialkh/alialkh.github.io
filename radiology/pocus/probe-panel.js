// The hand controls for the probe: the four motions a sonographer makes, a pad to slide along the skin, and a plain-language readout.
// It holds no state. The app gives it the pose and it reports changes.

import { h } from '../core/dom.js';
import { LIMITS, orientationName } from './geometry.js';

function slider({ id, label, min, max, step = 1, unit = '°', help, onInput }) {
  const out = h('output', { for: id, class: 'ps-out' });
  const input = h('input', { type: 'range', id, min, max, step, value: 0, 'aria-describedby': `${id}-help` });
  const dbl = () => { input.value = min < 0 ? 0 : min; input.dispatchEvent(new Event('input')); };
  input.addEventListener('input', () => { out.textContent = `${Number(input.value).toFixed(0)}${unit}`; onInput(Number(input.value)); });
  input.addEventListener('dblclick', dbl);
  const row = h('div', { class: 'ps-row', title: help }, h('label', { for: id }, label), input, out, h('span', { id: `${id}-help`, class: 'visually-hidden' }, help));
  return { el: row, set: v => { input.value = v; out.textContent = `${Number(v).toFixed(0)}${unit}`; } };
}

export function createProbePanel({ onChange, onSlide, onReset }) {
  const rotate = slider({ id: 'ps-rotate', label: 'Rotate', min: -180, max: 180, help: 'Turn the probe about its own axis', onInput: v => onChange({ phi: v }) });
  const fan = slider({ id: 'ps-fan', label: 'Fan', min: -LIMITS.fan, max: LIMITS.fan, help: 'Sweep the plane across the tissue', onInput: v => onChange({ fan: v }) });
  const rock = slider({ id: 'ps-rock', label: 'Rock', min: -LIMITS.rock, max: LIMITS.rock, help: 'Tilt the beam within the plane', onInput: v => onChange({ rock: v }) });
  const press = slider({ id: 'ps-press', label: 'Press', min: 0, max: LIMITS.press, unit: ' mm', help: 'Push into the patient: organs come nearer', onInput: v => onChange({ press: v }) });
  const text = h('p', { class: 'ps-text', 'aria-live': 'polite' });
  const pad = (label, dir, glyph) => h('button', { type: 'button', class: 'pad', 'aria-label': label, title: label, onclick: () => onSlide(dir) }, glyph);
  const dpad = h('div', { class: 'dpad', role: 'group', 'aria-label': 'Slide the probe along the skin' },
    pad('Slide toward the head', 'head', '▲'), pad('Slide to the patient’s right', 'right', '◀'), pad('Slide toward the feet', 'feet', '▼'), pad('Slide to the patient’s left', 'left', '▶'));
  const reset = h('button', { type: 'button', class: 'ps-reset', onclick: onReset }, 'Reset probe');
  const el = h('div', { class: 'probe-panel' }, h('div', { class: 'ps-sliders' }, rotate.el, fan.el, rock.el, press.el), h('div', { class: 'ps-side' }, dpad, reset), text);

  function update(pose, info) {
    rotate.set(pose.phi);
    fan.set(pose.fan);
    rock.set(pose.rock);
    press.set(pose.press);
    const marker = Math.abs(pose.phi) < 12 || Math.abs(pose.phi) > 168 ? (Math.abs(pose.phi) < 12 ? 'the patient’s right' : 'the patient’s left') : (Math.abs(pose.phi - 90) < 12 ? 'the head' : Math.abs(pose.phi + 90) < 12 ? 'the feet' : 'an oblique direction');
    text.textContent = `${orientationName(pose.phi)} plane, marker toward ${marker}.${info ? ` ${info}` : ''}`;
  }

  return { el, update };
}
