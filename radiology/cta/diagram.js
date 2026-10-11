// The schematic coronary tree for one system, drawn from tree.js. Hover and focus report a segment, a click or Enter selects it.
import { h } from '../core/dom.js';
import { VIEW, ROOT, OUTLINE, SEPTALS, GEOMETRY, BADGE_R, curvePath, badgeAt, CRUX } from './tree.js';

const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const FRONT = new Set(['lad', 'left-main']);
const NOTES = {
  right: [['Aortic root', 314, 30], ['Acute margin', 72, 510], ['Crux', 214, 618], ['Apex', 372, 716]],
  left: [['Aortic root', 314, 30], ['Septal branches', 150, 318], ['Crux', 214, 618], ['Apex', 372, 716]],
};

// segmentOf(id) is the table row. The LAD and left main are drawn last so they pass over the circumflex where the two cross.
function markup(system, segmentOf) {
  const ids = Object.keys(GEOMETRY).filter(id => GEOMETRY[id].system === system);
  // Halos first, then lines, so segments of one layer join cleanly and only a crossing between layers shows a gap.
  const layer = group => {
    const own = ids.filter(id => group === FRONT.has(segmentOf(id).artery));
    const path = (id, cls, extra) => `<path class="${cls}" data-seg="${id}" d="${curvePath(GEOMETRY[id].pts)}" stroke-width="${GEOMETRY[id].w + extra}"/>`;
    return own.map(id => path(id, 'glow', 10) + path(id, 'halo', 5)).join('') + own.map(id => path(id, `line a-${segmentOf(id).artery}`, 0)).join('');
  };
  const hits = ids.map(id => `<path class="hit" data-seg="${id}" d="${curvePath(GEOMETRY[id].pts)}" stroke-width="${GEOMETRY[id].w + 16}"/>`).join('');
  const badges = ids.map(id => {
    const s = segmentOf(id);
    const [x, y] = badgeAt(id);
    return `<g class="badge a-${s.artery}" data-seg="${id}" tabindex="0" role="button" aria-pressed="false" aria-label="${esc(`${s.name}, SYNTAX segment ${s.syntax}`)}" transform="translate(${x} ${y})">`
      + `<circle r="${BADGE_R}"/><text y="4">${esc(s.syntax)}</text></g>`;
  }).join('');
  const septals = system === 'left' ? SEPTALS.map(p => `<path class="septal" d="${curvePath(p)}"/>`).join('') : '';
  return `<path class="outline" d="${OUTLINE}"/>`
    + `<path class="aorta" d="M${ROOT.c[0] - ROOT.r} ${ROOT.c[1]}V0M${ROOT.c[0] + ROOT.r} ${ROOT.c[1]}V0"/><circle class="root" cx="${ROOT.c[0]}" cy="${ROOT.c[1]}" r="${ROOT.r}"/>`
    + `<circle class="crux" cx="${CRUX[0]}" cy="${CRUX[1]}" r="3"/>`
    + `<g class="notes">${NOTES[system].map(([t, x, y]) => `<text x="${x}" y="${y}">${t}</text>`).join('')}</g>${septals}`
    + `<g class="layer">${layer(false)}${layer(true)}</g><g class="hits">${hits}</g><g class="badges">${badges}</g>`;
}

export function createDiagram({ segmentOf, system = 'left', onHover, onSelect }) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'tree');
  svg.setAttribute('viewBox', `${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`);
  svg.setAttribute('role', 'group');
  svg.dataset.dominance = 'right';
  const el = h('div', { class: 'tree-box' }, svg);
  let selected = null;
  let current = system;

  const segOf = e => e.target.closest?.('[data-seg]')?.dataset.seg ?? null;
  function mark(id, cls, on) {
    for (const node of svg.querySelectorAll(`[data-seg="${id}"]`)) node.classList.toggle(cls, on);
  }
  const api = {
    el,
    get system() { return current; },
    setSystem(next) {
      current = next;
      selected = null;
      svg.innerHTML = markup(next, segmentOf);
      svg.setAttribute('aria-label', `${next === 'right' ? 'Right' : 'Left'} coronary system, schematic. Select a numbered segment for its name and description.`);
    },
    // Right dominant draws the PDA from the RCA (segment 4). Left dominant draws it from the circumflex (segment 15).
    setDominance(side) { svg.dataset.dominance = side; },
    setLabels(on) { svg.classList.toggle('no-numbers', !on); },
    highlight(id) {
      for (const node of svg.querySelectorAll('.hi')) node.classList.remove('hi');
      if (id) mark(id, 'hi', true);
    },
    select(id) {
      if (selected) mark(selected, 'sel', false);
      selected = id;
      for (const b of svg.querySelectorAll('.badge')) b.setAttribute('aria-pressed', String(b.dataset.seg === id));
      if (id) mark(id, 'sel', true);
    },
    // roles: segment id -> ['best' | 'foreshortened' | 'overlapped']. An empty map clears them.
    setRoles(roles) {
      svg.classList.toggle('has-roles', roles.size > 0);
      for (const node of svg.querySelectorAll('[data-seg]')) {
        const list = roles.get(node.dataset.seg) ?? [];
        for (const [role, cls] of [['best', 'best'], ['foreshortened', 'fore'], ['overlapped', 'over']]) node.classList.toggle(cls, list.includes(role));
      }
    },
  };

  for (const type of ['pointerover', 'focusin']) svg.addEventListener(type, e => { const id = segOf(e); if (id) onHover?.(id); });
  for (const type of ['pointerout', 'focusout']) svg.addEventListener(type, () => onHover?.(null));
  svg.addEventListener('click', e => { const id = segOf(e); if (id) onSelect?.(id); });
  svg.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.badge')) {
      e.preventDefault();
      onSelect?.(e.target.dataset.seg);
    }
  });
  api.setSystem(system);
  return api;
}
