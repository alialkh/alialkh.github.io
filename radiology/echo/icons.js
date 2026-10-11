import { iconSet, BASE_PATHS } from '../core/icons.js';

export const icon = iconSet({
  ...BASE_PATHS,
  first: '<path d="M6 5.5v13"/><path class="fill" d="M18 5.5v13L8.5 12z"/>',
  prev: '<path d="M14.5 6l-6 6 6 6"/>',
  next: '<path d="M9.5 6l6 6-6 6"/>',
  compare: '<rect x="3" y="5" width="8" height="14" rx="1.5"/><rect x="13" y="5" width="8" height="14" rx="1.5"/>',
});
