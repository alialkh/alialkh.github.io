# pocus
Purpose: ultrasound simulator game. A virtual probe on a body, a simulated B-mode image from a labeled CT volume, real controls (depth, gain, TGC, frequency, focus, presets, probe type, freeze and cine, calipers), and E-FAST and RUSH scenarios with scoring.
Input: a labeled CT Case and scenario files   Output: a game page.
Done when: one FAST scenario is playable and scored, and depth, gain and probe orientation visibly change the image.
Gotchas:
- A WebGL2 shader samples an oblique plane from a 3D texture, then adds attenuation, reflection, shadowing and speckle. It is educational, not physically exact, and the UI says so.
- CT is static. Cardiac windows use real or scripted loops from `../echo`. Lung sliding and B-lines are procedural.
- Build last. It reuses the volume loader and labels, so viewer and cta come first.
See: `../viewer/CLAUDE.md`, `../data/INDEX.md`.
