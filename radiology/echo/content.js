// Loads and validates the echo tables. Shapes and rules: ../docs/echo-content.md.
import { fetchJson } from '../core/json.js';
import { groupBy } from '../core/group.js';
import { ALLOWED_LICENSES, licenseAllowed } from '../core/license.js';
import { TYPES as BASE, checkShape as check } from '../core/shape.js';

export { ALLOWED_LICENSES, licenseAllowed };
export const WINDOWS = ['parasternal', 'apical', 'subcostal', 'suprasternal'];
export const SYSTEMS = ['pericardium', 'lv-function', 'valves', 'right-heart', 'cardiomyopathy', 'masses'];

const fraction = v => Number.isFinite(v) && v >= 0 && v <= 1;
// A pin label has to fit beside its dot on a phone-sized image.
const PIN_TEXT_MAX = 90;
const TYPES = {
  ...BASE,
  radius: ['a fraction of frame width above 0', v => fraction(v) && v > 0],
  point: ['[x, y] with each between 0 and 1', v => Array.isArray(v) && v.length === 2 && v.every(fraction)],
  degrees: ['a number from 0 up to but not including 360', v => Number.isFinite(v) && v >= 0 && v < 360],
  pinText: [`non-empty text of ${PIN_TEXT_MAX} characters or fewer`, v => BASE.text[1](v) && v.length <= PIN_TEXT_MAX],
};
const checkShape = (value, shape, where, problems) => check(value, shape, where, problems, TYPES);

// A field is a type name (a trailing ? makes it optional), a list of allowed values, or a nested shape.
const SHAPES = {
  structures: { id: 'id', name: 'text', description: 'text' },
  views: {
    id: 'id', name: 'text', abbrev: 'text', window: WINDOWS,
    probe: { site: 'text', chest: 'point', notch: 'text', angle: 'degrees' },
    screen: 'text', structures: 'ids', tips: 'texts', pitfalls: 'texts',
  },
  conditions: {
    id: 'id', name: 'text', system: SYSTEMS, summary: 'text', findings: 'texts', significance: 'text',
    pearls: 'texts', mimics: 'texts', compareView: 'id', sources: 'texts',
  },
  clips: {
    id: 'id', view: 'id', condition: 'id?', src: 'text', poster: 'text',
    fps: 'positive', durationSec: 'positive', width: 'positive', height: 'positive',
    markers: 'list', pins: 'list?', notes: 'string?',
    source: { author: 'text', license: 'text', licenseUrl: 'text', url: 'text', attribution: 'string', modified: 'string' },
  },
};
const MARKER = { structure: 'id', at: 'point', r: 'radius' };
const PIN = { at: 'point', text: 'pinText' };

// Pure, so node can run it over the real files. Returns a list of problems, empty when valid.
export function validateContent(tables) {
  const problems = [];
  for (const name of Object.keys(SHAPES)) {
    if (!Array.isArray(tables[name])) problems.push(`${name} must be a list`);
  }
  if (problems.length) return problems;

  const ids = {};
  for (const [name, shape] of Object.entries(SHAPES)) {
    ids[name] = new Set();
    for (const [i, row] of tables[name].entries()) {
      const where = `${name}[${JSON.stringify(row?.id ?? i)}]`;
      checkShape(row, shape, where, problems);
      if (ids[name].has(row?.id)) problems.push(`${where} is a duplicate id`);
      ids[name].add(row?.id);
    }
  }
  if (problems.length) return problems;

  const views = new Map(tables.views.map(v => [v.id, v]));
  for (const view of tables.views) {
    for (const s of view.structures) {
      if (!ids.structures.has(s)) problems.push(`views["${view.id}"] lists unknown structure "${s}"`);
    }
  }
  for (const c of tables.conditions) {
    if (!views.has(c.compareView)) problems.push(`conditions["${c.id}"].compareView "${c.compareView}" is not a view`);
  }
  for (const clip of tables.clips) {
    const where = `clips["${clip.id}"]`;
    const view = views.get(clip.view);
    if (!view) problems.push(`${where}.view "${clip.view}" is not a view`);
    if (clip.condition !== undefined && !ids.conditions.has(clip.condition)) {
      problems.push(`${where}.condition "${clip.condition}" is not a condition`);
    }
    if (!licenseAllowed(clip.source.license)) {
      problems.push(`${where} license "${clip.source.license}" is not allowed. Use ${ALLOWED_LICENSES}.`);
    }
    const marked = new Set();
    for (const [i, m] of clip.markers.entries()) {
      const before = problems.length;
      checkShape(m, MARKER, `${where}.markers[${i}]`, problems);
      if (problems.length > before) continue;
      if (view && !view.structures.includes(m.structure)) {
        problems.push(`${where} marks "${m.structure}", which view "${clip.view}" does not list`);
      }
      // One marker per structure, so selecting a structure in the panel pulses exactly one ring.
      if (marked.has(m.structure)) problems.push(`${where} marks "${m.structure}" twice`);
      marked.add(m.structure);
    }
    for (const [i, p] of (clip.pins ?? []).entries()) checkShape(p, PIN, `${where}.pins[${i}]`, problems);
  }
  return problems;
}

export function indexContent({ structures, views, conditions, clips }) {
  const byId = rows => new Map(rows.map(r => [r.id, r]));
  return {
    structures, views, conditions, clips,
    structure: byId(structures), view: byId(views), condition: byId(conditions), clip: byId(clips),
    normalClips: groupBy(clips.filter(c => !c.condition), c => c.view),
    caseClips: groupBy(clips.filter(c => c.condition), c => c.condition),
  };
}

// Dev and tests: ?clips=<url> and ?content=<dir/> swap the sources, resolved against the page.
export async function loadContent(pageUrl) {
  const page = new URL(pageUrl);
  const clipsParam = page.searchParams.get('clips');
  const dir = new URL(page.searchParams.get('content') ?? 'content/', page);
  const urls = {
    structures: new URL('structures.json', dir),
    views: new URL('views.json', dir),
    conditions: new URL('conditions.json', dir),
    clips: new URL(clipsParam ?? '../data/clips/manifest.json', page),
  };
  const names = Object.keys(urls);
  const settled = await Promise.allSettled(names.map(n => fetchJson(urls[n])));
  const tables = {};
  const problems = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') tables[names[i]] = r.value;
    // The default manifest only exists once the first clip is added.
    else if (names[i] === 'clips' && !clipsParam && r.reason.status === 404) tables.clips = [];
    else problems.push(r.reason.message);
  });
  if (!problems.length) problems.push(...validateContent(tables));
  if (problems.length) throw Object.assign(new Error('Echo content did not load'), { problems });
  const resolve = path => new URL(path, urls.clips).href;
  return indexContent({ ...tables, clips: tables.clips.map(c => ({ ...c, src: resolve(c.src), poster: resolve(c.poster) })) });
}
