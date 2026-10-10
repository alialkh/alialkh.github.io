# data index
Bulk files. Do not open them. Read this index and the per-case `manifest.json`.

Nothing added yet. Add a row to the table in the same change as each case or clip.

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
