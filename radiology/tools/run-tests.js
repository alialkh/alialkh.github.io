// Node 22 resolves `node --test radiology/` to package.json "main", which is this file.
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const tests = readdirSync(root, { recursive: true }).filter(f => /\.test\.m?js$/.test(f)).sort();
for (const file of tests) await import(pathToFileURL(root + file).href);
