import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Every module the page imports, found by following the imports from app.js.
function importedModules() {
  const seen = new Set();
  const walk = file => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)) {
      const spec = m[1] ?? m[2];
      if (spec.startsWith('.')) walk(resolve(dirname(file), spec));
    }
  };
  walk(resolve(here, 'app.js'));
  return [...seen].map(f => relative(here, f)).sort();
}

test('index.html preloads every module the page imports, so they download side by side and not one import level at a time', () => {
  const html = readFileSync(resolve(here, 'index.html'), 'utf8');
  const listed = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map(m => m[1]).sort();
  assert.deepEqual(listed, importedModules(), 'regenerate the modulepreload links in index.html: one per module reached from app.js');
});
