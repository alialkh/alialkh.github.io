// Small DOM pieces the case panel and the reference screens share.
import { h } from '../core/dom.js';
import { describeAngle, entryAngle, isLateral } from './views.js';

export const section = (title, ...body) => h('section', {}, h('h3', {}, title), ...body);
export const list = (tag, items) => h(tag, {}, items.map(t => h('li', {}, t)));
export const note = (...body) => h('p', { class: 'note' }, ...body);
export const typicalAngle = p => describeAngle(entryAngle(p));
// "typical LAO 45, cranial 20", or for a lateral view the angle and the fact that it is a convention.
export const angleNote = p => (isLateral(p) ? `${typicalAngle(p)}, stored by convention` : `typical ${typicalAngle(p)}`);

// Text with web addresses turned into links, minus the full stop that ends the sentence.
export function linkify(text) {
  return text.split(/(https?:\/\/\S+)/).flatMap(part => {
    if (!/^https?:\/\//.test(part)) return part;
    const url = part.replace(/[.,;)]+$/, '');
    return [h('a', { href: url, rel: 'noopener', target: '_blank' }, url), part.slice(url.length)];
  });
}
export const sourceList = items => h('ol', { class: 'sources' }, items.map(s => h('li', {}, linkify(s))));

// A row of buttons where exactly one is pressed. options: [{ value, label }].
export function segmented({ label, options, value, onChange }) {
  const buttons = options.map(o => h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(o.value === value), onclick: () => onChange(o.value) }, o.label));
  return {
    el: h('div', { class: 'segmented', role: 'group', 'aria-label': label }, buttons),
    set(next) { buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === next))); },
  };
}

// A name that finds its place on the image. selector or id goes to on.find, hover to on.hover.
export function labelButton(text, target, on, number, extra = {}) {
  return h('button', {
    type: 'button', class: 'label-link', title: 'Show on the image', onclick: () => on.find(target),
    onmouseenter: () => on.hover(target), onmouseleave: () => on.hover(null), onfocus: () => on.hover(target), onblur: () => on.hover(null),
    ...extra,
  }, number != null && h('span', { class: 'num', 'aria-hidden': 'true' }, String(number)), text);
}

// Segment rows: the SYNTAX number in the artery's colour, the name, and the description under it.
export function segmentRows(segments, { button } = {}) {
  return h('ul', { class: 'structures seg-list' }, segments.map(s => h('li', {},
    button ? button(s) : h('strong', {}, s.name),
    h('span', {}, s.description))));
}
export const segBadge = s => h('span', { class: `seg-num a-${s.artery}`, 'aria-hidden': 'true' }, s.syntax);

export const ARTERY_NAMES = {
  rca: 'Right coronary artery', 'left-main': 'Left main', lad: 'Left anterior descending and its branches', lcx: 'Circumflex and its branches', other: 'Other',
};

// Adds the class narrow while the element is under px wide. The CSS stacks the columns then.
export function stackWhenNarrow(el, px = 640) {
  if (!window.ResizeObserver) return null;
  const observer = new ResizeObserver(() => el.classList.toggle('narrow', el.clientWidth < px));
  observer.observe(el);
  return observer;
}
