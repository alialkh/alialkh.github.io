# core
Purpose: code every other area shares. Anything only one area uses lives in that area.
Contents: `dom.js` (element helper), `json.js` (fetchJson), `shell.js` (`DISCLAIMER` and the `disclaimer()` line every page shows), `theme.css` (dark theme, design tokens, buttons, glass surface, focus ring), `file-warning.js` (classic script for file:// visits). Not built until a first consumer exists: volume loader (viewer), tour engine (cta), quiz engine (the old echo one is in git history).
Input: `../data/**/manifest.json`   Output: ES modules and CSS used by the landing page and every area.
Done when: echo and viewer both run on it with no duplicated loader code.
Gotchas:
- Tours are data. Steps live in each case's manifest and the engine only interprets them, so adding a case never touches engine code.
- Decompress volumes with `DecompressionStream('gzip')`, no zlib library.
- Window presets (lung, bone, soft tissue, brain, angio) are a table here, not hard-coded in the viewer.
- No imports from outside `radiology/`.
- Pages link `theme.css` before their own stylesheet, so area styles win ties. Tokens (colors, `--fs-*`, `--r-*`, shadows, `--ease`) live on `:root`.
See: `../data/INDEX.md` for the manifest shapes.
