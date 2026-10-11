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

// Resolves true when every chunk is in, false when aborted. Chunks already in the volume are skipped, so calling it again resumes.
// limit stops after that many chunks, for a thumbnail that needs only the middle one.
export async function streamVolume(vol, meta, baseUrl, { signal, onChunk = () => {}, fetchFn = fetch, limit = Infinity }) {
  const todo = chunkOrder(meta.chunks, vol.dims[2]).map(i => meta.chunks[i]).filter(c => !vol.ready[c.z0]).slice(0, limit);
  let next = 0;
  let failed = false;
  async function worker() {
    while (next < todo.length && !failed) {
      const chunk = todo[next++];
      const url = new URL(chunk.file, baseUrl).href;
      try {
        const bytes = await fetchChunk(url, signal, fetchFn);
        if (bytes.length !== chunkLength(meta, chunk)) throw new Error(`${url} holds ${bytes.length} bytes, expected ${chunkLength(meta, chunk)}`);
        putChunk(vol, chunk, bytes);
      } catch (error) {
        failed = true;
        throw error;
      }
      onChunk(chunk);
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(PARALLEL, todo.length) }, worker));
  } catch (error) {
    if (signal.aborted) return false;
    throw error;
  }
  return !signal.aborted;
}
