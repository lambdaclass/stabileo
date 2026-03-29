/**
 * Central plane projection helpers for 3D→2D workflow.
 *
 * When a 3D model is viewed/analyzed in 2D mode with a selected drawing plane
 * (XY, XZ, YZ), all coordinate mappings flow through these helpers:
 *
 * - forward: 3D → 2D (for rendering, hit-testing, solver input)
 * - inverse: 2D → 3D (for editing, node creation, drag back-projection)
 *
 * The 2D convention is always: first axis = horizontal, second axis = vertical.
 *   XY: x→horizontal, y→vertical  (default, classic 2D)
 *   XZ: x→horizontal, z→vertical  (structural frame convention)
 *   YZ: y→horizontal, z→vertical
 */

export type DrawPlane = 'xy' | 'xz' | 'yz';

/** Project a 3D point to 2D coordinates in the selected plane. */
export function to2D(plane: DrawPlane, x: number, y: number, z: number): { x: number; y: number } {
  switch (plane) {
    case 'xz': return { x, y: z };
    case 'yz': return { x: y, y: z };
    default:   return { x, y };
  }
}

/** Back-project a 2D point to 3D, keeping the off-plane coordinate fixed. */
export function to3D(plane: DrawPlane, u: number, v: number, original: { x: number; y: number; z?: number }): { x: number; y: number; z: number } {
  switch (plane) {
    case 'xz': return { x: u, y: original.y, z: v };
    case 'yz': return { x: original.x, y: u, z: v };
    default:   return { x: u, y: v, z: original.z ?? 0 };
  }
}

/** Project a node-like object to 2D. Returns a new object with projected x/y. */
export function projectNode<T extends { x: number; y: number; z?: number }>(plane: DrawPlane, node: T): T {
  const p = to2D(plane, node.x, node.y, node.z ?? 0);
  return { ...node, x: p.x, y: p.y };
}

/**
 * Remap a 2D-convention nodal load (fx, fy with fy=vertical) to 3D components
 * so the 2D solver receives loads in the correct orientation.
 *
 * In 2D solver convention: fx = horizontal force, fy = vertical force (gravity direction).
 * When the drawing plane is XZ, the 2D "vertical" maps to the 3D Z axis.
 */
export function remapNodalLoad2D(plane: DrawPlane, fx3d: number, fy3d: number, fz3d: number): { fx: number; fy: number } {
  switch (plane) {
    case 'xz': return { fx: fx3d, fy: fz3d };
    case 'yz': return { fx: fy3d, fy: fz3d };
    default:   return { fx: fx3d, fy: fy3d };
  }
}

/**
 * Remap a 3D moment about each axis to the single 2D rotation (about the
 * out-of-plane axis).
 *   XY plane → rotation about Z
 *   XZ plane → rotation about Y (sign flip: right-hand rule)
 *   YZ plane → rotation about X
 */
export function remapMoment2D(plane: DrawPlane, mx: number, my: number, mz: number): number {
  switch (plane) {
    case 'xz': return -my;  // RH rule: XZ plane, out-of-plane = -Y
    case 'yz': return mx;
    default:   return mz;
  }
}

/**
 * Map 2D solver displacement results back to 3D coordinates.
 * 2D solver returns (ux, uy, rz) where uy = vertical displacement.
 */
export function remapDisplacement3D(plane: DrawPlane, ux2d: number, uy2d: number, rz2d: number): { ux: number; uy: number; uz: number; ry: number } {
  switch (plane) {
    case 'xz': return { ux: ux2d, uy: 0, uz: uy2d, ry: -rz2d };
    case 'yz': return { ux: 0, uy: ux2d, uz: uy2d, ry: rz2d };
    default:   return { ux: ux2d, uy: uy2d, uz: 0, ry: rz2d };
  }
}
