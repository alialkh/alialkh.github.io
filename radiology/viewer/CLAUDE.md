# viewer
Purpose: scroll CT and MRI volumes with window/level, axial/coronal/sagittal views, HU readout, distance tool and a MIP slab.
Input: a Case from `../data` through the `../core` volume loader   Output: an embeddable viewer component. cta and pocus reuse it.
Done when: a 256x256x200 case shows its first slice in about a second on a mid-range laptop and scrolling holds 60 fps.
Gotchas:
- Draw from typed arrays through a lookup table onto a canvas. No third-party viewer library until a feature needs one. 3D volume rendering is the likely trigger, and then Cornerstone3D vendored into `core/vendor/` is the first thing to try.
- Low-res volume first, full-res streamed after, so scrolling works immediately.
- MPR is index math on the loaded array, not a resample.
See: `../data/INDEX.md` for the Case shape.
