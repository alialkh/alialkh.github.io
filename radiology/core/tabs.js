// The info panel over the right of the stage: one tab list and one tab panel. A bottom sheet behind a handle on phones.
import { h } from './dom.js';
import { icon } from './icons.js';

// label names the tab list, handle names the panel and its phone handle, closeLabel the close button.
// render(id) returns the nodes for that tab. Falsy entries are skipped, like h() children.
export function createTabPanel({ label, handle: handleText, closeLabel, onToggle, render }) {
  let tabs = [];
  let tab = null;
  const tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': label });
  const body = h('div', { class: 'tab-body', id: 'case-tab-body', role: 'tabpanel', tabindex: '0' });
  const handle = h('button', { type: 'button', class: 'sheet-handle', 'aria-expanded': 'false', onclick: onToggle }, h('span', { class: 'grabber' }), handleText);
  const close = h('button', { type: 'button', class: 'icon-btn panel-close', 'aria-label': closeLabel, title: closeLabel, onclick: onToggle }, icon('close'));
  const el = h('aside', { class: 'info glass', 'aria-label': handleText }, handle, h('div', { class: 'info-head' }, tablist, close), body);

  const draw = () => body.replaceChildren(...render(tab).flat().filter(Boolean));
  function select(id, focus = false) {
    tab = id;
    for (const b of tablist.children) {
      const selected = b.dataset.tab === id;
      b.setAttribute('aria-selected', String(selected));
      b.tabIndex = selected ? 0 : -1;
      if (selected) body.setAttribute('aria-labelledby', b.id);
      if (selected && focus) b.focus();
    }
    draw();
    body.scrollTop = 0;
  }
  tablist.addEventListener('keydown', e => {
    const moves = { ArrowRight: 1, ArrowLeft: -1, Home: -Infinity, End: Infinity };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const i = tabs.findIndex(t => t.id === tab) + moves[e.key];
    select(tabs[Math.min(tabs.length - 1, Math.max(0, i))].id, true);
  });

  return {
    el,
    get tab() { return tab; },
    // tabs: [{ id, name }]. Keep the reader on the same tab when the next case has it.
    show(next) {
      tabs = next;
      tablist.replaceChildren(...tabs.map(t => h('button', {
        type: 'button', role: 'tab', id: `tab-${t.id}`, 'data-tab': t.id, 'aria-controls': 'case-tab-body', onclick: () => select(t.id),
      }, t.name)));
      select(tabs.some(t => t.id === tab) ? tab : tabs[0].id);
    },
    // Redraws the open tab in place, scroll position kept.
    refresh: draw,
    setOpen(open) {
      el.classList.toggle('open', open);
      handle.setAttribute('aria-expanded', String(open));
    },
  };
}
