// The right sidebar: the teaching tabs (Overview, Findings, Anatomy, Tips, Credits), a card for the finding being shown, and a stand-in for all of it in test mode.
// It collapses to an edge handle on a wide screen and is a drawer on a narrow one.
import { h } from '../core/dom.js';
import { createTabPanel } from '../core/tabs.js';
import { icon } from './icons.js';

// on: toggle() collapses, closeFinding(), reveal(). render(tabId) returns the nodes of a tab.
export function createRight({ on, render }) {
  const panel = createTabPanel({ label: 'Case information', handle: 'Case notes', closeLabel: 'Hide the side panel (I)', onToggle: on.toggle, render });
  const edge = h('button', { type: 'button', class: 'edge', 'aria-label': 'Show the side panel (I)', title: 'Show the side panel (I)', 'aria-controls': 'case-tab-body', onclick: on.toggle }, icon('chev-left'));
  const finding = h('aside', { class: 'finding-card', 'aria-label': 'Finding', hidden: true });
  const testNote = h('div', { class: 'test-note', hidden: true },
    h('p', {}, h('strong', {}, 'Test mode. '), 'Notes, findings, structure names and sources stay hidden until you reveal them.'),
    h('button', { type: 'button', class: 'primary', onclick: on.reveal }, 'Reveal'));
  const el = h('div', { class: 'side right' }, edge, h('div', { class: 'side-panel' }, finding, panel.el, testNote));
  let shownId = '';

  return {
    el,
    edge,
    panel,
    // Shows the finding that "Show me" opened, or hides the card. Test mode hides it too.
    setFinding(f, hidden) {
      finding.hidden = !f || hidden;
      if (!f || f.id === shownId) return;
      shownId = f.id;
      finding.replaceChildren(
        h('div', {}, h('h3', {}, f.title), h('p', {}, f.text)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close the finding', title: 'Close the finding', onclick: on.closeFinding }, icon('close')));
    },
    setTesting(testing) {
      testNote.hidden = !testing;
      panel.el.hidden = testing;
    },
    resetFinding() { shownId = ''; },
  };
}
