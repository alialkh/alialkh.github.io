# data index
Bulk files. Do not open them. Read this index and the `manifest.json` files.

Add a row to the table in the same change as each case or clip.

## Layout
- `cases/manifest.json` (Case[]) plus one folder per volume, `cases/<case-id>/<series-id>/` and `cases/<case-id>/labels/`, each holding `vol.json` and gzip chunks `c0000.gz` and so on
- `clips/manifest.json` plus `clips/<clip-id>.mp4`

## Shapes
- Case, Series, Label set and Finding: see `../docs/viewer-content.md`. All series and the labels of a case share one grid.
- Clip: see `../docs/echo-content.md`

## Ingest notes for CT and MRI
- Convert with `../tools/to-lps.py`, pack with `../tools/pack-volume.mjs`. Chunks hold whole slices. Pick `--chunk-slices` so one chunk is about 0.3 to 0.5 MB gzipped, because the loader pulls three at once and the first image waits for them. That is 1 for 512 by 512 CT, 4 for 256 by 256 CT, 6 to 16 for brain MRI and 32 for the spine.
- Orientation is checked on the anatomy of the packed volume, never on the header alone. MR brain and spine have no left-right anatomy to check, so there left and right rest on the header.
- Series of one case that were acquired on different grids (OpenNeuro T1w and T2w, UPENN-GBM) are resampled onto the first series' grid with the files' own geometry before packing.
- Chest CT is reduced in plane by `--max-size 256` (2 by 2 averaging) when 512 would pass the size budget, since `to-lps.py` shrinks by whole factors only.
- MSD Task02 Heart: the NIfTI header does not match the anatomy. The case was rebuilt with direction cosines taken from the anatomy (file axes run anterior, superior, patient's right).
- UPENN-GBM: a box in front of the eyes (first 40 voxels from the front, below voxel 85 from the bottom) is zero in all four series to remove the eyelid and nose contour.
- FUMPE: the MATLAB mask is `Mask[row, column, slice]` and lines up with the CT as `[slice, row, column]` with no flips, found by testing all 16 flips and transposes against the CT.

## Budget
GitHub Pages guidance is about 1 GB per site and 100 MB per file. Keep this folder under about 300 MB and move overflow to external static storage. The CT and MRI cases take about 115 MB so far.

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
| lungdx-a0020 | CT case, chest, lung adenocarcinoma | 4.3 MB | CC BY 4.0 |
| fumpe-pat034 | CT case, chest, pulmonary angiogram, embolism mask | 12.2 MB | CC BY 4.0 |
| msd-pancreas148 | CT case, abdomen, pancreas and cancer labels | 10.7 MB | CC BY-SA 4.0 |
| hcctace-hcc010 | CT case, abdomen, pre-contrast liver | 5.0 MB | CC BY 4.0 |
| spider-patient1 | MR case, spine, T1 and T2, 15 labels | 11.8 MB | CC BY 4.0 |
| msd-la005 | MR case, cardiac, left atrium label | 10.8 MB | CC BY-SA 4.0 |
