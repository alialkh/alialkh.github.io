// The case notes: one renderer per tab in the core tab panel, rebuilt for each case.
import { h } from '../core/dom.js';
import { createTabPanel } from '../core/tabs.js';
import { TAB_NAMES } from './case-list.js';

// The scale is the figure's 200 by 240 viewBox.
export const probeTransform = probe => ({ x: probe.chest[0] * 200, y: probe.chest[1] * 240, angle: probe.angle });

function probeFigure(probe) {
  const { x, y, angle } = probeTransform(probe);
  const fig = h('figure', { class: 'probe-figure' });
  fig.innerHTML = `<svg viewBox="0 0 200 240" role="img" aria-label="Probe position on the front of the chest">
    <path class="torso" d="M30 30 Q100 10 170 30 L178 120 Q172 200 150 236 H50 Q28 200 22 120 Z"/>
    <path class="bone" d="M42 30 Q70 40 94 34 M106 34 Q130 40 158 30 M94 34 H106 V138 H94 Z M100 140 L58 186 M100 140 L142 186"/>
    <ellipse class="heart" cx="112" cy="110" rx="30" ry="22" transform="rotate(25 112 110)"/>
    <text x="10" y="18">R</text><text x="182" y="18">L</text>
    <g transform="translate(${x} ${y}) rotate(${angle})"><rect class="probe" x="-12" y="-5" width="24" height="10" rx="3"/><circle class="notch" cx="9" cy="0" r="2.5"/><path class="notch-arrow" d="M14 0 H34 M28 -5 L34 0 L28 5"/></g></svg>`;
  fig.append(h('figcaption', {}, 'Front of the chest, patient\'s right on your left. The dot and arrow mark the notch.'));
  return fig;
}

const section = (title, ...body) => h('section', {}, h('h3', {}, title), ...body);
const list = (tag, items) => h(tag, {}, items.map(t => h('li', {}, t)));

// One renderer per tab id. `on` reaches the image: on.find(selector) pulses a label, on.hover(selector or null) highlights it.
const TABS = {
  overview: c => [
    c.clip.notes?.trim() && section('About this clip', h('p', {}, c.clip.notes)),
    c.condition && section('Summary', h('p', {}, c.condition.summary)),
    section('Probe placement', probeFigure(c.view.probe),
      h('p', {}, h('strong', {}, 'Site. '), c.view.probe.site),
      h('p', {}, h('strong', {}, 'Notch. '), c.view.probe.notch)),
    section('On screen', h('p', {}, c.view.screen)),
  ],
  structures: (c, content, on) => {
    const marked = c.clip.markers.map(m => m.structure);
    return [
      h('p', { class: 'hint' }, marked.length ? 'Select a highlighted name to find it on the image.' : 'No structures are marked on this clip yet.'),
      h('ul', { class: 'structures' }, c.view.structures.map(id => {
        const s = content.structure.get(id);
        // The number matches the badge a marker shows when its name has no room on the image.
        const n = marked.indexOf(id) + 1;
        return h('li', {}, n ? labelButton(s.name, `[data-structure="${id}"]`, on, n) : h('strong', {}, s.name), h('span', {}, s.description));
      })),
    ];
  },
  tips: c => [section('Tips', list('ul', c.view.tips)), section('Pitfalls', list('ul', c.view.pitfalls))],
  findings: (c, content, on) => [
    h('p', { class: 'hint' }, 'Look for each of these, in order.'),
    list('ol', c.condition.findings),
    c.clip.pins?.length && section('On this clip',
      h('ol', { class: 'pin-list' }, c.clip.pins.map((p, i) => h('li', {}, labelButton(p.text, `[data-pin="${i + 1}"]`, on, i + 1))))),
  ],
  significance: c => [
    h('p', {}, c.condition.significance),
    section('Pearls', list('ul', c.condition.pearls)),
    section('Mimics', list('ul', c.condition.mimics)),
    section('Sources', h('ol', { class: 'sources' }, c.condition.sources.map(s => h('li', {}, s)))),
  ],
};

function labelButton(text, selector, on, number) {
  return h('button', {
    type: 'button', class: 'label-link', title: 'Show on the image',
    onclick: () => on.find(selector),
    onmouseenter: () => on.hover(selector), onmouseleave: () => on.hover(null),
    onfocus: () => on.hover(selector), onblur: () => on.hover(null),
  }, number && h('span', { class: 'num', 'aria-hidden': 'true' }, String(number)), text);
}

export function createPanel({ content, on, onToggle }) {
  let current = null;
  const panel = createTabPanel({
    label: 'Case information', handle: 'Case notes', closeLabel: 'Hide case notes (I)', onToggle,
    render: id => TABS[id](current, content, on),
  });
  return {
    el: panel.el,
    show(c) {
      current = c;
      panel.show(c.tabs.map(id => ({ id, name: TAB_NAMES[id] })));
    },
    setOpen: panel.setOpen,
  };
}
