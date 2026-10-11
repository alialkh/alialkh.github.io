// The info panel over the right of the stage: one tab list, one tab panel, rebuilt for each case.
import { h } from '../core/dom.js';
import { icon } from './icons.js';
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
  let tab = 'overview';
  const tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Case information' });
  const body = h('div', { class: 'tab-body', id: 'case-tab-body', role: 'tabpanel', tabindex: '0' });
  const handle = h('button', { type: 'button', class: 'sheet-handle', 'aria-expanded': 'false', onclick: onToggle }, h('span', { class: 'grabber' }), 'Case notes');
  const close = h('button', { type: 'button', class: 'icon-btn panel-close', 'aria-label': 'Hide case notes (I)', title: 'Hide case notes (I)', onclick: onToggle }, icon('close'));
  const el = h('aside', { class: 'info glass', 'aria-label': 'Case notes' }, handle, h('div', { class: 'info-head' }, tablist, close), body);

  function select(id, focus = false) {
    tab = id;
    for (const b of tablist.children) {
      const selected = b.dataset.tab === id;
      b.setAttribute('aria-selected', String(selected));
      b.tabIndex = selected ? 0 : -1;
      if (selected) body.setAttribute('aria-labelledby', b.id);
      if (selected && focus) b.focus();
    }
    body.replaceChildren(...TABS[id](current, content, on).flat().filter(Boolean));
    body.scrollTop = 0;
  }
  tablist.addEventListener('keydown', e => {
    const moves = { ArrowRight: 1, ArrowLeft: -1, Home: -Infinity, End: Infinity };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const i = current.tabs.indexOf(tab) + moves[e.key];
    select(current.tabs[Math.min(current.tabs.length - 1, Math.max(0, i))], true);
  });

  return {
    el,
    show(c) {
      current = c;
      tablist.replaceChildren(...c.tabs.map(id => h('button', {
        type: 'button', role: 'tab', id: `tab-${id}`, 'data-tab': id, 'aria-controls': 'case-tab-body', onclick: () => select(id),
      }, TAB_NAMES[id])));
      // Keep the reader on the same tab when the next case has it.
      select(c.tabs.includes(tab) ? tab : 'overview');
    },
    setOpen(open) {
      el.classList.toggle('open', open);
      handle.setAttribute('aria-expanded', String(open));
    },
  };
}
