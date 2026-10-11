# viewer
Purpose: CT and MRI case viewer. One screen: a case sidebar, a big image stage (one plane, or three linked planes) and teaching overlays (title chip, finding card and ring, orientation letters, scale bar, ruler, control bar, info panel, test mode).
Input: `../data/cases/manifest.json` (Case[]) and the volume folders it names   Output: `index.html`, routed by `#/<case id>`. cta and pocus reuse the scene.
Done when: real licensed cases are in `../data/cases` (ten are, see `../data/INDEX.md`) and a 256x256x200 case shows its first slice in about a second and scrolls at 60 fps.
Files:
- Pure, each with a node test: `planes.js` plane geometry, orientation letters and slice extraction, `window.js` window lookup table and auto window, `chunks.js` load order and vol.json checks, `volume.js`, `measure.js`, `view.js` zoom and pan, `input.js` wheel and touch steps, `labels.js`, `case-list.js`, `content.js` Case validation and loading.
- I/O: `loader.js` streams chunks, `session.js` one case's volumes plus a cache of the last two, `thumb.js`.
- Screen: `app.js` page chrome and keys, `scene.js` panes, control bar and every action, `pane.js` one plane, `gestures.js` pointer input, `controls.js`, `notes.js` panel tabs, `icons.js`. CSS: `viewer.css`, `panes.css`, `bar.css`, `notes.css` over `../core` frame, stage, controls and panel css.
Gotchas:
- Orientation is the one thing that must never be wrong. `planes.js` holds the only table of which voxel axis each plane shows. Letters come from it. Never flip an image anywhere else.
- Axial slice numbers count from the head down (slice 1 is the most superior), the others count with the voxel index. `Finding.index` and the cursor are always voxel indices.
- Draw from typed arrays through a Uint32 lookup table into ImageData. Zoom and pan are CSS on a canvas of the plane's own size, nearest neighbour above 2x.
- MPR is index math on the loaded array, not a resample. Pixel shape comes from voxel spacing, never from pixel counts.
- Chunks stream middle slice first, so the first image needs one small download. Not-yet-loaded slices show a gray placeholder and a message, never black.
- Needs `DecompressionStream`. No inflate fallback is vendored, so older browsers get an unsupported-browser message.
- Beyond the doc, the validator requires volume urls to end in a slash, CT series to list windows, and `defaultWindow` empty when `windows` is empty (MR then gets Auto and Full range from the data).
- The real manifest is `../data/cases/manifest.json`. `content.test.js` checks it, volume by volume, whenever the file exists. Orientation of every real case was checked on the anatomy, so a new case needs the same check before it ships.
- Dev only: `?cases=<url>` swaps the manifest. Fixtures: `index.html?cases=test-fixtures/cases/manifest.json`. They are synthetic phantoms from `../tools/make-phantom.mjs`, never patients. `test-fixtures/cases/empty.json` shows the zero-case state.
- Test mode hides titles, notes, findings, label colours and names. Scrolling, windowing, the value readout and the ruler keep working.
- Keys: PageUp and PageDown scroll 10 slices, but switch case when focus is in the case list. The notes panel opens by default only above 1100 px. Label colours start off, label names on hover are always on outside test mode.
- Keyboard only: Tab to a pane to make it active, plus and minus zoom, Shift with the arrows pans, and with the ruler on Enter drops an end at the crosshair.
See: `../docs/viewer-content.md` for the Case shapes, volume format and orientation rule.
