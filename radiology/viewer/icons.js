import { iconSet, BASE_PATHS } from '../core/icons.js';

const frame = '<rect x="3.5" y="5" width="17" height="14" rx="1.6"/>';

export const icon = iconSet({
  ...BASE_PATHS,
  ruler: '<path d="M3.5 16.5l13-13 4 4-13 13z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4.5 4.5v4.5H9"/>',
  invert: '<circle cx="12" cy="12" r="8.5"/><path class="fill" d="M12 3.5a8.5 8.5 0 0 1 0 17z"/>',
  window: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.5 1.5M16.5 16.5L18 18M6 18l1.5-1.5M16.5 7.5L18 6"/>',
  grip: '<circle class="fill" cx="9" cy="7" r="1.3"/><circle class="fill" cx="15" cy="7" r="1.3"/><circle class="fill" cx="9" cy="12" r="1.3"/><circle class="fill" cx="15" cy="12" r="1.3"/><circle class="fill" cx="9" cy="17" r="1.3"/><circle class="fill" cx="15" cy="17" r="1.3"/>',
  maximize: '<rect x="5" y="5" width="14" height="14" rx="1.6"/>',
  restore: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  series: '<path d="M12 4l9 5-9 5-9-5z"/><path d="M3 13.5l9 5 9-5"/>',
  plane: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  annotate: '<path d="M5 19l7-14 7 14M8.2 14h7.6"/>',
  notes: '<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14 3.5V8.5h5M9 12.5h7M9 16.5h7"/>',
  focus: '<path d="M4 8.5V5.5a1 1 0 0 1 1-1h3M15.5 4.5h3a1 1 0 0 1 1 1v3M19.5 15.5v3a1 1 0 0 1-1 1h-3M8.5 19.5h-3a1 1 0 0 1-1-1v-3"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  left: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.5 4.5v15"/>',
  right: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M14.5 4.5v15"/>',
  bar: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 14.5h17"/>',
  'chev-left': '<path d="M14.5 6l-6 6 6 6"/>',
  'chev-right': '<path d="M9.5 6l6 6-6 6"/>',
  'chev-up': '<path d="M6 14.5l6-6 6 6"/>',
  'chev-down': '<path d="M6 9.5l6 6 6-6"/>',
  layout: `${frame}<path d="M12 5v14M3.5 12h17"/>`,
  '1x1': frame,
  '1x2': `${frame}<path d="M12 5v14"/>`,
  '2x1': `${frame}<path d="M3.5 12h17"/>`,
  '2x2': `${frame}<path d="M12 5v14M3.5 12h17"/>`,
  '1p2': `${frame}<path d="M14.5 5v14M14.5 12h6"/>`,
});
