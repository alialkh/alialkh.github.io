// The case list. Each case is a link to #/<clip id>, and the app marks the current one.
import { h } from '../core/dom.js';
import { icon } from './icons.js';

export function createSidebar(list, { onRail, onClose }) {
  const links = new Map();
  const item = c => {
    const link = h('a', { class: 'case', href: `#/${c.id}`, title: `${c.title}, ${c.subtitle}` },
      h('img', { src: c.clip.poster, alt: '', loading: 'lazy', width: c.clip.width, height: c.clip.height }),
      h('span', { class: 'case-text' }, h('span', { class: 'case-title' }, c.title), h('span', { class: 'case-sub' }, c.subtitle)));
    links.set(c.id, link);
    return h('li', {}, link);
  };
  const railBtn = h('button', { type: 'button', class: 'icon-btn rail-toggle', 'aria-expanded': 'true', 'aria-label': 'Collapse the case list', title: 'Collapse the case list', onclick: onRail }, icon('rail'));
  const closeBtn = h('button', { type: 'button', class: 'icon-btn drawer-close', 'aria-label': 'Close the case list', title: 'Close the case list', onclick: onClose }, icon('close'));

  const el = h('aside', { class: 'sidebar', id: 'case-list', 'aria-label': 'Case list' },
    h('div', { class: 'side-head' },
      h('a', { class: 'back', href: '../index.html', title: 'All radiology modules' }, icon('back'), h('span', {}, 'Radiology')),
      railBtn, closeBtn),
    h('h1', { class: 'side-title' }, 'Echocardiography'),
    h('nav', { class: 'case-nav', 'aria-label': 'Cases' },
      list.sections.length ? null : h('p', { class: 'side-empty' }, 'Cases appear here as clips are added.'),
      list.sections.map(s => h('section', {},
        h('h2', {}, s.label),
        s.groups.flatMap(g => [g.label && h('h3', {}, g.label), h('ul', {}, g.cases.map(item))])))));

  return {
    el,
    select(id) {
      for (const [caseId, link] of links) {
        if (caseId === id) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
      links.get(id)?.scrollIntoView({ block: 'nearest' });
    },
    setRail(rail) {
      const label = rail ? 'Expand the case list' : 'Collapse the case list';
      railBtn.setAttribute('aria-expanded', String(!rail));
      railBtn.setAttribute('aria-label', label);
      railBtn.title = label;
    },
    focusCurrent: () => (el.querySelector('[aria-current="page"]') ?? el.querySelector('a')).focus(),
  };
}
