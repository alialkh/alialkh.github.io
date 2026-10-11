import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const html = readFileSync(resolve(dir, 'index.html'), 'utf8');

// Every module the page loads, found by following the import lines from app.js.
function closure(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const [, from] of readFileSync(file, 'utf8').matchAll(/from '(\.[^']+)'/g)) closure(resolve(dirname(file), from), seen);
  return seen;
}

test('index.html preloads exactly the modules that app.js pulls in, so the import chain loads in one round', () => {
  const entry = resolve(dir, html.match(/<script type="module" src="([^"]+)"/)[1]);
  const preloaded = [...html.matchAll(/rel="modulepreload" href="([^"]+)"/g)].map(m => resolve(dir, m[1]));
  const needed = [...closure(entry)].filter(f => f !== entry);
  assert.deepEqual(preloaded.sort(), needed.sort());
  for (const f of preloaded) assert.ok(existsSync(f), f);
});

test('every path in index.html is relative and stays inside the radiology folder', () => {
  for (const [, url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (url.startsWith('data:')) continue;
    assert.ok(!url.startsWith('/') && !/^[a-z]+:/.test(url), url);
    assert.ok(resolve(dir, url).startsWith(resolve(dir, '..')), url);
  }
});
