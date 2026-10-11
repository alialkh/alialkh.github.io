// Pure. Turns raw wheel, touch and timer amounts into whole slice steps.
// Adds delta to a carried remainder and takes whole units of size unit, so slow movement is kept and not lost.
export function accumulate(carry, delta, unit) {
  const total = carry + delta;
  const steps = Math.trunc(total / unit);
  return { steps, carry: total - steps * unit };
}

// A mouse notch is one slice whatever the platform reports (100 or 120 px, or 3 lines). A trackpad sends many small deltas.
export function wheelSteps(carry, deltaY, deltaMode = 0) {
  const sign = Math.sign(deltaY);
  if (deltaMode === 1) return { steps: sign * Math.max(1, Math.round(Math.abs(deltaY) / 3)), carry: 0 };
  if (Math.abs(deltaY) >= 100) return { steps: sign * Math.round(Math.abs(deltaY) / 100), carry: 0 };
  return accumulate(carry, deltaY, 30);
}

// One finger across the pane covers about the whole stack, but never less than 6 px or more than 24 px a slice.
export const pxPerSlice = (paneHeight, count) => Math.min(24, Math.max(6, paneHeight / count));

// A scroll position moves by steps. Cine wraps round, everything else stops at the ends.
export function movePosition(position, steps, count, wrap = false) {
  const next = position + steps;
  if (wrap) return ((next % count) + count) % count;
  return Math.min(count - 1, Math.max(0, next));
}

// Cine speeds, in slices a second.
export const SPEEDS = [5, 10, 20, 30];
