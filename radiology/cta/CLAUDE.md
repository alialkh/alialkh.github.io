# cta
Purpose: guided CT angiogram walkthrough. Each step sets slice, window and zoom, highlights a vessel, shows a caption, and some steps ask the student to click a vessel.
Input: a Case with `labels` and `tour` in its manifest   Output: a tour page built on the `viewer` component and the `core` tour engine.
Done when: one full CTA case plays end to end, quiz steps score, and no step needs code beyond the manifest.
Gotchas:
- Use datasets that already ship vessel segmentations. Run a segmentation model only if a chosen dataset has none.
- Teaching content is the long pole. Steps are data in the manifest and need a medical accuracy review before publishing.
See: `../data/INDEX.md` for the Step shape.
