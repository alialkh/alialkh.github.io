// What the side panel says: one renderer per tab, rebuilt whenever the case, the active series or the active finding changes.
import { h } from '../core/dom.js';
import { DISCLAIMER } from '../core/shell.js';
import { credit } from '../core/credit.js';
import { PLANE_NAMES, planeInfo, indexToPosition } from './planes.js';
import { structuresPresent, cssColor } from './labels.js';
import { windowEnds } from './window.js';

export const TAB_NAMES = { overview: 'Overview', findings: 'Findings', anatomy: 'Anatomy', tips: 'Tips', credits: 'Credits' };
export const tabsFor = c => ['overview', ...(c.findings.length ? ['findings'] : []), ...(c.labels ? ['anatomy'] : []), 'tips', 'credits']
  .map(id => ({ id, name: TAB_NAMES[id] }));

const section = (title, ...body) => h('section', {}, h('h3', {}, title), ...body);
const unit = c => (c.modality === 'CT' ? ' HU' : '');
const link = (href, text) => h('a', { href, rel: 'noopener', target: '_blank' }, text ?? href);

const ORIENT = 'The letters at the edges of each image name the direction: R and L for the patient\'s right and left, A and P for front and back, S and I for head and feet. '
  + 'On an axial slice the patient\'s right is on the left of the screen and the front of the body is at the top.';

const KEYS = [
  ['Scroll', 'Mouse wheel, Up and Down arrows, or one finger dragging up and down. Page Up and Page Down move 10 slices. Home and End go to the first and last slice.'],
  ['Window', 'Drag with the left button, or use the Level and Width sliders. Drag right to widen, drag up to brighten. Keys 1 to 9 pick a preset.'],
  ['Zoom and pan', 'Drag with the right button or pinch to zoom, hold Shift while dragging or use the middle button to pan. From the keyboard, plus and minus zoom and Shift with the arrows pans. Double click or R resets the active viewport.'],
  ['Measure', 'M turns the ruler on. Drag across the image to read a distance in millimetres. From the keyboard, Enter drops the first and then the second end at the crosshair.'],
  ['Viewports', 'Click a viewport to make it active. The wheel, window, zoom and pan act under the pointer, the keys on the active one. Drag a title bar onto another viewport to swap them, or drag a series from the list onto one. '
    + 'With a title bar focused, Alt and an arrow key swap with the neighbour. Double click a title bar or press X to fill the grid, Escape to restore. V links the viewports so the same planes stay on the same slice.'],
  ['Panels', 'C the case list, I this panel, B the control bar, A the corner text, Z only the images, F fullscreen, T test mode.'],
  ['Other', 'L labels, Space plays the slices, J and K change case.'],
];

const urlsIn = text => [...text.matchAll(/https?:\/\/[^\s)]+/g)].map(m => m[0].replace(/[.,;]+$/, ''));

const TABS = {
  overview: ({ c, series }) => [
    c.vignette && section('Clinical context', h('p', {}, c.vignette)),
    section('Summary', h('p', {}, c.summary)),
    section('Sequence', h('p', {}, h('strong', {}, series.name), ` · ${c.modality === 'CT' ? 'CT, values in Hounsfield units' : 'MRI, values in scanner units'}`)),
    section('How to orient', h('p', {}, ORIENT)),
  ],

  findings: ({ c, ui, dims, spacing, show }) => [
    h('p', { class: 'hint' }, 'Show me moves a viewport to the finding and marks it with a ring.'),
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
    section('Corner text', h('p', {}, 'Im is the image number out of the total. Loc is the distance in millimetres from the first image of the stack, because these scans carry no table position. '
      + 'Sp is the spacing between neighbouring slices. WW and WL are the window width and level, and HU or Intensity is the value under the pointer.')),
    section('Controls', h('dl', { class: 'keys' }, KEYS.flatMap(([term, text]) => [h('dt', {}, term), h('dd', {}, text)]))),
  ],

  // The credit line is the one core/credit.js builds for the page, word for word. The rest is the same facts laid out to read.
  credits: ({ c, dims, spacing }) => {
    const s = c.source;
    const links = urlsIn(s.attribution);
    return [
      h('p', { class: 'hint' }, 'CC BY and CC BY-SA ask that this credit stays with the scan. A short form is always shown over the first image.'),
      h('div', { class: 'credit-block' }, credit(s, { noun: 'Scan', changed: 'processed' })),
      section('Source', h('dl', { class: 'facts' },
        h('dt', {}, 'Dataset'), h('dd', {}, s.short ?? s.author),
        h('dt', {}, 'Author'), h('dd', {}, s.author),
        h('dt', {}, 'License'), h('dd', {}, link(s.licenseUrl, s.license)),
        h('dt', {}, 'Source'), h('dd', {}, link(s.url)),
        h('dt', {}, 'Case'), h('dd', {}, c.id),
        dims && [h('dt', {}, 'Volume'), h('dd', {}, `${dims.join(' × ')} voxels, ${spacing.map(v => Number(v.toFixed(2))).join(' × ')} mm`)])),
      links.length > 0 && section('Links in the credit', h('ul', {}, links.map(u => h('li', {}, link(u))))),
      s.modified && section('What was changed', h('p', {}, s.modified)),
      section('Use', h('p', {}, DISCLAIMER)),
    ];
  },
};

// ctx: { c, ui, series, dims, spacing, presets, show(finding), jump(structure) }
export const renderTab = (id, ctx) => TABS[id](ctx).flat().filter(Boolean);
