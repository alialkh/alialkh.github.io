# core
Purpose: code every other area shares. Anything only one area uses lives in that area.
Contents: `dom.js` (element helper), `json.js` (fetchJson), `shell.js` (`DISCLAIMER` and the `disclaimer()` line every page shows), `theme.css` (dark theme, design tokens, buttons, glass surface, focus ring), `file-warning.js` (classic script for file:// visits).
Case-viewer shell, first built for echo: `license.js` (allowlist), `shape.js` (`checkShape` and base `TYPES`), `group.js` (`groupBy`), `route.js` (`#/<id>` resolver), `credit.js` (license credit line), `icons.js` (`iconSet`, `BASE_PATHS`, `icon`), `sidebar.js` (case list, rail, phone drawer), `tabs.js` (info panel tabs), `idle.js` (control bar auto-hide), `keys.js` (`bindKeys`). Shell CSS: `frame.css` (grid and case list), `stage.css`, `controls.css`, `panel.css`.
Not built until a second consumer exists: the volume loader (it lives in `../viewer/loader.js` until cta needs it), tour engine (cta), quiz engine (the old echo one is in git history).
Input: `../data/**/manifest.json`   Output: ES modules and CSS used by the landing page and every area.
Done when: echo and viewer both run on it with no duplicated loader code.
Gotchas:
- Tours are data. Steps live in each case's manifest and the engine only interprets them, so adding a case never touches engine code.
- Decompress volumes with `DecompressionStream('gzip')`, no zlib library.
- Window presets (lung, bone, soft tissue and so on) travel with each case's series in the manifest, so there is no preset table here.
- No imports from outside `radiology/`.
- Pages link `theme.css`, then the shell CSS they use in the order `frame`, `stage`, `controls`, `panel`, before their own stylesheets, so area styles win ties. Tokens (colors, `--fs-*`, `--r-*`, shadows, `--ease`) live on `:root`.
- One sidebar and one tab panel per page, because their ids (`case-list`, `case-tab-body`, `tab-<id>`) are fixed. A case item's thumbnail needs the class `thumb`.
See: `../data/INDEX.md` for the manifest shapes.
