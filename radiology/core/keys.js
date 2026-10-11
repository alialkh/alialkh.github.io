// Page shortcuts. table maps a lowercased e.key to a handler that gets the event.
// Keys never fire with Ctrl, Cmd or Alt, once handled, while ready() is false, or in a text field.
// skips(key, target, event) returns true for the keys a focused control already uses.
const TYPING = 'select, textarea, input:not([type="range"]), [contenteditable]';

export function bindKeys(table, { ready = () => true, skips = () => false } = {}) {
  addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (!table[key] || !ready() || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    if (e.target.matches(TYPING) || skips(key, e.target, e)) return;
    e.preventDefault();
    table[key](e);
  });
}
