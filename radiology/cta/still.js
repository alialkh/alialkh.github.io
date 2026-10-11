// An angiogram still fitted to its cell, with the dataset's segment outlines, name chips and a hover card.
import { h } from '../core/dom.js';
import { layoutLabels } from '../echo/label-layout.js';
import { polygonAnchor, spreadPoints } from './polygon.js';

// Stills are 512 px. Past twice that, upscaling only adds blur.
const MAX_SCALE = 2;
const DOT_R = 6;
// A badge is up to 24 by 20 px, so badges closer than the diagonal, 32 px, could overlap. Name chips use a dot of 9 px.
const BADGE_GAP = 32;
const DOT_GAP = 22;
// On a frame this narrow a name chip hides too much of the image, so only numbers show.
const NAMES_FROM = 520;
const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// c is a CathCase with regions. segment(id) returns the table row.
export function createStill(c, segment) {
  const regions = c.regions ?? [];
  const rows = regions.map(r => segment(r.segment));
  const anchors = regions.map(r => polygonAnchor(r.polygon));
  const frame = h('div', { class: 'frame' });
  const img = h('img', { src: c.src, width: c.width, height: c.height, alt: 'Coronary angiogram still frame', draggable: 'false' });
  const outlines = h('div', { class: 'regions' });
  outlines.innerHTML = `<svg viewBox="0 0 1 1" preserveAspectRatio="none" role="group" aria-label="Segment outlines from the dataset">${regions.map((r, i) =>
    `<polygon class="region a-${rows[i].artery}" data-seg="${r.segment}" tabindex="0" role="img" aria-label="${esc(`${rows[i].name}, SYNTAX segment ${rows[i].syntax}`)}" points="${r.polygon.map(p => p.join(',')).join(' ')}"/>`).join('')}</svg>`;
  const labels = h('div', { class: 'rlabels' }, regions.map((r, i) => h('span', {
    class: `rlabel a-${rows[i].artery} badged`, 'data-seg': r.segment, style: `left: ${anchors[i][0] * 100}%; top: ${anchors[i][1] * 100}%`,
  }, h('span', { class: 'dot' }, rows[i].syntax), h('span', { class: 'chip' }, rows[i].name))));
  const card = h('div', { class: 'seg-card glass', 'aria-hidden': 'true' });
  frame.append(img, outlines, labels, card);
  const cell = h('div', { class: 'cell' }, frame);

  const chips = [...labels.children].map(el => el.querySelector('.chip'));
  let laidOut = '';
  const fit = () => {
    const scale = Math.min(cell.clientWidth / c.width, cell.clientHeight / c.height, MAX_SCALE);
    const [width, height] = [Math.floor(c.width * scale), Math.floor(c.height * scale)];
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;
    // Hidden labels measure zero. The observer watches them too, so they lay out when they show.
    const key = labels.offsetWidth && `${width}x${height}`;
    if (!key || key === laidOut) return;
    laidOut = key;
    const points = spreadPoints(anchors.map(([x, y]) => [x * width, y * height]), width < NAMES_FROM ? BADGE_GAP : DOT_GAP, width, height);
    const spots = layoutLabels({ width, height, markers: points.map(([x, y], i) => ({ x, y, r: DOT_R, w: chips[i].offsetWidth, h: chips[i].offsetHeight })) });
    spots.forEach((s, i) => {
      const el = labels.children[i];
      el.classList.toggle('badged', s.badge || width < NAMES_FROM);
      el.style.left = `${(points[i][0] / width) * 100}%`;
      el.style.top = `${(points[i][1] / height) * 100}%`;
      el.style.setProperty('--x', `${s.x}px`);
      el.style.setProperty('--y', `${s.y}px`);
    });
  };
  const observer = window.ResizeObserver ? new ResizeObserver(fit) : null;
  if (observer) [cell, labels].forEach(el => observer.observe(el));
  // shortcut: without ResizeObserver only window resizes refit. Every browser since 2020 has it.
  else {
    addEventListener('resize', fit);
    requestAnimationFrame(fit);
  }

  function highlight(id) {
    for (const el of frame.querySelectorAll('[data-seg]')) el.classList.toggle('hi', el.dataset.seg === id);
    const i = regions.findIndex(r => r.segment === id);
    card.classList.toggle('shown', i >= 0);
    if (i < 0) return;
    const s = rows[i];
    card.replaceChildren(h('strong', {}, `${s.syntax} ${s.name}`), h('span', {}, s.description));
    // The card goes to the half of the frame the segment is not in.
    card.classList.toggle('top', anchors[i][1] > 0.55);
  }
  const idOf = e => e.target.closest?.('[data-seg]')?.dataset.seg ?? null;
  for (const [type, id] of [['pointerover', e => idOf(e)], ['pointerout', () => null], ['focusin', e => idOf(e)], ['focusout', () => null]]) {
    frame.addEventListener(type, e => {
      highlight(id(e));
    });
  }

  return {
    el: cell,
    highlight,
    pulse(id) {
      for (const el of frame.querySelectorAll(`[data-seg="${id}"]`)) {
        el.classList.remove('pulse');
        void el.getBoundingClientRect();
        el.classList.add('pulse');
        setTimeout(() => el.classList.remove('pulse'), 1600);
      }
      highlight(id);
      setTimeout(() => highlight(null), 2400);
    },
    destroy() {
      if (observer) observer.disconnect();
      else removeEventListener('resize', fit);
    },
  };
}
