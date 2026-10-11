// Pure. The text drawn in the corners of a viewport, PACS style.
import { PLANE_NAMES } from './planes.js';

const fixed = (n, digits) => String(Number(n.toFixed(digits)));

export const imageText = (position, count) => `Im ${position + 1} / ${count}`;
// Millimetres from the first image of the stack. The scans carry no table position, so there is no absolute origin.
export const locationText = (position, step) => `Loc ${(position * step).toFixed(1)} mm`;
export const spacingText = step => `Sp ${fixed(step, 2)} mm`;
export const windowText = ({ center, width, name }) => `WW ${Math.round(width)} WL ${Math.round(center)}${name ? ` · ${name}` : ''}`;
export const zoomText = zoom => `Zoom ${zoom.toFixed(1)}×`;

// What is under the cursor. name is the label structure, hidden by the caller in test mode.
export function valueText(modality, value, name) {
  const text = modality === 'CT' ? `HU ${value}` : `Intensity ${value}`;
  return name ? `${text} · ${name}` : text;
}

// The short credit kept over the first image: the dataset's short name and its license, for example "TotalSegmentator, CC BY 4.0".
export const creditShort = ({ short, author, license }) => `${short ?? author.split(/ \(|,/)[0]}, ${license}`;

// The title bar label. A viewport that shows the label colours, or that was given a window preset, says so, so two views of one plane stay apart.
export function viewportTitle(seriesName, { plane, win, labels }) {
  return [`${seriesName} · ${PLANE_NAMES[plane]}`, labels && 'Labels', win?.name].filter(Boolean).join(' · ');
}
