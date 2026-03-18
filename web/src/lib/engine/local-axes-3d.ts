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

export const AUTO_ORIENT_NON_VERTICAL_REFERENCE: [number, number, number] = [0, 1, 0];
export const AUTO_ORIENT_VERTICAL_REFERENCE: [number, number, number] = [0, 0, 1];

/**
 * Compute local coordinate system for a 3D element.
 *
 * Product/runtime geometry is Z-up, but the 3D solver's historical local-load
 * convention still uses global Y as the preferred auto-orient reference for
 * non-vertical members. Keep this internal convention explicit here so future
 * gravity/local-load changes migrate together instead of drifting silently.
 *
 * Solver convention:
 * - ex = normalize(J - I) — element axis
 * - For non-vertical: ey_ref = global Y
 * - For vertical: ey_ref = global Z
 * - ez = ex × ey_ref, ey = ez × ex
 *
 * Cardinal examples:
 *   +X bar: ex=(1,0,0),  ey=(0,1,0),   ez=(0,0,1)
 *   −X bar: ex=(−1,0,0), ey=(0,1,0),   ez=(0,0,−1)
 *   +Z bar: ex=(0,0,1),  ey=(0,1,0),   ez=(−1,0,0)
 *   −Z bar: ex=(0,0,−1), ey=(0,1,0),   ez=(1,0,0)
 *   +Y bar: ex=(0,1,0),  ey=(0,0,1),   ez=(1,0,0)
 *   −Y bar: ex=(0,−1,0), ey=(0,0,−1),  ez=(1,0,0)
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
    // Solver-internal auto-orient convention:
    //   ey_ref = global Y for non-vertical, global Z for vertical
    //   ez = ex × ey_ref, ey = ez × ex
    const dotY = Math.abs(ex[1]); // |component along global Y|

    let eyRef: [number, number, number];
    if (dotY > 0.999) {
      eyRef = AUTO_ORIENT_VERTICAL_REFERENCE;
    } else {
      eyRef = AUTO_ORIENT_NON_VERTICAL_REFERENCE;
    }

    // ez = normalize(ex × eyRef)
    let ezx = ex[1] * eyRef[2] - ex[2] * eyRef[1];
    let ezy = ex[2] * eyRef[0] - ex[0] * eyRef[2];
    let ezz = ex[0] * eyRef[1] - ex[1] * eyRef[0];
    const ezLen = Math.sqrt(ezx * ezx + ezy * ezy + ezz * ezz);
    if (ezLen < 1e-10) {
      throw new Error(t('solver.localAxesError'));
    }
    ezx /= ezLen; ezy /= ezLen; ezz /= ezLen;
    ez = [ezx, ezy, ezz];

    // ey = ez × ex (guaranteed orthogonal)
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
