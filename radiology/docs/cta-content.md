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
- CathCase `{ id, kind, projection?, angles?, title, summary, src, poster, fps?, durationSec?, width, height, markers, regions?, pins?, notes?, source }`
  - `kind` is angio-clip, angio-still, ivus-clip or ivus-still
  - `angles` is `{ primary: { side, angle }, secondary: { direction, angle } }`, the real angles the source states for this image. The shapes are the Projection ones, so side is LAO, RAO or AP, direction is cranial, caudal or none, and angle is 0 to 90 and may have decimals. An AP side or a direction of none takes angle 0. Leave it out unless the source gives numbers. A caption that only names a view sets `projection` and no `angles`.
  - `projection` is a ProjectionId, present when the source names the view or states angles near a listed one. When `angles` is present, the view must be within 15 degrees of the stated angles on both axes, which is the C-arm picker's tolerance, measured from the listed view's typical angle. Where no listed view is that near, leave `projection` out and let `angles` carry the information.
  - Signs. A source that stores DICOM angles has the primary angle positive toward LAO and negative toward RAO, and the secondary angle positive toward cranial and negative toward caudal. `side` and `direction` carry the sign, so `angle` is never negative. CARDIAG says its angles are compliant with the DICOM standard and its record does not restate the signs.
  - `markers` is `{ segment, at: [x, y], r }[]` placing SYNTAX segments on the image. `r` is a fraction of frame width.
  - `regions` is `{ segment, polygon: [[x, y], ...] }[]`, outlines of whole segments as fractions of the frame, used when a dataset supplies polygons. They are the dataset's own labels, shown as such.
  - `pins` is `{ at, text }[]`, on-image callouts such as a lesion, text 90 characters or fewer, only where unambiguous
  - `notes` is one or two sentences "About this case", only what the source states
  - `source` is `{ author, license, licenseUrl, url, attribution, modified }`

## What the app builds from this
One screen in the echo and CT viewer design. The sidebar puts cases that state their view (`angles` or `projection`) in a first group, "Angiography with stated projection", then groups the rest by kind, and its second line shows the stated angles or else the named view. The Overview tab states the angles and the nearest listed view, and the Projections tab can send the C-arm picker to the case's exact angles. The stage shows the media with overlays. The panel has tabs for the case, the segment diagram with the projection's best-seen segments highlighted, and the credits. The segment diagram is an original drawing, not a copy of any published figure.
