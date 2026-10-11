// Pure. How the viewports of one case stay in step. All series of a case share one voxel grid, so a cursor means the same place in every viewport.
import { indexToPosition, positionToIndex, cursorIndex, withIndex } from './planes.js';
import { movePosition } from './input.js';

// Linked, every viewport takes the cursor, so same plane viewports show the same slice and other planes move their crosshair.
export function applyCursor(viewports, slot, cursor, link) {
  return viewports.map((v, i) => (link || i === slot ? (v.cursor === cursor ? v : { ...v, cursor }) : v));
}

// The cursor after scrolling this viewport by steps. count is the slice count along its plane.
export function scrollCursor({ plane, cursor }, steps, count, wrap = false) {
  const position = movePosition(indexToPosition(plane, cursorIndex(plane, cursor), count), steps, count, wrap);
  return withIndex(cursor, plane, positionToIndex(plane, position, count));
}

// The cursor for a slider or Home and End: position is the slice number from 0 in reading order, clamped to the stack.
export function seekCursor({ plane, cursor }, position, count) {
  return withIndex(cursor, plane, positionToIndex(plane, Math.min(count - 1, Math.max(0, position)), count));
}

// The crosshair is only worth drawing while some other plane is on screen to follow it.
export function crosshairShown({ viewports, link, maximized }, slot) {
  const onScreen = maximized === null ? viewports : [viewports[maximized]];
  return link && onScreen.some(v => v.plane !== viewports[slot].plane);
}

// Which slot a finding should open in. A viewport already showing the finding's plane and series wins, then one showing its plane, then the active one.
export function findingSlot({ viewports, active, maximized }, finding) {
  if (maximized !== null) return maximized;
  const order = [active, ...viewports.keys()].filter((s, i, all) => all.indexOf(s) === i);
  const samePlane = order.filter(s => viewports[s].plane === finding.plane);
  return samePlane.find(s => !finding.series || viewports[s].series === finding.series) ?? samePlane[0] ?? active;
}
