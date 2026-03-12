import type { LocalAxes3D } from '../engine/solver-3d';

/**
 * Apply visual axis convention for diagram rendering.
 * Terna izquierda: negate ey so positive diagrams flip to opposite side.
 * Terna derecha (default): keep ey as-is (solver already uses right-hand rule).
 */
export function applyAxisConvention(axes: LocalAxes3D, leftHand: boolean): LocalAxes3D {
  if (!leftHand) return axes;
  return {
    ...axes,
    ey: [-axes.ey[0], -axes.ey[1], -axes.ey[2]] as [number, number, number],
  };
}
