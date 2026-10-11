import { h } from './dom.js';

// CC BY and CC BY-SA need visible credit: who, which license, where from, and whether it was changed.
// source: { author, attribution, license, licenseUrl, url, modified }. modified is the tooltip on the changed note.
export function credit(source, { noun = 'Clip', changed = 're-encoded' } = {}) {
  const s = source;
  return h('p', { class: 'credit' },
    `${noun}: `, s.attribution || s.author, ', ',
    h('a', { href: s.licenseUrl, rel: 'license noopener', target: '_blank' }, s.license), ', ',
    h('a', { href: s.url, rel: 'noopener', target: '_blank' }, 'source'),
    s.modified && [', ', h('span', { title: s.modified }, changed)], '.');
}
