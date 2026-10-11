# data index
Bulk files. Do not open them. Read this index and the `manifest.json` files.

Add a row to the table in the same change as each case or clip.

## Layout
- `cases/manifest.json` (Case[]) plus one folder per volume, `cases/<case-id>/<series-id>/` and `cases/<case-id>/labels/`, each holding `vol.json` and gzip chunks `c0000.gz` and so on
- `clips/manifest.json` plus `clips/<clip-id>.mp4`
- `cath/manifest.json` (CathCase[]) plus, beside it, `<id>.jpg` and `<id>-thumb.jpg` per still, `<id>.mp4` and `<id>.jpg` per clip

## Shapes
- Case, Series, Label set and Finding: see `../docs/viewer-content.md`. All series and the labels of a case share one grid.
- Clip: see `../docs/echo-content.md`
- CathCase: see `../docs/cta-content.md`

## Ingest notes for CT and MRI
- Convert with `../tools/to-lps.py`, pack with `../tools/pack-volume.mjs`. Chunks hold whole slices. Pick `--chunk-slices` so one chunk is about 0.3 to 0.5 MB gzipped, because the loader pulls three at once and the first image waits for them. That is 1 for 512 by 512 CT, 4 for 256 by 256 CT, 6 to 16 for brain MRI and 32 for the spine.
- Orientation is checked on the anatomy of the packed volume, never on the header alone. MR brain and spine have no left-right anatomy to check, so there left and right rest on the header.
- Series of one case that were acquired on different grids (OpenNeuro T1w and T2w, UPENN-GBM) are resampled onto the first series' grid with the files' own geometry before packing.
- Chest CT is reduced in plane by `--max-size 256` (2 by 2 averaging) when 512 would pass the size budget, since `to-lps.py` shrinks by whole factors only.
- MSD Task02 Heart: the NIfTI header does not match the anatomy. The case was rebuilt with direction cosines taken from the anatomy (file axes run anterior, superior, patient's right).
- UPENN-GBM: a box in front of the eyes (first 40 voxels from the front, below voxel 85 from the bottom) is zero in all four series to remove the eyelid and nose contour.
- FUMPE: the MATLAB mask is `Mask[row, column, slice]` and lines up with the CT as `[slice, row, column]` with no flips, found by testing all 16 flips and transposes against the CT.
- HCC-TACE-Seg: the 172-image series the DICOM-SEG references holds two acquisitions on the same x, y and 2.5 mm z positions (one of 77 slices, one of 95), and the SEG's per-slice references pick images from both. Both are kept as two series on the 77 shared positions, reduced to 256 in plane because one 512 series packs to about 20 MB. The SEG frames are bit-packed and are placed by the position of the image each frame references. The four segments do not overlap, so one uint8 volume holds them under the SEG's own segment numbers (Liver, Mass, Portal vein, Abdominal aorta). The labels fit neither acquisition exactly, as if drawn on a breath-hold state between them. The liver label fits the later acquisition and runs into the lung at the dome on the earlier one. The mass label sits 3 to 5 slices (about 8 to 12 mm) high on the earlier acquisition, measured at the two ends of the mass, and about 3 slices low on the later one, measured at its lower end. The finding texts say so.
- Lung-PET-CT-Dx A0020: the 138-image '5mm Lung SS50' series is three acquisitions of the same 46 positions, 5 mm apart. The annotation XML names slices in that series and in its '5mm Stnd SS50' sibling, one box per slice with the object name a. The first acquisition of the Lung series is kept. Its 7 annotated slices are indices 26 to 32 and the finding sits on index 29.

## Ingest notes for the cath lab
- Encode with `../tools/add-cath.mjs`. It refuses anything the validator in `../cta/content.js` rejects and writes nothing in that case.
- ARCADE: the COCO category id is an index, not the segment number, so the category name is the key and maps to `seg-<name>`. A name the segment table lacks is dropped and reported. Polygons are simplified to 0.7 px and stored as fractions of the 512 by 512 frame. The dataset gives no projection, so no case names one.
- CADICA: frames are PNGs, assembled at 10 fps (the rate the dataset states). Lesion boxes exist on key frames only and drift between frames, so a pin goes in only where a box lines up with a visible narrowing in the frames checked. One pin of 5 clips met that test. The band names (p0_20 to p90_98) are not defined in the dataset files and are read as percent ranges.
- IVUS: the source video is stretched sideways by about 4:3. The 1 mm ticks are 58 px apart vertically and 77.5 px horizontally, so the width is scaled by 0.75 (`--stretch 0.75`) and the cross-section comes out round. Encoded at CRF 30, because speckle makes IVUS expensive. Audio is dropped.
- CARDIAG: 12 stills out of the 645 samples of `CARDIAG.zip` (4.6 GB, read by HTTP Range). Each sample holds `img.png`, one mask per segment named after the SYNTAX segment (`01.png` is segment 1, `16a.png` is 16a) and `metadata.json` with the primary and secondary angle as signed DICOM numbers. The masks were turned into a COCO file with a throwaway script that is not in the repo (OpenCV `findContours`, outer contours of at least 4 px, one category per mask named by its segment). Then `add-cath.mjs --coco` mapped the names to `seg-<name>` and simplified the polygons. The angles go in with `--dicom-angles=<primary>,<secondary>` (the `=` keeps a minus sign from being read as an option). The tool stores them as `angles` and sets `projection` only when a listed view of the image's system is within 15 degrees on both axes. The system comes from the outlines, RCA segments meaning the right coronary system. Two images have no listed view that near and keep `angles` alone. Outlines were kept only where the polygons sit on dark vessels in an overlay and in a grey-level test at zero shift of the mask. One candidate (sample 214) failed it, the masks sat off the vessels, and was dropped.
- Arnold et al. 2008 clips (S1, S2, S3, S5): the Commons captions name the projection and give no angles, so they set `projection` and no `angles`. Kuno et al. f1 and f2 and Milici et al. f4 were fetched and not used (see `../docs/LICENSES.md`).

## Budget
GitHub Pages guidance is about 1 GB per site and 100 MB per file. Keep this folder under about 300 MB and move overflow to external static storage. The CT and MRI cases take about 128 MB so far and the cath lab media about 13 MB.

| id | kind | size | license |
|---|---|---|---|
| plax-normal-1 | echo clip, plax, normal | 148 KB | CC BY-SA 3.0 |
| psax-pm-normal-1 | echo clip, psax-pm, normal | 249 KB | CC BY-SA 3.0 |
| a4c-normal-1 | echo clip, a4c, normal | 153 KB | CC BY-SA 3.0 |
| a5c-normal-1 | echo clip, a5c, normal | 187 KB | CC BY-SA 3.0 |
| a2c-normal-1 | echo clip, a2c, normal | 270 KB | CC BY-SA 3.0 |
| a3c-normal-1 | echo clip, a3c, normal | 312 KB | CC BY-SA 3.0 |
| sc-4c-normal-1 | echo clip, sc-4c, normal | 126 KB | CC BY-SA 3.0 |
| psax-av-aortic-regurgitation-2 | echo clip, psax-av, aortic-regurgitation | 326 KB | CC BY-SA 3.0 |
| plax-dilated-cardiomyopathy-1 | echo clip, plax, dilated-cardiomyopathy | 176 KB | CC BY-SA 3.0 |
| plax-hypertrophic-cardiomyopathy-1 | echo clip, plax, hypertrophic-cardiomyopathy | 154 KB | CC BY-SA 3.0 |
| plax-hypertrophic-cardiomyopathy-2 | echo clip, plax, hypertrophic-cardiomyopathy | 565 KB | CC BY 3.0 |
| plax-mitral-regurgitation-1 | echo clip, plax, mitral-regurgitation | 145 KB | CC BY-SA 3.0 |
| a4c-mitral-regurgitation-1 | echo clip, a4c, mitral-regurgitation | 134 KB | CC BY-SA 3.0 |
| plax-mitral-stenosis-1 | echo clip, plax, mitral-stenosis | 158 KB | CC BY-SA 3.0 |
| plax-aortic-regurgitation-1 | echo clip, plax, aortic-regurgitation | 161 KB | CC BY-SA 3.0 |
| psax-av-aortic-regurgitation-1 | echo clip, psax-av, aortic-regurgitation | 216 KB | CC BY-SA 3.0 |
| a4c-regional-wall-motion-abnormality-1 | echo clip, a4c, regional-wall-motion-abnormality | 440 KB | CC BY 2.0 |
| a4c-regional-wall-motion-abnormality-2 | echo clip, a4c, regional-wall-motion-abnormality | 169 KB | CC BY-SA 3.0 |
| a4c-takotsubo-1 | echo clip, a4c, takotsubo | 279 KB | CC BY 3.0 |
| a4c-takotsubo-2 | echo clip, a4c, takotsubo | 135 KB | CC BY-SA 3.0 |
| totalseg-s0289 | CT case, head and neck CT angiogram, 48 labels | 5.8 MB | CC BY 4.0 |
| openneuro-ds000221-sub010003 | MR case, brain, T1w and T2w | 19.1 MB | CC0 1.0 |
| upenngbm-00001 | MR case, brain, T1, T1 post-contrast, T2 and FLAIR | 27.1 MB | CC BY 4.0 |
| covidctmd-p148 | CT case, chest, COVID-19 | 7.9 MB | CC0 1.0 |
| lungdx-a0020 | CT case, chest, lung adenocarcinoma, annotated tumour box | 12.5 MB | CC BY 4.0 |
| fumpe-pat034 | CT case, chest, pulmonary angiogram, embolism mask | 12.2 MB | CC BY 4.0 |
| msd-pancreas148 | CT case, abdomen, pancreas and cancer labels | 10.7 MB | CC BY-SA 4.0 |
| hcctace-hcc010 | CT case, abdomen, liver, two acquisitions, 4 labels | 10.4 MB | CC BY 4.0 |
| spider-patient1 | MR case, spine, T1 and T2, 15 labels | 11.8 MB | CC BY 4.0 |
| msd-la005 | MR case, cardiac, left atrium label | 10.8 MB | CC BY-SA 4.0 |
| arcade-12 | angiogram still, 4 outlined segments | 34 KB | CC0 1.0 |
| arcade-100 | angiogram still, 5 outlined segments | 42 KB | CC0 1.0 |
| arcade-145 | angiogram still, 3 outlined segments | 17 KB | CC0 1.0 |
| arcade-14 | angiogram still, 8 outlined segments | 36 KB | CC0 1.0 |
| arcade-10 | angiogram still, 3 outlined segments | 26 KB | CC0 1.0 |
| arcade-102 | angiogram still, 6 outlined segments | 43 KB | CC0 1.0 |
| arcade-119 | angiogram still, 7 outlined segments | 37 KB | CC0 1.0 |
| arcade-1 | angiogram still, 6 outlined segments | 39 KB | CC0 1.0 |
| arcade-33 | angiogram still, 11 outlined segments | 38 KB | CC0 1.0 |
| arcade-154 | angiogram still, 8 outlined segments | 37 KB | CC0 1.0 |
| cadica-p12-v1 | angiogram cine, 1 lesion pin | 465 KB | CC BY 4.0 |
| cadica-p40-v1 | angiogram cine | 390 KB | CC BY 4.0 |
| cadica-p40-v7 | angiogram cine | 347 KB | CC BY 4.0 |
| cadica-p12-v7 | angiogram cine | 769 KB | CC BY 4.0 |
| cadica-p40-v11 | angiogram cine | 337 KB | CC BY 4.0 |
| ivus-scad-haematoma | IVUS clip, square pixels | 8.3 MB | CC BY 2.0 |
| cardiag-629 | angiogram still, 10 outlined segments, stated LAO 43.2, cranial 20.8 | 15 KB | CC BY 4.0 |
| cardiag-245 | angiogram still, 8 outlined segments, stated LAO 44.1, caudal 28 | 17 KB | CC BY 4.0 |
| cardiag-397 | angiogram still, 8 outlined segments, stated RAO 26.5, cranial 32.7 | 16 KB | CC BY 4.0 |
| cardiag-433 | angiogram still, 11 outlined segments, stated RAO 26.6, caudal 25.3 | 14 KB | CC BY 4.0 |
| cardiag-613 | angiogram still, 9 outlined segments, stated AP, cranial 39.2 | 17 KB | CC BY 4.0 |
| cardiag-305 | angiogram still, 8 outlined segments, stated AP, caudal 29.5 | 17 KB | CC BY 4.0 |
| cardiag-197 | angiogram still, 6 outlined segments, stated RAO 29.9, cranial 0.4 | 13 KB | CC BY 4.0 |
| cardiag-060 | angiogram still, 6 outlined segments, stated LAO 45.5, caudal 0.1 | 15 KB | CC BY 4.0 |
| cardiag-000 | angiogram still, 7 outlined segments, stated RAO 2.7, cranial 28.7 | 14 KB | CC BY 4.0 |
| cardiag-039 | angiogram still, 6 outlined segments, stated LAO 89.4, caudal 3.4 | 15 KB | CC BY 4.0 |
| cardiag-213 | angiogram still, 5 outlined segments, stated RAO 29.3, cranial 28.5, no listed view near | 15 KB | CC BY 4.0 |
| cardiag-505 | angiogram still, 8 outlined segments, stated LAO 61.9, caudal 4.9, no listed view near | 15 KB | CC BY 4.0 |
| arnold-s1 | angiogram cine, caption names RAO caudal, no angles | 199 KB | CC BY 2.0 |
| arnold-s2 | angiogram cine, caption names RAO caudal, no angles | 157 KB | CC BY 2.0 |
| arnold-s3 | angiogram cine, caption names LAO, no angles | 342 KB | CC BY 2.0 |
| arnold-s5 | angiogram cine, caption names LAO, no angles | 433 KB | CC BY 2.0 |
