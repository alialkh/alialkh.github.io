// Cine player: frame stepping, A-B loop, speed, labeled markers. One instance per clip.
import { h } from '../core/dom.js';
import { NO_LOOP, setLoopPoint, loopSeek, loopLabel } from './loop.js';

export const SPEEDS = [0.1, 0.25, 0.5, 1, 1.5];
const keyHint = fullscreen => `Keys: Space play or pause, Left and Right step a frame, Shift steps 10, [ and ] speed, L labels, ${fullscreen ? 'F fullscreen, ' : ''}Home first frame.`;

// CC BY and CC BY-SA need visible credit: who, which license, where from, and whether it was changed.
export function credit(clip) {
  const s = clip.source;
  return h('p', { class: 'credit muted' },
    'Clip: ', s.attribution || s.author, ', ',
    h('a', { href: s.licenseUrl, rel: 'license noopener', target: '_blank' }, s.license), ', ',
    h('a', { href: s.url, rel: 'noopener', target: '_blank' }, 'source'),
    s.modified && [', ', h('span', { title: s.modified }, 're-encoded')], '.');
}

// fullscreen: false where answer controls live outside the player, as in the quiz.
export function createPlayer(clip, { markers = clip.markers, nameOf = id => id, label = 'Cine loop', autoplay = true, showCredit = true, fullscreen = true } = {}) {
  const frames = Math.max(1, Math.round(clip.durationSec * clip.fps));
  const frameAt = t => Math.min(frames - 1, Math.max(0, Math.floor(t * clip.fps + 1e-3)));
  const listeners = [];
  const hint = keyHint(fullscreen);
  let frame = 0;
  let loop = NO_LOOP;
  let alive = true;

  const video = h('video', { src: clip.src, poster: clip.poster, width: clip.width, height: clip.height, preload: 'auto', 'aria-label': label });
  Object.assign(video, { muted: true, playsInline: true, loop: true });
  const layer = h('div', { class: 'markers' });
  const stage = h('div', { class: 'stage', style: `--w: ${clip.width}px; --ar: ${clip.width} / ${clip.height}` }, video, layer);

  const button = (text, aria, onclick) => h('button', { type: 'button', 'aria-label': aria, title: aria, onclick }, text);
  const playBtn = button('▶', 'Play (Space)', () => act(video.paused ? 'play' : 'pause'));
  const scrub = h('input', { type: 'range', min: 0, max: frames - 1, step: 1, value: 0, 'aria-label': 'Frame' });
  const counter = h('span', { class: 'counter' });
  const speed = h('select', { 'aria-label': 'Speed' }, SPEEDS.map(s => h('option', { value: s, selected: s === 1 }, `${s}×`)));
  const loopText = h('span', { class: 'loop-text muted' });
  const labelsBtn = h('button', { type: 'button', 'aria-pressed': 'true', title: 'Labels on or off (L)', onclick: () => setLabels(layer.hidden) }, 'Labels');
  const fullBtn = button('⛶', 'Fullscreen (F)', toggleFullscreen);
  const figure = h('figure', { class: 'player', tabindex: '0', 'aria-label': `${label}. ${hint}` },
    h('div', { class: 'frame' }, stage),
    h('div', { class: 'controls', role: 'group', 'aria-label': 'Cine controls' },
      h('div', { class: 'row' },
        playBtn,
        button('⏮', 'First frame (Home)', () => act('seekStart')),
        button('‹', 'Previous frame (Left)', () => step(-1)),
        button('›', 'Next frame (Right)', () => step(1)),
        scrub, counter, speed),
      h('div', { class: 'row' },
        h('button', { type: 'button', title: 'Loop start at this frame', onclick: () => setLoop('a') }, 'Set A'),
        h('button', { type: 'button', title: 'Loop end at this frame', onclick: () => setLoop('b') }, 'Set B'),
        h('button', { type: 'button', onclick: () => setLoop(null) }, 'Clear loop'),
        loopText,
        h('span', { class: 'spacer' }),
        labelsBtn,
        fullscreen && document.fullscreenEnabled && fullBtn)),
    h('p', { class: 'hint muted' }, hint),
    showCredit && h('figcaption', {}, credit(clip)));

  function show(f) {
    frame = f;
    scrub.value = f;
    counter.textContent = `frame ${f + 1} / ${frames}`;
    const still = video.paused || video.seeking;
    // Not during playback, or a screen reader would hear every frame.
    if (still) scrub.setAttribute('aria-valuetext', counter.textContent);
    const target = still ? null : loopSeek(loop, f);
    if (target !== null) seekFrame(target);
  }
  function seekFrame(f) {
    const target = Math.min(frames - 1, Math.max(0, f));
    // Aim at the middle of the frame so rounding never lands on the previous one.
    video.currentTime = (target + 0.5) / clip.fps;
    show(target);
  }
  function step(d) {
    video.pause();
    seekFrame(frame + d);
  }
  function setLoop(which) {
    loop = setLoopPoint(loop, which, frame);
    loopText.textContent = loopLabel(loop);
  }
  function setLabels(on) {
    layer.hidden = !on;
    labelsBtn.setAttribute('aria-pressed', String(on));
  }
  function setRate(rate) {
    video.playbackRate = rate;
    video.defaultPlaybackRate = rate;
    speed.value = rate;
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else figure.requestFullscreen?.().catch(() => {});
  }
  function setMarkers(list) {
    labelsBtn.hidden = !list.length;
    layer.replaceChildren(...list.map(m => {
      const name = nameOf(m.structure);
      return h('span', {
        class: `marker${m.at[0] > 0.5 ? ' chip-left' : ''}`, role: 'img', tabindex: '0', 'aria-label': name, 'data-structure': m.structure,
        style: `left: ${m.at[0] * 100}%; top: ${m.at[1] * 100}%; --d: ${m.r * 200}%`,
      }, h('span', { class: 'ring' }), h('span', { class: 'chip' }, name));
    }));
  }
  const markerEl = id => layer.querySelector(`[data-structure="${CSS.escape(id)}"]`);

  const api = {
    el: figure, stage, video,
    play: () => video.play().catch(() => {}),
    pause: () => video.pause(),
    seekStart: () => seekFrame(0),
    setRate, setLabels, setMarkers,
    onControl: fn => listeners.push(fn),
    highlight(id) {
      for (const m of layer.children) m.classList.toggle('hi', m.dataset.structure === id);
    },
    pulse(id) {
      const m = markerEl(id);
      if (!m) return;
      setLabels(true);
      m.classList.remove('pulse');
      void m.offsetWidth;
      m.classList.add('pulse');
      setTimeout(() => m.classList.remove('pulse'), 1600);
    },
    destroy() {
      alive = false;
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (document.fullscreenElement === figure) document.exitFullscreen();
    },
  };
  // User actions go through act so a mirrored player can follow them without echoing back.
  function act(name, arg) {
    api[name](arg);
    for (const fn of listeners) fn(name, arg);
  }
  function changeSpeed(d) {
    const i = SPEEDS.indexOf(video.playbackRate);
    act('setRate', SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, (i < 0 ? 3 : i) + d))]);
  }

  scrub.addEventListener('input', () => {
    video.pause();
    seekFrame(Number(scrub.value));
  });
  speed.addEventListener('change', () => act('setRate', Number(speed.value)));
  video.addEventListener('play', () => { playBtn.textContent = '❚❚'; playBtn.setAttribute('aria-label', 'Pause (Space)'); });
  video.addEventListener('pause', () => {
    playBtn.textContent = '▶';
    playBtn.setAttribute('aria-label', 'Play (Space)');
    show(frameAt(video.currentTime));
  });
  video.addEventListener('seeked', () => show(frameAt(video.currentTime)));
  video.addEventListener('error', () => {
    if (!alive) return;
    // The file name stays out of the page because in the quiz it can give the answer away.
    console.error('Clip failed to load:', clip.src, video.error);
    stage.append(h('p', { class: 'stage-error' }, 'This clip could not be loaded.'));
  });
  if ('requestVideoFrameCallback' in video) {
    const onFrame = (_, meta) => {
      if (!alive) return;
      show(frameAt(meta.mediaTime));
      video.requestVideoFrameCallback(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
  } else {
    video.addEventListener('timeupdate', () => show(frameAt(video.currentTime)));
  }

  const KEYS = {
    ' ': () => act(video.paused ? 'play' : 'pause'),
    arrowleft: e => step(e.shiftKey ? -10 : -1),
    arrowright: e => step(e.shiftKey ? 10 : 1),
    home: () => act('seekStart'),
    l: () => setLabels(layer.hidden),
    '[': () => changeSpeed(-1),
    ']': () => changeSpeed(1),
    f: fullscreen && toggleFullscreen,
  };
  figure.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (!KEYS[key] || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    // Leave keys a focused control already uses: Space on buttons, arrows and Home in the slider and menu.
    if (key === ' ' && e.target.matches('button, select, input')) return;
    if (['arrowleft', 'arrowright', 'home'].includes(key) && e.target.matches('select, input')) return;
    e.preventDefault();
    KEYS[key](e);
  });

  setMarkers(markers);
  show(0);
  if (autoplay && !matchMedia('(prefers-reduced-motion: reduce)').matches) api.play();
  return api;
}
