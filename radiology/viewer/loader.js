// Streams one volume's chunks into a volume, middle slice first. Needs DecompressionStream, so there is no vendored inflate fallback.
import { chunkOrder } from './chunks.js';
import { chunkLength, putChunk } from './volume.js';

export const canDecompress = typeof DecompressionStream === 'function';
const PARALLEL = 3;

// Some servers undo the gzip on the way out. The magic bytes say which case this is.
async function gunzip(bytes) {
  if (!(bytes[0] === 0x1f && bytes[1] === 0x8b)) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function fetchChunk(url, signal, fetchFn) {
  const res = await fetchFn(url, { signal });
  if (!res.ok) throw new Error(`Could not load ${url}: HTTP ${res.status}`);
  return gunzip(new Uint8Array(await res.arrayBuffer()));
}

// jobs: [{ vol, meta, chunk, base, key? }], fetched in order PARALLEL at a time. Resolves true when all are in, false when aborted.
// ramp sends the first job alone, so the first image does not share the link with chunks it does not need yet.
export async function runJobs(jobs, { signal, onChunk = () => {}, fetchFn = fetch, ramp = false }) {
  let next = 0;
  let failed = false;
  async function load(job) {
    const { vol, meta, chunk } = job;
    const url = new URL(chunk.file, job.base).href;
    try {
      const bytes = await fetchChunk(url, signal, fetchFn);
      if (bytes.length !== chunkLength(meta, chunk)) throw new Error(`${url} holds ${bytes.length} bytes, expected ${chunkLength(meta, chunk)}`);
      putChunk(vol, chunk, bytes);
    } catch (error) {
      failed = true;
      throw error;
    }
    onChunk(chunk, job);
  }
  async function worker() {
    while (next < jobs.length && !failed) await load(jobs[next++]);
  }
  try {
    if (ramp && jobs.length) await load(jobs[next++]);
    await Promise.all(Array.from({ length: Math.min(PARALLEL, jobs.length - next) }, worker));
  } catch (error) {
    if (signal.aborted) return false;
    throw error;
  }
  return !signal.aborted;
}

// Resolves true when every chunk of one volume is in, false when aborted. Chunks already in the volume are skipped, so calling it again resumes.
// limit stops after that many chunks, for a thumbnail that needs only the middle one.
export async function streamVolume(vol, meta, baseUrl, { limit = Infinity, ...options }) {
  const todo = chunkOrder(meta.chunks, vol.dims[2]).map(i => meta.chunks[i]).filter(c => !vol.ready[c.z0]).slice(0, limit);
  return runJobs(todo.map(chunk => ({ vol, meta, chunk, base: baseUrl })), options);
}
