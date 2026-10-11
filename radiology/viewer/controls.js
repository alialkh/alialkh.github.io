// The control bar under the image. Built once, then synced to the state after every change.
import { h } from '../core/dom.js';
import { autoHide } from '../core/idle.js';
import { icon } from './icons.js';
import { SPEEDS } from './input.js';
import { PLANES, PLANE_NAMES } from './planes.js';

const KEY_HINT = 'Keys work anywhere outside a text field. Up and Down arrows or the mouse wheel scroll the slices, Page Up and Page Down move 10, Home and End jump to the ends. '
  + 'Keys 1 to 9 pick a window preset. Plus and minus zoom, Shift with the arrows pans. R resets, M measures and Enter drops a ruler end at the crosshair, L labels, I the notes, T test mode, F fullscreen, Space plays the slices. J and K change case.';

export function createControls(stage, on, isPlaying) {
  const button = (name, label, onclick, extra = {}) =>
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': label, title: label, onclick, ...extra }, icon(name));
  const range = (label, onInput, extra = {}) => {
    const input = h('input', { type: 'range', step: 1, 'aria-label': label, ...extra });
    input.addEventListener('input', () => onInput(Number(input.value)));
    return input;
  };
  const field = (label, input, value) => h('label', { class: 'field track' }, h('span', {}, label), input, value);
  const toggle = (name, label, onclick) => button(name, label, onclick, { 'aria-pressed': 'false' });

  const play = button('play', 'Play the slices (Space)', on.cine, { 'aria-pressed': 'false' });
  const speed = h('select', { 'aria-label': 'Cine speed in slices a second', title: 'Cine speed' }, SPEEDS.map(s => h('option', { value: s, selected: s === 10 }, `${s}/s`)));
  speed.addEventListener('change', () => on.speed(Number(speed.value)));
  const slider = range('Slice', value => on.seek(value - 1), { min: 1, max: 1, value: 1 });
  const counter = h('span', { class: 'counter' });
  const planes = h('div', { class: 'seg', role: 'group', 'aria-label': 'Plane' },
    PLANES.map(p => h('button', { type: 'button', 'data-plane': p, 'aria-pressed': 'false', onclick: () => on.plane(p) }, PLANE_NAMES[p])));
  const series = h('div', { class: 'seg', role: 'group', 'aria-label': 'Sequence' });
  const presets = h('div', { class: 'seg presets', role: 'group', 'aria-label': 'Window presets' });
  const invert = toggle('invert', 'Invert the gray scale', on.invert);
  const level = range('Window level', value => on.level(value));
  const width = range('Window width', value => on.width(value), { min: 1 });
  const opacity = range('Label opacity', value => on.opacity(value / 100), { min: 0, max: 100 });
  const winToggle = h('button', { type: 'button', class: 'icon-btn win-toggle', 'aria-expanded': 'false', 'aria-label': 'Window sliders', title: 'Window sliders', onclick: () => {
    const open = winRow.classList.toggle('open');
    winToggle.setAttribute('aria-expanded', String(open));
  } }, icon('window'));
  const [levelText, widthText, opacityText] = [h('span', { class: 'val' }), h('span', { class: 'val' }), h('span', { class: 'val' })];
  const opacityField = field('Labels', opacity, opacityText);
  const winRow = h('div', { class: 'win-row' }, field('Level', level, levelText), field('Width', width, widthText), opacityField);
  const toggles = {
    labels: toggle('labels', 'Label colours and names (L)', on.labels),
    ruler: toggle('ruler', 'Ruler, drag to measure (M)', on.ruler),
    layout: toggle('layout', 'Three planes at once', on.layout),
    info: toggle('info', 'Case notes (I)', on.info),
    test: toggle('test', 'Test mode, hide the answers (T)', on.test),
    fullscreen: toggle('fullscreen', 'Fullscreen (F)', on.fullscreen),
  };
  const reset = button('reset', 'Reset the view and window (R)', on.reset);

  const bar = h('div', { class: 'controls glass', role: 'group', 'aria-label': 'Viewer controls', 'aria-describedby': 'key-hint' },
    h('p', { id: 'key-hint', class: 'visually-hidden' }, KEY_HINT),
    h('div', { class: 'scrub' }, play, speed, h('div', { class: 'track' }, slider), counter),
    h('div', { class: 'row' },
      h('div', { class: 'group' }, planes, series),
      h('div', { class: 'group window' }, presets, invert, winToggle),
      h('div', { class: 'group toggles' }, toggles.labels, toggles.ruler, toggles.layout, reset, toggles.info, toggles.test, toggles.fullscreen)),
    winRow);
  toggles.fullscreen.hidden = !document.fullscreenEnabled;

  const wake = autoHide(stage, bar, () => isPlaying());
  let seriesKey = '';
  let presetKey = '';
  let cine = false;
  const pressed = (el, on_) => el.setAttribute('aria-pressed', String(Boolean(on_)));

  return {
    el: bar,
    wake,
    toggles,
    // s: { ui, position, count, presets, case }
    sync({ ui, position, count, presets: list, case: c }) {
      slider.max = count;
      slider.value = position + 1;
      counter.textContent = `${position + 1} / ${count}`;
      // Not during cine, or a screen reader would hear every slice.
      if (!ui.cine) slider.setAttribute('aria-valuetext', `Slice ${position + 1} of ${count}`);
      for (const b of planes.children) pressed(b, b.dataset.plane === ui.active);

      const sKey = c.series.map(s => s.id).join();
      if (sKey !== seriesKey) {
        seriesKey = sKey;
        series.replaceChildren(...c.series.map(s => h('button', { type: 'button', 'data-series': s.id, 'aria-pressed': 'false', title: s.name, onclick: () => on.series(s.id) }, s.id.toUpperCase())));
      }
      series.hidden = c.series.length < 2;
      for (const b of series.children) pressed(b, b.dataset.series === ui.series);

      const pKey = list.map(p => p.name).join('|');
      if (pKey !== presetKey) {
        presetKey = pKey;
        presets.replaceChildren(...list.map((p, i) => h('button', { type: 'button', 'aria-pressed': 'false', title: `${p.name}: level ${Math.round(p.center)}, width ${Math.round(p.width)} (key ${i + 1})`, onclick: () => on.preset(i) },
          h('span', { class: 'n', 'aria-hidden': 'true' }, String(i + 1)), p.name)));
      }
      [...presets.children].forEach((b, i) => pressed(b, list[i].name === ui.windowName));

      pressed(invert, ui.invert);
      level.min = ui.limits.min;
      level.max = ui.limits.max;
      width.max = ui.limits.max - ui.limits.min;
      level.value = ui.center;
      width.value = ui.width;
      levelText.textContent = Math.round(ui.center);
      widthText.textContent = Math.round(ui.width);
      opacity.value = ui.opacity * 100;
      opacityText.textContent = `${Math.round(ui.opacity * 100)}%`;
      opacityField.hidden = !c.labels || ui.testing;
      toggles.labels.hidden = !c.labels;

      if (cine !== ui.cine) {
        cine = ui.cine;
        pressed(play, cine);
        play.replaceChildren(icon(cine ? 'pause' : 'play'));
        play.setAttribute('aria-label', cine ? 'Pause the slices (Space)' : 'Play the slices (Space)');
        play.title = play.getAttribute('aria-label');
        wake();
      }
      pressed(toggles.labels, ui.labels);
      pressed(toggles.ruler, ui.tool === 'ruler');
      pressed(toggles.layout, ui.layout === 'mpr');
      pressed(toggles.info, ui.info);
      pressed(toggles.test, ui.testing);
      // Test mode owns the labels and the notes until Reveal.
      toggles.labels.disabled = toggles.info.disabled = ui.testing;
    },
    setFullscreen: on_ => pressed(toggles.fullscreen, on_),
  };
}
