// The left sidebar: the case list grouped by region, and the series of the open case as thumbnails to click or drag onto a viewport.
// It collapses to an edge handle on a wide screen and is a drawer on a narrow one.
import { h } from '../core/dom.js';
import { icon } from './icons.js';
import { caseSubtitle } from './case-list.js';
import { beginDrag } from './drag.js';
import { drawVolumeThumb } from './thumb.js';

const TITLE = 'CT and MRI';

// list: the grouped cases from case-list.js. thumbs: the case thumbnail queue. on: toggle() collapses, pick(seriesId) shows a series in the active viewport, drop(slot, seriesId).
export function createLeft(list, { thumbs, on }) {
  const links = new Map();
  const caseThumbs = new Map();
  const seriesThumbs = new Map();
  let testing = false;

  const item = c => {
    const thumb = h('canvas', { class: 'thumb', width: 56, height: 42, 'aria-hidden': 'true' });
    caseThumbs.set(c.id, thumb);
    thumbs.add(c, thumb);
    const name = `${c.title}, ${caseSubtitle(c)}`;
    const link = h('a', { class: 'case', href: `#/${c.id}`, title: name, 'data-name': name }, thumb,
      h('span', { class: 'case-text' }, h('span', { class: 'case-title' }, c.title), h('span', { class: 'case-sub' }, caseSubtitle(c))));
    links.set(c.id, link);
    return h('li', {}, link);
  };

  const seriesList = h('ul', { class: 'series-list' });
  const collapse = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Hide the case list (C)', title: 'Hide the case list (C)', onclick: on.toggle }, icon('chev-left'));
  const edge = h('button', { type: 'button', class: 'edge', 'aria-label': 'Show the case list (C)', title: 'Show the case list (C)', 'aria-controls': 'case-list', onclick: on.toggle }, icon('chev-right'));
  const panel = h('aside', { class: 'sidebar side-panel', id: 'case-list', 'aria-label': 'Cases and series' },
    h('div', { class: 'side-head' },
      h('a', { class: 'back', href: '../index.html', title: 'All radiology modules' }, icon('back'), h('span', {}, 'Radiology')),
      collapse),
    h('div', { class: 'side-scroll' },
      h('section', { class: 'cases-sec', 'aria-labelledby': 'cases-h' },
        h('h2', { id: 'cases-h' }, TITLE),
        h('nav', { class: 'case-nav', 'aria-label': 'Cases' },
          list.sections.length ? null : h('p', { class: 'side-empty' }, 'Cases appear here as scans are added.'),
          list.sections.map(s => h('section', {}, h('h3', {}, s.label), s.groups.flatMap(g => [g.label && h('h4', {}, g.label), h('ul', {}, g.cases.map(item))])))))),
    h('section', { class: 'series-sec', 'aria-labelledby': 'series-h' },
      h('h2', { id: 'series-h' }, 'Series'),
      h('p', { class: 'hint' }, 'Click to show in the active viewport, or drag onto a viewport.'),
      seriesList));
  const el = h('div', { class: 'side left' }, edge, panel);

  return {
    el,
    collapse,
    edge,
    select(id) {
      for (const [caseId, link] of links) {
        if (caseId === id) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
      links.get(id)?.scrollIntoView({ block: 'nearest' });
    },
    // The canvas of a case's thumbnail, for drawing it from a volume that is already loaded.
    caseThumb: id => caseThumbs.get(id),
    // Rebuilds the series thumbnails for a case. They fill in as the middle slice of each series arrives.
    setSeries(c) {
      seriesThumbs.clear();
      seriesList.replaceChildren(...c.series.map(s => {
        const canvas = h('canvas', { class: 'thumb', width: 56, height: 56, 'aria-hidden': 'true' });
        seriesThumbs.set(s.id, canvas);
        const button = h('button', { type: 'button', class: 'series-item', 'data-series': s.id, title: `${s.name}. Click to show it in the active viewport, or drag it onto a viewport.`,
          onclick: () => on.pick(s.id) }, canvas, h('span', {}, s.name));
        button.addEventListener('pointerdown', e => {
          if (e.button !== 0) return;
          beginDrag(e, {
            label: s.name,
            targetAt: (x, y) => document.elementFromPoint(x, y)?.closest('.pane') ?? null,
            onDrop: pane => on.drop(Number(pane.dataset.slot), s.id),
          });
        });
        return h('li', {}, button);
      }));
    },
    seriesThumb(id, vol, series) {
      const canvas = seriesThumbs.get(id);
      if (canvas) drawVolumeThumb(canvas, vol, series);
    },
    // ids: the series on screen. active: the active viewport's series.
    markShown(ids, active) {
      for (const button of seriesList.querySelectorAll('.series-item')) {
        button.classList.toggle('shown', ids.includes(button.dataset.series));
        if (button.dataset.series === active) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      }
    },
    // Test mode hides case names, so the tooltips must not say them either.
    setTesting(on_) {
      if (on_ === testing) return;
      testing = on_;
      for (const link of links.values()) {
        if (on_) link.removeAttribute('title');
        else link.title = link.dataset.name;
      }
    },
    focusCurrent: () => (panel.querySelector('[aria-current="page"]') ?? panel.querySelector('a')).focus(),
  };
}
