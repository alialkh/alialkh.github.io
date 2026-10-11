// Which panels the reader collapsed survives a reload. Storage can be blocked or full, so every access is guarded and the page works without it.
const KEY = 'radiology.viewer.layout';
const PANELS = ['left', 'right', 'bar'];

// Returns { panels, annotations } with only the booleans that were saved, so a stale or edited value cannot break the page.
export function loadPrefs(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(KEY));
    const panels = Object.fromEntries(PANELS.filter(k => typeof saved?.[k] === 'boolean').map(k => [k, saved[k]]));
    return typeof saved?.annotations === 'boolean' ? { panels, annotations: saved.annotations } : { panels };
  } catch {
    return { panels: {} };
  }
}

export function savePrefs({ panels, annotations }, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify({ ...panels, annotations }));
  } catch {
    // Blocked storage only means the choice is forgotten.
  }
}
