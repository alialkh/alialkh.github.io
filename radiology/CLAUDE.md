# radiology
Self-contained teaching module for med students. `index.html` picks a modality: echo case viewer and CT/MRI viewer (live), CT angiogram tour and POCUS simulator (coming). Static files only, no build step, hosted free on GitHub Pages.

Run: serve this folder over http, for example `python -m http.server 8000` (ES modules do not load from file://).
Test: `node --test radiology/` from the repo root (Node 22, no install). Then open the page for the area you changed.

## Isolation rule
This folder must lift out into its own site (for example "The Budding Radiology") unchanged.
- Every path is relative and stays inside `radiology/`. No absolute `/` paths.
- No imports or links to the parent site's CSS, JS or pages. Styles live in `core/`.
- Native ES modules, no bundler. Third-party code goes in `core/vendor/` with its version and license noted.

## Map
- `core/`   shared theme, disclaimer and loaders. Read `core/CLAUDE.md`.
- `viewer/` CT/MRI case viewer, one plane or three linked. Read `viewer/CLAUDE.md`.
- `cta/`    guided CT angiogram tour on the viewer. Read `cta/CLAUDE.md`.
- `echo/`   echo case viewer, every clip a case with teaching overlays. Read `echo/CLAUDE.md`.
- `pocus/`  ultrasound simulator game. Read `pocus/CLAUDE.md`.
- `data/`   cases and clips. Read `data/INDEX.md`, never the files.
- `docs/`   dataset licenses, content schemas. Open on demand.
- `tools/`  offline scripts, not shipped. `add-clip.mjs` ingests echo clips. `to-lps.py` (Python with SimpleITK) turns DICOM or NIfTI into raw LPS, `pack-volume.mjs` chunks that for the viewer, `make-phantom.mjs` makes the synthetic fixtures. `run-tests.js` is the `main` in `package.json`, which is how `node --test radiology/` finds every `*.test.js` and `*.test.mjs`.

## Rules
- Educational use only. Every page shows the disclaimer from `core/`.
- No real patient data. A dataset goes in `docs/LICENSES.md` with a license that allows republishing before any of its files enter `data/`.
- First image in about 2 seconds. Volumes stream in chunks from the middle slice outward, so one small download shows the first image.
- When a folder's purpose changes, its `CLAUDE.md` changes in the same commit.
