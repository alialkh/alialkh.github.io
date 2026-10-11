// Pointer drag for moving viewports and dropping a series on one. Pointer events, so touch works, and no HTML5 drag and drop.
import { h } from '../core/dom.js';

const SLOP = 5;

// e is the pointerdown. label is the text on the ghost that follows the pointer. targetAt(x, y) returns the element a drop would land on, or null.
// onDrop(target) runs on release over a target. onClick runs when the pointer never moved past the slop. Escape cancels.
export function beginDrag(e, { label, targetAt, onDrop, onClick }) {
  const id = e.pointerId;
  let ghost = null;
  let hot = null;
  const mark = el => {
    if (el === hot) return;
    hot?.classList.remove('drop-target');
    hot = el;
    hot?.classList.add('drop-target');
  };
  const move = ev => {
    if (ev.pointerId !== id) return;
    if (!ghost) {
      if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < SLOP) return;
      ghost = h('div', { class: 'drag-ghost', 'aria-hidden': 'true' }, label);
      document.body.append(ghost);
      document.body.classList.add('dragging');
    }
    ghost.style.transform = `translate(${ev.clientX + 14}px, ${ev.clientY + 14}px)`;
    mark(targetAt(ev.clientX, ev.clientY));
  };
  const finish = (ev, drop) => {
    if (ev.pointerId !== id) return;
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', cancel);
    removeEventListener('keydown', key);
    const target = hot;
    mark(null);
    ghost?.remove();
    document.body.classList.remove('dragging');
    if (!drop) return;
    if (ghost) target && onDrop(target);
    else onClick?.(ev);
  };
  const up = ev => finish(ev, true);
  const cancel = ev => finish(ev, false);
  const key = ev => ev.key === 'Escape' && finish({ pointerId: id }, false);
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', cancel);
  addEventListener('keydown', key);
}
