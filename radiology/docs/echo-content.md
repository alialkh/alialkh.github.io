# Echo content schema
Reference for everything `echo/` teaches. `echo/content.js` enforces the integrity and license rules and `echo/content.test.js` runs them over the real files. Run `node --test radiology/` after every content change.

IDs are kebab-case strings, unique within their table. Coordinates are fractions of the video frame, x from the left and y from the top.

## Tables
| file | holds |
|---|---|
| `echo/content/structures.json` | `Structure[]` |
| `echo/content/views.json` | `View[]` |
| `echo/content/conditions.json` | `Condition[]` |
| `data/clips/manifest.json` | `Clip[]` |

## Shapes
- Structure `{ id, name, description }`
- View `{ id, name, abbrev, window, probe, screen, structures, tips, pitfalls, reviewed }`
  - `window` is parasternal, apical, subcostal or suprasternal
  - `probe` is `{ site, chest: [x, y], notch }`. `site` and `notch` are sentences. `chest` places the transducer on the front-of-chest schematic, patient's right on the viewer's left, sternum near x 0.5.
  - `screen` says how the sector is laid out on screen
  - `structures` lists StructureIds visible in this view, in teaching order
- Condition `{ id, name, system, summary, findings, significance, pearls, mimics, compareView, reviewed, sources }`
  - `system` is pericardium, lv-function, valves, right-heart, cardiomyopathy or masses
  - `findings` is the ordered list of things to look for, one sentence each
  - `compareView` is the ViewId whose normal clip is shown beside the case
  - `sources` are references that were opened and checked
- Clip `{ id, view, condition?, src, poster, fps, durationSec, width, height, markers, pins?, notes?, source }`. A clip is one case in the app.
  - no `condition` means a normal study
  - `markers` is `{ structure, at: [x, y], r }[]`. `r` is a fraction of frame width. Each structure must be listed in the clip's view.
  - `pins` is `{ at: [x, y], text }[]`, on-image callouts for findings visible in this clip. `text` is one short plain sentence, 90 characters or fewer. Add a pin only where the finding is unambiguous in the frame.
  - `notes` is one or two sentences shown as "About this clip", for example what the clip shows, that it is a healthy volunteer, or that the loop is a single beat
  - `source` is `{ author, license, licenseUrl, url, attribution, modified }`

## Rules the validator enforces
- every referenced id exists
- `source.license` is CC0 1.0, Public domain, CC BY x.y or CC BY-SA x.y. Anything NC or ND is rejected.
- `reviewed: false` shows a "draft, not yet medically reviewed" badge in the UI

## Adding a clip
1. Record the dataset and its license in `LICENSES.md`.
2. Run `node radiology/tools/add-clip.mjs <file> --id <id> --view <view> [--condition <id>] --author <text> --license <text> --license-url <url> --url <url>`. It encodes H.264 mp4 plus a poster into `data/clips/` and appends a manifest entry with empty markers.
3. Open a mid-cycle frame, place markers for the structures the view lists, then add the clip to the table in `data/INDEX.md`.

## What the app builds from this
One screen. The sidebar lists every clip as a case, normal views first in the order of `views.json`, then pathology grouped by condition system in the order of `conditions.json`. Two clips with the same title and view are numbered on the second line. The stage shows the selected clip with overlays built from the tables. The title comes from the condition for a pathology clip and from the view for a normal one. Summary, findings, significance, pearls, mimics and sources come from the condition. Probe placement, on-screen layout, structures, tips and pitfalls come from the view. Markers, pins and "About this clip" come from the clip. Pins are numbered in manifest order and listed under the findings as "On this clip". Compare puts the first normal clip of `compareView` beside the case.
