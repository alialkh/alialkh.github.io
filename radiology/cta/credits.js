// Pure. Who to credit for each screen. The strings are the ones in the content tables, so the credit and the claim never drift apart.
export const SYNTAX_SOURCES = [
  'SYNTAX Score website, Tutorial, Definitions. https://syntaxscore.org/index.php/tutorial/definitions',
  'Sianos G et al. The SYNTAX Score: an angiographic tool grading the complexity of coronary artery disease. EuroIntervention 2005;1(2):219-227. PMID 19758907.',
];

// "Popov M, Amanturdieva A, Fazli S" becomes "Popov M et al.". A single author stays whole.
export function shortAuthor(author) {
  const [first, ...rest] = author.split(',').map(a => a.trim());
  return rest.length ? `${first} et al.` : first;
}

const unique = lists => [...new Set(lists.flat())];

// [{ title, items }] for a screen kind. Segments are credited here because the tables carry no per-segment sources.
export function creditGroups(kind, content) {
  const projections = { title: 'Projection notes', items: unique(content.projections.map(p => p.sources)) };
  const concepts = { title: 'IVUS concepts', items: unique(content.ivus.map(c => c.sources)) };
  const segments = { title: 'Segment definitions', items: SYNTAX_SOURCES };
  return {
    'angio-clip': [segments, projections], 'angio-still': [segments, projections],
    'ivus-clip': [concepts], 'ivus-still': [concepts],
    'ref-segments': [segments], 'ref-projections': [projections], 'ref-ivus': [concepts],
  }[kind];
}
