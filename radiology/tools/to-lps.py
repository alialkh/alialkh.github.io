"""Turns a DICOM series folder or a NIfTI, NRRD or MHA file into <out>.raw plus <out>.json in LPS voxel order.

Voxel x increases toward the patient's left, y toward posterior, z toward superior, x fastest in the raw file.
Feed the result to pack-volume.mjs with --meta <out>.json.
"""
import argparse
import json
import math
import os
import sys

import numpy as np
import SimpleITK as sitk


def fail(message):
    print(f"to-lps: {message}", file=sys.stderr)
    sys.exit(1)


def read(path, series_uid):
    if not os.path.exists(path):
        fail(f"no such file or folder: {path}")
    if not os.path.isdir(path):
        return sitk.ReadImage(path)
    uids = sitk.ImageSeriesReader.GetGDCMSeriesIDs(path)
    if not uids:
        fail(f"no DICOM series found in {path}")
    if series_uid is None and len(uids) > 1:
        fail(f"{path} holds {len(uids)} DICOM series. Pick one with --series-uid:\n  " + "\n  ".join(uids))
    if series_uid is not None and series_uid not in uids:
        fail(f"series {series_uid} is not in {path}. It holds:\n  " + "\n  ".join(uids))
    reader = sitk.ImageSeriesReader()
    reader.SetFileNames(sitk.ImageSeriesReader.GetGDCMSeriesFileNames(path, series_uid or uids[0]))
    return reader.Execute()


def to_lps(img):
    if img.GetDimension() != 3 or img.GetNumberOfComponentsPerPixel() != 1:
        fail(f"expected a 3D single-channel volume, got {img.GetDimension()}D with {img.GetNumberOfComponentsPerPixel()} channels")
    # Checked against SimpleITK 2.5: "LPS" leaves an identity direction, with index axes increasing toward L, P and S.
    img = sitk.DICOMOrient(img, "LPS")
    tilt = max(math.degrees(math.acos(min(1.0, img.GetDirection()[4 * i]))) for i in range(3))
    if tilt > 0.5:
        # shortcut: an oblique source is snapped to the nearest axes, resample onto an LPS grid when one shows up.
        print(f"to-lps: warning, the source is oblique by up to {tilt:.1f} degrees and was snapped to the nearest axes", file=sys.stderr)
    return sitk.GetArrayFromImage(img), list(img.GetSpacing())


def crop_z(a, z_range):
    try:
        z0, z1 = (int(v) for v in z_range.split(":"))
    except ValueError:
        fail(f"--z-range must look like a:b, got {z_range}")
    if not 0 <= z0 < z1 <= a.shape[0]:
        fail(f"--z-range {z_range} is outside 0:{a.shape[0]}")
    return a[z0:z1]


def shrink(a, spacing, max_size, labels):
    nz, ny, nx = a.shape
    f = max(1, math.ceil(max(nx, ny) / max_size))
    if f == 1:
        return a, spacing
    ny2, nx2 = ny // f, nx // f
    if not ny2 or not nx2:
        fail(f"--max-size {max_size} would leave less than one voxel across {nx}x{ny}")
    if labels:
        a = a[:, f // 2::f, f // 2::f][:, :ny2, :nx2]
    else:
        a = a[:, :ny2 * f, :nx2 * f].reshape(nz, ny2, f, nx2, f).mean(axis=(2, 4), dtype=np.float32)
    return a, [spacing[0] * f, spacing[1] * f, spacing[2]]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("input", help="DICOM series folder, or a NIfTI, NRRD or MHA file")
    p.add_argument("--out", required=True, help="path prefix, writes <out>.raw and <out>.json")
    p.add_argument("--series-uid", help="which series to read when a DICOM folder holds several")
    p.add_argument("--max-size", type=int, help="shrink in plane by an integer factor until max(nx, ny) <= N")
    p.add_argument("--z-range", help="keep slices a up to b exclusive, counted after reorientation")
    p.add_argument("--labels", action="store_true", help="label volume: nearest neighbour, uint8, writes centroids")
    o = p.parse_args()
    if o.max_size is not None and o.max_size < 1:
        fail("--max-size must be at least 1")

    try:
        a, spacing = to_lps(read(o.input, o.series_uid))
    except RuntimeError as e:
        fail(f"could not read {o.input}: {str(e).strip().splitlines()[-1]}")
    if o.labels:
        if np.issubdtype(a.dtype, np.floating) and not np.array_equal(a, np.round(a)):
            fail("label values must be whole numbers")
        if a.min() < 0 or a.max() > 255:
            fail(f"label values must be 0 to 255, got {a.min()} to {a.max()}")
        a = a.astype(np.uint8)
    if o.z_range:
        a = crop_z(a, o.z_range)
    if o.max_size:
        a, spacing = shrink(a, spacing, o.max_size, o.labels)

    meta = {"dtype": "uint8" if o.labels else "int16", "dims": list(a.shape[::-1]), "spacing": [round(s, 6) for s in spacing]}
    if o.labels:
        meta["centroids"] = {}
        ids = np.unique(a)
        for v in ids[ids > 0]:
            z, y, x = np.nonzero(a == v)
            meta["centroids"][str(int(v))] = [round(float(c.mean()), 1) for c in (x, y, z)]
    else:
        a = np.rint(a) if np.issubdtype(a.dtype, np.floating) else a.astype(np.int32)
        clipped = int(np.count_nonzero(a < -32768) + np.count_nonzero(a > 32767))
        if clipped:
            print(f"to-lps: warning, {clipped} voxels were outside the int16 range and were clipped", file=sys.stderr)
        a = np.clip(a, -32768, 32767).astype("<i2")

    os.makedirs(os.path.dirname(os.path.abspath(o.out)), exist_ok=True)
    a.tofile(o.out + ".raw")  # tofile writes C order, and the [z, y, x] array in C order is x fastest
    with open(o.out + ".json", "w", encoding="utf8") as fh:
        fh.write(json.dumps(meta, indent=2) + "\n")
    nx, ny, nz = meta["dims"]
    print(f"Wrote {o.out}.raw and {o.out}.json: {nx}x{ny}x{nz} {meta['dtype']}, spacing {' x '.join(map(str, meta['spacing']))} mm.")


if __name__ == "__main__":
    main()
