// The slim bar above the viewports: the panel toggles, the case chip with its notes popover, and the layout, link, text, image only, test and fullscreen buttons.
// Nothing here ever covers an image. Only the notes popover opens over the grid, and only while it is open.
import { h } from '../core/dom.js';
import { icon } from './icons.js';
import { createMenu } from './menu.js';
import { LAYOUTS, LAYOUT_IDS } from './layouts.js';
import { REGION_NAMES } from './case-list.js';

// on: left(), right(), layout(id), link(), annotate(), imageOnly(), test(), fullscreen(), reveal().
export function createTopBar({ on }) {
  const toggle = (name, label, onclick, extra = {}) =>
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': label, title: label, 'aria-pressed': 'false', onclick, ...extra }, icon(name));

  const left = toggle('left', 'Case list (C)', on.left);
  const right = toggle('right', 'Side panel (I)', on.right);
  const link = toggle('link', 'Link the viewports, same planes stay on the same slice (V)', on.link);
  const annotate = toggle('annotate', 'Corner text on the images (A)', on.annotate);
  const imageOnly = toggle('focus', 'Show only the images (Z)', on.imageOnly);
  const test = toggle('test', 'Test mode, hide the answers (T)', on.test);
  const fullscreen = toggle('fullscreen', 'Fullscreen (F)', on.fullscreen, { hidden: !document.fullscreenEnabled });
  const menu = createMenu({
    label: 'Viewport layout', glyph: 'layout', onPick: on.layout,
    items: LAYOUT_IDS.map(id => ({ id, label: LAYOUTS[id].name, glyph: id })),
  });

  const title = h('h1', { class: 'chip-title' });
  const sub = h('p', { class: 'chip-sub' });
  const notesBody = h('div', { class: 'notes-body' });
  const notesClose = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close the case notes', title: 'Close the case notes', onclick: () => setNotes(false) }, icon('close'));
  const pop = h('div', { class: 'notes-pop', id: 'case-notes', role: 'dialog', 'aria-label': 'Case notes', hidden: true }, notesBody, notesClose);
  const notes = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Case notes', title: 'Case notes', 'aria-expanded': 'false', 'aria-controls': 'case-notes', onclick: () => setNotes(pop.hidden) }, icon('notes'));
  const chip = h('div', { class: 'chip' }, h('div', { class: 'chip-text' }, title, sub), notes);
  const testChip = h('div', { class: 'chip test-chip', hidden: true },
    h('p', {}, h('strong', {}, 'Test mode. '), h('span', {}, 'Scroll, window and measure, then reveal.')),
    h('button', { type: 'button', class: 'primary', onclick: on.reveal }, 'Reveal'));
  const progress = h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Loading the scan', 'aria-valuemin': '0', 'aria-valuemax': '100', hidden: true });

  const el = h('header', { class: 'topbar' }, left, chip, testChip, h('div', { class: 'topbar-tools' }, menu.el, link, annotate, imageOnly, test, fullscreen, right), pop, progress);

  function setNotes(open) {
    pop.hidden = !open;
    notes.setAttribute('aria-expanded', String(open));
    if (open) notesClose.focus({ preventScroll: true });
  }
  addEventListener('pointerdown', e => {
    if (!pop.hidden && !pop.contains(e.target) && !notes.contains(e.target)) setNotes(false);
  });
  const pressed = (button, value) => button.setAttribute('aria-pressed', String(Boolean(value)));

  return {
    el,
    left,
    right,
    notes,
    // Closes whatever is open over the grid. True when something was.
    dismiss() {
      const was = !pop.hidden;
      setNotes(false);
      return menu.close(true) || was;
    },
    setCase(c) {
      title.textContent = c.title;
      sub.textContent = `${REGION_NAMES[c.region]} · ${c.modality}`;
      notesBody.replaceChildren(...[
        c.vignette && h('section', {}, h('h2', {}, 'Clinical context'), h('p', {}, c.vignette)),
        h('section', {}, h('h2', {}, 'Summary'), h('p', {}, c.summary)),
      ].filter(Boolean));
      setNotes(false);
    },
    setProgress(p) {
      progress.hidden = p >= 1;
      progress.style.setProperty('--p', String(p));
      progress.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    },
    // s: { layout, link, annotations, imageOnly, leftOpen, rightOpen, testing }
    sync(s) {
      menu.sync(s.layout);
      pressed(left, s.leftOpen);
      pressed(right, s.rightOpen);
      pressed(link, s.link);
      pressed(annotate, s.annotations);
      pressed(imageOnly, s.imageOnly);
      pressed(test, s.testing);
      chip.hidden = s.testing;
      testChip.hidden = !s.testing;
      if (s.testing) setNotes(false);
    },
    setFullscreen: value => pressed(fullscreen, value),
  };
}
