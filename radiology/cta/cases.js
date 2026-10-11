// Pure. Every screen is one sidebar entry: a case from the manifest or one of the three reference screens.
// The sidebar and the stage both read screens from here.
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

function subtitleOf(c) {
  if (c.kind === 'angio-still') {
    const n = (c.regions ?? []).length;
    return n ? `${n} outlined segment${n === 1 ? '' : 's'}` : 'Still frame';
  }
  return `${Math.round(c.durationSec)} s cine`;
}

const screenOf = c => ({ id: c.id, kind: c.kind, title: c.title, subtitle: subtitleOf(c), tabs: TABS[c.kind], c });

// sections: [{ label, groups: [{ label, cases }] }]. cases is the flat order that j and k walk. Stills come first, so the first screen shows outlines.
export function screenList(content) {
  const own = kinds => content.cases.filter(c => kinds.includes(c.kind)).map(screenOf);
  const ref = REFERENCE.map(r => ({ ...r, tabs: TABS[r.kind], c: null }));
  const sections = [
    { label: 'Angiography', groups: [{ label: 'Stills with segment outlines', cases: own(['angio-still']) }, { label: 'Cine loops', cases: own(['angio-clip']) }].filter(g => g.cases.length) },
    { label: 'IVUS', groups: [{ label: null, cases: own(['ivus-clip', 'ivus-still']) }].filter(g => g.cases.length) },
    { label: 'Reference', groups: [{ label: null, cases: ref }] },
  ].filter(s => s.groups.length);
  return { sections, cases: sections.flatMap(s => s.groups.flatMap(g => g.cases)) };
}
