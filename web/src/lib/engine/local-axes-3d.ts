// Local coordinate axes for 3D elements.
// Used by Three.js renderers, solver-service, and solver-detailed-3d.

import type { SolverNode3D } from './types-3d';
import { t } from '../i18n';

// ─── Local Axes ──────────────────────────────────────────────────

export interface LocalAxes3D {
  ex: [number, number, number];  // local X (element axis, I→J)
  ey: [number, number, number];  // local Y
  ez: [number, number, number];  // local Z
  L: number;                     // element length
}

/** Global up (Z) — the auto-orient reference: local z aligns with up. */
export const AUTO_ORIENT_UP_REFERENCE: [number, number, number] = [0, 0, 1];
/** Stable horizontal fallback (global X) for near-vertical (column) members. */
export const AUTO_ORIENT_VERTICAL_REFERENCE: [number, number, number] = [1, 0, 0];

/**
 * Compute local coordinate system for a 3D element.
 *
 * Canonical Z-up convention (corrected — no legacy mode):
 * - ex = normalize(J - I) — element axis.
 * - local z = global up (Z) projected perpendicular to ex (Gram–Schmidt), so
 *   the section depth (h, along local z) points "up" for any horizontal-plan
 *   member regardless of its plan angle.
 * - ey = ez × ex (right-handed: ex × ey = ez).
 * Consequence: a vertical (global-Z) gravity load on any horizontal beam — along
 * X, Y, a diagonal, or any 360° plan rotation — bends consistently about local y
 * (My is the main vertical bending moment), never flipping to Mz by orientation.
 * Inclined members: vertical load splits into axial (along ex) + transverse along
 * local z, bending primarily My. Near-vertical members fall back to a stable
 * horizontal reference (global X) to avoid degeneracy.
 *
 * Cardinal examples:
 *   +X bar: ex=(1,0,0),  ey=(0,1,0),   ez=(0,0,1)
 *   +Y bar: ex=(0,1,0),  ey=(−1,0,0),  ez=(0,0,1)
 *   +Z col: ex=(0,0,1),  ey=(0,−1,0),  ez=(1,0,0)
 *
 * Optional overrides:
 * - localY: explicit ey reference vector (overrides auto-orient)
 * - rollAngle: rotation of ey/ez around ex in degrees
 */
export function computeLocalAxes3D(
  nodeI: SolverNode3D, nodeJ: SolverNode3D,
  localY?: { x: number; y: number; z: number },
  rollAngle?: number,
  leftHand?: boolean,
): LocalAxes3D {
  const dx = nodeJ.x - nodeI.x;
  const dy = nodeJ.y - nodeI.y;
  const dz = nodeJ.z - nodeI.z;
  const L = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (L < 1e-10) {
    throw new Error(t('solver.elemZeroLength3D').replace('{coordI}', `(${nodeI.x},${nodeI.y},${nodeI.z})`).replace('{coordJ}', `(${nodeJ.x},${nodeJ.y},${nodeJ.z})`));
  }

  const ex: [number, number, number] = [dx / L, dy / L, dz / L];

  let ey: [number, number, number];
  let ez: [number, number, number];

  if (localY) {
    // Explicit orientation: use localY as ey reference
    const ref: [number, number, number] = [localY.x, localY.y, localY.z];
    // ez = normalize(ex × ref)
    let ezx = ex[1] * ref[2] - ex[2] * ref[1];
    let ezy = ex[2] * ref[0] - ex[0] * ref[2];
    let ezz = ex[0] * ref[1] - ex[1] * ref[0];
    const ezLen = Math.sqrt(ezx * ezx + ezy * ezy + ezz * ezz);
    if (ezLen < 1e-10) {
      throw new Error(t('solver.localYParallel'));
    }
    ezx /= ezLen; ezy /= ezLen; ezz /= ezLen;
    ez = [ezx, ezy, ezz];
    // ey = ez × ex
    ey = [
      ezy * ex[2] - ezz * ex[1],
      ezz * ex[0] - ezx * ex[2],
      ezx * ex[1] - ezy * ex[0],
    ];
  } else {
    // Canonical Z-up auto-orient: ez = global up projected ⊥ ex (Gram–Schmidt);
    // ey = ez × ex. Near-vertical members (up ∥ ex) use a horizontal fallback.
    const up = AUTO_ORIENT_UP_REFERENCE;
    const dotUp = ex[0] * up[0] + ex[1] * up[1] + ex[2] * up[2];
    let ezRaw: [number, number, number];
    if (Math.abs(dotUp) > 0.999) {
      const refH = AUTO_ORIENT_VERTICAL_REFERENCE; // global X, ⊥ to a Z-aligned member
      const dotH = ex[0] * refH[0] + ex[1] * refH[1] + ex[2] * refH[2];
      ezRaw = [refH[0] - dotH * ex[0], refH[1] - dotH * ex[1], refH[2] - dotH * ex[2]];
    } else {
      ezRaw = [up[0] - dotUp * ex[0], up[1] - dotUp * ex[1], up[2] - dotUp * ex[2]];
    }
    const ezLen = Math.sqrt(ezRaw[0] * ezRaw[0] + ezRaw[1] * ezRaw[1] + ezRaw[2] * ezRaw[2]);
    if (ezLen < 1e-10) {
      throw new Error(t('solver.localAxesError'));
    }
    ez = [ezRaw[0] / ezLen, ezRaw[1] / ezLen, ezRaw[2] / ezLen];

    // ey = ez × ex (guaranteed orthogonal, right-handed)
    ey = [
      ez[1] * ex[2] - ez[2] * ex[1],
      ez[2] * ex[0] - ez[0] * ex[2],
      ez[0] * ex[1] - ez[1] * ex[0],
    ];
  }

  // Apply roll angle (rotation of ey/ez around ex)
  if (rollAngle !== undefined && rollAngle !== 0 && Math.abs(rollAngle) > 1e-10) {
    const rad = rollAngle * Math.PI / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const newEy: [number, number, number] = [
      c * ey[0] + s * ez[0],
      c * ey[1] + s * ez[1],
      c * ey[2] + s * ez[2],
    ];
    const newEz: [number, number, number] = [
      -s * ey[0] + c * ez[0],
      -s * ey[1] + c * ez[1],
      -s * ey[2] + c * ez[2],
    ];
    ey = newEy;
    ez = newEz;
  }

  // Terna izquierda (left-hand convention): negate ey to produce det([ex,ey,ez]) = -1
  if (leftHand) {
    ey = [-ey[0], -ey[1], -ey[2]];
  }

  return { ex, ey, ez, L };
}
