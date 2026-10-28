// The control panel under the screen. It turns user input into machine actions and non-machine commands, and mirrors machine state back
// into its widgets. It holds no state of its own.

import { h } from '../core/dom.js';
import { knob, fader, key, segment } from './widgets.js';
import { RANGES, PRESET_LIST, MAPS, MODES } from './machine.js';
import { PROBE_LIST } from './probes.js';

const section = (title, ...kids) => h('section', { class: 'cons-sec', 'aria-label': title }, h('h3', {}, title), h('div', { class: 'cons-row' }, ...kids));

// dispatch(action) changes the machine. command(name, payload) is everything else (save, measure, auto TGC).
export function createConsole({ dispatch, command }) {
  const select = (label, options, onPick) => {
    const s = h('select', { 'aria-label': label, class: 'cons-select' }, ...options.map(o => h('option', { value: o.id }, o.label)));
    s.addEventListener('change', () => onPick(s.value));
    return s;
  };

  // --- exam, probe and mode
  const preset = select('Exam preset', PRESET_LIST.map(p => ({ id: p.id, label: p.name })), id => dispatch({ type: 'preset', id }));
  const probe = select('Transducer', PROBE_LIST.map(p => ({ id: p.id, label: `${p.name}  ${p.label}` })), id => dispatch({ type: 'probe', id }));
  const mode = segment({ label: 'Imaging mode', options: MODES.map(m => ({ id: m, label: { B: 'B', BM: 'B+M', M: 'M' }[m], title: { B: 'B-mode', BM: 'B-mode with M-mode', M: 'M-mode' }[m] })), value: 'B', onPick: m => dispatch({ type: 'mode', mode: m }) });
  const thi = key({ label: 'THI', hint: 'Tissue harmonic imaging: cleaner, sharper, less penetration', onClick: on => dispatch({ type: 'thi', on }) });
  const orient = segment({ label: 'Screen orientation', options: [{ id: 'abdominal', label: 'Abd', title: 'Marker on the left of the screen' }, { id: 'cardiac', label: 'Card', title: 'Marker on the right of the screen' }], value: 'abdominal', onPick: v => dispatch({ type: 'orient', value: v }) });
  const flipX = key({ label: 'L/R', hint: 'Flip left and right', onClick: () => dispatch({ type: 'flipx' }) });
  const flipY = key({ label: 'U/D', hint: 'Flip up and down', onClick: () => dispatch({ type: 'flipy' }) });
  const freeze = key({ label: 'Freeze', hint: 'Freeze the image and scroll the cine loop (Space)', onClick: on => dispatch({ type: 'freeze', on }), wide: true });
  const save = key({ label: 'Save', kind: 'momentary', hint: 'Store the image (S)', onClick: () => command('save') });

  // --- image knobs
  const gain = knob({ label: 'Gain', min: 0, max: 100, value: 50, format: v => `${Math.round(v)}`, hint: 'Overall gain', onInput: v => dispatch({ type: 'gain', value: v }) });
  const depthValue = h('div', { class: 'depth-val', 'aria-live': 'polite' });
  const depthBox = h('div', { class: 'depth' },
    h('button', { type: 'button', class: 'step', 'aria-label': 'Shallower', title: 'Shallower (-)', onclick: () => dispatch({ type: 'depth', step: -1 }) }, '−'),
    h('div', { class: 'depth-label' }, h('div', { class: 'knob-label' }, 'Depth'), depthValue),
    h('button', { type: 'button', class: 'step', 'aria-label': 'Deeper', title: 'Deeper (+)', onclick: () => dispatch({ type: 'depth', step: 1 }) }, '+'));
  const focus = knob({ label: 'Focus', min: RANGES.focus[0], max: 340, value: 70, step: 5, format: v => `${(v / 10).toFixed(1)} cm`, hint: 'Depth of the transmit focus', onInput: v => dispatch({ type: 'focus', value: v }) });
  const zones = segment({ label: 'Focal zones', options: [1, 2, 3].map(n => ({ id: n, label: String(n), title: `${n} transmit focal zone${n > 1 ? 's' : ''}: finer over more depth, slower frame rate` })), value: 1, onPick: n => dispatch({ type: 'zones', value: n }) });
  const freq = segment({ label: 'Frequency', options: [{ id: 'pen', label: 'Pen', title: 'Penetration: lower frequency, deeper' }, { id: 'gen', label: 'Gen', title: 'General' }, { id: 'res', label: 'Res', title: 'Resolution: higher frequency, finer' }], value: 'gen', onPick: m => dispatch({ type: 'freq', mode: m }) });
  const dr = knob({ label: 'DR', min: RANGES.dr[0], max: RANGES.dr[1], value: 64, step: 2, format: v => `${v} dB`, hint: 'Dynamic range: how many dB of echo fit between black and white', onInput: v => dispatch({ type: 'dr', value: v }) });
  const power = knob({ label: 'Power', min: RANGES.power[0], max: RANGES.power[1], value: 100, step: 5, format: v => `${v}%`, hint: 'Acoustic output. Use as little as will do (ALARA).', onInput: v => dispatch({ type: 'power', value: v }) });
  const persist = knob({ label: 'Persist', min: 0, max: 7, value: 2, format: v => `${v}`, hint: 'Frame averaging: smoother, with trailing on motion', onInput: v => dispatch({ type: 'persist', value: v }) });
  const smooth = knob({ label: 'SRI', min: 0, max: 5, value: 2, format: v => `${v}`, hint: 'Speckle reduction', onInput: v => dispatch({ type: 'smooth', value: v }) });
  const sharp = knob({ label: 'Edge', min: 0, max: 5, value: 2, format: v => `${v}`, hint: 'Edge enhancement', onInput: v => dispatch({ type: 'sharp', value: v }) });
  const map = h('button', { type: 'button', class: 'key map-key', title: 'Grey map', 'aria-label': 'Grey map' }, h('span', { class: 'key-label' }));
  map.addEventListener('click', () => command('map-next'));
  const tint = segment({ label: 'Colour tint', options: [{ id: 'gray', label: 'Grey' }, { id: 'sepia', label: 'Sepia' }, { id: 'blue', label: 'Blue' }], value: 'gray', onPick: v => dispatch({ type: 'tint', value: v }) });
  const invert = key({ label: 'Invert', onClick: () => dispatch({ type: 'invert' }) });

  // --- time gain compensation
  const tgcLabels = ['Near', '', '', '', '', '', '', 'Far'];
  const faders = Array.from({ length: 8 }, (_, i) => fader({ label: `TGC ${i + 1}`, min: RANGES.tgc[0], max: RANGES.tgc[1], value: 0, onInput: v => dispatch({ type: 'tgc', index: i, value: v }) }));
  const tgcBox = h('div', { class: 'tgc' }, ...faders.map((f, i) => h('div', { class: 'tgc-col' }, f.el, h('div', { class: 'tgc-label' }, tgcLabels[i]))));
  const auto = h('button', { type: 'button', class: 'key', title: 'Even out the brightness down the image', onclick: () => command('auto-tgc') }, h('span', { class: 'lamp' }), h('span', { class: 'key-label' }, 'Auto'));
  const tgcReset = h('button', { type: 'button', class: 'key', title: 'Centre every TGC slider', onclick: () => dispatch({ type: 'tgc-reset' }) }, h('span', { class: 'lamp' }), h('span', { class: 'key-label' }, 'Flat'));

  // --- measurements and zoom
  const dist = key({ label: 'Dist', hint: 'Measure a distance (two clicks)', onClick: on => command('tool', on ? 'distance' : null) });
  const ellipseKey = key({ label: 'Ellipse', hint: 'Measure an area: two ends of one axis, then the other axis', onClick: on => command('tool', on ? 'ellipse' : null) });
  const clear = key({ label: 'Clear', kind: 'momentary', onClick: () => command('clear-measures') });
  const zoomIn = h('button', { type: 'button', class: 'step', 'aria-label': 'Zoom in', title: 'Zoom in', onclick: () => command('zoom', 0.25) }, '+');
  const zoomOut = h('button', { type: 'button', class: 'step', 'aria-label': 'Zoom out', title: 'Zoom out', onclick: () => command('zoom', -0.25) }, '−');
  const zoomBox = h('div', { class: 'zoom' }, zoomOut, h('div', { class: 'knob-label' }, 'Zoom'), zoomIn);
  const msweep = knob({ label: 'M speed', min: RANGES.msweep[0], max: RANGES.msweep[1], value: 4, format: v => `${v} s`, hint: 'Seconds across the M-mode strip', onInput: v => dispatch({ type: 'msweep', value: v }) });

  const el = h('div', { class: 'console' },
    section('Exam', preset, probe, mode.el, thi.el, orient.el),
    section('Image', gain.el, depthBox, focus.el, zones.el, freq.el, dr.el, power.el, persist.el, smooth.el, sharp.el, map, tint.el, invert.el),
    h('div', { class: 'cons-pair' },
      section('TGC', tgcBox, h('div', { class: 'tgc-keys' }, auto, tgcReset)),
      section('Tools', freeze.el, save.el, dist.el, ellipseKey.el, clear.el, zoomBox, flipX.el, flipY.el, msweep.el)));

  function update(m, extra) {
    preset.value = m.preset;
    probe.value = m.probe;
    mode.set(m.mode);
    thi.set(m.thi);
    orient.set(m.orient);
    flipX.set(m.flipX);
    flipY.set(m.flipY);
    freeze.set(m.frozen);
    gain.set(m.gain);
    depthValue.textContent = `${(m.depth / 10).toFixed(m.depth % 10 === 0 ? 0 : 1)} cm`;
    focus.set(m.focus);
    zones.set(m.zones);
    freq.set(m.freqMode);
    dr.set(m.dr);
    power.set(m.power);
    persist.set(m.persist);
    smooth.set(m.smooth);
    sharp.set(m.sharp);
    map.firstChild.textContent = `Map ${MAPS[m.map]}`;
    tint.set(m.tint);
    invert.set(m.invert);
    m.tgc.forEach((v, i) => faders[i].set(v));
    msweep.set(m.msweep);
    dist.set(extra.tool === 'distance');
    ellipseKey.set(extra.tool === 'ellipse');
  }

  return { el, update };
}
