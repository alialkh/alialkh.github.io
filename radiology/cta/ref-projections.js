// Reference screen: the C-arm angle picker. The angle picks the nearest listed view, and the coronary diagram
// marks only what that view's table entry lists.
import { h } from '../core/dom.js';
import { createCarm } from './carm.js';
import { createDiagram } from './diagram.js';
import { createSegmentCard, legend } from './ref-segments.js';
import { entryAngle, matchProjection, segmentRoles, describeAngle, isLateral, TOLERANCE } from './views.js';
import { section, list, note, segmented, sourceList, typicalAngle, angleNote } from './ui.js';

const ROLES = [
  ['best', 'Best seen', 'The table lists the segment as well seen in this view.'],
  ['foreshortened', 'Foreshortened', 'The table lists the segment as foreshortened in this view.'],
  ['overlapped', 'Overlapped', 'The table lists the segment as overlapped by another in this view.'],
];
const SYSTEM_NAMES = { left: 'left', right: 'right' };

// start is { angle, system, title } when a case sends the picker to its stated angles.
export function createProjectionsRef({ content, refresh, start }) {
  const state = { system: start?.system ?? 'left', angle: start?.angle ?? { rot: 45, tilt: 20 }, match: null };
  const nameOf = id => content.segment.get(id).name;
  const card = createSegmentCard(content);
  const HINT = 'Move the sliders or pick a view. Point at a segment for its name.';
  const diagram = createDiagram({
    segmentOf: id => content.segment.get(id), system: state.system,
    onHover: id => card.show(id, HINT),
  });
  const system = segmented({ label: 'Coronary system', value: state.system, options: [{ value: 'left', label: 'Left coronary' }, { value: 'right', label: 'Right coronary' }], onChange: v => setSystem(v) });
  const carm = createCarm({ angle: state.angle, onChange: angle => setAngle(angle, false) });
  const views = h('div', { class: 'view-btns', role: 'group', 'aria-label': 'Listed views' });
  const summary = h('p', { class: 'ref-summary', 'aria-live': 'polite' });
  const from = start && h('p', { class: 'ref-hint' }, `Angles stated for ${start.title}.`);
  const roleKey = h('ul', { class: 'role-key', 'aria-label': 'What the marks mean' }, ROLES.map(([role, name, text]) => h('li', { title: text }, h('span', { class: `role-sw ${role}` }), name)));

  function drawViews() {
    views.replaceChildren(...content.projections.filter(p => p.system === state.system || p.system === 'both').map(p => h('button', {
      type: 'button', class: 'view-btn', 'aria-pressed': String(state.match?.entry === p), onclick: () => setAngle(entryAngle(p), true),
    }, h('strong', {}, p.name), h('span', {}, angleNote(p)))));
  }
  function update(notify = true) {
    state.match = matchProjection(state.angle, content.projections, state.system);
    const picked = `Selected ${describeAngle(state.angle)}.`;
    summary.textContent = state.match
      ? `${picked} Nearest listed view: ${state.match.entry.name}, ${angleNote(state.match.entry)}.`
      : `${picked} No listed ${SYSTEM_NAMES[state.system]} coronary view is within ${TOLERANCE} degrees of this angle, so nothing is marked.`;
    diagram.setRoles(segmentRoles(state.match?.entry));
    drawViews();
    if (notify) refresh();
  }
  function setAngle(angle, moveSliders) {
    state.angle = angle;
    if (moveSliders) carm.set(angle);
    update();
  }
  function setSystem(next) {
    state.system = next;
    system.set(next);
    diagram.setSystem(next);
    update();
  }
  update(false);
  card.show(null, HINT);

  return {
    el: h('div', { class: 'ref ref-views' },
      h('div', { class: 'ref-tools' }, system.el, summary, from),
      h('div', { class: 'ref-left' }, carm.el, views),
      h('div', { class: 'ref-right' }, roleKey, diagram.el, card.el, legend(content),
        h('p', { class: 'ref-hint' }, 'Segments that are not marked are simply not listed for this view. That does not mean they cannot be seen. Where the sources disagree with a mark, the Projection tab says so.'))),
    setLabels: diagram.setLabels,
    tab: id => ({
      guide: () => [
        section('What this is', h('p', {}, 'A schematic of the C-arm. Set the rotation and the angulation, or pick a listed view, and the coronary diagram marks what the projection table says about it.')),
        section('How to use it', list('ul', [
          'Pick the left or the right coronary system.',
          'Move the two sliders, or choose a view from the list. The view buttons set the angle to its typical value.',
          'The nearest listed view within 15 degrees is the match. Where nothing is near, nothing is marked.',
          'Best seen, foreshortened and overlapped come only from the table. No other segment is marked.',
        ])),
        note('Rotation is positive for LAO and negative for RAO. Angulation is positive for cranial and negative for caudal. A lateral view is stored as LAO 90 by convention.'),
      ],
      projection: () => {
        const p = state.match?.entry;
        if (!p) return [h('p', { class: 'hint' }, `No listed view for the ${SYSTEM_NAMES[state.system]} coronary system is within ${TOLERANCE} degrees of ${describeAngle(state.angle)}. Move the sliders or pick a view.`)];
        const named = ids => (ids.length ? ids.map(nameOf).join(', ') : 'none listed');
        return [
          h('h4', { class: 'proj-title' }, p.name),
          p.aliases.length > 0 && h('p', { class: 'muted' }, `Also called ${p.aliases.join(', ')}.`),
          isLateral(p)
            ? h('p', {}, h('strong', {}, 'Angle in this tool. '), 'LAO 90. A lateral view is stored as LAO 90 by convention, because no source gives a rotation angle for it.')
            : h('p', {}, h('strong', {}, 'Typical angle. '), `${typicalAngle(p)}. This is a typical value. Where the sources give other angles, the text below lists them.`),
          section('When to use it', h('p', {}, p.whenToUse)),
          section('Segments the table lists', list('ul', [
            [h('strong', {}, 'Best seen. '), named(p.bestSeen)],
            [h('strong', {}, 'Foreshortened. '), named(p.foreshortened)],
            [h('strong', {}, 'Overlapped. '), named(p.overlapped)],
          ])),
          section('Pitfalls', list('ul', p.pitfalls)),
          section('Sources', sourceList(p.sources)),
        ];
      },
    })[id]?.(),
  };
}
