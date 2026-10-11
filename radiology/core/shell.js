import { h } from './dom.js';

export const DISCLAIMER = 'Educational use only, not for diagnosis or patient care.';

// Builds the page frame and returns the slots an area fills.
export function mountShell(title) {
  // Prepended so an area's own stylesheet still wins ties against the theme.
  document.head.prepend(h('link', { rel: 'stylesheet', href: new URL('./theme.css', import.meta.url).href }));
  const nav = h('nav', { class: 'shell-nav', 'aria-label': title });
  const main = h('main', { class: 'shell-main', tabindex: '-1' });
  document.body.replaceChildren(
    h('header', { class: 'shell-header' },
      h('a', { class: 'shell-brand', href: new URL('../index.html', import.meta.url).href }, 'Radiology teaching'),
      h('h1', { class: 'shell-title' }, title),
      nav),
    main,
    h('footer', { class: 'shell-footer' }, h('p', {}, DISCLAIMER)),
  );
  return { nav, main };
}
