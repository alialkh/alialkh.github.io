import { iconSet, BASE_PATHS } from '../core/icons.js';

// Sidebar glyphs for the three reference screens, on top of the core set.
export const icon = iconSet({
  ...BASE_PATHS,
  tree: '<path d="M12 3v6M12 9l-6 6M12 9l6 6M6 15l-2 5M18 15l2 5M12 9v11"/>',
  carm: '<path d="M18.5 5.5a9 9 0 1 0 0 13"/><path d="M12 12h3"/><circle class="fill" cx="12" cy="12" r="1.6"/>',
  ivus: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><circle class="fill" cx="12" cy="12" r="1.8"/>',
});
