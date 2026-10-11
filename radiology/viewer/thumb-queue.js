// Decides when the sidebar's case thumbnails are fetched. They wait until the open case has everything it needs (the page calls release()),
// load one at a time, and only for items that are on screen, so a collapsed list costs nothing. No DOM here: load() draws, Observer reports what is visible.

// load(item, key) returns a promise. Observer is IntersectionObserver or a stand-in. Without one, every item counts as visible.
export function createThumbQueue({ load, Observer = globalThis.IntersectionObserver }) {
  const waiting = new Map();
  const visible = new Set();
  let released = false;
  let running = false;

  const observer = Observer ? new Observer(entries => {
    for (const { isIntersecting, target } of entries) (isIntersecting ? visible.add(target) : visible.delete(target));
    pump();
  }) : null;

  async function pump() {
    if (running) return;
    running = true;
    try {
      while (released) {
        const key = [...waiting.keys()].find(k => !observer || visible.has(k));
        if (key === undefined) break;
        const item = waiting.get(key);
        drop(key);
        await load(item, key).catch(error => console.warn('Thumbnail failed:', error.message));
      }
    } finally {
      running = false;
    }
  }
  function drop(key) {
    waiting.delete(key);
    visible.delete(key);
    observer?.unobserve(key);
  }

  return {
    // key is the element the picture goes in. It is what the observer watches.
    add(item, key) {
      waiting.set(key, item);
      observer?.observe(key);
      pump();
    },
    // The picture came from elsewhere, for example the open case's loaded volume.
    skip: drop,
    // The open case has loaded, so the thumbnails may start.
    release() {
      released = true;
      pump();
    },
    // A new case is loading. The thumbnail in flight finishes, and no further one starts until release().
    hold() {
      released = false;
    },
    get pending() { return waiting.size; },
  };
}
