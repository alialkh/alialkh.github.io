import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { credit } from './player.js';

// Just enough DOM for core/dom.js, so the real credit() renders in node.
class Node {
  constructor(tag) { Object.assign(this, { tag, attrs: {}, children: [] }); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener() {}
  append(...c) { this.children.push(...c); }
  get textContent() { return this.children.map(c => (typeof c === 'string' ? c : c.textContent)).join(''); }
  find(tag) { return this.children.flatMap(c => (typeof c === 'string' ? [] : [...(c.tag === tag ? [c] : []), ...c.find(tag)])); }
}
globalThis.document = { createElement: tag => new Node(tag) };

const fixture = JSON.parse(readFileSync(new URL('./test-fixtures/clips/manifest.json', import.meta.url), 'utf8'))
  .find(c => c.source.attribution);

test('the credit line shows attribution, linked license, source link and re-encoded', () => {
  const s = fixture.source;
  const line = credit(fixture);
  assert.equal(line.textContent, `Clip: ${s.attribution}, ${s.license}, source, re-encoded.`);
  assert.deepEqual(line.find('a').map(a => [a.textContent, a.attrs.href]), [[s.license, s.licenseUrl], ['source', s.url]]);
  assert.equal(line.find('span')[0].attrs.title, s.modified);
});

test('the credit line falls back to the author and drops re-encoded when unmodified', () => {
  const clip = { ...fixture, source: { ...fixture.source, attribution: '', modified: '' } };
  assert.equal(credit(clip).textContent, `Clip: ${fixture.source.author}, ${fixture.source.license}, source.`);
});
