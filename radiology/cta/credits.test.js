import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { creditGroups, shortAuthor, SYNTAX_SOURCES } from './credits.js';

const table = name => JSON.parse(readFileSync(new URL(`./content/${name}.json`, import.meta.url), 'utf8'));
const content = { projections: table('projections'), ivus: table('ivus') };

test('shortAuthor keeps the first author and says et al. for a list', () => {
  assert.equal(shortAuthor('Popov M, Amanturdieva A, Fazli S'), 'Popov M et al.');
  assert.equal(shortAuthor('Hellerhoff'), 'Hellerhoff');
});

test('the segment screens credit the SYNTAX definitions page and Sianos 2005', () => {
  const [group] = creditGroups('ref-segments', content);
  assert.equal(group.items, SYNTAX_SOURCES);
  assert.match(group.items.join(' '), /syntaxscore\.org\/index\.php\/tutorial\/definitions/);
  assert.match(group.items.join(' '), /Sianos G.*PMID 19758907/);
});

test('every source in the projection and IVUS tables is credited exactly as written, once', () => {
  const [projections] = creditGroups('ref-projections', content);
  for (const s of content.projections.flatMap(p => p.sources)) assert.ok(projections.items.includes(s), s);
  assert.equal(new Set(projections.items).size, projections.items.length);
  const [ivus] = creditGroups('ref-ivus', content);
  assert.deepEqual(ivus.items, ['Saito Y et al. CVIT 2025 clinical expert consensus document on intravascular ultrasound. Cardiovasc Interv Ther 2025;40:211-225. PMID 39870989.']);
});

test('an angiogram credits segments and projections, an IVUS clip credits the IVUS consensus', () => {
  assert.deepEqual(creditGroups('angio-still', content).map(g => g.title), ['Segment definitions', 'Projection notes']);
  assert.deepEqual(creditGroups('ivus-clip', content).map(g => g.title), ['IVUS concepts']);
});
