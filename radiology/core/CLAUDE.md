# core
Purpose: code every other area shares. Anything only one area uses lives in that area.
Contents: `dom.js` (element helper), `json.js` (fetchJson), `shell.js` and `theme.css` (page frame, disclaimer, theme), `quiz.js` (pure quiz state machine plus seeded `mulberry32` and `shuffle`). Not built until a first consumer exists, volume loader (viewer) and tour engine (cta).
Input: `../data/**/manifest.json`   Output: ES modules imported by viewer, cta, echo and pocus.
Done when: echo and viewer both run on it with no duplicated loader code.
Gotchas:
- Tours are data. Steps live in each case's manifest and the engine only interprets them, so adding a case never touches engine code.
- Decompress volumes with `DecompressionStream('gzip')`, no zlib library.
- Window presets (lung, bone, soft tissue, brain, angio) are a table here, not hard-coded in the viewer.
- No imports from outside `radiology/`.
- `mountShell` prepends `theme.css`, so an area's own stylesheet wins ties. Theme tokens live on `:root`.
- `quiz.js` point questions: `r` is a fraction of frame width and `aspect` is width over height.
See: `../data/INDEX.md` for the manifest shapes.
