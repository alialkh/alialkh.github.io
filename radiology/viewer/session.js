// A case being viewed: its volumes and the streams that fill them. The last two cases stay in memory.
import { fetchJson } from '../core/json.js';
import { streamVolume } from './loader.js';
import { createVolume } from './volume.js';
import { validateGrid } from './content.js';

export function createSession(c) {
  // One part per series, plus the labels. Each is { key, url (vol.json), meta, vol }.
  const parts = [...c.series.map(s => ({ key: s.id, base: s.url })), ...(c.labels ? [{ key: 'labels', base: c.labels.url }] : [])];
  let controller = null;
  let ready = null;
  // stop() during the vol.json wait must also cancel a start() that has not begun streaming.
  let token = 0;

  async function init() {
    const metas = await Promise.all(parts.map(p => fetchJson(new URL('vol.json', p.base))));
    const problems = validateGrid(c, Object.fromEntries(parts.map((p, i) => [p.key, metas[i]])));
    if (problems.length) throw Object.assign(new Error('This case does not fit together'), { problems });
    parts.forEach((p, i) => Object.assign(p, { url: new URL('vol.json', p.base).href, meta: metas[i], vol: createVolume(metas[i]) }));
  }
  const part = key => parts.find(p => p.key === key);

  const session = {
    case: c,
    // Resolves once vol.json files are in and checked. A failure is not kept, so reopening the case tries again.
    ready() {
      ready ??= init().catch(error => {
        ready = null;
        throw error;
      });
      return ready;
    },
    volume: key => part(key)?.vol,
    // Slices in across every volume, as a fraction.
    progress: () => parts.reduce((n, p) => n + (p.vol?.readyCount ?? 0), 0) / parts.reduce((n, p) => n + (p.meta?.dims[2] ?? 1), 0),
    // The shown series and the labels first, together. The other series follow.
    async start(seriesId, { onChunk, onError }) {
      const mine = ++token;
      controller?.abort();
      await session.ready();
      if (mine !== token) return;
      controller = new AbortController();
      const { signal } = controller;
      const run = key => streamVolume(part(key).vol, part(key).meta, part(key).url, { signal, onChunk: () => onChunk(key) });
      try {
        await Promise.all([run(seriesId), c.labels && run('labels')]);
        for (const s of c.series) if (s.id !== seriesId) await run(s.id);
      } catch (error) {
        if (!signal.aborted) onError(error);
      }
    },
    stop() {
      token++;
      controller?.abort();
    },
  };
  return session;
}

export function createSessions() {
  const kept = new Map();
  return {
    open(c) {
      let session = kept.get(c.id);
      kept.delete(c.id);
      session ??= createSession(c);
      kept.set(c.id, session);
      for (const [id, old] of kept) {
        if (kept.size <= 2) break;
        old.stop();
        kept.delete(id);
      }
      return session;
    },
    has: id => kept.has(id),
  };
}
