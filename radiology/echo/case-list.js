// Pure. Every clip is one case. The sidebar and the stage both read cases from here.
import { groupBy } from './content.js';

export const WINDOW_NAMES = { parasternal: 'Parasternal', apical: 'Apical', subcostal: 'Subcostal', suprasternal: 'Suprasternal' };
export const SYSTEM_NAMES = {
  pericardium: 'Pericardium', 'lv-function': 'LV function', valves: 'Valves',
  'right-heart': 'Right heart', cardiomyopathy: 'Cardiomyopathy', masses: 'Masses',
};
export const TAB_NAMES = { overview: 'Overview', structures: 'Structures', tips: 'Tips', findings: 'Findings', significance: 'Why it matters' };
const TABS = { normal: ['overview', 'structures', 'tips'], pathology: ['overview', 'findings', 'significance'] };

export function caseOf(content, clip) {
  const view = content.view.get(clip.view);
  const condition = clip.condition === undefined ? null : content.condition.get(clip.condition);
  const kind = condition ? 'pathology' : 'normal';
  // Clips with the same title and the same view would read the same, so the second line numbers them.
  const siblings = (condition ? content.caseClips.get(condition.id) : content.normalClips.get(view.id)).filter(c => c.view === clip.view);
  const number = siblings.length > 1 ? `, clip ${siblings.indexOf(clip) + 1}` : '';
  return {
    id: clip.id, clip, view, condition, kind,
    title: condition ? condition.name : view.abbrev,
    subtitle: (condition ? view.abbrev : WINDOW_NAMES[view.window]) + number,
    // Both tables feed a pathology case's panel, so either one unreviewed makes it a draft.
    draft: !view.reviewed || (condition !== null && !condition.reviewed),
    tabs: TABS[kind],
    compare: (condition && content.normalClips.get(condition.compareView)?.[0]) ?? null,
  };
}

// sections: [{ label, groups: [{ label, cases }] }]. cases is the flat order that j and k walk.
export function caseList(content) {
  const normal = content.views.flatMap(v => content.normalClips.get(v.id) ?? []);
  const pathology = [...groupBy(content.conditions, c => c.system)]
    .map(([system, conditions]) => ({ label: SYSTEM_NAMES[system], clips: conditions.flatMap(c => content.caseClips.get(c.id) ?? []) }))
    .filter(g => g.clips.length);
  const toGroup = ({ label, clips }) => ({ label, cases: clips.map(clip => caseOf(content, clip)) });
  const sections = [
    { label: 'Normal views', groups: normal.length ? [toGroup({ label: null, clips: normal })] : [] },
    { label: 'Pathology', groups: pathology.map(toGroup) },
  ].filter(s => s.groups.length);
  return { sections, cases: sections.flatMap(s => s.groups.flatMap(g => g.cases)) };
}
