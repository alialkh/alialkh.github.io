# echo
Purpose: echocardiography cine-loop library with a view atlas (PLAX, PSAX, A4C, A5C, A2C, subcostal, IVC), frame stepping, labeled overlays and a view-recognition quiz.
Input: `content/*.json` (structures, views, conditions) and `../data/clips/manifest.json`   Output: a single-page app (`index.html`, hash routes) with atlas, cases and quiz screens on the `core` shell and quiz engine.
Files: `app.js` router, `route.js` pure hash parser, `content.js` load and validate, `questions.js` pure deck, `loop.js` pure A-B loop, `player.js` cine player and clip credit, `atlas.js`, `cases.js`, `quiz-screen.js` screens.
Done when: every atlas view has at least one licensed clip, loops play and frame-step, and the quiz scores.
Gotchas:
- Encode clips with ffmpeg to H.264 or WebM, a few hundred KB each. Record source and license in the clip manifest before the file is added.
- Markers are static points with a radius, not per-frame tracking. Tracking needs segmentation masks and is out of scope for now.
- Teaching content ships with `reviewed: false` and shows a draft badge until a clinician signs it off.
- Dev only: `?clips=<url>` and `?content=<dir/>` swap the sources. Fixtures: `index.html?clips=test-fixtures/clips/manifest.json&content=test-fixtures/content/`.
- Clip `src` and `poster` resolve against the manifest file. A missing default manifest means zero clips, any other load or rule failure stops the page.
- Every clip shows its credit line. The quiz shows it only after the answer, and its player has no fullscreen because the answers sit outside it.
- Browsers from about 2022 must work, older iPhones included. No `Map.groupBy`, `Object.groupBy` or `toSorted`.
- `<video>` frame stepping is accurate to about one frame. Fine for teaching. Switch to canvas frames if exactness ever matters.
See: `../docs/echo-content.md` for every shape and the rules `content.js` enforces.
