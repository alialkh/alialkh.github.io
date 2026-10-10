// Pure A-B loop logic for the cine player. Frames are 0-based and B is the last frame played.
export const NO_LOOP = { a: null, b: null };

// which is 'a', 'b', or null to clear. A and B set in reverse order are swapped.
export function setLoopPoint(loop, which, frame) {
  if (which === null) return NO_LOOP;
  const { a, b } = { ...loop, [which]: frame };
  return a !== null && b !== null && b < a ? { a: b, b: a } : { a, b };
}

export const loopActive = ({ a, b }) => a !== null && b !== null && a < b;

// The frame to seek to while playing, or null to keep playing.
export const loopSeek = (loop, frame) => (loopActive(loop) && (frame < loop.a || frame > loop.b) ? loop.a : null);

export function loopLabel({ a, b }) {
  if (a === null && b === null) return '';
  if (a === b) return `A and B are both frame ${a + 1}, so no loop is active.`;
  const name = f => (f === null ? 'not set' : `frame ${f + 1}`);
  return `A ${name(a)}, B ${name(b)}`;
}
