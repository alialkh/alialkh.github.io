// The control bar under the viewports: cine, the slice slider, window presets and sliders, and the tools. It acts on the active viewport.
// Built once, then synced to the state after every change. Series and plane pickers live in each viewport's title bar.
import { h } from '../core/dom.js';
import { autoHide } from '../core/idle.js';
import { icon } from './icons.js';
import { SPEEDS } from './input.js';

const KEY_HINT = 'Keys work anywhere outside a text field and act on the active viewport. Up and Down arrows or the mouse wheel scroll the slices, Page Up and Page Down move 10, Home and End jump to the ends. '
  + 'Keys 1 to 9 pick a window preset. Plus and minus zoom, Shift with the arrows pans. R resets, M measures and Enter drops a ruler end at the crosshair, L labels, I the side panel, C the case list, B this bar, '
  + 'A the corner text, V links the viewports, X maximizes, Z shows only the images, T test mode, F fullscreen, Space plays the slices. J and K change case. Alt with an arrow key on a viewport title bar swaps viewports.';

// on: cine, speed(n), seek(position), preset(i), invert, level(n), width(n), opacity(0 to 1), labels, ruler, reset. app is the element that gets the idle class.
export function createControls(app, on, isPlaying) {
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
  const presets = h('div', { class: 'seg presets', role: 'group', 'aria-label': 'Window presets' });
  const invert = toggle('invert', 'Invert the gray scale', on.invert);
  const level = range('Window level', value => on.level(value));
  const width = range('Window width', value => on.width(value), { min: 1 });
  const opacity = range('Label opacity', value => on.opacity(value / 100), { min: 0, max: 100 });
  const winRow = h('div', { class: 'win-row' });
  const winToggle = h('button', { type: 'button', class: 'icon-btn', 'aria-expanded': 'false', 'aria-label': 'Window sliders', title: 'Window sliders', onclick: () => {
    const open = winRow.classList.toggle('open');
    winToggle.setAttribute('aria-expanded', String(open));
  } }, icon('window'));
  const [levelText, widthText, opacityText] = [h('span', { class: 'val' }), h('span', { class: 'val' }), h('span', { class: 'val' })];
  const opacityField = field('Labels', opacity, opacityText);
  winRow.append(field('Level', level, levelText), field('Width', width, widthText), opacityField);
  const labels = toggle('labels', 'Label colours in the active viewport (L)', on.labels);
  const ruler = toggle('ruler', 'Ruler, drag to measure (M)', on.ruler);
  const reset = button('reset', 'Reset the active viewport (R)', on.reset);

  const bar = h('div', { class: 'controls', role: 'group', 'aria-label': 'Viewer controls', 'aria-describedby': 'key-hint' },
    h('p', { id: 'key-hint', class: 'visually-hidden' }, KEY_HINT),
    h('div', { class: 'scrub' }, play, speed, h('div', { class: 'track' }, slider), counter),
    h('div', { class: 'tools' }, presets, invert, winToggle, labels, ruler, reset),
    winRow);

  const wake = autoHide(app, bar, () => isPlaying());
  let presetKey = '';
  let cine = false;
  const pressed = (el, on_) => el.setAttribute('aria-pressed', String(Boolean(on_)));

  return {
    el: bar,
    wake,
    // s: ui (flags), vp (the active viewport), position and count (its slice), presets, win (resolved window or null), limits, c (the case).
    sync({ ui, vp, position, count, presets: list, win, limits, c }) {
      slider.max = count;
      slider.value = position + 1;
      counter.textContent = `${position + 1} / ${count}`;
      // Not during cine, or a screen reader would hear every slice.
      if (!ui.cine) slider.setAttribute('aria-valuetext', `Slice ${position + 1} of ${count}`);

      const pKey = list.map(p => p.name).join('|');
      if (pKey !== presetKey) {
        presetKey = pKey;
        presets.replaceChildren(...list.map((p, i) => h('button', { type: 'button', 'aria-pressed': 'false', title: `${p.name}: level ${Math.round(p.center)}, width ${Math.round(p.width)} (key ${i + 1})`, onclick: () => on.preset(i) },
          h('span', { class: 'n', 'aria-hidden': 'true' }, String(i + 1)), p.name)));
      }
      [...presets.children].forEach((b, i) => pressed(b, win?.name === list[i].name));
      presets.hidden = !list.length;

      pressed(invert, vp.invert);
      level.min = limits.min;
      level.max = limits.max;
      width.max = limits.max - limits.min;
      level.value = win?.center ?? 0;
      width.value = win?.width ?? 1;
      levelText.textContent = win ? Math.round(win.center) : '';
      widthText.textContent = win ? Math.round(win.width) : '';
      opacity.value = ui.opacity * 100;
      opacityText.textContent = `${Math.round(ui.opacity * 100)}%`;
      opacityField.hidden = !c.labels || ui.testing;
      labels.hidden = !c.labels;

      if (cine !== ui.cine) {
        cine = ui.cine;
        pressed(play, cine);
        play.replaceChildren(icon(cine ? 'pause' : 'play'));
        play.setAttribute('aria-label', cine ? 'Pause the slices (Space)' : 'Play the slices (Space)');
        play.title = play.getAttribute('aria-label');
        wake();
      }
      pressed(labels, vp.labels);
      pressed(ruler, ui.tool === 'ruler');
      // Test mode owns the labels until Reveal.
      labels.disabled = ui.testing;
    },
  };
}
