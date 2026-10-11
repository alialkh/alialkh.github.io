// Pure. Plane geometry and slice extraction for LPS volumes. The rules are in ../docs/viewer-content.md.
// Voxel x grows toward the patient's left, y toward posterior, z toward superior.
export const PLANES = ['axial', 'coronal', 'sagittal'];
export const PLANE_NAMES = { axial: 'Axial', coronal: 'Coronal', sagittal: 'Sagittal' };

const AXIS = { x: 0, y: 1, z: 2 };
// The negative end and the positive end of each voxel axis.
const ENDS = { x: ['R', 'L'], y: ['A', 'P'], z: ['I', 'S'] };
// Screen right (u) follows a voxel axis in every plane. Screen down (v) follows one too, sign -1 reversed.
// through is the scroll axis. The axial slice number counts from the head down, the way a stack is read, so its scroll position is reversed.
const GEOMETRY = {
  axial: { u: 'x', v: ['y', 1], through: 'z', headFirst: true },
  coronal: { u: 'x', v: ['z', -1], through: 'y', headFirst: false },
  sagittal: { u: 'y', v: ['z', -1], through: 'x', headFirst: false },
};

const throughAxis = plane => AXIS[GEOMETRY[plane].through];

export function planeInfo(plane, dims, spacing) {
  const { u, v: [va, vs], through } = GEOMETRY[plane];
  const width = dims[AXIS[u]];
  const height = dims[AXIS[va]];
  const du = spacing[AXIS[u]];
  const dv = spacing[AXIS[va]];
  return {
    plane, width, height, du, dv,
    widthMm: width * du, heightMm: height * dv,
    count: dims[AXIS[through]],
    letters: {
      left: ENDS[u][0], right: ENDS[u][1],
      top: ENDS[va][vs > 0 ? 0 : 1], bottom: ENDS[va][vs > 0 ? 1 : 0],
    },
  };
}

// Slice index along the scroll axis, and back. position 0 is the first slice a reader sees.
export const indexToPosition = (plane, index, count) => (GEOMETRY[plane].headFirst ? count - 1 - index : index);
export const positionToIndex = indexToPosition;

export const cursorIndex = (plane, cursor) => cursor[throughAxis(plane)];
export function withIndex(cursor, plane, index) {
  const next = [...cursor];
  next[throughAxis(plane)] = index;
  return next;
}

// out is reused when it is the right size, so scrolling allocates nothing.
export function extractSlice({ data, dims }, plane, index, out) {
  const { u, v: [va, vs], through } = GEOMETRY[plane];
  const stride = [1, dims[0], dims[0] * dims[1]];
  const w = dims[AXIS[u]];
  const h = dims[AXIS[va]];
  const du = stride[AXIS[u]];
  const dv = vs * stride[AXIS[va]];
  let base = index * stride[AXIS[through]];
  if (vs < 0) base += (h - 1) * stride[AXIS[va]];
  if (!out || out.length !== w * h) out = new data.constructor(w * h);
  for (let j = 0, o = 0; j < h; j++) {
    for (let i = 0, p = base + j * dv; i < w; i++, p += du) out[o++] = data[p];
  }
  return out;
}

// Image coordinates are continuous, in voxels, from the top left of the plane image.
export function voxelAt(plane, index, u, v, dims) {
  const { u: ua, v: [va, vs], through } = GEOMETRY[plane];
  const w = dims[AXIS[ua]];
  const h = dims[AXIS[va]];
  if (!(u >= 0 && u < w && v >= 0 && v < h)) return null;
  const voxel = [0, 0, 0];
  voxel[AXIS[ua]] = Math.floor(u);
  voxel[AXIS[va]] = vs > 0 ? Math.floor(v) : h - 1 - Math.floor(v);
  voxel[AXIS[through]] = index;
  return voxel;
}

// The centre of a voxel in image coordinates.
export function imagePoint(plane, voxel, dims) {
  const { u, v: [va, vs] } = GEOMETRY[plane];
  return [voxel[AXIS[u]] + 0.5, vs > 0 ? voxel[AXIS[va]] + 0.5 : dims[AXIS[va]] - voxel[AXIS[va]] - 0.5];
}

// A finding names a point as fractions of the plane image. The result is the voxel cursor for it.
export function findingCursor({ plane, index, at }, dims) {
  const { width, height } = planeInfo(plane, dims, [1, 1, 1]);
  // A fraction of exactly 1 is the far edge, which belongs to the last voxel.
  const inside = (f, n) => Math.min(f * n, n - 1e-6);
  return voxelAt(plane, index, inside(at[0], width), inside(at[1], height), dims);
}
