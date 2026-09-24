/**
 * IFC placements as rigid transforms, and a member's axis from its extrusion.
 *
 * IFC is Z-up, like this app, and a placement is a full frame — location, axis and reference
 * direction — nested under its parent's. The parser used to assume Y-up and swap the axes (a
 * column came in lying down) and to add only the locations up the chain, so any rotated
 * placement — every beam in a model that rotates its local frame, which is most of them — landed
 * on the wrong line.
 */

export type V3 = [number, number, number];
/** A rigid transform: columns of `r` are the local x, y, z axes in the parent; `t` the origin. */
export interface Frame { r: [V3, V3, V3]; t: V3 }

export const IDENTITY: Frame = { r: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] };

const norm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * An IfcAxis2Placement3D: Z is `axis` (default +Z); X is `refDirection` made orthogonal to it
 * (default +X, or +Y when +X is parallel to Z); Y completes a right-handed frame.
 */
export function axis2Placement3D(location: V3, axis?: V3, refDirection?: V3): Frame {
  const z = norm(axis ?? [0, 0, 1]);
  let x0: V3 = refDirection ?? [1, 0, 0];
  if (Math.abs(dot(norm(x0), z)) > 1 - 1e-9) x0 = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const d = dot(x0, z);
  const x = norm([x0[0] - d * z[0], x0[1] - d * z[1], x0[2] - d * z[2]]);
  const y = cross(z, x);
  return { r: [x, y, z], t: location };
}

/** A direction from a frame's local axes into its parent. */
export function rotate(f: Frame, v: V3): V3 {
  return [
    f.r[0][0] * v[0] + f.r[1][0] * v[1] + f.r[2][0] * v[2],
    f.r[0][1] * v[0] + f.r[1][1] * v[1] + f.r[2][1] * v[2],
    f.r[0][2] * v[0] + f.r[1][2] * v[1] + f.r[2][2] * v[2],
  ];
}

/** A point from a frame into its parent. */
export function apply(f: Frame, p: V3): V3 {
  const q = rotate(f, p);
  return [q[0] + f.t[0], q[1] + f.t[1], q[2] + f.t[2]];
}

/** `parent ∘ child`: the child frame expressed in the parent's parent. */
export function compose(parent: Frame, child: Frame): Frame {
  return { r: [rotate(parent, child.r[0]), rotate(parent, child.r[1]), rotate(parent, child.r[2])], t: apply(parent, child.t) };
}

/** A member's end points: the solid's origin, and that point pushed `depth` along its extrusion. */
export function extrusionAxis(world: Frame, extrudedDirection: V3, depth: number): { start: V3; end: V3 } {
  const start = apply(world, [0, 0, 0]);
  const d = norm(rotate(world, extrudedDirection));
  return { start, end: [start[0] + d[0] * depth, start[1] + d[1] * depth, start[2] + d[2] * depth] };
}
