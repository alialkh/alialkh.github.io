// Reference screen: the schematic coronary tree with every SYNTAX segment, a legend and a dominance toggle.
import { h } from '../core/dom.js';
import { createDiagram } from './diagram.js';
import { GEOMETRY } from './tree.js';
import { section, list, note, segmented, segmentRows, segBadge, ARTERY_NAMES } from './ui.js';

const DOMINANCE = {
  right: 'Right dominant. The PDA comes from the RCA as segment 4, and segment 15 is usually absent.',
  left: 'Left dominant. The PDA is the end of the circumflex as segment 15, and segment 4 is usually absent.',
};

// Shared by the projection guide, which draws the same tree.
export function legend(content) {
  return h('ul', { class: 'legend', 'aria-label': 'Artery colours' }, Object.keys(ARTERY_NAMES).map(a => {
    const own = content.segments.filter(s => s.artery === a);
    return own.length > 0 && h('li', { class: `a-${a}` }, h('span', { class: 'swatch' }), h('span', {}, `${ARTERY_NAMES[a]}, ${own.map(s => s.syntax).join(', ')}`));
  }));
}

// The card under a figure: the segment under the pointer, else the selected one, else a hint.
export function createSegmentCard(content) {
  const el = h('div', { class: 'ref-card', 'aria-live': 'polite' });
  return {
    el,
    show(id, hint) {
      const s = id && content.segment.get(id);
      el.replaceChildren(...(s
        ? [h('p', { class: 'ref-card-title' }, segBadge(s), h('strong', {}, s.name), h('span', { class: 'muted' }, ARTERY_NAMES[s.artery])), h('p', {}, s.description)]
        : [h('p', { class: 'muted' }, hint)]));
    },
  };
}

export function createSegmentsRef({ content }) {
  const state = { system: 'right', dominance: 'right', selected: null };
  const HINT = 'Point at a number, or Tab to it, for the name and description. Select it to keep it here.';
  const card = createSegmentCard(content);
  const diagram = createDiagram({
    segmentOf: id => content.segment.get(id), system: state.system,
    onHover: id => { diagram.highlight(id ?? state.selected); card.show(id ?? state.selected, HINT); },
    onSelect: id => select(id),
  });
  const system = segmented({ label: 'Coronary system', value: 'right', options: [{ value: 'right', label: 'Right coronary' }, { value: 'left', label: 'Left coronary' }], onChange: v => setSystem(v) });
  const dominance = segmented({ label: 'Dominance', value: 'right', options: [{ value: 'right', label: 'Right dominant' }, { value: 'left', label: 'Left dominant' }], onChange: v => setDominance(v) });
  const dominanceText = h('p', { class: 'ref-hint' }, DOMINANCE.right);

  function select(id) {
    state.selected = id;
    // A segment in the other system opens that system first.
    if (id && GEOMETRY[id].system !== diagram.system) setSystem(GEOMETRY[id].system);
    diagram.select(id);
    diagram.highlight(id);
    card.show(id, HINT);
  }
  function setSystem(next) {
    system.set(next);
    diagram.setSystem(next);
    diagram.setDominance(state.dominance);
    if (state.selected && GEOMETRY[state.selected].system === next) diagram.select(state.selected);
  }
  function setDominance(next) {
    state.dominance = next;
    dominance.set(next);
    diagram.setDominance(next);
    dominanceText.textContent = DOMINANCE[next];
  }
  card.show(null, HINT);

  return {
    el: h('div', { class: 'ref ref-tree' },
      h('div', { class: 'ref-tools' }, system.el, dominance.el),
      diagram.el,
      h('div', { class: 'ref-side' }, card.el, dominanceText, legend(content),
        h('p', { class: 'ref-hint' }, 'A schematic, simplified and not to scale. Septal branches are drawn for orientation only.'))),
    setLabels: diagram.setLabels,
    tab: id => ({
      guide: () => [
        section('What this is', h('p', {}, 'An original schematic of the coronary arteries with every SYNTAX score segment, drawn from the segment descriptions. It is not a copy of any published figure.')),
        section('How to use it', list('ul', [
          'Switch between the right and the left coronary system. Each number is one segment.',
          'Point at a number, or Tab to it, for its name and description. Select it to keep it.',
          'The dominance toggle shows where the PDA comes from.',
          'Labels (L) hides the numbers.',
        ])),
        note('The drawing follows the descriptions: where each segment starts and ends, and which segment each branch leaves. Where a description names no parent, as for segments 14, 14a and 14b, the branch is drawn off the distal circumflex.'),
      ],
      segments: () => [
        h('p', { class: 'hint' }, 'Select a segment to find it on the drawing.'),
        ...Object.keys(ARTERY_NAMES).map(a => content.segments.some(s => s.artery === a) && section(ARTERY_NAMES[a],
          segmentRows(content.segments.filter(s => s.artery === a), {
            button: s => h('button', { type: 'button', class: 'label-link', onclick: () => select(s.id) }, segBadge(s), s.name),
          }))),
      ],
    })[id]?.(),
  };
}
