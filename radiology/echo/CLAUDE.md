# echo
Purpose: echocardiography case viewer. Every clip is a case. One screen: a case sidebar, the clip on a black stage, and teaching overlays (title chip, info panel, markers, pins, control bar, test mode, compare with normal).
Input: `content/*.json` (structures, views, conditions) and `../data/clips/manifest.json`   Output: `index.html`, a single screen routed by `#/<clip id>`.
Files: `app.js` wiring and one `ui` state object, `case-list.js` pure case grouping and per-case info, `route.js` pure hash resolver, `content.js` load and validate, `loop.js` pure A-B loop, `label-layout.js` pure marker chip placement, `player.js` cine player and clip credit, `controls.js` control bar, `panel.js` info panel tabs, `sidebar.js`, `icons.js`. CSS: `echo.css` frame and sidebar, `stage.css`, `controls.css`, `panel.css`.
Done when: every standard view and condition has a licensed clip with markers, and every case reads well in the viewer.
Gotchas:
- Encode clips with `../tools/add-clip.mjs` (H.264, a few hundred KB). Record source and license in the manifest before the file is added.
- Markers and pins are fractions of the frame. The player sizes the frame to the clip's aspect ratio with a ResizeObserver, so they stay on their structures at any size.
- Markers are static points, not per-frame tracking. Tracking needs segmentation masks and is out of scope.
- Marker name chips are placed by `label-layout.js` whenever the frame size changes or hidden labels show, never per frame. A marker with no clear spot shows its number instead, and the Structures list shows the same number. Pin chips open on hover and focus only, so they stay out of the layout.
- Teaching content ships `reviewed: false`. A case shows the draft badge when its view or its condition is unreviewed.
- Dev only: `?clips=<url>` and `?content=<dir/>` swap the sources. Fixtures: `index.html?clips=test-fixtures/clips/manifest.json&content=test-fixtures/content/`. `test-fixtures/clips/empty.json` shows the zero-clip state.
- Clip `src` and `poster` resolve against the manifest. A missing default manifest means zero clips. Any other load or rule failure stops the page with the list of problems.
- The credit line is never hidden, in test mode and fullscreen included. Fullscreen targets the whole stage.
- Browsers from about 2022 must work, older iPhones included. No `Map.groupBy`, `Object.groupBy` or `toSorted`. Newer APIs get a one-line fallback.
- `<video>` frame stepping is accurate to about one frame. Switch to canvas frames if exactness ever matters.
See: `../docs/echo-content.md` for every shape and the rules `content.js` enforces.
