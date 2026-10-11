import { h } from '../core/dom.js';
import { createPlayer } from './player.js';
import { clipPicker, draftBadge, groupedNav } from './atlas.js';

export const SYSTEM_NAMES = {
  pericardium: 'Pericardium', 'lv-function': 'LV function', valves: 'Valves',
  'right-heart': 'Right heart', cardiomyopathy: 'Cardiomyopathy', masses: 'Masses',
};

export function renderCases(main, content, conditionId) {
  const condition = content.condition.get(conditionId ?? content.conditions[0]?.id);
  const sidebar = groupedNav('Conditions', content.conditions, c => c.system, SYSTEM_NAMES, c => `#/cases/${c.id}`, condition?.id);
  if (!condition) {
    main.append(h('div', { class: 'layout' }, h('div', {}, h('h2', {}, conditionId ? `No condition called "${conditionId}"` : 'No conditions yet')), sidebar));
    return;
  }

  const clips = content.caseClips.get(condition.id) ?? [];
  const normal = content.normalClips.get(condition.compareView)?.[0];
  const compareView = content.view.get(condition.compareView);
  const nameOf = id => content.structure.get(id).name;
  const caseHolder = h('div', {});
  const normalHolder = h('div', { hidden: true });
  const players = h('div', { class: 'players' }, caseHolder, normalHolder);
  let player = null;
  let normalPlayer = null;
  const compareBtn = normal && h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => setCompare(!normalPlayer) },
    `Compare with normal ${compareView.abbrev}`);

  function mount(clip) {
    player?.destroy();
    player = clip && createPlayer(clip, { nameOf, label: 'Cine loop, case' });
    caseHolder.replaceChildren(clip
      ? h('div', {}, h('h3', { class: 'player-title' }, condition.name), player.el, clip.notes && h('p', { class: 'muted' }, clip.notes))
      : h('p', { class: 'empty' }, 'No clip for this condition yet. The findings below still apply.'));
    if (!player) return;
    player.setLabels(false);
    // Each player forwards only user actions, so mirroring never echoes back.
    player.onControl((name, arg) => normalPlayer?.[name](arg));
    if (normalPlayer) syncStart();
  }
  function syncStart() {
    for (const p of [player, normalPlayer]) {
      p?.seekStart();
      p?.setRate(player?.video.playbackRate ?? 1);
      p?.play();
    }
  }
  function setCompare(on) {
    compareBtn.setAttribute('aria-pressed', String(on));
    players.classList.toggle('two', on);
    normalPlayer?.destroy();
    normalPlayer = null;
    normalHolder.hidden = !on;
    normalHolder.replaceChildren();
    if (!on) return;
    normalPlayer = createPlayer(normal, { nameOf, label: `Cine loop, normal ${compareView.name}` });
    normalPlayer.setLabels(false);
    normalPlayer.onControl((name, arg) => player?.[name](arg));
    normalHolder.append(h('h3', { class: 'player-title' }, `Normal ${compareView.name}`), normalPlayer.el);
    syncStart();
  }
  mount(clips[0]);

  const findings = h('ol', { class: 'findings', 'aria-live': 'polite' });
  const nextBtn = h('button', { type: 'button', class: 'primary', onclick: () => reveal(1) }, 'Reveal next finding');
  const allBtn = h('button', { type: 'button', onclick: () => reveal(condition.findings.length) }, 'Reveal all');
  function reveal(n) {
    const shown = findings.children.length;
    findings.append(...condition.findings.slice(shown, shown + n).map(f => h('li', {}, f)));
    const done = findings.children.length === condition.findings.length;
    nextBtn.disabled = allBtn.disabled = done;
  }

  const list = (tag, items) => h(tag, {}, items.map(t => h('li', {}, t)));
  main.append(h('div', { class: 'layout' }, h('article', { class: 'case' },
    h('h2', {}, `${condition.name} `, draftBadge(condition)),
    clipPicker(clips, mount),
    players,
    compareBtn && h('div', { class: 'compare-bar' }, compareBtn),
    h('section', { class: 'reveal' },
      h('h3', {}, 'What do you see?'),
      h('p', {}, 'Watch the loop and name what you see before you reveal the findings one at a time.'),
      findings,
      h('div', { class: 'button-row' }, nextBtn, allBtn)),
    h('section', {},
      h('h3', {}, 'Summary'), h('p', {}, condition.summary),
      h('h3', {}, 'Why it matters'), h('p', {}, condition.significance),
      h('h3', {}, 'Pearls'), list('ul', condition.pearls),
      h('h3', {}, 'Mimics'), list('ul', condition.mimics),
      h('h3', {}, 'Sources'), list('ol', condition.sources))), sidebar));
  return () => {
    player?.destroy();
    normalPlayer?.destroy();
  };
}
