# data index
Bulk files. Do not open them. Read this index and the per-case `manifest.json`.

Add a row to the table in the same change as each case or clip.

## Layout
- `cases/<case-id>/manifest.json` plus chunked volume files
- `clips/manifest.json` plus `clips/<clip-id>.mp4`

## Shapes
- Case `{ id, modality, title, source: {dataset, license, url}, volume: {url, dims, spacing, dtype, lowres?}, labels?: {url, names}, tour?: Step[] }`
- Step `{ slice, window, zoom?, highlight?: labelName, caption, quiz?: {target: labelName} }`
- Clip see `../docs/echo-content.md`

## Budget
GitHub Pages guidance is about 1 GB per site and 100 MB per file. Keep this folder under about 300 MB and move overflow to external static storage.

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
| plax-pericardial-effusion-1 | echo clip, plax, pericardial-effusion | 156 KB | CC BY-SA 3.0 |
| plax-dilated-cardiomyopathy-1 | echo clip, plax, dilated-cardiomyopathy | 176 KB | CC BY-SA 3.0 |
| plax-hypertrophic-cardiomyopathy-1 | echo clip, plax, hypertrophic-cardiomyopathy | 154 KB | CC BY-SA 3.0 |
| plax-hypertrophic-cardiomyopathy-2 | echo clip, plax, hypertrophic-cardiomyopathy | 565 KB | CC BY 3.0 |
| a2c-hypertrophic-cardiomyopathy-1 | echo clip, a2c, hypertrophic-cardiomyopathy | 811 KB | CC BY 2.0 |
| plax-mitral-regurgitation-1 | echo clip, plax, mitral-regurgitation | 145 KB | CC BY-SA 3.0 |
| a4c-mitral-regurgitation-1 | echo clip, a4c, mitral-regurgitation | 134 KB | CC BY-SA 3.0 |
| plax-mitral-stenosis-1 | echo clip, plax, mitral-stenosis | 158 KB | CC BY-SA 3.0 |
| plax-aortic-regurgitation-1 | echo clip, plax, aortic-regurgitation | 161 KB | CC BY-SA 3.0 |
| psax-av-aortic-regurgitation-1 | echo clip, psax-av, aortic-regurgitation | 216 KB | CC BY-SA 3.0 |
| a4c-regional-wall-motion-abnormality-1 | echo clip, a4c, regional-wall-motion-abnormality | 440 KB | CC BY 2.0 |
| a4c-regional-wall-motion-abnormality-2 | echo clip, a4c, regional-wall-motion-abnormality | 169 KB | CC BY-SA 3.0 |
| a4c-takotsubo-1 | echo clip, a4c, takotsubo | 279 KB | CC BY 3.0 |
| a4c-takotsubo-2 | echo clip, a4c, takotsubo | 135 KB | CC BY-SA 3.0 |
