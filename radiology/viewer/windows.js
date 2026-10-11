// Pure. Which window a viewport shows. A viewport holds null (its series default), { name } (a preset) or { center, width } (set by hand).
export const CT_LIMITS = { min: -1024, max: 3071 };

// Presets for a series. Two or more listed windows are used as they are. With one, an Auto window from the data follows it, and with none (MR)
// there are Auto and Full range. The data windows exist once the middle slices have arrived.
export function presetsFor(series, auto) {
  if (series.windows.length >= 2) return series.windows;
  const fromData = auto ? [{ name: 'Auto', center: auto.center, width: auto.width }] : [];
  if (series.windows.length) return [...series.windows, ...fromData];
  return auto ? [...fromData, { name: 'Full range', center: (auto.max + auto.min) / 2, width: auto.max - auto.min + 1 }] : [];
}

// Null while an MR series has no data to window from. A preset name that this series lacks falls back to the default.
export function resolveWindow(win, series, auto) {
  if (win && 'center' in win) return { center: win.center, width: win.width, name: null };
  const presets = presetsFor(series, auto);
  const p = presets.find(x => x.name === win?.name) ?? presets.find(x => x.name === series.defaultWindow) ?? presets[0];
  return p ? { center: p.center, width: p.width, name: p.name } : null;
}

// The range the level and width sliders cover.
export const limitsFor = (series, auto) => (series.windows.length ? CT_LIMITS : { min: Math.min(0, auto?.min ?? 0), max: auto?.max ?? 1 });
