# POCUS content schema
Reference for the simulator in `pocus/`. The tests in `pocus/` enforce it: `node --test radiology/`.

## Patient parameters
`DEFAULTS` in `pocus/patient.js` lists every parameter the anatomy reads. A case overrides some of them.

| parameter | unit | meaning |
|---|---|---|
| `habitus` | 0 to 1 | body size, fat in the wall. The back stays on the table. |
| `ef`, `lvDil`, `rvDil` | ratio | ejection fraction, left and right ventricle size against normal |
| `ivcDiam`, `ivcCollapse` | mm, 0 to 1 | largest IVC diameter and the fraction lost at the end of a sniff |
| `bladder` | mL | bladder volume |
| `aaa` | mm | extra radius of the infrarenal aorta |
| `hydro`, `stones` | 0 to 1 | dilated renal collecting system, gallstones |
| `fluidRUQ`, `fluidLUQ`, `fluidPelvis`, `ascites` | mm | free fluid thickness |
| `pericardial`, `pleuralR`, `pleuralL` | mm | effusions |
| `ptxR`, `ptxL` | mm | air between lung and chest wall |

Moving parameters (`breath`, `sys`, `atria`, `mv`, `tv`, `av`, `pulse`, `peri`) are set every frame by `animate()` in `motion.js` and are not part of a case.

## Case (`SCENARIOS` in `scenarios.js`)
`{ id, title, level, story, params, vitals: { hr, rr }, lung?: { blines }, findings, teach }`
- `story` is the clinical presentation and never names the diagnosis in the first sentence the student reads before scanning.
- `findings` are ids for the report, `teach` is a list of plain sentences shown after the exam.
- Every key of `params` must exist in `DEFAULTS` (tested).

## Window (`WINDOW_SPECS` in `windows.js`)
`{ id, name, short, group, probe, preset, depth, where, look, need, extra, search, question, truth }`
- `need`: structure id to the mm² of image that must show it. Each need counts up to 100 percent of its area, and a saved image counts as this window when the average over its needs reaches 85 percent. Needs below 85 percent are listed as missing in the feedback.
- `extra`: structures looked for but not required.
- `search`: where `tools/make-windows.mjs` looks (side of the body, positions along it, probe angles).
- `prior`: pulls the search toward the orientation a window should have, written in the heart's frame (`hX` long axis, `hY` septum to lateral wall, `hZ` normal to the four chamber plane) or as a world vector. `role` is the probe axis it applies to (`h` elevation, `n` beam, `e` screen right) and `w` the weight.
- `aim` (heart windows): the textbook plane as a target point in the heart's frame, a beam direction `n` and the direction `s` that should be screen right. `tools/aim.mjs` turns it into probe poses, which start the search where a sonographer would. `centred` asks the search to put the needed chambers evenly either side of the middle of the sector.
- `truth(P, lung)` says whether the view reads positive for a case, and so what the right answer to `question` is.
- Poses are in `windows-poses.js`, written by the tool. Never edit that file by hand. `windows.test.js` checks that every pose still shows its needs, and that the abnormal case shows its extras.

## Structures
`STRUCTURES` in `patient.js` names every structure by prefix of the shape names (`liver-r`, `kidney-R` and so on). The image shows a structure when a scan line reaches it without crossing bone, aerated lung or gas first (`visibility.js`).

## Anatomy table
A shape is `{ kind, name, tissue, ... }` with kinds `ell` (ellipsoid), `cap` (capsule or tapered tube), `box`, `band` (a layer at a depth under the skin), `ribs`, `vert` (repeated along the spine), `plane`, `cage` (inside of the rib cage). Fields can be functions of the parameters. Entries are painted in order, later over earlier, inside groups that carry a bounding sphere for speed. `hidden` shapes are only used as clips. `active` switches a shape off when its disease is absent. Tissues and their acoustic numbers are in `tissues.js` with the sources named there.
