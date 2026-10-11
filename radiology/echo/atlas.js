import { h } from '../core/dom.js';
import { createPlayer } from './player.js';
import { groupBy } from './content.js';

export const WINDOW_NAMES = { parasternal: 'Parasternal', apical: 'Apical', subcostal: 'Subcostal', suprasternal: 'Suprasternal' };
const NOTCH_ANGLES = { 'right shoulder': -135, 'left shoulder': -45, head: -90, left: 0, right: 180 };

// shortcut: the arrow follows the first direction named in the notch sentence. Add an angle to the probe shape if a sentence ever misleads.
export function notchAngle(sentence) {
  const m = sentence.toLowerCase().match(/right shoulder|left shoulder|head|left|right/);
  return m ? NOTCH_ANGLES[m[0]] : null;
}

export const draftBadge = item => !item.reviewed && h('span', { class: 'badge draft' }, 'Draft, not yet medically reviewed');

export function groupedNav(label, items, groupOf, groupNames, hrefOf, currentId) {
  const groups = groupBy(items, groupOf);
  return h('nav', { class: 'side', 'aria-label': label },
    [...groups].map(([g, list]) => h('section', {},
      h('h3', {}, groupNames[g]),
      h('ul', {}, list.map(item => h('li', {},
        h('a', { href: hrefOf(item), 'aria-current': item.id === currentId ? 'page' : null }, item.name)))))));
}

function probeFigure(probe) {
  const [x, y] = [probe.chest[0] * 200, probe.chest[1] * 240];
  const angle = notchAngle(probe.notch);
  const arrow = angle === null ? '' : '<path class="notch-arrow" d="M14 0 H34 M28 -5 L34 0 L28 5"/>';
  const svg = `<svg viewBox="0 0 200 240" role="img" aria-label="Probe position on the front of the chest">
    <path class="torso" d="M30 30 Q100 10 170 30 L178 120 Q172 200 150 236 H50 Q28 200 22 120 Z"/>
    <path class="bone" d="M42 30 Q70 40 94 34 M106 34 Q130 40 158 30 M94 34 H106 V138 H94 Z M100 140 L58 186 M100 140 L142 186"/>
    <ellipse class="heart" cx="112" cy="110" rx="30" ry="22" transform="rotate(-25 112 110)"/>
    <text x="10" y="18">R</text><text x="182" y="18">L</text>
    <g transform="translate(${x} ${y}) rotate(${angle ?? 0})">
      <rect class="probe" x="-12" y="-5" width="24" height="10" rx="3"/>
      ${angle === null ? '' : '<circle class="notch" cx="9" cy="0" r="2.5"/>'}${arrow}
    </g></svg>`;
  const fig = h('figure', { class: 'probe-figure' });
  fig.innerHTML = svg;
  fig.append(h('figcaption', { class: 'muted' }, 'Front of the chest. The patient\'s right is on your left. The dot and arrow mark the notch.'));
  return fig;
}

export function clipPicker(clips, onPick) {
  if (clips.length < 2) return null;
  const buttons = clips.map((c, i) => h('button', { type: 'button', 'aria-pressed': String(i === 0), onclick: () => {
    buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
    onPick(c);
  } }, `Clip ${i + 1}`));
  return h('div', { class: 'picker', role: 'group', 'aria-label': 'Clips' }, buttons);
}

export function renderAtlas(main, content, viewId) {
  const view = content.view.get(viewId ?? content.views[0]?.id);
  const clips = content.normalClips.get(view?.id) ?? [];
  const sidebar = groupedNav('Views', content.views, v => v.window, WINDOW_NAMES, v => `#/atlas/${v.id}`, view?.id);
  if (!view) {
    main.append(h('div', { class: 'layout' }, h('div', {}, h('h2', {}, viewId ? `No view called "${viewId}"` : 'No views yet')), sidebar));
    return;
  }

  let player = null;
  const nameOf = id => content.structure.get(id).name;
  const stageSlot = h('div', { class: 'clip-slot' });
  const structureList = h('ul', { class: 'structures' });
  const hint = h('p', { class: 'muted' }, 'Select a highlighted name to find it on the loop.');
  function mount(clip) {
    player?.destroy();
    player = clip && createPlayer(clip, { nameOf, label: `Cine loop, ${view.name}` });
    stageSlot.replaceChildren(...(clip
      ? [player.el, clip.notes && h('p', { class: 'muted' }, clip.notes)]
      : [h('p', { class: 'empty' }, 'No clip for this view yet. The teaching notes below still apply.')]));
    const marked = new Set(clip?.markers.map(m => m.structure));
    hint.hidden = !marked.size;
    structureList.replaceChildren(...view.structures.map(id => {
      const s = content.structure.get(id);
      const name = marked.has(id)
        ? h('button', {
          type: 'button', class: 'structure-name', title: 'Show on the loop',
          onclick: () => player.pulse(id),
          onmouseenter: () => player.highlight(id), onmouseleave: () => player.highlight(null),
          onfocus: () => player.highlight(id), onblur: () => player.highlight(null),
        }, s.name)
        : h('strong', {}, s.name);
      return h('li', {}, name, ' ', s.description);
    }));
  }
  mount(clips[0]);

  const list = items => h('ul', {}, items.map(t => h('li', {}, t)));
  main.append(h('div', { class: 'layout' }, h('article', { class: 'view' },
    h('h2', {}, `${view.name} (${view.abbrev}) `, draftBadge(view)),
    clipPicker(clips, mount),
    stageSlot,
    h('div', { class: 'teaching' },
      h('section', { class: 'probe' },
        h('h3', {}, 'Probe placement'),
        probeFigure(view.probe),
        h('p', {}, h('strong', {}, 'Site. '), view.probe.site),
        h('p', {}, h('strong', {}, 'Notch. '), view.probe.notch),
        h('h3', {}, 'On screen'),
        h('p', {}, view.screen)),
      h('section', {},
        h('h3', {}, 'Structures'),
        hint,
        structureList,
        h('h3', {}, 'Tips'), list(view.tips),
        h('h3', {}, 'Pitfalls'), list(view.pitfalls)))), sidebar));
  return () => player?.destroy();
}
