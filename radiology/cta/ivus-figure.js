// An original schematic IVUS cross-section. Every part names the concept in content/ivus.json that explains it.
import { h } from '../core/dom.js';

export const PARTS = [
  { id: 'catheter', name: 'Catheter and ring-down halo', concept: 'catheter-and-guidewire' },
  { id: 'guidewire', name: 'Guidewire and its acoustic shadow', concept: 'catheter-and-guidewire' },
  { id: 'lumen', name: 'Lumen', concept: 'lumen' },
  { id: 'plaque', name: 'Intima and plaque', concept: 'plaque-burden' },
  { id: 'calcium', name: 'Calcium', concept: 'calcium' },
  { id: 'shadow', name: 'Acoustic shadow behind calcium', concept: 'calcium' },
  { id: 'media', name: 'Media', concept: 'eem' },
  { id: 'eem', name: 'External elastic membrane (EEM)', concept: 'eem' },
  { id: 'adventitia', name: 'Adventitia', concept: 'eem' },
];

const C = 200;
const FIELD = 192;
const R_EEM = 112;
const R_MEDIA = 100;
const R_ADV = 156;
const rad = d => (d * Math.PI) / 180;
const f = n => Math.round(n * 10) / 10;
const at = (r, deg) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))];
// The lumen is round except where the plaque bulges in, centred at 60 degrees.
const lumenR = deg => 82 - 40 * Math.exp(-(((((deg - 60 + 540) % 360) - 180) / 52) ** 2));

const ring = (r, from = 0, to = 360, step = 4) => {
  const out = [];
  for (let d = from; d <= to; d += step) out.push(at(typeof r === 'function' ? r(d) : r, d));
  return out;
};
const poly = pts => `M${pts.map(p => `${f(p[0])} ${f(p[1])}`).join('L')}Z`;
const band = (inner, outer, from, to) => poly([...ring(outer, from, to), ...ring(inner, from, to).reverse()]);

const CAL = [28, 92];
const WIRE = 205;
const SHAPES = {
  adventitia: band(R_EEM, R_ADV, 0, 360),
  media: band(R_MEDIA, R_EEM, 0, 360),
  plaque: band(lumenR, R_MEDIA, 0, 360),
  lumen: band(22, lumenR, 0, 360),
  eem: band(R_EEM - 3, R_EEM + 3, 0, 360),
  calcium: band(d => lumenR(d) + 1, d => lumenR(d) + 9, ...CAL),
  shadow: band(d => lumenR(d) + 9, FIELD, ...CAL),
  guidewire: band(26, FIELD, WIRE - 3, WIRE + 3),
};

const markup = () => `<svg viewBox="0 0 400 400" role="group" aria-label="Schematic IVUS cross-section of a diseased artery. Select a part for its concept.">
  <defs>
    <clipPath id="round"><circle cx="${C}" cy="${C}" r="${FIELD}"/></clipPath>
    <filter id="noise" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="11"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.1 0 0 0 -0.3"/></filter>
    <radialGradient id="adv" cx="50%" cy="50%" r="50%"><stop offset="60%" stop-color="#4b5058"/><stop offset="100%" stop-color="#14171b"/></radialGradient>
    <linearGradient id="shade" gradientUnits="userSpaceOnUse" x1="${C}" y1="${C}" x2="${at(FIELD, (CAL[0] + CAL[1]) / 2)[0]}" y2="${at(FIELD, (CAL[0] + CAL[1]) / 2)[1]}"><stop offset="0.3" stop-color="#000" stop-opacity="0.92"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></linearGradient>
  </defs>
  <circle class="field" cx="${C}" cy="${C}" r="${FIELD}"/>
  <path class="part adventitia" data-part="adventitia" d="${SHAPES.adventitia}"/>
  <path class="part media" data-part="media" d="${SHAPES.media}"/>
  <path class="part plaque" data-part="plaque" d="${SHAPES.plaque}"/>
  <path class="part lumen" data-part="lumen" d="${SHAPES.lumen}"/>
  <path class="edge" d="${poly(ring(lumenR))}"/>
  <path class="part eem" data-part="eem" d="${SHAPES.eem}"/>
  <path class="part shadow" data-part="shadow" d="${SHAPES.shadow}"/>
  <path class="part calcium" data-part="calcium" d="${SHAPES.calcium}"/>
  <path class="part guidewire" data-part="guidewire" d="${SHAPES.guidewire}"/>
  <circle class="wire" cx="${f(at(30, WIRE)[0])}" cy="${f(at(30, WIRE)[1])}" r="3.5"/>
  <g class="part catheter" data-part="catheter"><circle class="halo2" cx="${C}" cy="${C}" r="25"/><circle class="halo" cx="${C}" cy="${C}" r="20"/><circle class="body" cx="${C}" cy="${C}" r="14"/></g>
  <g clip-path="url(#round)" pointer-events="none"><rect class="speckle" x="0" y="0" width="400" height="400" filter="url(#noise)"/></g>
  <g class="ticks">${[0, 90, 180, 270].map(d => { const [x, y] = at(FIELD - 4, d); return `<circle cx="${f(x)}" cy="${f(y)}" r="1.6"/>`; }).join('')}</g>
</svg>`;

// onHover(partId | null) on pointer and focus, onSelect(partId) on click and Enter. Parts take the keyboard with Tab.
export function createIvusFigure({ onHover, onSelect }) {
  const box = h('div', { class: 'ivus-box' });
  box.innerHTML = markup();
  const svg = box.firstElementChild;
  svg.querySelector('.shadow').setAttribute('fill', 'url(#shade)');
  svg.querySelector('.adventitia').setAttribute('fill', 'url(#adv)');
  for (const part of svg.querySelectorAll('.part')) {
    const info = PARTS.find(p => p.id === part.dataset.part);
    part.setAttribute('tabindex', '0');
    part.setAttribute('role', 'button');
    part.setAttribute('aria-pressed', 'false');
    part.setAttribute('aria-label', info.name);
  }
  const idOf = e => e.target.closest?.('[data-part]')?.dataset.part ?? null;
  for (const type of ['pointerover', 'focusin']) svg.addEventListener(type, e => { const id = idOf(e); if (id) onHover?.(id); });
  for (const type of ['pointerout', 'focusout']) svg.addEventListener(type, () => onHover?.(null));
  svg.addEventListener('click', e => { const id = idOf(e); if (id) onSelect?.(id); });
  svg.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-part]')) {
      e.preventDefault();
      onSelect?.(e.target.dataset.part);
    }
  });
  return {
    el: box,
    highlight(id) {
      for (const p of svg.querySelectorAll('.part')) p.classList.toggle('hi', p.dataset.part === id);
    },
    select(id) {
      for (const p of svg.querySelectorAll('.part')) {
        p.classList.toggle('sel', p.dataset.part === id);
        p.setAttribute('aria-pressed', String(p.dataset.part === id));
      }
    },
  };
}
