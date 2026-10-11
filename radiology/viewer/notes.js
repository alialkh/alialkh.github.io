// What the info panel says: one renderer per tab, rebuilt whenever the case, the series or the active finding changes.
import { h } from '../core/dom.js';
import { PLANE_NAMES, planeInfo, indexToPosition } from './planes.js';
import { structuresPresent, cssColor } from './labels.js';
import { windowEnds } from './window.js';

export const TAB_NAMES = { overview: 'Overview', findings: 'Findings', anatomy: 'Anatomy', tips: 'Tips' };
export const tabsFor = c => ['overview', ...(c.findings.length ? ['findings'] : []), ...(c.labels ? ['anatomy'] : []), 'tips']
  .map(id => ({ id, name: TAB_NAMES[id] }));

const section = (title, ...body) => h('section', {}, h('h3', {}, title), ...body);
const unit = c => (c.modality === 'CT' ? ' HU' : '');

const ORIENT = 'The letters at the edges of each image name the direction: R and L for the patient\'s right and left, A and P for front and back, S and I for head and feet. '
  + 'On an axial slice the patient\'s right is on the left of the screen and the front of the body is at the top.';

const KEYS = [
  ['Scroll', 'Mouse wheel, Up and Down arrows, or one finger dragging up and down. Page Up and Page Down move 10 slices. Home and End go to the first and last slice.'],
  ['Window', 'Drag with the left button, or use the Level and Width sliders. Drag right to widen, drag up to brighten. Keys 1 to 9 pick a preset.'],
  ['Zoom and pan', 'Drag with the right button or pinch to zoom, hold Shift while dragging or use the middle button to pan. From the keyboard, plus and minus zoom and Shift with the arrows pans. Double click or R resets.'],
  ['Measure', 'M turns the ruler on. Drag across the image to read a distance in millimetres. From the keyboard, Enter drops the first and then the second end at the crosshair. Scroll the other planes in three-plane view to move the crosshair.'],
  ['Other', 'L labels, I this panel, T test mode, F fullscreen, Space plays the slices, J and K change case.'],
];

const TABS = {
  overview: ({ c, series }) => [
    c.vignette && section('Clinical context', h('p', {}, c.vignette)),
    section('Summary', h('p', {}, c.summary)),
    section('Sequence', h('p', {}, h('strong', {}, series.name), ` · ${c.modality === 'CT' ? 'CT, values in Hounsfield units' : 'MRI, values in scanner units'}`)),
    section('How to orient', h('p', {}, ORIENT)),
  ],

  findings: ({ c, ui, dims, spacing, show }) => [
    h('p', { class: 'hint' }, 'Show me moves the image to the finding and marks it with a ring.'),
    h('ol', { class: 'findings' }, c.findings.map(f => {
      const count = dims && planeInfo(f.plane, dims, spacing).count;
      const where = `${PLANE_NAMES[f.plane]}${count ? `, slice ${indexToPosition(f.plane, f.index, count) + 1} of ${count}` : ''}`;
      return h('li', { class: ui.finding?.id === f.id ? 'on' : null, 'aria-current': ui.finding?.id === f.id ? 'true' : null },
        h('h4', {}, f.title),
        h('p', { class: 'where' }, where),
        h('p', {}, f.text),
        h('button', { type: 'button', class: 'show-me', onclick: () => show(f) }, 'Show me'));
    })),
  ],

  anatomy: ({ c, jump }) => [
    h('p', { class: 'hint' }, 'Select a structure to move the crosshair to its centre. Hover the image to read names. Press L to show or hide the colours.'),
    h('ul', { class: 'structures' }, structuresPresent(c.labels).map(s => h('li', {},
      h('button', { type: 'button', class: 'structure', onclick: () => jump(s) },
        h('span', { class: 'swatch', style: `background: ${cssColor(s.id)}`, 'aria-hidden': 'true' }), s.name)))),
  ],

  tips: ({ c, presets }) => [
    section('Window level and width',
      h('p', {}, 'The level is the middle of the range of values drawn as gray. The width is the size of that range. Values below it are drawn black and values above it white.'),
      h('p', {}, 'A narrow width spreads a small range of values over the whole gray scale. A wide width fits more values on screen, with less difference between close ones.'),
      h('p', {}, c.modality === 'CT'
        ? 'CT values are Hounsfield units: air is about -1000, water is 0 and compact bone is several hundred or more.'
        : 'MRI values are arbitrary scanner units. The same tissue gets different numbers on another scan or sequence, so compare within one image.')),
    section('Window presets', h('ul', {}, presets.map(({ name, center, width }, i) => {
      const [low, high] = windowEnds({ center, width });
      return h('li', {}, h('strong', {}, `${i + 1}. ${name}`), `: level ${Math.round(center)}, width ${Math.round(width)}. Black at ${Math.round(low)}${unit(c)} and below, white at ${Math.round(high)}${unit(c)} and above.`);
    }))),
    section('Controls', h('dl', { class: 'keys' }, KEYS.flatMap(([term, text]) => [h('dt', {}, term), h('dd', {}, text)]))),
  ],
};

// ctx: { c, ui, series, dims, spacing, presets, show(finding), jump(structure) }
export const renderTab = (id, ctx) => TABS[id](ctx).flat().filter(Boolean);
