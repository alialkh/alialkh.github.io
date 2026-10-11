// A small menu button for choosing one of a few options, such as the viewport layout. Arrow keys move, Enter picks, Escape closes.
import { h } from '../core/dom.js';
import { icon } from './icons.js';

// items: [{ id, label, glyph }]. onPick(id) runs on a choice. label names the button for assistive tech.
export function createMenu({ label, glyph, items, onPick }) {
  const entries = items.map(item => h('button', {
    type: 'button', role: 'menuitemradio', 'aria-checked': 'false', 'data-id': item.id, tabindex: '-1',
    onclick: () => { pick(item.id); },
  }, icon(item.glyph), h('span', {}, item.label)));
  const list = h('div', { class: 'menu-list', role: 'menu', 'aria-label': label, hidden: true }, entries);
  const button = h('button', { type: 'button', class: 'icon-btn menu-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': label, title: label }, icon(glyph));
  const el = h('div', { class: 'menu' }, button, list);

  const isOpen = () => !list.hidden;
  function open(focusFirst = true) {
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    if (focusFirst) (entries.find(e => e.getAttribute('aria-checked') === 'true') ?? entries[0]).focus();
  }
  function close(refocus = false) {
    if (!isOpen()) return false;
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (refocus) button.focus();
    return true;
  }
  function pick(id) {
    close(true);
    onPick(id);
  }

  button.addEventListener('click', () => (isOpen() ? close() : open(false)));
  button.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      open();
    }
  });
  list.addEventListener('keydown', e => {
    const at = entries.indexOf(document.activeElement);
    const moves = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (e.key in moves) {
      e.preventDefault();
      entries[(at + moves[e.key] + entries.length) % entries.length].focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Tab') {
      close();
    }
  });
  // A press anywhere else closes the menu.
  addEventListener('pointerdown', e => {
    if (isOpen() && !el.contains(e.target)) close();
  });

  return {
    el,
    close,
    sync: current => entries.forEach(e => e.setAttribute('aria-checked', String(e.dataset.id === current))),
  };
}
