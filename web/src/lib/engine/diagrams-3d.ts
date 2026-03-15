// 3D Diagram Computation — Analytical equations
// Compute diagram values (My, Mz, Vy, Vz, N, Mx) along each 3D element
// using equilibrium equations with distributed and point loads.

import type { ElementForces3D } from './types-3d';

export type Diagram3DKind = 'momentY' | 'momentZ' | 'shearY' | 'shearZ' | 'axial' | 'torsion';

export interface DiagramPoint3D {
  /** Normalized position along element [0, 1] */
  t: number;
  /** Diagram value at this point (kN or kN·m) */
  value: number;
}

export interface ElementDiagram3D {
  elementId: number;
  points: DiagramPoint3D[];
  maxValue: number;
  minValue: number;
  maxAbsValue: number;
}

const NUM_POINTS = 21;

/**
 * Build sorted, unique sampling positions (as t ∈ [0,1]) including
 * regular grid points and positions just before/after each point load
 * to capture discontinuities in shear diagrams.
 */
function buildSamplingPositions(
  length: number,
  pointLoads: Array<{ a: number; p: number }>,
): number[] {
  const tSet = new Set<number>();

  for (let i = 0; i < NUM_POINTS; i++) {
    tSet.add(i / (NUM_POINTS - 1));
  }

  const eps = 1e-6;
  for (const pl of pointLoads) {
    const tPl = pl.a / length;
    if (tPl > eps) tSet.add(tPl - eps);
    tSet.add(tPl);
    if (tPl < 1 - eps) tSet.add(tPl + eps);
  }

  return Array.from(tSet).sort((a, b) => a - b);
}

/**
 * Compute a 3D diagram for one element.
 * Delegates to evaluateDiagramAt for each sample point.
 */
export function computeDiagram3D(
  ef: ElementForces3D,
  kind: Diagram3DKind,
): ElementDiagram3D {
  const relevantPointLoads =
    kind === 'momentZ' || kind === 'shearY'
      ? ef.pointLoadsY
      : kind === 'momentY' || kind === 'shearZ'
        ? ef.pointLoadsZ
        : [];

  const positions = buildSamplingPositions(ef.length, relevantPointLoads);
  const points: DiagramPoint3D[] = [];
  let maxVal = -Infinity;
  let minVal = Infinity;
  let maxAbsValue = 0;

  for (const t of positions) {
    const value = evaluateDiagramAt(ef, kind, t);
    points.push({ t, value });
    if (value > maxVal) maxVal = value;
    if (value < minVal) minVal = value;
    if (Math.abs(value) > Math.abs(maxAbsValue)) maxAbsValue = value;
  }

  return { elementId: ef.elementId, points, maxValue: maxVal, minValue: minVal, maxAbsValue };
}

/**
 * Compute the global maximum absolute value for a diagram kind across all elements.
 */
export function computeGlobalMax3D(
  elementForces: ElementForces3D[],
  kind: Diagram3DKind,
): number {
  let globalMax = 0;
  for (const ef of elementForces) {
    const d = computeDiagram3D(ef, kind);
    globalMax = Math.max(globalMax, Math.abs(d.maxValue), Math.abs(d.minValue));
  }
  return globalMax;
}

/**
 * Determine the perpendicular direction for a diagram kind.
 *
 * - Mz, Vy  → bending in local XY plane  → perpendicular = ey  → return 'y'
 * - My, Vz  → bending in local XZ plane  → perpendicular = ez  → return 'z'
 * - N, Mx   → drawn in local XZ plane    → perpendicular = ez  → return 'z'
 */
export function getDiagramLocalDirection(kind: Diagram3DKind): 'y' | 'z' {
  switch (kind) {
    case 'momentZ':
    case 'shearY':
      return 'y';
    case 'momentY':
    case 'shearZ':
    case 'axial':
    case 'torsion':
      return 'z';
  }
}

/**
 * Evaluate the diagram value at a specific normalized position t ∈ [0,1].
 * Uses analytical equilibrium equations.
 */
export function evaluateDiagramAt(
  ef: ElementForces3D,
  kind: Diagram3DKind,
  t: number,
): number {
  const L = ef.length;
  const x = t * L;

  switch (kind) {
    case 'momentZ': {
      let value = ef.mzStart - ef.vyStart * x;
      for (const dl of ef.distributedLoadsY) {
        const a = dl.a;
        const b = dl.b;
        const span = b - a;
        if (span < 1e-12) continue;
        const dq = dl.qJ - dl.qI;
        const xClamp = Math.min(x, b);
        if (xClamp <= a) continue;
        const s = xClamp - a;
        value -= dl.qI * (s * (x - a) - s * s / 2)
               + dq / span * (s * s / 2 * (x - a) - s * s * s / 3);
      }
      for (const pl of ef.pointLoadsY) {
        if (pl.a < x - 1e-10) value -= pl.p * (x - pl.a);
      }
      return value;
    }
    case 'momentY': {
      let value = ef.myStart + ef.vzStart * x;
      for (const dl of ef.distributedLoadsZ) {
        const a = dl.a;
        const b = dl.b;
        const span = b - a;
        if (span < 1e-12) continue;
        const dq = dl.qJ - dl.qI;
        const xClamp = Math.min(x, b);
        if (xClamp <= a) continue;
        const s = xClamp - a;
        value += dl.qI * (s * (x - a) - s * s / 2)
               + dq / span * (s * s / 2 * (x - a) - s * s * s / 3);
      }
      for (const pl of ef.pointLoadsZ) {
        if (pl.a < x - 1e-10) value += pl.p * (x - pl.a);
      }
      return value;
    }
    case 'shearY': {
      let value = ef.vyStart;
      for (const dl of ef.distributedLoadsY) {
        const a = dl.a;
        const b = dl.b;
        const span = b - a;
        if (span < 1e-12) continue;
        const dq = dl.qJ - dl.qI;
        const xClamp = Math.min(x, b);
        if (xClamp <= a) continue;
        const s = xClamp - a;
        value += dl.qI * s + dq * s * s / (2 * span);
      }
      for (const pl of ef.pointLoadsY) {
        if (pl.a < x - 1e-10) value += pl.p;
      }
      return value;
    }
    case 'shearZ': {
      let value = ef.vzStart;
      for (const dl of ef.distributedLoadsZ) {
        const a = dl.a;
        const b = dl.b;
        const span = b - a;
        if (span < 1e-12) continue;
        const dq = dl.qJ - dl.qI;
        const xClamp = Math.min(x, b);
        if (xClamp <= a) continue;
        const s = xClamp - a;
        value += dl.qI * s + dq * s * s / (2 * span);
      }
      for (const pl of ef.pointLoadsZ) {
        if (pl.a < x - 1e-10) value += pl.p;
      }
      return value;
    }
    case 'axial':
      return ef.nStart + t * (ef.nEnd - ef.nStart);
    case 'torsion':
      return ef.mxStart + t * (ef.mxEnd - ef.mxStart);
  }
}

/** Format a 3D diagram value for display.
 *  Moment values are negated: internal convention is hogging=positive,
 *  but standard engineering convention is sagging=positive. */
export function formatDiagramValue3D(value: number, kind: Diagram3DKind): string {
  const isMoment = kind === 'momentY' || kind === 'momentZ' || kind === 'torsion';
  const displayVal = isMoment ? -value : value;
  const abs = Math.abs(displayVal);
  const sign = displayVal < 0 ? '-' : '';
  const formatted = abs >= 100 ? abs.toFixed(0) : abs >= 10 ? abs.toFixed(1) : abs.toFixed(2);
  const unit = isMoment ? ' kN·m' : ' kN';
  return sign + formatted + unit;
}
