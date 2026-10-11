// Loads and validates the Case table. Shapes and rules: ../docs/viewer-content.md.
import { fetchJson } from '../core/json.js';
import { checkShape, TYPES as BASE } from '../core/shape.js';
import { licenseAllowed, ALLOWED_LICENSES } from '../core/license.js';
import { PLANES, planeInfo } from './planes.js';
import { REGIONS } from './case-list.js';
import { volumeProblems } from './chunks.js';

const fraction = v => Number.isFinite(v) && v >= 0 && v <= 1;
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const TYPES = {
  ...BASE,
  number: ['a number', Number.isFinite],
  index: ['a whole number from 0', v => Number.isInteger(v) && v >= 0],
  point: ['[x, y] with each between 0 and 1', v => Array.isArray(v) && v.length === 2 && v.every(fraction)],
  folder: ['a folder url ending in a slash', v => typeof v === 'string' && v.length > 1 && v.endsWith('/')],
  object: ['an object', isObject],
};

const SHAPES = {
  case: {
    id: 'id', modality: ['CT', 'MR'], region: REGIONS, title: 'text', summary: 'text', vignette: 'text?',
    series: 'list', labels: 'object?', findings: 'list',
    source: { author: 'text', license: 'text', licenseUrl: 'text', url: 'text', attribution: 'string', modified: 'string', short: 'text?' },
  },
  series: { id: 'id', name: 'text', url: 'folder', windows: 'list', defaultWindow: 'string?' },
  window: { name: 'text', center: 'number', width: 'positive' },
  labels: { url: 'folder', names: 'object', centroids: 'object' },
  finding: { id: 'id', title: 'text', text: 'text', plane: PLANES, index: 'index', at: 'point', series: 'id?', window: 'text?' },
};

const LABEL_ID = /^[1-9]\d{0,2}$/;
const check = (value, shape, where, problems) => checkShape(value, shape, where, problems, TYPES);

function labelProblems(labels, where, problems) {
  const names = Object.keys(labels.names);
  for (const id of names) {
    if (!LABEL_ID.test(id) || Number(id) > 255) problems.push(`${where}.names key "${id}" must be a label id from 1 to 255`);
    else if (typeof labels.names[id] !== 'string' || !labels.names[id].trim()) problems.push(`${where}.names["${id}"] must be non-empty text`);
    const c = labels.centroids[id];
    if (!(Array.isArray(c) && c.length === 3 && c.every(n => Number.isFinite(n) && n >= 0))) problems.push(`${where}.centroids["${id}"] must be [x, y, z] voxel coordinates`);
  }
  for (const id of Object.keys(labels.centroids)) {
    if (!(id in labels.names)) problems.push(`${where}.centroids["${id}"] has no name`);
  }
}

function seriesProblems(c, where, problems) {
  const ids = new Set();
  for (const [i, s] of c.series.entries()) {
    const at = `${where}.series[${JSON.stringify(s?.id ?? i)}]`;
    const before = problems.length;
    check(s, SHAPES.series, at, problems);
    if (problems.length > before) continue;
    if (ids.has(s.id)) problems.push(`${at} is a duplicate series id`);
    ids.add(s.id);
    const names = new Set();
    for (const [j, w] of s.windows.entries()) {
      const n = problems.length;
      check(w, SHAPES.window, `${at}.windows[${j}]`, problems);
      if (problems.length === n && names.has(w.name)) problems.push(`${at}.windows[${j}] repeats the window name "${w.name}"`);
      names.add(w?.name);
    }
    if (s.windows.length && !names.has(s.defaultWindow)) problems.push(`${at}.defaultWindow "${s.defaultWindow ?? ''}" is not one of its windows`);
    if (!s.windows.length && s.defaultWindow) problems.push(`${at}.defaultWindow must be empty when windows is empty`);
    if (!s.windows.length && c.modality === 'CT') problems.push(`${at} is CT, so it needs windows`);
  }
  if (!c.series.length) problems.push(`${where}.series must hold at least one series`);
}

function findingProblems(c, where, problems) {
  const ids = new Set();
  for (const [i, f] of c.findings.entries()) {
    const at = `${where}.findings[${JSON.stringify(f?.id ?? i)}]`;
    const before = problems.length;
    check(f, SHAPES.finding, at, problems);
    if (problems.length > before) continue;
    if (ids.has(f.id)) problems.push(`${at} is a duplicate finding id`);
    ids.add(f.id);
    const series = f.series === undefined ? c.series[0] : c.series.find(s => s.id === f.series);
    if (!series) problems.push(`${at}.series "${f.series}" is not a series of this case`);
    else if (f.window !== undefined && !series.windows.some(w => w.name === f.window)) problems.push(`${at}.window "${f.window}" is not a window of series "${series.id}"`);
  }
}

// Pure, so node can run it over the real files. Returns a list of problems, empty when valid.
export function validateCases(cases) {
  if (!Array.isArray(cases)) return ['the case manifest must be a list'];
  const problems = [];
  const ids = new Set();
  for (const [i, c] of cases.entries()) {
    const where = `cases[${JSON.stringify(c?.id ?? i)}]`;
    const before = problems.length;
    check(c, SHAPES.case, where, problems);
    if (ids.has(c?.id)) problems.push(`${where} is a duplicate id`);
    ids.add(c?.id);
    if (problems.length > before) continue;
    if (c.labels) check(c.labels, SHAPES.labels, `${where}.labels`, problems);
    seriesProblems(c, where, problems);
    if (c.labels && isObject(c.labels.names) && isObject(c.labels.centroids)) labelProblems(c.labels, `${where}.labels`, problems);
    findingProblems(c, where, problems);
    if (!licenseAllowed(c.source.license)) problems.push(`${where} license "${c.source.license}" is not allowed. Use ${ALLOWED_LICENSES}.`);
  }
  return problems;
}

// metas maps a series id, and "labels", to that volume's vol.json. This is the part that needs the dims.
export function validateGrid(c, metas) {
  const where = `cases["${c.id}"]`;
  const problems = [];
  for (const [key, meta] of Object.entries(metas)) problems.push(...volumeProblems(meta, `${where} ${key === 'labels' ? 'labels' : `series "${key}"`} vol.json`));
  if (problems.length) return problems;
  const first = metas[c.series[0].id];
  const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
  for (const [key, meta] of Object.entries(metas)) {
    const name = key === 'labels' ? 'labels' : `series "${key}"`;
    if (!same(meta.dims, first.dims)) problems.push(`${where} ${name} dims ${meta.dims.join('x')} differ from series "${c.series[0].id}" ${first.dims.join('x')}`);
    else if (!same(meta.spacing, first.spacing)) problems.push(`${where} ${name} spacing ${meta.spacing.join(', ')} differs from series "${c.series[0].id}"`);
    if (meta.dtype !== (key === 'labels' ? 'uint8' : 'int16')) problems.push(`${where} ${name} dtype ${meta.dtype} must be ${key === 'labels' ? 'uint8' : 'int16'}`);
  }
  if (problems.length) return problems;
  for (const f of c.findings) {
    const { count } = planeInfo(f.plane, first.dims, first.spacing);
    if (f.index >= count) problems.push(`${where}.findings["${f.id}"].index ${f.index} is outside the ${count} ${f.plane} slices`);
  }
  for (const [id, centroid] of Object.entries(c.labels?.centroids ?? {})) {
    if (centroid.some((v, i) => v > first.dims[i] - 1)) problems.push(`${where}.labels.centroids["${id}"] is outside the volume`);
  }
  return problems;
}

// Dev and tests: ?cases=<url> swaps the manifest, resolved against the page. Volume urls are made absolute against the manifest.
export async function loadCases(pageUrl) {
  const page = new URL(pageUrl);
  const param = page.searchParams.get('cases');
  const manifest = new URL(param ?? '../data/cases/manifest.json', page);
  let cases;
  try {
    cases = await fetchJson(manifest);
  } catch (error) {
    // The default manifest only exists once the first case is added.
    if (param || error.status !== 404) throw Object.assign(error, { problems: [error.message] });
    cases = [];
  }
  const problems = validateCases(cases);
  if (problems.length) throw Object.assign(new Error('Case content did not load'), { problems });
  const resolve = url => new URL(url, manifest).href;
  return cases.map(c => ({
    ...c,
    series: c.series.map(s => ({ ...s, url: resolve(s.url) })),
    labels: c.labels && { ...c.labels, url: resolve(c.labels.url) },
  }));
}
