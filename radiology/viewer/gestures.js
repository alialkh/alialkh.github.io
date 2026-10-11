// Pointer, wheel and touch on one pane, turned into the handler calls below. Coordinates are pixels inside el.
// handlers: tool() 'window' or 'ruler', scroll(steps), window(dx, dy), zoom(factor, point), pan(dx, dy),
// click(point), measure(phase, point), hover(point or null), reset(), size() height of el.
import { wheelSteps, accumulate, pxPerSlice } from './input.js';
import { pinch } from './view.js';

const CLICK_SLOP = 5;

export function attachGestures(el, handlers, count) {
  const pointers = new Map();
  let mode = null;
  let moved = 0;
  let carry = 0;
  let wheelCarry = 0;
  let start = null;
  const at = e => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const touches = () => [...pointers.values()].filter(p => p.touch);

  el.addEventListener('pointerdown', e => {
    el.setPointerCapture?.(e.pointerId);
    const p = { ...at(e), touch: e.pointerType === 'touch' };
    pointers.set(e.pointerId, p);
    if (p.touch) {
      mode = touches().length > 1 ? 'pinch' : 'scroll';
    } else if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      mode = 'pan';
    } else if (e.button === 2) {
      mode = 'zoom';
    } else if (e.button === 0) {
      mode = handlers.tool() === 'ruler' ? 'measure' : 'window';
    } else {
      return;
    }
    e.preventDefault();
    start = { x: p.x, y: p.y };
    moved = 0;
    carry = 0;
    if (mode === 'measure') handlers.measure('start', p);
  });

  el.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    const now = at(e);
    if (e.pointerType !== 'touch') handlers.hover(now);
    if (!p) return;
    const dx = now.x - p.x;
    const dy = now.y - p.y;
    const before = touches().map(t => ({ x: t.x, y: t.y }));
    Object.assign(p, now);
    moved += Math.abs(dx) + Math.abs(dy);
    if (mode === 'window') handlers.window(dx, dy);
    else if (mode === 'pan') handlers.pan(dx, dy);
    else if (mode === 'zoom') handlers.zoom(Math.exp(-dy * 0.01), start);
    else if (mode === 'measure') handlers.measure('move', now);
    else if (mode === 'scroll') {
      const r = accumulate(carry, dy, pxPerSlice(handlers.size(), count()));
      carry = r.carry;
      if (r.steps) handlers.scroll(r.steps);
    } else if (mode === 'pinch' && before.length === 2) {
      const r = pinch(before, touches());
      handlers.zoom(r.factor, r.anchor);
      handlers.pan(r.dx, r.dy);
    }
  });

  const end = e => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    if (mode === 'measure') handlers.measure('end', p);
    else if (e.type === 'pointerup' && moved < CLICK_SLOP && (mode === 'window' || mode === 'scroll')) handlers.click(p);
    // A finger left over after a pinch would jump, so it only scrolls again once the next touch starts.
    mode = pointers.size ? 'ignore' : null;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('pointerleave', e => e.pointerType !== 'touch' && handlers.hover(null));
  el.addEventListener('dblclick', e => {
    e.preventDefault();
    handlers.reset();
  });
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey) {
      handlers.zoom(Math.exp(-e.deltaY * 0.01), at(e));
      return;
    }
    const r = wheelSteps(wheelCarry, e.deltaY, e.deltaMode);
    wheelCarry = r.carry;
    if (r.steps) handlers.scroll(r.steps);
  }, { passive: false });
}
