// Pure. Every screen is one sidebar entry: a case from the manifest or one of the three reference screens.
// The sidebar and the stage both read screens from here.
import { describeAngle, entryAngle } from './views.js';

export const REFERENCE = [
  { id: 'ref-segments', kind: 'ref-segments', title: 'Coronary segment diagram', subtitle: 'Schematic, every SYNTAX segment' },
  { id: 'ref-projections', kind: 'ref-projections', title: 'Projection guide', subtitle: 'C-arm angle picker' },
  { id: 'ref-ivus', kind: 'ref-ivus', title: 'IVUS cross-section', subtitle: 'Schematic, hover each layer' },
];
export const TAB_NAMES = {
  overview: 'Overview', segments: 'Segments', projections: 'Projections', concepts: 'IVUS concepts', credits: 'Credits',
  guide: 'Guide', projection: 'Projection', concept: 'Concept',
};
const CASE_TABS = ['overview', 'segments', 'projections', 'credits'];
const TABS = {
  'angio-clip': CASE_TABS, 'angio-still': CASE_TABS, 'ivus-clip': ['overview', 'concepts', 'credits'], 'ivus-still': ['overview', 'concepts', 'credits'],
  'ref-segments': ['guide', 'segments', 'credits'], 'ref-projections': ['projection', 'guide', 'credits'], 'ref-ivus': ['guide', 'concept', 'credits'],
};
export const isClip = s => s.kind === 'angio-clip' || s.kind === 'ivus-clip';
export const isAngio = s => s.kind.startsWith('angio');
export const isRef = s => s.kind.startsWith('ref-');

// A case states its view when the source gives angles or names a projection.
export const statesView = c => Boolean(c.angles || c.projection);

// The exact stated angles when there are any, else the name of the stated view.
export function viewText(c, projectionOf) {
  if (c.angles) return describeAngle(entryAngle(c.angles));
  return c.projection ? (projectionOf?.(c.projection)?.name ?? c.projection) : null;
}

function subtitleOf(c, projectionOf) {
  const view = viewText(c, projectionOf);
  let size = `${Math.round(c.durationSec)} s cine`;
  if (c.kind === 'angio-still') {
    const n = (c.regions ?? []).length;
    size = n ? `${n} outlined segment${n === 1 ? '' : 's'}` : 'Still frame';
  }
  return view ? `${view} · ${size}` : size;
}

const screenOf = projectionOf => c => ({ id: c.id, kind: c.kind, title: c.title, subtitle: subtitleOf(c, projectionOf), tabs: TABS[c.kind], c });

// sections: [{ label, groups: [{ label, cases }] }]. cases is the flat order that j and k walk.
// Cases that state their view come first, then stills before cine, so the first screen shows outlines.
export function screenList(content) {
  const screen = screenOf(id => content.projection?.get(id));
  const own = (kinds, stated) => content.cases.filter(c => kinds.includes(c.kind) && (stated === undefined || statesView(c) === stated)).map(screen);
  const ref = REFERENCE.map(r => ({ ...r, tabs: TABS[r.kind], c: null }));
  const sections = [
    {
      label: 'Angiography',
      groups: [
        { label: 'Angiography with stated projection', cases: [...own(['angio-still'], true), ...own(['angio-clip'], true)] },
        { label: 'Stills with segment outlines', cases: own(['angio-still'], false) },
        { label: 'Cine loops', cases: own(['angio-clip'], false) },
      ].filter(g => g.cases.length),
    },
    { label: 'IVUS', groups: [{ label: null, cases: own(['ivus-clip', 'ivus-still']) }].filter(g => g.cases.length) },
    { label: 'Reference', groups: [{ label: null, cases: ref }] },
  ].filter(s => s.groups.length);
  return { sections, cases: sections.flatMap(s => s.groups.flatMap(g => g.cases)) };
}
