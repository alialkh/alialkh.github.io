// Reference screen: the schematic IVUS cross-section. Each part opens the concept from content/ivus.json that explains it.
import { h } from '../core/dom.js';
import { createIvusFigure, PARTS } from './ivus-figure.js';
import { section, list, note, sourceList } from './ui.js';

// The formula is read from the table, so the drawing and the table cannot disagree. It is the sentences that start at "Plaque plus media area =".
export const burdenFormula = concept => {
  const start = concept.definition.indexOf('Plaque plus media area =');
  return concept.definition.slice(start).split('. ').slice(0, 2).join('. ').replace(/\.?$/, '.');
};

// The concept as the table gives it. The card under the drawing and the Concept tab both show all of it.
const conceptBody = c => [
  h('p', {}, c.definition),
  h('p', {}, h('strong', {}, 'How to see it. '), c.howToSee),
  h('h4', { class: 'card-sub' }, 'Pitfalls'), list('ul', c.pitfalls),
  h('h4', { class: 'card-sub' }, 'Sources'), sourceList(c.sources),
];

export function createIvusRef({ content, refresh }) {
  const state = { hover: null, selected: null };
  const part = id => PARTS.find(p => p.id === id);
  const concept = id => content.concept.get(part(id).concept);
  const HINT = 'Point at a part, or Tab to it, to see its concept. Select it to keep it here and in the Concept tab.';
  const card = h('div', { class: 'ref-card', 'aria-live': 'polite' });
  const figure = createIvusFigure({
    onHover: id => { state.hover = id; showCard(); figure.highlight(id); },
    onSelect: id => pick(id),
  });
  function pick(id) {
    state.selected = id;
    figure.select(id);
    partButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(PARTS[i].id === id)));
    showCard();
    refresh();
  }
  // Pointing at a button only lights the part. The card sits above the buttons, so changing it would move them under the pointer.
  const partButtons = PARTS.map(p => h('button', {
    type: 'button', class: 'part-btn', 'aria-pressed': 'false', onclick: () => pick(p.id),
    onmouseenter: () => figure.highlight(p.id), onmouseleave: () => figure.highlight(null),
  }, p.name));
  const formula = h('p', { class: 'formula' }, h('strong', {}, 'Plaque burden. '), burdenFormula(content.concept.get('plaque-burden')));

  function showCard() {
    const id = state.hover ?? state.selected;
    if (!id) return card.replaceChildren(h('p', { class: 'muted' }, HINT));
    const c = concept(id);
    card.replaceChildren(h('p', { class: 'ref-card-title' }, h('strong', {}, part(id).name), h('span', { class: 'muted' }, c.name)), ...conceptBody(c));
  }
  showCard();

  return {
    el: h('div', { class: 'ref ref-ivus' },
      h('div', { class: 'ref-main' }, figure.el),
      h('div', { class: 'ref-side' }, card, h('div', { class: 'part-btns', role: 'group', 'aria-label': 'Parts of the drawing' }, partButtons), formula,
        h('p', { class: 'ref-hint' }, 'A schematic, simplified and not to scale. The layers are drawn brighter and darker as they usually look on grey-scale IVUS. It is not a real image.'))),
    tab: id => ({
      guide: () => [
        section('What this is', h('p', {}, 'An original schematic of an IVUS cross-section of a diseased artery. The catheter is at the centre, the lumen around it, then the wall layers out to the adventitia. One side carries plaque with calcium and its acoustic shadow.')),
        section('How to use it', list('ul', [
          'Point at a part, or Tab to it, for its concept. Select it to keep it in the Concept tab.',
          'The formula under the drawing is the plaque burden formula from the consensus table.',
        ])),
        note('Several parts share one concept because the consensus describes them together. The media and the adventitia are described in the EEM concept, and the intima in the lumen concept.'),
      ],
      concept: () => {
        const id = state.selected;
        if (!id) return [h('p', { class: 'hint' }, 'Select a part of the drawing to read its concept here.')];
        const c = concept(id);
        return [h('h4', { class: 'proj-title' }, part(id).name), h('p', { class: 'muted' }, `Concept: ${c.name}`), ...conceptBody(c)];
      },
    })[id]?.(),
  };
}
