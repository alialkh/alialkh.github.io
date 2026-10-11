// Loads and validates the cath lab tables. Shapes and rules: ../docs/cta-content.md.
import { fetchJson } from '../core/json.js';
import { ALLOWED_LICENSES, licenseAllowed } from '../core/license.js';
import { TYPES as BASE, checkShape as check } from '../core/shape.js';
import { entryAngle, angleDistance, describeAngle, TOLERANCE } from './views.js';

export { ALLOWED_LICENSES, licenseAllowed };
export const KINDS = ['angio-clip', 'angio-still', 'ivus-clip', 'ivus-still'];
const ARTERIES = ['rca', 'left-main', 'lad', 'lcx', 'other'];
const SIDES = ['LAO', 'RAO', 'AP'];
const DIRECTIONS = ['cranial', 'caudal', 'none'];
const SYSTEMS = ['left', 'right', 'both'];
const CLIPS = ['angio-clip', 'ivus-clip'];

const fraction = v => Number.isFinite(v) && v >= 0 && v <= 1;
const point = v => Array.isArray(v) && v.length === 2 && v.every(fraction);
// A pin label has to fit beside its dot on a phone-sized image.
const PIN_TEXT_MAX = 90;
const TYPES = {
  ...BASE,
  radius: ['a fraction of frame width above 0', v => fraction(v) && v > 0],
  point: ['[x, y] with each between 0 and 1', point],
  polygon: ['a list of at least 3 [x, y] points, each between 0 and 1', v => Array.isArray(v) && v.length >= 3 && v.every(point)],
  degrees: ['a number from 0 to 90', v => Number.isFinite(v) && v >= 0 && v <= 90],
  aha: ['a number, or null when no source supports a mapping', v => v === null || Number.isFinite(v)],
  pinText: [`non-empty text of ${PIN_TEXT_MAX} characters or fewer`, v => BASE.text[1](v) && v.length <= PIN_TEXT_MAX],
};
const checkShape = (value, shape, where, problems) => check(value, shape, where, problems, TYPES);

const ANGLES = { primary: { side: SIDES, angle: 'degrees' }, secondary: { direction: DIRECTIONS, angle: 'degrees' } };
const SHAPES = {
  segments: { id: 'id', name: 'text', artery: ARTERIES, syntax: 'text', aha: 'aha', description: 'text' },
  projections: {
    id: 'id', name: 'text', aliases: 'texts', ...ANGLES,
    system: SYSTEMS, bestSeen: 'ids', foreshortened: 'ids', overlapped: 'ids', whenToUse: 'text', pitfalls: 'texts', sources: 'texts',
  },
  ivus: { id: 'id', name: 'text', definition: 'text', howToSee: 'text', pitfalls: 'texts', sources: 'texts' },
  cases: {
    id: 'id', kind: KINDS, projection: 'id?', title: 'text', summary: 'text', src: 'text', poster: 'text',
    fps: 'positive?', durationSec: 'positive?', width: 'positive', height: 'positive',
    markers: 'list', regions: 'list?', pins: 'list?', notes: 'string?',
    source: { author: 'text', license: 'text', licenseUrl: 'text', url: 'text', attribution: 'string', modified: 'string' },
  },
};
const MARKER = { segment: 'id', at: 'point', r: 'radius' };
const REGION = { segment: 'id', polygon: 'polygon' };
const PIN = { at: 'point', text: 'pinText' };
const SEGMENT_LISTS = ['bestSeen', 'foreshortened', 'overlapped'];

// An AP view has no rotation and a view with no tilt has no angle, so a stray angle would draw a wrong picture.
function degenerateAngles(a, where) {
  const problems = [];
  if (a.primary.side === 'AP' && a.primary.angle !== 0) problems.push(`${where} is AP, so primary.angle must be 0`);
  if (a.secondary.direction === 'none' && a.secondary.angle !== 0) problems.push(`${where} has no tilt, so secondary.angle must be 0`);
  return problems;
}

// Stated angles are the source's own numbers. A named view beside them is only the nearest listed one, so it has to be near.
function anglesProblems(c, projections, where) {
  const problems = [];
  checkShape(c.angles, ANGLES, `${where}.angles`, problems);
  if (problems.length) return problems;
  problems.push(...degenerateAngles(c.angles, `${where}.angles`));
  const view = projections.find(p => p.id === c.projection);
  if (view && angleDistance(entryAngle(c.angles), entryAngle(view)) > TOLERANCE) {
    problems.push(`${where}.projection "${c.projection}" is not within ${TOLERANCE} degrees of the stated angles ${describeAngle(entryAngle(c.angles))}`);
  }
  return problems;
}

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

  const seen = new Set();
  for (const s of tables.segments) {
    if (seen.has(s.syntax)) problems.push(`segments["${s.id}"].syntax "${s.syntax}" is used twice`);
    seen.add(s.syntax);
  }
  for (const p of tables.projections) {
    const where = `projections["${p.id}"]`;
    for (const list of SEGMENT_LISTS) {
      for (const id of p[list]) if (!ids.segments.has(id)) problems.push(`${where}.${list} lists unknown segment "${id}"`);
    }
    problems.push(...degenerateAngles(p, where));
  }
  for (const c of tables.cases) {
    const where = `cases["${c.id}"]`;
    // Reference screens own the ref- ids in the route.
    if (c.id.startsWith('ref-')) problems.push(`${where}.id must not start with "ref-"`);
    if (c.projection !== undefined && !ids.projections.has(c.projection)) problems.push(`${where}.projection "${c.projection}" is not a projection`);
    if (CLIPS.includes(c.kind) && !(c.fps > 0 && c.durationSec > 0)) problems.push(`${where} is a clip, so it needs fps and durationSec`);
    if (c.angles !== undefined) problems.push(...anglesProblems(c, tables.projections, where));
    if (!licenseAllowed(c.source.license)) problems.push(`${where} license "${c.source.license}" is not allowed. Use ${ALLOWED_LICENSES}.`);
    for (const [list, shape] of [['markers', MARKER], ['regions', REGION], ['pins', PIN]]) {
      for (const [i, item] of (c[list] ?? []).entries()) {
        const at = `${where}.${list}[${i}]`;
        const before = problems.length;
        checkShape(item, shape, at, problems);
        if (problems.length === before && item.segment !== undefined && !ids.segments.has(item.segment)) {
          problems.push(`${at} names unknown segment "${item.segment}"`);
        }
      }
    }
  }
  return problems;
}

export function indexContent({ segments, projections, ivus, cases }) {
  const byId = rows => new Map(rows.map(r => [r.id, r]));
  return { segments, projections, ivus, cases, segment: byId(segments), projection: byId(projections), concept: byId(ivus), case: byId(cases) };
}

export async function loadContent(pageUrl) {
  const page = new URL(pageUrl);
  const dir = new URL('content/', page);
  const urls = {
    segments: new URL('segments.json', dir),
    projections: new URL('projections.json', dir),
    ivus: new URL('ivus.json', dir),
    cases: new URL('../data/cath/manifest.json', page),
  };
  const names = Object.keys(urls);
  const settled = await Promise.allSettled(names.map(n => fetchJson(urls[n])));
  const tables = {};
  const problems = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') tables[names[i]] = r.value;
    // The reference screens work without cases, so a missing manifest only empties the case list.
    else if (names[i] === 'cases' && r.reason.status === 404) tables.cases = [];
    else problems.push(r.reason.message);
  });
  if (!problems.length) problems.push(...validateContent(tables));
  if (problems.length) throw Object.assign(new Error('Cath lab content did not load'), { problems });
  const resolve = path => new URL(path, urls.cases).href;
  return indexContent({ ...tables, cases: tables.cases.map(c => ({ ...c, src: resolve(c.src), poster: resolve(c.poster) })) });
}
