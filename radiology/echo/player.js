// Cine player for one clip: a frame fitted to its cell, frame stepping, A-B loop, speed, markers and pins.
import { h } from '../core/dom.js';
import { credit as creditLine } from '../core/credit.js';
import { NO_LOOP, setLoopPoint, loopSeek } from './loop.js';
import { layoutLabels } from './label-layout.js';

export const SPEEDS = [0.1, 0.25, 0.5, 1, 1.5];
// Clips are at most 720 px wide. Past twice that, upscaling only adds blur.
const MAX_SCALE = 2;

export const credit = clip => creditLine(clip.source);

const place = ([x, y]) => `left: ${x * 100}%; top: ${y * 100}%`;

// Markers start as numbered badges, and fit() turns each into a name chip where one fits.
function overlays(clip, nameOf) {
  const markers = clip.markers.map((m, i) => h('span', {
    class: 'marker badged', role: 'img', tabindex: '0', 'aria-label': nameOf(m.structure), 'data-structure': m.structure,
    style: `${place(m.at)}; --d: ${m.r * 200}%`,
  }, h('span', { class: 'ring' }), h('span', { class: 'num', 'aria-hidden': 'true' }, String(i + 1)), h('span', { class: 'chip' }, nameOf(m.structure))));
  // Pin chips show only on hover and focus, so they open toward the middle of the frame instead of taking part in layout.
  const pins = (clip.pins ?? []).map((p, i) => h('span', {
    class: `pin${p.at[0] > 0.5 ? ' chip-left' : ''}`, role: 'img', tabindex: '0', 'aria-label': `Finding pin ${i + 1}. ${p.text}`, 'data-pin': i + 1,
    style: place(p.at),
  }, h('span', { class: 'dot' }, String(i + 1)), h('span', { class: 'chip' }, p.text)));
  return h('div', { class: 'labels' }, markers, pins);
}

// caption names the clip under its frame when two players share the stage.
export function createPlayer(clip, { nameOf, label, caption }) {
  const frames = Math.max(1, Math.round(clip.durationSec * clip.fps));
  const frameAt = t => Math.min(frames - 1, Math.max(0, Math.floor(t * clip.fps + 1e-3)));
  const commandListeners = [];
  const frameListeners = [];
  let frame = 0;
  let loop = NO_LOOP;
  let alive = true;

  const video = h('video', { src: clip.src, poster: clip.poster, width: clip.width, height: clip.height, preload: 'auto', 'aria-label': label });
  Object.assign(video, { muted: true, playsInline: true, loop: true });
  const labels = overlays(clip, nameOf);
  const box = h('div', { class: 'frame' }, video, labels, h('span', { class: 'cell-tag' }, caption));
  const cell = h('div', { class: 'cell' }, box);

  const marks = [...labels.querySelectorAll('.marker')];
  const chips = marks.map(el => el.querySelector('.chip'));
  let laidOut = '';
  // Markers and pins are fractions of the frame, so the frame keeps the clip's exact aspect ratio.
  function fit() {
    const scale = Math.min(cell.clientWidth / clip.width, cell.clientHeight / clip.height, MAX_SCALE);
    const width = Math.floor(clip.width * scale);
    const height = Math.floor(clip.height * scale);
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;
    // Hidden labels measure zero. The observer watches them too, so they lay out when they show.
    const key = labels.offsetWidth && `${width}x${height}`;
    if (!key || key === laidOut) return;
    laidOut = key;
    const spots = layoutLabels({
      width, height,
      markers: clip.markers.map((m, i) => ({ x: m.at[0] * width, y: m.at[1] * height, r: m.r * width, w: chips[i].offsetWidth, h: chips[i].offsetHeight })),
      pins: (clip.pins ?? []).map(p => ({ x: p.at[0] * width, y: p.at[1] * height })),
    });
    spots.forEach((s, i) => {
      marks[i].classList.toggle('badged', s.badge);
      marks[i].style.setProperty('--x', `${s.x}px`);
      marks[i].style.setProperty('--y', `${s.y}px`);
    });
  }
  const observer = window.ResizeObserver ? new ResizeObserver(fit) : null;
  if (observer) [cell, labels].forEach(el => observer.observe(el));
  // shortcut: without ResizeObserver only window resizes refit, not the panel toggle. Every browser since 2020 has it.
  else {
    addEventListener('resize', fit);
    requestAnimationFrame(fit);
  }

  function show(f) {
    frame = f;
    const still = video.paused || video.seeking;
    for (const fn of frameListeners) fn(f, still);
    const target = still ? null : loopSeek(loop, f);
    if (target !== null) seekFrame(target);
  }
  function seekFrame(f) {
    const target = Math.min(frames - 1, Math.max(0, f));
    // Aim at the middle of the frame so rounding never lands on the previous one.
    video.currentTime = (target + 0.5) / clip.fps;
    show(target);
  }
  // Commands are what a mirrored player follows in compare mode.
  const command = (name, run) => arg => {
    run(arg);
    for (const fn of commandListeners) fn(name, arg);
  };

  const api = {
    el: cell, video, frames,
    get loop() { return loop; },
    play: command('play', () => video.play().catch(() => {})),
    pause: command('pause', () => video.pause()),
    seekStart: command('seekStart', () => seekFrame(0)),
    setRate: command('setRate', rate => {
      video.playbackRate = rate;
      video.defaultPlaybackRate = rate;
    }),
    toggle: () => (video.paused ? api.play() : api.pause()),
    step(d) {
      api.pause();
      seekFrame(frame + d);
    },
    seek(f) {
      api.pause();
      seekFrame(f);
    },
    setLoop(which) {
      loop = setLoopPoint(loop, which, frame);
    },
    onCommand: fn => commandListeners.push(fn),
    onFrame: fn => frameListeners.push(fn),
    pulse(selector) {
      for (const el of labels.querySelectorAll(selector)) {
        el.classList.remove('pulse');
        // Reading layout restarts the animation when the same label is pulsed twice in a row.
        void el.offsetWidth;
        el.classList.add('pulse');
        setTimeout(() => el.classList.remove('pulse'), 1600);
      }
    },
    highlight(selector) {
      for (const el of labels.children) el.classList.toggle('hi', selector !== null && el.matches(selector));
    },
    destroy() {
      alive = false;
      if (observer) observer.disconnect();
      else removeEventListener('resize', fit);
      video.pause();
      video.removeAttribute('src');
      video.load();
    },
  };

  video.addEventListener('pause', () => show(frameAt(video.currentTime)));
  video.addEventListener('seeked', () => show(frameAt(video.currentTime)));
  video.addEventListener('error', () => {
    if (!alive) return;
    // The page never names the file. A file name can give a case away in test mode.
    console.error('Clip failed to load:', clip.src, video.error);
    box.append(h('p', { class: 'frame-error', role: 'status' }, 'This clip could not be loaded.'));
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
  return api;
}
