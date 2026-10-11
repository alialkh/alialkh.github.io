// The viewer's keyboard shortcuts. They act on the active viewport and work anywhere outside a text field.
import { bindKeys } from '../core/keys.js';

const BLOCKED_ON_FOCUS = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'home', 'end', 'pageup', 'pagedown'];

// d: scene, ui, move(step) for the next or previous case, setTesting(on), toggleFullscreen().
export function bindViewerKeys({ scene, ui, move, setTesting, toggleFullscreen }) {
  const flip = type => () => scene.dispatch({ type });
  const panel = name => () => scene.dispatch({ type: 'panel', name });
  const inList = e => e.target.closest?.('.sidebar');
  const KEYS = {
    arrowup: e => (e.shiftKey ? scene.pan(0, 40) : scene.step(-1)),
    arrowleft: e => (e.shiftKey ? scene.pan(40, 0) : scene.step(-1)),
    arrowdown: e => (e.shiftKey ? scene.pan(0, -40) : scene.step(1)),
    arrowright: e => (e.shiftKey ? scene.pan(-40, 0) : scene.step(1)),
    '+': () => scene.zoom(1.25),
    '=': () => scene.zoom(1.25),
    '-': () => scene.zoom(0.8),
    enter: () => scene.markAtCursor(),
    pageup: e => (inList(e) ? move(-1) : scene.step(-10)),
    pagedown: e => (inList(e) ? move(1) : scene.step(10)),
    home: () => scene.ends(false),
    end: () => scene.ends(true),
    ' ': () => scene.toggleCine(),
    r: () => scene.reset(),
    m: () => scene.changeUi({ tool: ui.tool === 'ruler' ? 'window' : 'ruler' }),
    l: () => !ui.testing && scene.toggleLabels(),
    i: panel('right'),
    c: panel('left'),
    b: panel('bar'),
    a: flip('annotations'),
    v: flip('link'),
    x: flip('maximize'),
    z: flip('imageOnly'),
    t: () => setTesting(!ui.testing),
    f: toggleFullscreen,
    j: () => move(1),
    k: () => move(-1),
    ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), () => scene.setPreset(i)])),
  };
  bindKeys(KEYS, {
    ready: () => ui.current,
    // The slice slider and the other range inputs use these keys themselves, and a focused button or link owns Space.
    skips: (key, target) => ((key === ' ' || key === 'enter') && target.matches('button, a, input, select, summary'))
      || (BLOCKED_ON_FOCUS.includes(key) && target.matches('input')),
  });
}
