// Inline stroke icons, so glyphs never fall back to emoji on phones.
const PATHS = {
  play: '<path class="fill" d="M8 5.5v13l11-6.5z"/>',
  pause: '<path class="fill" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>',
  first: '<path d="M6 5.5v13"/><path class="fill" d="M18 5.5v13L8.5 12z"/>',
  prev: '<path d="M14.5 6l-6 6 6 6"/>',
  next: '<path d="M9.5 6l6 6-6 6"/>',
  labels: '<circle cx="12" cy="12" r="7.5"/><circle class="fill" cx="12" cy="12" r="1.8"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.2"/>',
  test: '<path d="M3.5 3.5l17 17"/><path d="M10.4 6.2A9 9 0 0 1 12 6c5 0 9 6 9 6a16 16 0 0 1-2.7 3.2M6.6 7.7C4.3 9.4 3 12 3 12s4 6 9 6a8.7 8.7 0 0 0 4.1-1"/>',
  compare: '<rect x="3" y="5" width="8" height="14" rx="1.5"/><rect x="13" y="5" width="8" height="14" rx="1.5"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  rail: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9.5 4v16"/>',
  cases: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle class="fill" cx="4.5" cy="6.5" r="1.2"/><circle class="fill" cx="4.5" cy="12" r="1.2"/><circle class="fill" cx="4.5" cy="17.5" r="1.2"/>',
  back: '<path d="M14.5 6l-6 6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};

export function icon(name) {
  const box = document.createElement('span');
  box.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
  return box.firstChild;
}
