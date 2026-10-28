// The machine's screen: a canvas the simulator draws on, with the clinical overlays on top of it as SVG and text.
// It owns the layout (where the B-mode image and the M-mode strip go), the depth scale, the markers, the calipers and the pointer
// handling for them. It draws no ultrasound itself.

import { h } from '../core/dom.js';
import { fitView, screenToProbe, probeToScreen, depthTicks, focusMarkers } from './view.js';
import { distance, ellipse, label as measureLabel, TOOLS } from './measure.js';
import { PROBES } from './probes.js';

const NS = 'http://www.w3.org/2000/svg';
const HEADER = 46;
const M_LEFT = 54;
const M_RIGHT = 62;

const s = (tag, attrs = {}, text) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
};

// Split the canvas into the B-mode rectangle and the M-mode strip, in CSS pixels.
export function layout(W, H, mode) {
  const top = HEADER;
  const body = H - top;
  if (mode === 'B') return { b: { x: 0, y: top, w: W, h: body }, m: null };
  const bh = Math.round(body * (mode === 'BM' ? 0.58 : 0.36));
  return {
    b: { x: 0, y: top, w: W, h: bh },
    m: { x: M_LEFT, y: top + bh + 6, w: W - M_LEFT - M_RIGHT, h: body - bh - 26 },
  };
}

export function createScreen({ onPoint, onMLine, onPan, onZoom, onScrub }) {
  const canvas = h('canvas', { class: 'us-canvas', width: 800, height: 640, 'aria-label': 'Ultrasound image' });
  const overlay = document.createElementNS(NS, 'svg');
  overlay.setAttribute('class', 'us-overlay');
  const header = h('div', { class: 'us-header' });
  const hl = h('div', { class: 'hdr-left' });
  const hc = h('div', { class: 'hdr-centre' });
  const hr = h('div', { class: 'hdr-right' });
  header.append(hl, hc, hr);
  const scrub = h('input', { type: 'range', class: 'us-scrub', min: 0, max: 100, value: 0, 'aria-label': 'Cine loop', hidden: true });
  const banner = h('div', { class: 'us-banner', hidden: true, role: 'status' });
  const note = h('div', { class: 'us-note', hidden: true });
  const body = h('div', { class: 'us-bodymarker', 'aria-hidden': 'true' });
  const el = h('div', { class: 'screen' }, canvas, overlay, header, scrub, banner, note, body);

  let model = null;
  let size = { w: 800, h: 640, dpr: 1 };
  let lastBView = null;
  let pointer = null;

  const flipOf = m => ({ x: m.flipScreen.x, y: m.flipScreen.y });
  const bRect = () => layout(size.w, size.h, model?.machine.mode ?? 'B').b;

  // pointer position in the B-mode rectangle, to probe mm
  function toProbe(e) {
    const r = canvas.getBoundingClientRect();
    const rect = bRect();
    const x = e.clientX - r.left - rect.x;
    const y = e.clientY - r.top - rect.y;
    return { x, y, uv: screenToProbe(lastBView, rect.w, rect.h, flipOf(model), x, y), inside: x >= 0 && y >= 0 && x <= rect.w && y <= rect.h };
  }

  canvas.addEventListener('pointerdown', e => {
    if (!model || !lastBView) return;
    const p = toProbe(e);
    const mrect = layout(size.w, size.h, model.machine.mode).m;
    if (model.tool) {
      if (p.inside) onPoint(p.uv);
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, kind: model.machine.mode !== 'B' && p.inside ? 'mline' : (model.machine.zoom > 1 ? 'pan' : null), mrect };
    if (pointer.kind === 'mline') onMLine(p.x / bRect().w, model.flipScreen.x);
  });
  canvas.addEventListener('pointermove', e => {
    if (!model || !lastBView) return;
    if (pointer?.kind === 'mline') {
      const p = toProbe(e);
      onMLine(Math.min(1, Math.max(0, p.x / bRect().w)), model.flipScreen.x);
    } else if (pointer?.kind === 'pan') {
      onPan([(e.clientX - pointer.x) * lastBView.mmPerPx * (model.flipScreen.x ? 1 : -1), (e.clientY - pointer.y) * lastBView.mmPerPx * (model.flipScreen.y ? 1 : -1)]);
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    } else if (model.tool && model.pending.length) {
      const p = toProbe(e);
      model.hover = p.inside ? p.uv : null;
      draw();
    }
  });
  const up = () => { pointer = null; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => {
    if (!model) return;
    e.preventDefault();
    const p = toProbe(e);
    onZoom(e.deltaY < 0 ? 0.15 : -0.15, p.inside ? p.uv : null);
  }, { passive: false });
  scrub.addEventListener('input', () => onScrub(Number(scrub.value)));

  function resize(w, hgt, dpr = 1) {
    size = { w, h: hgt, dpr };
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${hgt}px`;
    overlay.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
    overlay.setAttribute('width', w);
    overlay.setAttribute('height', hgt);
  }

  // the view the simulator should draw with, for the current model
  function viewFor(m, probe) {
    const rect = layout(size.w, size.h, m.machine.mode).b;
    return { rect, view: fitView(probe, m.machine.depth, rect.w, rect.h, { zoom: m.machine.zoom, centre: m.centre, margin: 0.045 }) };
  }

  function update(m) {
    model = m;
    const probe = PROBES[m.machine.probe];
    const { view } = viewFor(m, probe);
    lastBView = view;
    const r = m.readouts;
    hl.replaceChildren(
      h('div', { class: 'hdr-brand' }, 'SonoSim', h('small', {}, ' POCUS')),
      h('div', { class: 'hdr-sub' }, m.patientLine),
    );
    hc.replaceChildren(
      h('div', { class: 'hdr-exam' }, m.examName),
      h('div', { class: 'hdr-sub' }, `${r.probe}  ${r.freq}${m.machine.zoom > 1 ? `   ×${m.machine.zoom.toFixed(1)}` : ''}`),
    );
    hr.replaceChildren(
      h('div', {}, `MI ${r.mi}  TIS ${r.tis}`),
      h('div', { class: 'hdr-sub' }, `${r.fr} Hz  ·  D ${r.depthCm} cm  ·  G ${r.gain}  ·  DR ${r.dr}  ·  ${r.map}`),
    );
    scrub.hidden = !(m.machine.frozen && m.cine.length > 1);
    if (!scrub.hidden) {
      scrub.max = m.cine.length - 1;
      scrub.value = m.cine.length - 1 - m.cine.offset;
      scrub.setAttribute('aria-valuetext', `${(m.cine.seconds).toFixed(1)} seconds of loop`);
    }
    banner.hidden = !m.banner;
    banner.textContent = m.banner ?? '';
    note.hidden = !m.note;
    note.textContent = m.note ?? '';
    drawBodyMarker(m);
    draw();
    return { view, rect: bRect() };
  }

  function drawBodyMarker(m) {
    body.hidden = !m.pose;
    if (!m.pose) return;
    // A little torso. x is across the body, y runs head to foot. The probe is a bar rotated to the plane's direction.
    const px = 30 + (m.pose.p[0] / 190) * 24;
    const py = 56 - (m.pose.p[2] / 520) * 52 - 26;
    const ang = -m.pose.phi + (m.pose.p[1] > 0 ? 0 : 0);
    body.innerHTML = `<svg viewBox="0 0 60 100" width="60" height="100"><path d="M14 8c0-4 5-6 16-6s16 2 16 6l4 16c2 8-1 14-3 22l2 22c0 12-4 22-8 28H21c-4-6-8-16-8-28l2-22c-2-8-5-14-3-22z" fill="none" stroke="#8fa0b3" stroke-width="1.2"/><g transform="translate(${px.toFixed(1)} ${(py + 30).toFixed(1)}) rotate(${ang.toFixed(0)})"><rect x="-8" y="-1.6" width="16" height="3.2" rx="1.2" fill="#ffd866"/><circle cx="-8" cy="0" r="2.4" fill="#fff"/></g></svg>`;
  }

  // everything drawn over the canvas
  function draw() {
    overlay.replaceChildren();
    if (!model || !lastBView) return;
    const m = model;
    const probe = PROBES[m.machine.probe];
    const rect = bRect();
    const flip = flipOf(m);
    const g = s('g', { transform: `translate(${rect.x} ${rect.y})` });
    overlay.append(g);

    // depth scale, down the edge that is away from the marker
    const right = !m.flipScreen.x;
    const ticks = depthTicks(lastBView, rect.w, rect.h, flip, m.machine.depth, probe);
    const xs = right ? rect.w - 10 : 10;
    const sg = s('g', { class: 'scale' });
    for (const t of ticks) {
      if (t.y < 2 || t.y > rect.h - 2) continue;
      sg.append(s('line', { x1: xs, x2: xs + (right ? -(t.major ? 9 : 5) : (t.major ? 9 : 5)), y1: t.y, y2: t.y }));
      if (t.major || (t.label && m.machine.depth <= 200)) sg.append(s('text', { x: xs + (right ? -13 : 13), y: t.y + 3.5, 'text-anchor': right ? 'end' : 'start' }, String(t.cm)));
    }
    sg.append(s('text', { x: xs + (right ? -13 : 13), y: 14, 'text-anchor': right ? 'end' : 'start', class: 'unit' }, 'cm'));
    g.append(sg);

    // transmit focus markers, little triangles beside the scale
    for (const f of focusMarkers(lastBView, rect.w, rect.h, flip, m.machine.focus, m.machine.zones)) {
      if (f.y < 0 || f.y > rect.h) continue;
      const x = xs + (right ? -22 : 22);
      g.append(s('path', { class: 'focus', d: right ? `M${x} ${f.y - 5} L${x - 8} ${f.y} L${x} ${f.y + 5}Z` : `M${x} ${f.y - 5} L${x + 8} ${f.y} L${x} ${f.y + 5}Z` }));
    }

    // probe orientation marker, on the side the machine's convention puts it
    const mx = m.flipScreen.x ? rect.w - 22 : 22;
    g.append(s('circle', { cx: mx, cy: 18, r: 6, class: 'marker' }), s('circle', { cx: mx, cy: 18, r: 9.5, class: 'marker-ring' }));

    // grey bar
    const gx = m.flipScreen.x ? 8 : rect.w - 8 - 10;
    const gradId = 'greybar';
    const defs = s('defs');
    const grad = s('linearGradient', { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.append(s('stop', { offset: '0', 'stop-color': '#fff' }), s('stop', { offset: '1', 'stop-color': '#000' }));
    defs.append(grad);
    g.append(defs, s('rect', { x: gx, y: rect.h - 96, width: 8, height: 80, fill: `url(#${gradId})`, stroke: '#667', 'stroke-width': 0.6 }));

    // the M-mode line across the B-mode image
    if (m.machine.mode !== 'B') {
      const lx = (m.flipScreen.x ? 1 - m.machine.mline : m.machine.mline) * rect.w;
      g.append(s('line', { x1: lx, x2: lx, y1: 24, y2: rect.h - 4, class: 'mline' }));
    }

    // calipers
    const dot = ([u, v], cls = '') => {
      const [x, y] = probeToScreen(lastBView, rect.w, rect.h, flip, u, v);
      return { x, y, el: s('path', { d: `M${x - 5} ${y}h10M${x} ${y - 5}v10`, class: `cal-dot ${cls}` }) };
    };
    const drawMeasure = (item, pending = false) => {
      const pts = item.points.map(p => dot(p, pending ? 'pending' : ''));
      pts.forEach(p => g.append(p.el));
      if (item.kind === 'distance' && pts.length === 2) {
        g.append(s('line', { x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y, class: `cal-line${pending ? ' pending' : ''}` }));
        g.append(s('text', { x: (pts[0].x + pts[1].x) / 2 + 8, y: (pts[0].y + pts[1].y) / 2 - 6, class: 'cal-text' }, measureLabel(item)));
      } else if (item.kind === 'ellipse' && pts.length === 3) {
        const e = ellipse(...item.points);
        const [cx, cy] = probeToScreen(lastBView, rect.w, rect.h, flip, e.centre[0], e.centre[1]);
        const ang = (Math.atan2(item.points[1][1] - item.points[0][1], item.points[1][0] - item.points[0][0]) * 180) / Math.PI * ((flip.x ? -1 : 1) * (flip.y ? -1 : 1));
        g.append(s('ellipse', { cx, cy, rx: e.semiA / lastBView.mmPerPx, ry: e.semiB / lastBView.mmPerPx, transform: `rotate(${ang} ${cx} ${cy})`, class: 'cal-ellipse' }));
        g.append(s('text', { x: cx + 8, y: cy - 8, class: 'cal-text' }, measureLabel(item)));
      }
    };
    m.measures.forEach(item => drawMeasure(item));
    if (m.tool && m.pending.length) {
      const pend = { kind: m.tool, points: [...m.pending] };
      if (m.hover && pend.points.length < TOOLS[m.tool].clicks) pend.points.push(m.hover);
      drawMeasure(pend, true);
    }

    // M-mode strip axes
    const lay = layout(size.w, size.h, m.machine.mode);
    if (lay.m) {
      const mr = lay.m;
      const mg = s('g');
      mg.append(s('rect', { x: mr.x - 0.5, y: mr.y - 0.5, width: mr.w + 1, height: mr.h + 1, class: 'mframe' }));
      const pxPerMm = mr.h / m.machine.depth;
      for (let mm = 0; mm <= m.machine.depth; mm += 10) {
        const y = mr.y + mm * pxPerMm;
        const major = mm % 50 === 0;
        mg.append(s('line', { x1: mr.x - (major ? 8 : 4), x2: mr.x, y1: y, y2: y, class: 'scale-line' }));
        if (major || (mm % 20 === 0 && m.machine.depth <= 200)) mg.append(s('text', { x: mr.x - 11, y: y + 3.5, 'text-anchor': 'end', class: 'scale-text' }, String(mm / 10)));
      }
      const secs = m.machine.msweep;
      for (let t = 0; t <= secs; t += 1) {
        const x = mr.x + mr.w - (t / secs) * mr.w;
        mg.append(s('line', { x1: x, x2: x, y1: mr.y + mr.h, y2: mr.y + mr.h + 5, class: 'scale-line' }));
      }
      mg.append(s('text', { x: mr.x + mr.w + 6, y: mr.y + mr.h + 4, class: 'scale-text' }, `${secs} s`));
      overlay.append(mg);
    }
  }

  return { el, canvas, resize, update, draw, viewFor, layout: mode => layout(size.w, size.h, mode), get size() { return size; } };
}
