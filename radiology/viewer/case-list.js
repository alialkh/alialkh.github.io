// Pure. The sidebar groups cases by region. The stage and the sidebar both read cases from here.
export const REGIONS = ['head', 'chest', 'abdomen', 'pelvis', 'spine', 'musculoskeletal', 'cardiac', 'vascular'];
export const REGION_NAMES = {
  head: 'Head', chest: 'Chest', abdomen: 'Abdomen', pelvis: 'Pelvis', spine: 'Spine',
  musculoskeletal: 'Musculoskeletal', cardiac: 'Cardiac', vascular: 'Vascular',
};

// The small second line of a sidebar item: the modality and the sequence names.
export const caseSubtitle = c => `${c.modality} · ${c.series.map(s => s.name).join(', ')}`;

// sections: [{ label, groups: [{ label, cases }] }]. cases is the flat order that j and k walk.
export function caseList(cases) {
  const sections = REGIONS
    .map(region => ({ label: REGION_NAMES[region], cases: cases.filter(c => c.region === region) }))
    .filter(s => s.cases.length)
    .map(({ label, cases: inRegion }) => ({ label, groups: [{ label: null, cases: inRegion }] }));
  return { sections, cases: sections.flatMap(s => s.groups[0].cases) };
}
