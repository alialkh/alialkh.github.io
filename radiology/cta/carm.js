// The C-arm picker: two original schematics (the patient seen from the feet and from the left side) and two sliders.
// Rotation and angulation use the sign convention of views.js, so this file draws and views.js matches.
import { h } from '../core/dom.js';
import { describeAngle } from './views.js';

const ROT = { min: -90, max: 90, step: 5 };
const TILT = { min: -45, max: 45, step: 5 };
const rad = d => (d * Math.PI) / 180;
const f = n => Math.round(n * 10) / 10;

// The beam runs from the tube to the detector through the heart at c. angle is measured from straight up.
function beam(c, angle, reach) {
  const [dx, dy] = [Math.sin(rad(angle)), -Math.cos(rad(angle))];
  const d = [c[0] + reach * dx, c[1] + reach * dy];
  const t = [c[0] - reach * dx, c[1] - reach * dy];
  return `<line class="ray" x1="${f(t[0])}" y1="${f(t[1])}" x2="${f(d[0])}" y2="${f(d[1])}"/>`
    + `<g class="detector" transform="translate(${f(d[0])} ${f(d[1])}) rotate(${angle})"><rect x="-24" y="-5" width="48" height="10" rx="3"/></g>`
    + `<g class="tube" transform="translate(${f(t[0])} ${f(t[1])})"><circle r="9"/><path d="M-4 -3l8 6M4 -3l-8 6"/></g>`;
}

const AXIAL = rot => `<svg viewBox="0 0 220 190" role="img" aria-label="The patient seen from the feet with the C-arm at ${describeAngle({ rot, tilt: 0 })}">`
  + '<rect class="table" x="26" y="136" width="168" height="6" rx="3"/>'
  + '<ellipse class="body" cx="110" cy="96" rx="64" ry="38"/><ellipse class="lung" cx="76" cy="92" rx="20" ry="23"/><ellipse class="lung" cx="144" cy="92" rx="20" ry="23"/>'
  + '<ellipse class="heart" cx="120" cy="94" rx="18" ry="15"/><circle class="bone" cx="110" cy="124" r="7"/><path class="bone" d="M100 62h20"/>'
  + `${beam([118, 92], rot, 80)}<text class="side" x="6" y="100">R</text><text class="side" x="206" y="100">L</text></svg>`;

const SAGITTAL = tilt => `<svg viewBox="0 0 260 190" role="img" aria-label="The patient seen from the left with the C-arm at ${describeAngle({ rot: 0, tilt })}">`
  + '<rect class="table" x="14" y="136" width="232" height="6" rx="3"/>'
  + '<rect class="body" x="48" y="66" width="152" height="68" rx="30"/><path class="body" d="M14 112L52 100V134H14Z"/><circle class="body" cx="214" cy="100" r="22"/>'
  + '<ellipse class="heart" cx="128" cy="96" rx="19" ry="17"/><path class="bone" d="M62 124H192"/>'
  + `${beam([128, 92], tilt, 80)}<text class="side" x="20" y="100">Feet</text><text class="side" x="206" y="64">Head</text></svg>`;

// onChange({ rot, tilt }) runs on every slider move.
export function createCarm({ onChange, angle: start = { rot: 0, tilt: 0 } }) {
  let angle = { ...start };
  const axial = h('figure', { class: 'carm-fig' });
  const side = h('figure', { class: 'carm-fig' });
  const rot = h('input', { type: 'range', ...ROT, value: 0, 'aria-label': 'Rotation, RAO to the left and LAO to the right' });
  const tilt = h('input', { type: 'range', ...TILT, value: 0, 'aria-label': 'Angulation, caudal to the left and cranial to the right' });
  const rotOut = h('output', { class: 'carm-value' });
  const tiltOut = h('output', { class: 'carm-value' });

  function draw() {
    axial.innerHTML = `${AXIAL(angle.rot)}<figcaption>Seen from the feet. LAO swings the detector to the patient's left.</figcaption>`;
    side.innerHTML = `${SAGITTAL(angle.tilt)}<figcaption>Seen from the left. Cranial tilts the detector toward the head.</figcaption>`;
    rot.value = angle.rot;
    tilt.value = angle.tilt;
    rotOut.textContent = angle.rot === 0 ? 'AP' : `${angle.rot > 0 ? 'LAO' : 'RAO'} ${Math.abs(angle.rot)}`;
    tiltOut.textContent = angle.tilt === 0 ? 'none' : `${angle.tilt > 0 ? 'cranial' : 'caudal'} ${Math.abs(angle.tilt)}`;
    rot.setAttribute('aria-valuetext', rotOut.textContent);
    tilt.setAttribute('aria-valuetext', `angulation ${tiltOut.textContent}`);
  }
  const read = () => {
    angle = { rot: Number(rot.value), tilt: Number(tilt.value) };
    draw();
    onChange(angle);
  };
  rot.addEventListener('input', read);
  tilt.addEventListener('input', read);
  draw();

  return {
    el: h('div', { class: 'carm' },
      h('div', { class: 'carm-figs' }, axial, side),
      h('div', { class: 'carm-sliders' },
        h('label', {}, h('span', {}, 'Rotation'), rot, rotOut),
        h('label', {}, h('span', {}, 'Angulation'), tilt, tiltOut))),
    // Sets the sliders without announcing a change to onChange, for buttons that already know the angle.
    set(next) {
      angle = { ...next };
      draw();
    },
  };
}
