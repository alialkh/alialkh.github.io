// Photographs the simulator in headless Chromium (software GL), to check the images by eye. Not shipped.
//   node radiology/tools/pocus-shot.mjs --out <dir> --name <file> [--page pocus/dev.html] [--query "from=right&a=10&z=-70&phi=90"] [--wait 120000]
//   node radiology/tools/pocus-shot.mjs --out <dir> --shots '{"ruq":"from=right&a=10&z=-70&phi=90","luq":"..."}'   several views in one browser
// Serves radiology/ over http on a free port for the run. Prints the page's own log and console errors.
import { parseArgs } from 'node:util';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const { values: o } = parseArgs({
  options: {
    out: { type: 'string' }, name: { type: 'string', default: 'shot' }, page: { type: 'string', default: 'pocus/dev.html' },
    query: { type: 'string', default: '' }, shots: { type: 'string' }, wait: { type: 'string', default: '180000' }, size: { type: 'string', default: '800x640' }, full: { type: 'boolean', default: false }, clip: { type: 'string' },
  },
});
if (!o.out) throw new Error('--out is required');
await mkdir(o.out, { recursive: true });

const root = fileURLToPath(new URL('../', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.gz': 'application/gzip', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const [w, h] = o.size.split('x').map(Number);
const page = await browser.newPage({ viewport: { width: w, height: h } });
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[console ${m.type()}]`, m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
const jobs = o.shots ? Object.entries(JSON.parse(o.shots)) : [[o.name, o.query]];
for (const [name, query] of jobs) {
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/${o.page}${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: Number(o.wait) });
  await page.waitForFunction(() => window.__still === undefined || window.__idle === true, null, { timeout: Number(o.wait) });
  const text = await page.evaluate(() => document.getElementById('log')?.textContent ?? '');
  console.log(`${name}: ${Date.now() - t0} ms  ${text.replace(/\n+/g, ' | ')}`);
  await page.screenshot({ path: join(o.out, `${name}.png`), fullPage: o.full, timeout: Number(o.wait), clip: o.clip ? Object.fromEntries(['x', 'y', 'width', 'height'].map((k, i) => [k, Number(o.clip.split(',')[i])])) : undefined });
}
await browser.close();
server.close();
