# viewer
Purpose: CT and MRI case viewer laid out like a PACS workstation. A slim top bar, a case and series sidebar, a grid of viewports edge to edge, a teaching sidebar (Overview, Findings, Anatomy, Tips, Credits) and a control bar over a status strip. Test mode hides the answers.
Input: `../data/cases/manifest.json` (Case[]) and the volume folders it names   Output: `index.html`, routed by `#/<case id>`.
Done when: real licensed cases are in `../data/cases` (ten are, see `../data/INDEX.md`), the first image shows in about 2 s on a 10 Mbit/s link, and a 2 by 2 of four 192x256x192 series scrolls at 60 fps.
Files:
- Pure, each with a node test: `state.js` the one reducer (layout, viewports, active, maximized, Link, panels), `layouts.js` layouts, default fill, neighbours, `link.js` slice mapping, `windows.js`, `annotate.js` corner text, `planes.js`, `window.js`, `chunks.js` load order, `volume.js`, `measure.js`, `view.js`, `input.js`, `labels.js`, `case-list.js`, `content.js`, `prefs.js`, `thumb-queue.js`.
- I/O: `loader.js`, `session.js` (a case's volumes, the last two kept), `thumb.js`, `windowing.js` MR auto windows and window tables.
- Screen: `app.js` boot, chrome, routes. `scene.js` every action and the draw loop. `grid.js`, `pane.js` one viewport, `title.js`, `corners.js`, `drag.js`, `controls.js`, `left.js`, `right.js`, `topbar.js`, `menu.js`, `notes.js` tabs, `keys.js`, `gestures.js`, `icons.js`. CSS: `viewer.css`, `side.css`, `panes.css`, `bar.css`, `notes.css` over `../core/theme.css` only.
Gotchas:
- Orientation is the one thing that must never be wrong. `planes.js` holds the only table of which voxel axis each plane shows. Letters come from it. Never flip an image anywhere else.
- Axial slice numbers count from the head down, the others count with the voxel index. `Finding.index` and the cursor are always voxel indices. Draw from typed arrays through a Uint32 table into ImageData, nearest neighbour above 2x. MPR is index math, not a resample.
- Every case opens 2 by 2 (`defaultFill`). Native plane first (the slice axis stands out in the spacing, so a spine opens sagittal), then the other planes, then the native plane again with labels or a second window. Two series: native on top, next plane below.
- One voxel grid per case. With Link on every viewport shares one cursor. Window, zoom, pan, invert, labels and ruler belong to a viewport and move with it when swapped. Wheel and drag act under the pointer, keys on the active viewport.
- Loading: the active series' middle chunk alone, then the other shown series and labels, the rest, other series last (`loadOrder`). Other cases' thumbnails wait until the open case is complete, one at a time, low priority, visible only.
- Needs `DecompressionStream`. The validator requires volume urls to end in a slash, CT series to list windows, and `defaultWindow` empty when `windows` is empty. `content.test.js` checks the real manifest down to its volumes.
- The short credit ("dataset, license" from `source.short`) stays over the first viewport in every mode, key A included. The full credit is the Credits tab. The disclaimer lives in the status strip.
- Dev only: `?cases=<url>` swaps the manifest. Fixtures `test-fixtures/cases/manifest.json` are synthetic phantoms, never patients. `empty.json` shows the zero-case state.
- Test mode hides titles, notes, finding text, label colours and names and the tab content. Scrolling, windowing, readout and ruler keep working.
- Keys: arrows or wheel scroll, PageUp and PageDown 10 (or change case in the list), 1 to 9 presets, plus and minus zoom, R reset, M ruler, Enter ruler end, L labels, Space cine, J and K case, I side panel, C case list, B control bar, A corner text, V Link, X maximize, Z only images, T test, F fullscreen, Escape restores. Alt with an arrow on a title bar swaps with the neighbour.
- Panels: the side panel starts open only at 1400 px or wider. The reader's collapsed panels and the A flag persist in localStorage. At 800 px or less both sidebars are closed drawers.
See: `../docs/viewer-content.md` for the Case shapes, volume format and orientation rule.
