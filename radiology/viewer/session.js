// A case being viewed: its volumes and the streams that fill them. The last two cases stay in memory.
import { fetchJson } from '../core/json.js';
import { runJobs } from './loader.js';
import { loadOrder } from './chunks.js';
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
    // shown is the series on screen, the active viewport's first. They and the labels come first, the other series follow (see loadOrder).
    // Calling it again with another list re-plans the rest and skips every chunk already in.
    async start(shown, { onChunk, onError }) {
      const mine = ++token;
      controller?.abort();
      await session.ready();
      if (mine !== token) return;
      controller = new AbortController();
      const { signal } = controller;
      const order = loadOrder(parts.map(p => ({ key: p.key, chunks: p.meta.chunks, nz: p.meta.dims[2] })), [].concat(shown, 'labels'));
      const jobs = order
        .map(({ key, i }) => ({ key, vol: part(key).vol, meta: part(key).meta, chunk: part(key).meta.chunks[i], base: part(key).url }))
        .filter(job => !job.vol.ready[job.chunk.z0]);
      try {
        await runJobs(jobs, { signal, ramp: true, onChunk: (chunk, job) => onChunk(job.key) });
      } catch (error) {
        onError(error);
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
