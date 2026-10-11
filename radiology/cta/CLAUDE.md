# cta
Purpose: cath lab teaching on the echo design. One screen: a case sidebar (Angiography stills with the dataset's SYNTAX outlines, cine loops, IVUS, three Reference screens), the media on a black stage, a tabbed panel, test mode. CT angiography volumes, curved reformats and a simulator are not built.
Input: `content/segments.json`, `projections.json`, `ivus.json` and `../data/cath/manifest.json`   Output: `index.html`, routed by `#/<id>` (`ref-segments`, `ref-projections`, `ref-ivus` are the reference screens).
Files: `app.js` wiring and one `ui` object. Pure and tested: `content.js` (validator and loader), `cases.js` (sidebar list and tabs), `views.js` (angle to listed view, segment roles), `tree.js` (coronary tree geometry and its topology links), `polygon.js` (label anchor, badge spread), `credits.js`. DOM: `still.js` (outlines, chips, hover card), `diagram.js` (the tree), `carm.js`, `ivus-figure.js`, `ref-*.js` (one per reference screen), `panel.js` and `ui.js` (tab content), `cta.css`.
Done when: every case reads well, the validator passes, and each reference screen answers hover and focus with the table's own words.
Gotchas:
- Imports `../echo/player.js`, `controls.js` and `label-layout.js` and links `../echo/*.css` unchanged. Moving them to `core/` is the clean follow-up. Do not edit them from here.
- Encode with `../tools/add-cath.mjs`. No source states a projection for ARCADE or CADICA, so no case sets `projection` and no text names one.
- Outlines are the dataset's own labels and can be incomplete. A pin goes in only where a lesion box lines up with a visible narrowing in the frames checked. Pins are static, the artery moves.
- ARCADE category ids are not segment numbers. The tool maps by name to `seg-<name>`.
- The tree is topologically exact by construction: a branch starts on a vertex of its parent (`tree.test.js`). Where a description names no parent (14, 14a, 14b) the branch is drawn off 13. Septals are drawn for orientation and have no segment.
- The projection picker matches the nearest listed view within 15 degrees and marks only what the table lists. A lateral view is stored as LAO 90.
- IVUS overview text is written for the SCAD clip. Check `panel.js` before adding another IVUS clip.
- `index.html` preloads every module. `index.test.js` fails when the list drifts from the import graph.
- Dev: serve `radiology/` over http. Browsers from about 2022 must work. No `Map.groupBy` or `toSorted`.
See: `../docs/cta-content.md` for the shapes, `../data/INDEX.md` for the media.
