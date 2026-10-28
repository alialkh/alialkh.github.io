// The POCUS simulator page: one patient, one probe, one machine. This file wires the pieces together and runs the clock.
//
//   patient-view.js  the 3D body, the probe on it, and the plane through the body
//   screen.js        the machine screen and its overlays
//   console.js       the keys, knobs and faders
//   sim.js           the ultrasound physics, on the GPU
//   exam-panel.js    the case, the windows to find, the saved images and the result

import { h } from '../core/dom.js';
import { disclaimer } from '../core/shell.js';
import { bindKeys } from '../core/keys.js';
import { Sim, CAL } from './sim.js';
import { PatientView, VIEWS } from './patient-view.js';
import { createScreen, layout } from './screen.js';
import { createConsole } from './console.js';
import { createProbePanel } from './probe-panel.js';
import { createExamPanel } from './exam-panel.js';
import { buildPatient, DEFAULTS, restOf } from './patient.js';
import { resolve, bodyNormal, add3, scale3, sub3, dot3, cross3, norm3 } from './anatomy.js';
import { TISSUE_INDEX } from './tissues.js';
import { PROBES } from './probes.js';
import { poseFrame, pickSkin, compliance, DEFAULT_POSE, LIMITS } from './geometry.js';
import { presetState, reduce, simConfig, readouts, mirrored, autoTgc, MAPS, gainDb, RANGES } from './machine.js';
import { animate, lungSlide } from './motion.js';
import { Cine } from './cine.js';
import { SCENARIOS, scenarioById, paramsOf, lungOf } from './scenarios.js';
import { WINDOWS, EXAMS, windowById } from './windows.js';
import { visibleStructures } from './visibility.js';
import { evaluateView, recognise, scoreExam, answerScore } from './exam.js';
import { STRUCTURES, structureMap } from './patient.js';
import { fitView, screenToProbe } from './view.js';
import { TOOLS } from './measure.js';

const q = new URLSearchParams(location.search);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function fail(message) {
  window.__error = message;
  window.__ready = true;
  document.body.replaceChildren(h('main', { class: 'problems-page' }, h('section', { class: 'problems' }, h('h1', {}, 'The simulator cannot start'), h('p', {}, message),
    h('p', { class: 'muted' }, 'It needs a recent browser with WebGL 2 and floating point textures: Chrome, Edge, Firefox or Safari 15 and later on a computer or a recent phone.')), disclaimer()));
}

async function boot() {
  document.title = 'POCUS simulator · Radiology teaching';
  // ---------- layout ----------
  const screenBox = h('div', { class: 'machine-screen' });
  const patientCanvas = h('canvas', { class: 'patient-canvas', width: 640, height: 400, 'aria-label': 'The patient and the probe' });
  const patientLabels = h('div', { class: 'patient-labels', 'aria-hidden': 'true' });
  const patientBox = h('div', { class: 'patient-box' }, patientCanvas, patientLabels);

  let sim;
  let pv;
  let acc = 0;
  // The screen comes first because the simulator draws on its canvas. Its callbacks only run later, once everything below exists.
  const screen = createScreen({
    onPoint: uv => {
      state.pending.push(uv);
      const need = TOOLS[state.tool].clicks;
      if (state.pending.length >= need) {
        state.measures.push({ kind: state.tool, points: state.pending.splice(0, need) });
        state.hover = null;
      }
      dirty.screen = true;
    },
    onMLine: (frac, flipped) => { dispatch({ type: 'mline', value: flipped ? 1 - frac : frac }); },
    onPan: d => { state.centre = [(state.centre?.[0] ?? centreOfFan()[0]) + d[0], (state.centre?.[1] ?? centreOfFan()[1]) + d[1]]; dirty.screen = true; dirty.still = true; },
    onZoom: (delta, uv) => {
      const z = clamp(state.machine.zoom + delta, ...RANGES.zoom);
      if (z <= 1.001) state.centre = null;
      else if (uv && state.machine.zoom <= 1.001) state.centre = uv;
      dispatch({ type: 'zoom', value: z });
    },
    onScrub: v => { state.cineOffset = state.cine.length - 1 - v; dirty.still = true; dirty.screen = true; },
  });
  screenBox.append(screen.el);
  try {
    sim = new Sim(screen.canvas, {});
  } catch (e) {
    fail(String(e.message ?? e));
    return;
  }

  // ---------- state ----------
  const builder = buildPatient();
  const state = {
    machine: presetState('fast'),
    pose: { ...DEFAULT_POSE, p: [...DEFAULT_POSE.p] },
    scenario: scenarioById(q.get('case') ?? 'normal') ?? scenarioById('normal'),
    mode: q.get('mode') === 'exam' ? 'exam' : 'learn',
    examId: q.get('exam') ?? 'free',
    time: 0,
    tool: null,
    pending: [],
    hover: null,
    measures: [],
    cine: new Cine(sim.cineFrames),
    cineOffset: 0,
    centre: null,
    labels: q.get('labels') === '1',
    cut: true,
    bodyMarker: true,
    results: {},
    saves: [],
    pendingReview: null,
    startedAt: null,
    finished: null,
    inView: [],
    anim: null,
    banner: null,
    note: null,
    lastView: null,
    mscroll: 0,
  };
  state.P = paramsOf(state.scenario, DEFAULTS);
  state.res = null;
  const dirty = { screen: true, patient: true, console: true, panel: true, still: true };

  // ---------- pieces ----------


  const probePanel = createProbePanel({
    onChange: patch => { setPose(patch); },
    onSlide: dir => slide(dir),
    onReset: () => { state.anim = null; setPose({ ...DEFAULT_POSE, p: [...DEFAULT_POSE.p] }); },
  });

  const cons = createConsole({
    dispatch: a => dispatch(a),
    command: (name, payload) => command(name, payload),
  });

  const panel = createExamPanel({
    onCase: id => setCase(id),
    onExam: id => setExam(id),
    onMode: m => setMode(m),
    onGoto: id => gotoWindow(id),
    onAnswer: a => answer(a),
    onFinish: () => finishExam(),
    onRestart: () => restartExam(),
    onToggle: (id, on) => {
      if (id === 't-labels') state.labels = on;
      if (id === 't-cut' && pv) { state.cut = on; pv.cut = on; pv.dirty = true; }
      if (id === 't-body') state.bodyMarker = on;
      dirty.screen = true; dirty.still = true; dirty.patient = true;
    },
  });

  const camButtons = h('div', { class: 'cam-buttons', role: 'group', 'aria-label': 'Camera' },
    ...[['overview', 'Overview'], ['side', 'Side'], ['top', 'Above'], ['closeChest', 'Chest'], ['closeAbdomen', 'Abdomen']].map(([id, label]) => h('button', { type: 'button', class: 'cam', onclick: () => { pv.setCamera(VIEWS[id]); updateLabels(); } }, label)));
  const moveToggle = h('button', { type: 'button', class: 'cam', 'aria-pressed': 'false', title: 'On a touch screen, switch between moving the probe and turning the view', onclick: () => { orbitMode = !orbitMode; moveToggle.setAttribute('aria-pressed', String(orbitMode)); moveToggle.textContent = orbitMode ? 'Turning view' : 'Moving probe'; } }, 'Moving probe');
  let orbitMode = false;

  const topbar = h('header', { class: 'topbar' },
    h('a', { class: 'back', href: '../index.html' }, '← Radiology'),
    h('h1', {}, 'POCUS simulator'),
    h('div', { class: 'top-actions' }, h('button', { type: 'button', id: 'keys-btn', onclick: () => keysDialog.showModal?.() }, 'Keys')));

  const keysDialog = h('dialog', { class: 'keys-dialog', 'aria-label': 'Keyboard shortcuts' },
    h('h2', {}, 'Keyboard'),
    h('dl', { class: 'keys-list' },
      ...[['Arrow keys', 'Slide the probe along the skin'], ['Q  E', 'Rotate the probe'], ['A  D', 'Fan the plane'], ['W  X', 'Rock the beam'], ['R  F', 'Press harder or lighter'],
        ['Space', 'Freeze or run'], ['S', 'Save the image'], ['+  −', 'Depth'], ['G  Shift G', 'Gain up or down'], ['M', 'Measure a distance'], ['C', 'Clear measurements'], ['L', 'Name the structures (Learn mode)'], ['H', 'This list']]
        .flatMap(([k, d]) => [h('dt', {}, k), h('dd', {}, d)])),
    h('form', { method: 'dialog' }, h('button', { class: 'primary' }, 'Close')));

  const patientCol = h('section', { class: 'col patient-col', 'aria-label': 'Patient and probe' },
    h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Patient'), h('div', { class: 'card-tools' }, camButtons, moveToggle)), patientBox,
      h('p', { class: 'hint' }, 'Drag on the body to move the probe. Drag the background, or hold Shift, to turn the view. Scroll to zoom.')),
    h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Probe')), probePanel.el));
  const machineCol = h('section', { class: 'col machine-col', 'aria-label': 'Ultrasound machine' },
    h('div', { class: 'card machine' }, screenBox, cons.el));
  const examCol = h('aside', { class: 'col exam-col', 'aria-label': 'Exam' }, panel.el);

  document.body.replaceChildren(topbar, h('main', { class: 'workspace' }, patientCol, machineCol, examCol),
    h('footer', { class: 'foot' }, disclaimer(), h('p', { class: 'disclaimer' }, 'A simulation built from a computer model of an adult, not from any patient’s scan. Educational use only.')), keysDialog);

  try {
    pv = new PatientView(patientCanvas);
  } catch (e) {
    fail(String(e.message ?? e));
    return;
  }

  // ---------- helpers ----------
  const centreOfFan = () => { const p = PROBES[state.machine.probe]; return [0, p.type === 'linear' ? state.machine.depth / 2 : state.machine.depth / 2]; };
  const probe = () => PROBES[state.machine.probe];
  const frame = () => poseFrame(state.pose, state.P.habitus);
  const gapMax = () => compliance(state.pose.p[2]);
  const hr = () => state.scenario.vitals.hr;

  function setPose(patch) {
    const next = { ...state.pose, ...patch };
    next.fan = clamp(next.fan, -LIMITS.fan, LIMITS.fan);
    next.rock = clamp(next.rock, -LIMITS.rock, LIMITS.rock);
    next.press = clamp(next.press, 0, LIMITS.press);
    next.phi = ((next.phi + 540) % 360) - 180;
    state.pose = next;
    dirty.patient = true; dirty.screen = true; dirty.panel = true;
    if (state.machine.frozen) return;
    sceneChanged();
  }

  // The scene under the probe changed: a still image would be stale, so make sure the next frame is drawn.
  function sceneChanged() { acc = 1; }

  function slide(dir) {
    const nu = bodyNormal(state.pose.p, state.P.habitus);
    const head = norm3(sub3([0, 0, 1], scale3(nu, nu[2])));
    let side = cross3([0, 0, 1], nu);
    if (Math.hypot(...side) < 1e-3) side = [1, 0, 0];
    side = norm3(side);
    const v = { head, feet: scale3(head, -1), left: scale3(side, 1), right: scale3(side, -1) }[dir];
    if (!v) return;
    const step = 9;
    const cand = add3(state.pose.p, scale3(v, step));
    const hit = pickSkin(add3(cand, scale3(nu, 60)), scale3(nu, -1), state.P.habitus, 200);
    if (hit && hit.p[1] < 113) setPose({ p: hit.p });
  }

  function dispatch(action) {
    if (action.type === 'mline') {
      state.machine = reduce(state.machine, action);
    } else if (action.type === 'zoom') {
      state.machine = reduce(state.machine, action);
    } else {
      const before = state.machine;
      state.machine = reduce(state.machine, action);
      if (action.type === 'preset' || action.type === 'probe') afterProbeChange(before);
      if (action.type === 'freeze') onFreeze();
    }
    dirty.screen = true; dirty.console = true; dirty.patient = true;
    if (state.machine.frozen) {
      if (action.type !== 'freeze') { sim.reprocess(simConfig(state.machine)); dirty.still = true; }
    } else {
      sceneChanged();
    }
  }

  function afterProbeChange() {
    state.centre = null;
    dirty.patient = true;
  }

  function onFreeze() {
    state.cineOffset = 0;
    if (!state.machine.frozen) { state.cine.reset(); sim.resetCine(); }
    dirty.still = true; dirty.screen = true;
  }

  function command(name, payload) {
    switch (name) {
      case 'save': save(); break;
      case 'map-next': dispatch({ type: 'map', value: state.machine.map + 1 }); break;
      case 'tool':
        state.tool = payload; state.pending = []; state.hover = null; dirty.screen = true; dirty.console = true; break;
      case 'clear-measures': state.measures = []; state.pending = []; dirty.screen = true; break;
      case 'zoom': {
        const z = clamp(state.machine.zoom + payload, ...RANGES.zoom);
        if (z <= 1.001) state.centre = null;
        dispatch({ type: 'zoom', value: z });
        break;
      }
      case 'auto-tgc': {
        // grey level back to dB on the machine's own scale, then flatten the bands to the second one
        const { profile } = sim.grayProfile(8);
        const DR = state.machine.dr;
        const db = profile.map(v => (Number.isFinite(v) ? CAL.whiteDb - DR + v * DR : NaN));
        dispatch({ type: 'tgc-set', values: autoTgc(db) });
        break;
      }
      default: break;
    }
  }

  // ---------- cases and exams ----------
  function setCase(id, keepResults = false) {
    state.scenario = scenarioById(id);
    state.P = paramsOf(state.scenario, DEFAULTS);
    if (!keepResults) { state.results = {}; state.saves = []; state.pendingReview = null; state.finished = null; }
    dirty.panel = true; dirty.patient = true;
    sceneChanged();
  }

  function setExam(id) {
    state.examId = id;
    state.results = {}; state.saves = []; state.pendingReview = null; state.finished = null;
    dirty.panel = true;
  }

  function setMode(mode) {
    state.mode = mode;
    panel.setMode(mode);
    if (mode === 'exam') {
      if (state.examId === 'free') { state.examId = 'efast'; panel.setExam('efast'); }
      restartExam(true);
      state.labels = false;
      panel.toggles.cLabels.checked = false;
    } else {
      state.startedAt = null;
      state.finished = null;
    }
    dirty.panel = true; dirty.screen = true; dirty.still = true;
  }

  function restartExam(keepCase = false) {
    if (state.mode === 'exam' && !keepCase) {
      const others = SCENARIOS.filter(s => s.id !== state.scenario.id);
      setCase(others[Math.floor(Math.random() * others.length)].id);
    }
    state.results = {}; state.saves = []; state.pendingReview = null; state.finished = null;
    state.startedAt = performance.now();
    dirty.panel = true;
  }

  function finishExam() {
    if (state.mode !== 'exam' || state.finished) return;
    state.finished = scoreExam(state.examId, state.results, state.P, lungOf(state.scenario));
    dirty.panel = true;
  }

  function currentView() {
    return visibleStructures(state.res, probe(), frame(), state.machine.depth, { lines: 36, step: 3, gapMax: gapMax() });
  }

  function thumbnail() {
    const c = document.createElement('canvas');
    const w = 240;
    const b = layout(screen.size.w, screen.size.h, state.machine.mode).b;
    const dpr = screen.size.dpr;
    c.width = w;
    c.height = Math.round((w * b.h) / b.w);
    c.getContext('2d').drawImage(sim.canvas, b.x * dpr, b.y * dpr, b.w * dpr, b.h * dpr, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  }

  function save() {
    if (!state.res || !state.cine.length) return;
    const view = currentView();
    const gray = sim.grayProfile(8).mean;
    const ids = state.examId === 'free' ? WINDOWS.map(w => w.id) : EXAMS[state.examId].windows;
    const rec = recognise(view, ids, state.machine.depth);
    const url = thumbnail();
    if (!rec) {
      state.pendingReview = { window: null, quality: 0, missing: [], answer: null };
      state.saves.push({ name: 'Image', url, answer: null });
      state.banner = null;
      dirty.panel = true;
      return;
    }
    const ev = evaluateView(view, rec.spec, { depth: state.machine.depth, grayMean: gray });
    const prev = state.results[rec.id];
    const keep = !prev || ev.quality >= prev.quality;
    if (keep) state.results[rec.id] = { quality: ev.quality, answer: prev?.answer ?? null, url };
    state.saves.push({ name: rec.spec.short, url, answer: null });
    state.pendingReview = { window: rec.spec, quality: ev.quality, missing: ev.missing, answer: state.results[rec.id].answer, feedback: null };
    dirty.panel = true;
  }

  function answer(a) {
    const rev = state.pendingReview;
    if (!rev?.window) return;
    const r = state.results[rev.window.id];
    if (r) r.answer = a;
    rev.answer = a;
    const truth = rev.window.truth(state.P, lungOf(state.scenario));
    if (state.mode === 'learn') {
      const ok = answerScore(a, truth) === 1;
      rev.feedback = { ok, text: ok ? `Correct. ${truth ? 'The finding is present in this case.' : 'There is nothing abnormal in this view.'}` : (a === 'unsure' ? 'Not sure is a fair answer, but look again.' : `Not quite. In this case the answer is ${truth ? 'yes' : 'no'}.`) };
    }
    const last = state.saves.at(-1);
    if (last) last.answer = { yes: 'Yes', no: 'No', unsure: 'Not sure' }[a];
    dirty.panel = true;
  }

  function gotoWindow(id) {
    const w = windowById(id);
    if (!w?.pose) return;
    state.machine = presetState(w.preset, state.machine);
    state.machine = reduce(state.machine, { type: 'probe', id: w.probe });
    state.machine = reduce({ ...state.machine, depth: w.depth }, { type: 'focus', value: Math.round(w.depth * 0.45) });
    state.machine.depth = w.depth;
    state.machine.frozen = false;
    state.centre = null;
    state.anim = { from: { ...state.pose, p: [...state.pose.p] }, to: { ...w.pose, p: [...w.pose.p] }, t: 0, dur: 0.9 };
    state.currentWindow = id;
    dirty.console = true; dirty.screen = true; dirty.panel = true;
  }

  // ---------- patient view interaction ----------
  let drag = null;
  patientCanvas.addEventListener('pointerdown', e => {
    patientCanvas.setPointerCapture(e.pointerId);
    const hit = !orbitMode && !e.shiftKey && e.button === 0 ? pv.pickSkin(e.clientX, e.clientY, state.P.habitus) : null;
    if (hit) { drag = { kind: 'probe' }; state.anim = null; setPose({ p: hit }); } else drag = { kind: 'orbit', x: e.clientX, y: e.clientY };
  });
  patientCanvas.addEventListener('pointermove', e => {
    if (!drag) return;
    if (drag.kind === 'probe') {
      const hit = pv.pickSkin(e.clientX, e.clientY, state.P.habitus);
      if (hit) setPose({ p: hit });
    } else {
      pv.setCamera({ yaw: pv.cam.yaw - (e.clientX - drag.x) * 0.4, pitch: pv.cam.pitch + (e.clientY - drag.y) * 0.4 });
      drag.x = e.clientX; drag.y = e.clientY;
      updateLabels();
    }
  });
  const endDrag = () => { drag = null; };
  patientCanvas.addEventListener('pointerup', endDrag);
  patientCanvas.addEventListener('pointercancel', endDrag);
  patientCanvas.addEventListener('wheel', e => { e.preventDefault(); pv.setCamera({ dist: pv.cam.dist * (e.deltaY > 0 ? 1.08 : 0.92) }); updateLabels(); }, { passive: false });

  function updateLabels() {
    const mk = (text, p) => { const s = pv.project(p); return s ? h('span', { class: 'plabel', style: `left:${s[0].toFixed(0)}px;top:${s[1].toFixed(0)}px` }, text) : null; };
    patientLabels.replaceChildren(...[mk('Head', [0, 0, 470]), mk('Feet', [0, 0, -700]), mk('Right', [-190, -20, -120]), mk('Left', [190, -20, -120])].filter(Boolean));
  }

  // ---------- keys ----------
  const nudge = (patch) => setPose(Object.fromEntries(Object.entries(patch).map(([k, d]) => [k, state.pose[k] + d])));
  bindKeys({
    arrowup: () => slide('head'), arrowdown: () => slide('feet'), arrowleft: () => slide('right'), arrowright: () => slide('left'),
    q: () => nudge({ phi: -5 }), e: () => nudge({ phi: 5 }), a: () => nudge({ fan: -3 }), d: () => nudge({ fan: 3 }), w: () => nudge({ rock: -3 }), x: () => nudge({ rock: 3 }),
    r: () => nudge({ press: 3 }), f: () => nudge({ press: -3 }),
    ' ': () => dispatch({ type: 'freeze' }), s: () => save(), '+': () => dispatch({ type: 'depth', step: 1 }), '=': () => dispatch({ type: 'depth', step: 1 }), '-': () => dispatch({ type: 'depth', step: -1 }),
    g: e => dispatch({ type: 'gain', value: state.machine.gain + (e.shiftKey ? -4 : 4) }),
    m: () => command('tool', state.tool ? null : 'distance'), c: () => command('clear-measures'),
    l: () => { if (state.mode === 'learn') { state.labels = !state.labels; panel.toggles.cLabels.checked = state.labels; dirty.screen = true; dirty.still = true; } },
    h: () => keysDialog.showModal?.(),
  }, { skips: (key, target) => key.startsWith('arrow') && target.matches('input[type="range"], [role="slider"], select') });

  // ---------- sizing ----------
  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sw = Math.max(320, Math.floor(screenBox.clientWidth || 640));
    const sh = Math.round(clamp(sw * 0.78, 300, 760));
    screen.resize(sw, sh, dpr);
    const pw = Math.max(280, Math.floor(patientBox.clientWidth || 480));
    pv.resize(pw, Math.round(pw * 0.72), dpr);
    dirty.screen = true; dirty.still = true; dirty.patient = true;
    updateLabels();
  }
  new ResizeObserver(fit).observe(screenBox);
  new ResizeObserver(fit).observe(patientBox);

  // ---------- the clock ----------
  // ?still=N renders N frames at a fixed time step and then stops, so a test browser can photograph a settled page.
  const stillN = Number(q.get('still') ?? 0);
  let simFrames = 0;
  let stopping = false;
  window.__still = stillN || undefined;
  let last = performance.now();
  let sinceStats = 0;
  let sincePanel = 0;
  const lastSimTimeRef = { v: 0 };

  function simFrame(dtSim) {
    const m = state.machine;
    const P = animate(state.P, state.time, { hr: hr(), rr: state.scenario.vitals.rr });
    state.live = P;
    state.res = resolve(builder, TISSUE_INDEX, P, restOf(P));
    sim.setAnatomy(state.res);
    const lung = lungOf(state.scenario);
    const cfg = {
      ...simConfig(m),
      frame: frame(),
      gapMax: gapMax(),
      slide: lungSlide(P.breath, 1),
      blines: lung.blines,
      lungHaze: 1,
      time: state.time,
    };
    sim.frame(cfg);
    state.cine.push({ time: state.time, pose: { ...state.pose }, depth: m.depth });
    if (m.mode !== 'B') {
      if (!sim.mTex) sim.initMMode(640);
      sim.pushMMode(m.mline, dtSim, m.msweep);
    }
    state.lastCfg = cfg;
    lastSimTimeRef.v = state.time;
  }

  function draw() {
    const m = state.machine;
    const dpr = screen.size.dpr;
    const lay = layout(screen.size.w, screen.size.h, m.mode);
    const layer = m.frozen ? (state.cine.frameAt(state.cineOffset)?.layer ?? sim.layer) : sim.layer;
    const info = screen.viewFor({ machine: m, centre: state.centre }, probe());
    sim.clear();
    const rect = { x: Math.round(lay.b.x * dpr), y: Math.round(lay.b.y * dpr), w: Math.round(lay.b.w * dpr), h: Math.round(lay.b.h * dpr) };
    sim.display({
      ...(state.lastCfg ?? simConfig(m)), depth: m.depth,
      view: { u0: info.view.u0, v0: info.view.v0, mmPerPx: info.view.mmPerPx / dpr },
      flipX: mirrored(m), flipY: m.flipY, tint: m.tint === 'gray' ? [1, 1, 1] : m.tint === 'sepia' ? [1, 0.9, 0.72] : [0.8, 0.9, 1], invert: m.invert,
      labelMix: state.labels && state.mode === 'learn' ? 0.5 : 0,
    }, layer, rect);
    if (lay.m) {
      sim.displayMMode({ x: Math.round(lay.m.x * dpr), y: Math.round(lay.m.y * dpr), w: Math.round(lay.m.w * dpr), h: Math.round(lay.m.h * dpr) }, { tint: m.tint === 'sepia' ? [1, 0.9, 0.72] : m.tint === 'blue' ? [0.8, 0.9, 1] : [1, 1, 1], invert: m.invert, scroll: state.mscroll });
    }
  }

  function overlayModel() {
    const m = state.machine;
    const cine = { length: state.cine.length, offset: state.cineOffset, seconds: state.cine.duration() };
    return {
      machine: m, readouts: readouts(m), flipScreen: { x: mirrored(m), y: m.flipY }, centre: state.centre,
      tool: state.tool, pending: state.pending, hover: state.hover, measures: state.measures, cine,
      patientLine: `Simulated adult  ·  ${new Date().toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}`,
      examName: state.mode === 'learn' ? `${EXAMS[state.examId]?.name ?? 'Free scan'} · ${state.scenario.title}` : `${EXAMS[state.examId]?.name ?? 'Free scan'}`,
      banner: m.frozen ? 'FROZEN' : null, note: state.note, pose: state.bodyMarker ? state.pose : null,
    };
  }

  function refreshPanel() {
    const learn = state.mode === 'learn';
    panel.setMode(state.mode);
    panel.renderCase(state.scenario, state.mode === 'exam', !!state.finished);
    panel.renderWindows({ examId: state.examId, mode: state.mode, results: state.results, current: state.currentWindow });
    panel.renderReview(state.pendingReview);
    panel.renderGallery(state.saves);
    panel.renderReport(state.finished, state.scenario);
    panel.renderInView(state.inView, state.currentWindow, learn);
    probePanel.update(state.pose, `Depth ${state.machine.depth / 10} cm.`);
  }

  function frameLoop(now) {
    const dt = stillN ? 1 / 30 : Math.min(0.1, (now - last) / 1000);
    last = now;
    if (state.anim) {
      const a = state.anim;
      a.t += dt / a.dur;
      const k = Math.min(1, a.t);
      const e = k * k * (3 - 2 * k);
      const mid = [0, 1, 2].map(i => a.from.p[i] + (a.to.p[i] - a.from.p[i]) * e);
      // keep the contact point on the skin while it travels
      const nu = bodyNormal(mid, state.P.habitus);
      const hit = pickSkin(add3(mid, scale3(nu, 80)), scale3(nu, -1), state.P.habitus, 200);
      let dphi = a.to.phi - a.from.phi;
      dphi = ((dphi + 540) % 360) - 180;
      state.pose = {
        p: hit && k < 1 ? hit.p : (k >= 1 ? a.to.p : mid),
        phi: a.from.phi + dphi * e, fan: a.from.fan + (a.to.fan - a.from.fan) * e, rock: a.from.rock + (a.to.rock - a.from.rock) * e, press: a.from.press + (a.to.press - a.from.press) * e,
      };
      dirty.patient = true; dirty.screen = true;
      if (k >= 1) { state.anim = null; dirty.panel = true; }
      sceneChanged();
    }
    const m = state.machine;
    if (!m.frozen) {
      state.time += dt;
      acc += dt;
      const interval = 1 / Math.min(30, readouts(m).fr);
      if (acc >= interval || !state.lastFrameAt) {
        const dtSim = acc;
        acc = 0;
        state.lastFrameAt = now;
        simFrame(dtSim);
        simFrames++;
        dirty.patient = true;
        dirty.still = true;
      }
    }
    if (dirty.still || dirty.screen) {
      if (state.cine.length) draw();
      dirty.still = false;
    }
    if (dirty.screen || (now % 1000 < 40 && !m.frozen)) {
      screen.update(overlayModel());
      dirty.screen = false;
    }
    if (dirty.console) { cons.update(state.machine, { tool: state.tool }); dirty.console = false; }
    // the patient view follows the pose and animates at a gentler rate
    sinceStats += dt;
    if (state.res) {
      if (dirty.patient && (sinceStats > 0.1 || pv.dirty || drag)) {
        pv.setAnatomy(state.res);
        pv.setProbe(frame(), probe(), state.machine.depth);
        pv.cut = state.cut;
        pv.lit = drag?.kind === 'probe' ? 1 : 0;
        if (pv.render()) { updateLabels(); }
        dirty.patient = false;
        sinceStats = 0;
      }
    }
    sincePanel += dt;
    if (sincePanel > 0.35 && state.res) {
      sincePanel = 0;
      if (state.mode === 'learn') {
        const view = currentView();
        const spec = state.currentWindow ? windowById(state.currentWindow) : null;
        const need = new Set(spec ? Object.keys(spec.need) : []);
        const hidden = new Set(['muscle-psoas']);
        state.inView = [...view.areas].filter(([, a]) => a > 12).map(([id, a]) => ({ id, a, need: need.has(id) })).filter(x => !hidden.has(x.id)).sort((a, b) => b.a - a.a).slice(0, 14);
      }
      if (state.mode === 'exam' && state.startedAt && !state.finished) panel.renderTimer((performance.now() - state.startedAt) / 1000, true);
      else panel.renderTimer(0, false);
      if (state.mode === 'learn') panel.renderInView(state.inView, state.currentWindow, true);
    }
    if (dirty.panel) { refreshPanel(); dirty.panel = false; }
    if (stillN && simFrames >= stillN) {
      if (stopping) { window.__idle = true; return; }
      stopping = true;
      dirty.screen = true; dirty.console = true; dirty.panel = true; dirty.patient = true; dirty.still = true; sinceStats = 1; sincePanel = 1;
    }
    requestAnimationFrame(frameLoop);
  }

  // first state
  panel.setMode(state.mode);
  panel.setExam(state.examId);
  panel.toggles.cLabels.checked = state.labels;
  cons.update(state.machine, { tool: state.tool });
  fit();
  pv.setCamera(VIEWS.overview);
  if (q.get('window')) {
    const w = windowById(q.get('window'));
    if (w?.pose) {
      state.machine = presetState(w.preset, state.machine);
      state.machine = reduce(state.machine, { type: 'probe', id: w.probe });
      state.machine.depth = w.depth;
      state.machine.focus = Math.round(w.depth * 0.45);
      state.pose = { ...w.pose, p: [...w.pose.p] };
      state.currentWindow = w.id;
    }
  }
  refreshPanel();
  requestAnimationFrame(frameLoop);
  window.__pocus = { state, sim, pv, dispatch, command, save, gotoWindow, setCase, setPose, setMode, setExam, answer, finishExam, fit, dirty };
  window.__ready = true;
}

boot().catch(e => { fail(String(e?.stack ?? e)); window.__error = String(e); window.__ready = true; });
