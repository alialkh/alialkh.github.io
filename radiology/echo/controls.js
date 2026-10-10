// The bottom control bar. Built once, then pointed at each case's player in turn.
import { h } from '../core/dom.js';
import { icon } from './icons.js';
import { SPEEDS } from './player.js';
import { loopActive, loopLabel } from './loop.js';

const IDLE_MS = 3000;
const KEY_HINT = 'Keys work anywhere outside a text field. Space plays or pauses. Left and Right step a frame, with Shift 10. Home goes to the first frame. [ and ] change speed. L labels, I case notes, T test mode, F fullscreen. J and K, or Page Down and Page Up, change case.';

// :focus-visible needs Safari 15.4. Before that, any focus inside the bar keeps it up.
const keyboardFocus = el => {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
};

// toggles: [{ name, icon, label, onclick }], shown as pressed buttons on the right of the bar.
export function createControls(stage, toggles) {
  let player = null;
  const button = (name, label, onclick, extra = {}) =>
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': label, title: label, onclick, ...extra }, icon(name));
  const playBtn = button('play', 'Play (Space)', () => player.toggle());
  const scrub = h('input', { type: 'range', min: 0, max: 0, step: 1, value: 0, 'aria-label': 'Frame' });
  const band = h('span', { class: 'loop-band', hidden: true });
  const counter = h('span', { class: 'counter' });
  const speed = h('select', { 'aria-label': 'Speed', title: 'Speed ([ and ])' }, SPEEDS.map(s => h('option', { value: s, selected: s === 1 }, `${s}×`)));
  const loopText = h('span', { class: 'loop-text' });
  const clearLoop = button('close', 'Clear loop', () => setLoop(null), { hidden: true });
  const pressed = Object.fromEntries(toggles.map(t => [t.name, button(t.icon, t.label, t.onclick, { 'aria-pressed': 'false' })]));

  const bar = h('div', { class: 'controls glass', role: 'group', 'aria-label': 'Cine controls', 'aria-describedby': 'key-hint' },
    h('p', { id: 'key-hint', class: 'visually-hidden' }, KEY_HINT),
    h('div', { class: 'scrub' }, h('div', { class: 'track' }, band, scrub), counter),
    h('div', { class: 'buttons' },
      h('div', { class: 'group' },
        playBtn,
        button('first', 'First frame (Home)', () => player.seekStart()),
        button('prev', 'Previous frame (Left arrow, Shift for 10)', () => player.step(-1)),
        button('next', 'Next frame (Right arrow, Shift for 10)', () => player.step(1)),
        speed),
      h('div', { class: 'group loop', role: 'group', 'aria-label': 'A to B loop' },
        h('button', { type: 'button', class: 'text-btn', 'aria-label': 'A, loop from this frame', title: 'Loop from this frame', onclick: () => setLoop('a') }, 'A'),
        h('button', { type: 'button', class: 'text-btn', 'aria-label': 'B, loop to this frame', title: 'Loop to this frame', onclick: () => setLoop('b') }, 'B'),
        clearLoop, loopText),
      h('div', { class: 'group toggles' }, Object.values(pressed))));

  function setLoop(which) {
    player.setLoop(which);
    const { a, b } = player.loop;
    const last = Math.max(1, player.frames - 1);
    band.hidden = !loopActive(player.loop);
    band.style.setProperty('--a', String(a / last));
    band.style.setProperty('--b', String(b / last));
    loopText.textContent = loopLabel(player.loop);
    clearLoop.hidden = a === null && b === null;
  }
  function syncPlaying() {
    const playing = !player.video.paused;
    playBtn.replaceChildren(icon(playing ? 'pause' : 'play'));
    playBtn.setAttribute('aria-label', playing ? 'Pause (Space)' : 'Play (Space)');
    playBtn.title = playBtn.getAttribute('aria-label');
    wake();
  }

  let timer = 0;
  const engaged = () => bar.matches(':hover') || (bar.contains(document.activeElement) && keyboardFocus(document.activeElement));
  function wake() {
    stage.classList.remove('idle');
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (player && !player.video.paused && !engaged()) stage.classList.add('idle');
    }, IDLE_MS);
  }
  for (const type of ['pointermove', 'pointerdown', 'focusin']) stage.addEventListener(type, wake);
  addEventListener('keydown', wake);

  scrub.addEventListener('input', () => player.seek(Number(scrub.value)));
  speed.addEventListener('change', () => player.setRate(Number(speed.value)));

  return {
    el: bar,
    pressed,
    setPressed: (name, on) => pressed[name].setAttribute('aria-pressed', String(on)),
    attach(p) {
      player = p;
      scrub.max = p.frames - 1;
      const show = (f, still) => {
        scrub.value = f;
        counter.textContent = `${f + 1} / ${p.frames}`;
        // Not during playback, or a screen reader would hear every frame.
        if (still) scrub.setAttribute('aria-valuetext', `Frame ${f + 1} of ${p.frames}`);
      };
      p.onFrame(show);
      show(0, true);
      for (const type of ['play', 'pause']) p.video.addEventListener(type, syncPlaying);
      p.video.addEventListener('ratechange', () => { speed.value = p.video.playbackRate; });
      // The chosen speed carries over to the next case.
      p.setRate(Number(speed.value));
      setLoop(null);
      syncPlaying();
    },
    changeSpeed(d) {
      const i = SPEEDS.indexOf(Number(speed.value));
      player.setRate(SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, i + d))]);
    },
  };
}
