# Cath lab and CTA tour content schema
Reference for the tour in `cta/`. It teaches coronary anatomy and the views a student meets in the cath lab: coronary CT angiography, invasive angiography in the standard projections, and IVUS. The validator in `cta/` will enforce the integrity and license rules. Run `node --test radiology/` after every content change.

IDs are kebab-case strings, unique within their table. Image coordinates are fractions of the frame, x from the left and y from the top. Source and license rules are the same as in `echo-content.md`.

## Tables
| file | holds |
|---|---|
| `cta/content/segments.json` | `Segment[]` |
| `cta/content/projections.json` | `Projection[]` |
| `cta/content/ivus.json` | `IvusConcept[]` |
| `data/cath/manifest.json` | `CathCase[]` |

## Shapes
- Segment `{ id, name, artery, syntax, aha, description }`
  - `artery` is rca, left-main, lad, lcx or other
  - `syntax` is the SYNTAX score segment number as a string, for example "6" or "12a". `aha` is the AHA segment number as a number, or null when no source supports a mapping (for example 12, 12a and 12b stay null).
  - `description` says where the segment starts and ends in plain words
- Projection `{ id, name, aliases, primary, secondary, system, bestSeen, foreshortened, overlapped, whenToUse, pitfalls, sources }`
  - `primary` is `{ side, angle }`, side is LAO, RAO or AP, angle in degrees from 0 to 90. `secondary` is `{ direction, angle }`, direction is cranial, caudal or none.
  - `system` is left, right or both
  - `bestSeen`, `foreshortened`, `overlapped` list SegmentIds
  - `sources` are references that were opened and checked
  - one angle per view, ranges that sources give are in `whenToUse`. A lateral view is stored as LAO 90 by app convention, no source states a rotation angle.
  - segments carry no per-item sources. Their credit is the SYNTAX score definitions page and Sianos 2005 (PMID 19758907), shown in the credits tab.
- IvusConcept `{ id, name, definition, howToSee, pitfalls, sources }`
- CathCase `{ id, kind, projection?, title, summary, src, poster, fps?, durationSec?, width, height, markers, regions?, pins?, notes?, source }`
  - `kind` is angio-clip, angio-still, ivus-clip or ivus-still
  - `projection` is a ProjectionId, present when the source states it
  - `markers` is `{ segment, at: [x, y], r }[]` placing SYNTAX segments on the image. `r` is a fraction of frame width.
  - `regions` is `{ segment, polygon: [[x, y], ...] }[]`, outlines of whole segments as fractions of the frame, used when a dataset supplies polygons. They are the dataset's own labels, shown as such.
  - `pins` is `{ at, text }[]`, on-image callouts such as a lesion, text 90 characters or fewer, only where unambiguous
  - `notes` is one or two sentences "About this case", only what the source states
  - `source` is `{ author, license, licenseUrl, url, attribution, modified }`

## What the app builds from this
One screen in the echo and CT viewer design. The sidebar groups cases by kind. The stage shows the media with overlays. The panel has tabs for the case, the segment diagram with the projection's best-seen segments highlighted, and the credits. The segment diagram is an original drawing, not a copy of any published figure.
