# Viewer content schema
Reference for the CT and MRI viewer in `viewer/`. The validator in `viewer/` enforces the integrity and license rules and its test runs them over the real files. Run `node --test radiology/` after every content change.

IDs are kebab-case strings, unique within their table. Image coordinates are fractions of the plane image, x from the left and y from the top.

## Orientation, fixed everywhere
Volumes are stored in LPS voxel order. Voxel x increases toward the patient's left, y toward posterior, z toward superior. The packer tool reorients every source into this order, so the viewer never guesses.
- Axial shows slice z. Screen x is voxel x, screen y is voxel y. Patient's right is on the viewer's left, anterior is at the top.
- Coronal shows slice y. Screen x is voxel x, screen y runs from superior at the top. Patient's right is on the viewer's left.
- Sagittal shows slice x. Screen x is voxel y, so anterior is on the left and posterior on the right. Superior is at the top.
- Orientation letters R, L, A, P, S, I are drawn on every plane from this rule, never typed per case.
- Values. CT is int16 Hounsfield units. MR is int16 original intensities. Labels are uint8, 0 is background.

## Volume files
A volume is a folder. `vol.json` is `{ dtype, dims: [nx, ny, nz], spacing: [sx, sy, sz], chunkSlices, chunks: [{ file, z0, z1 }] }`, spacing in millimetres. Each chunk file is the gzip of raw little-endian voxels for slices z0 up to z1, x fastest then y then z. The viewer loads chunks outward from the middle slice so the first image appears after one small download.

## Tables
| file | holds |
|---|---|
| `data/cases/manifest.json` | `Case[]` |

## Shapes
- Case `{ id, modality, region, title, summary, vignette?, series, labels?, findings, source }`
  - `modality` is CT or MR
  - `region` is head, chest, abdomen, pelvis, spine, musculoskeletal, cardiac or vascular
  - `vignette` is one to three sentences of clinical context shown before the findings
  - all series and the labels share one voxel grid
  - `source` is `{ author, license, licenseUrl, url, attribution, modified, short? }`, license rules as in `echo-content.md`. `short` is the dataset's short name, for example TotalSegmentator. The short credit over the first viewport reads "short, license", and falls back to the author's name when `short` is missing.
- Series `{ id, name, url, windows, defaultWindow }`
  - `url` is the volume folder, relative to the manifest
  - `windows` is `{ name, center, width }[]`, for example Brain 40 and 80, Subdural 75 and 215, Lung -600 and 1500
  - `defaultWindow` names one of them. MR series use a window computed from the data when `windows` is empty.
- LabelSet `{ url, names, centroids }`
  - `url` is a uint8 volume folder
  - `names` maps a label id string to a structure name
  - `centroids` maps a label id string to `[x, y, z]` voxel coordinates, so the viewer can jump to a structure
- Finding `{ id, title, text, plane, index, at, series?, window? }`. The finding jumps to slice `index` of `plane` (axial, coronal or sagittal), marks the point `at`, and switches to the named series and window when present. `text` is one to three plain sentences describing only what is visible.

## What the app builds from this
One screen. The left sidebar lists every case grouped by region, and the series of the open case as thumbnails. The grid opens in 2 by 2 and fills its four viewports from the series, the voxel spacing and whether the case has labels, as `viewer/CLAUDE.md` says. Findings become "Show me" buttons that open the right viewport, plane and slice. Labels give a hover name under the cursor, a list of structures, and a colour overlay per viewport. The Credits tab shows the full `source`. Test mode hides every overlay, name and note.
