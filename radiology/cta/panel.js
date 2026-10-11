// The info panel: one renderer per tab id, rebuilt for each screen. Reference screens add their own tabs through ref.tab(id).
import { h } from '../core/dom.js';
import { credit } from '../core/credit.js';
import { createTabPanel } from '../core/tabs.js';
import { TAB_NAMES, isAngio } from './cases.js';
import { creditGroups, shortAuthor } from './credits.js';
import { section, list, note, sourceList, labelButton, segmentRows, segBadge, angleNote, ARTERY_NAMES } from './ui.js';

export const shortCredit = (source, noun) => credit({ ...source, attribution: shortAuthor(source.author) }, { noun, changed: 're-encoded' });
export const nounOf = c => (c.kind.endsWith('still') ? 'Image' : 'Clip');

function projectionNote(c, content) {
  const p = c.projection && content.projection.get(c.projection);
  return section('Projection', p
    ? h('p', {}, h('strong', {}, p.name), `. Angle in this tool: ${angleNote(p)}.`)
    : h('p', {}, 'Not stated. The source gives no projection angle for this image, so the view is not named here. The Projections tab explains how views are named.'));
}

const STILL_HOW = [
  'Point at an outline, or Tab to it, to see its name and description.',
  'Select a name in the Segments tab to find it on the image.',
  'Labels (L) hides the outlines. Test mode hides them and these notes until you reveal.',
];
const IVUS_HOW = [
  'The catheter is the black disc in the middle with a bright halo around it. The halo is an artefact.',
  'The dark area around it is the lumen. The wall layers lie outside it.',
  'The scanner text at the bottom right reads 8.2 mm, 1 mm/div, and the ticks along the axes are 1 mm apart.',
  'The IVUS concepts tab explains each structure and its pitfalls.',
];
const PIN_POLICY = 'Pins appear only where a lesion box in the dataset clearly lines up with a narrowing in the frames. The dataset boxes lesions on key frames only and the vessel moves with the heartbeat, so a pin can sit off the lesion between frames. The dataset names its bands p0_20 to p90_98 without defining them. Here they are read as percent stenosis ranges.';

const TABS = {
  overview: ({ c, content, on }) => [
    c.notes?.trim() && section('About this case', h('p', {}, c.notes)),
    section('Summary', h('p', {}, c.summary)),
    isAngio(c) && projectionNote(c, content),
    c.kind === 'angio-still' && [
      section('How to use', list('ul', STILL_HOW)),
      note(h('strong', {}, 'The outlines are the dataset\'s own labels. '), 'They can be incomplete, so a visible vessel with no outline is not necessarily without a name.'),
    ],
    c.kind === 'angio-clip' && [
      section(c.pins?.length ? 'On this clip' : 'Lesion pins', c.pins?.length
        ? h('ol', { class: 'pin-list' }, c.pins.map((p, i) => h('li', {}, labelButton(p.text, `[data-pin="${i + 1}"]`, on, i + 1))))
        : h('p', {}, 'No pins on this clip.')),
      note(PIN_POLICY),
    ],
    c.kind === 'ivus-clip' && [
      section('How to read it', list('ul', IVUS_HOW)),
      note('The source video was stretched sideways by about 4:3. It was resampled to square pixels, so the vessel cross-section is round.'),
    ],
  ],
  segments: ({ c, content, on }) => {
    const find = s => h('button', {
      type: 'button', class: 'label-link', title: 'Show on the image', onclick: () => on.find(s.id),
      onmouseenter: () => on.hover(s.id), onmouseleave: () => on.hover(null), onfocus: () => on.hover(s.id), onblur: () => on.hover(null),
    }, segBadge(s), s.name);
    if (c.kind === 'angio-still') {
      const outlined = new Set(c.regions.map(r => r.segment));
      const shown = content.segments.filter(s => outlined.has(s.id));
      return [h('p', { class: 'hint' }, 'The segments the dataset outlines in this image. Select one to find it.'), segmentRows(shown, { button: find })];
    }
    return [
      h('p', { class: 'hint' }, 'This clip has no segment outlines. These are all the SYNTAX segments.'),
      h('p', {}, h('a', { href: '#/ref-segments' }, 'Open the segment diagram')),
      ...Object.keys(ARTERY_NAMES).map(a => content.segments.some(s => s.artery === a) && section(ARTERY_NAMES[a],
        segmentRows(content.segments.filter(s => s.artery === a), { button: s => h('strong', {}, segBadge(s), s.name) }))),
    ];
  },
  projections: ({ content }) => [
    section('How views are named', list('ul', [
      'LAO and RAO say which side of the patient the image intensifier sits on, left or right. AP means straight on.',
      'Cranial tilts it toward the head and caudal toward the feet.',
      'This tool writes rotation as positive for LAO and negative for RAO, and angulation as positive for cranial and negative for caudal.',
      'The spider view is LAO caudal. It is not RAO caudal.',
      'A lateral view is stored as LAO 90 by convention. No source gives a rotation angle for it.',
    ])),
    section('Standard views', h('ul', { class: 'views' }, content.projections.map(p => h('li', {},
      h('strong', {}, p.name), h('span', {}, `Angle: ${angleNote(p)}.`))))),
    h('p', {}, 'Each view lists one typical angle. Sources give different angles, and the guide shows their ranges. ', h('a', { href: '#/ref-projections' }, 'Open the projection guide')),
  ],
  concepts: ({ content }) => [
    h('p', { class: 'hint' }, 'Concepts from the CVIT 2025 IVUS consensus. Open one for how to see it and its pitfalls.'),
    ...content.ivus.map(c => h('details', { class: 'concept' },
      h('summary', {}, c.name),
      h('p', {}, c.definition), h('p', {}, h('strong', {}, 'How to see it. '), c.howToSee), list('ul', c.pitfalls))),
  ],
};

function creditsTab(screen, content) {
  const { c, kind } = screen;
  return [
    c ? section(`${nounOf(c)} credit`, credit(c.source, { noun: nounOf(c), changed: 're-encoded' }),
      h('p', {}, h('strong', {}, 'Changes. '), c.source.modified),
      h('p', {}, h('strong', {}, 'Authors. '), c.source.author))
      : section('Drawings', h('p', {}, 'The drawings on this screen are original schematics made for this tool. They are simplified and not to scale.')),
    ...creditGroups(kind, content).map(g => section(g.title, sourceList(g.items))),
  ];
}

export function createPanel({ content, on, onToggle }) {
  let screen = null;
  let ref = null;
  const panel = createTabPanel({
    label: 'Case information', handle: 'Case notes', closeLabel: 'Hide case notes (I)', onToggle,
    render: id => (id === 'credits' ? creditsTab(screen, content) : ref ? ref.tab(id) : TABS[id]({ c: screen.c, content, on })),
  });
  return {
    el: panel.el,
    show(s, r = null) {
      [screen, ref] = [s, r];
      panel.show(s.tabs.map(id => ({ id, name: TAB_NAMES[id] })));
    },
    refresh: panel.refresh,
    setOpen: panel.setOpen,
  };
}
