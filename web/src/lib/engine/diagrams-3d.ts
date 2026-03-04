// 3D Diagram Computation — Analytical equations
// Compute diagram values (My, Mz, Vy, Vz, N, Mx) along each 3D element
// using equilibrium equations with distributed and point loads.
//
// Sign conventions follow the solver output:
// - ElementForces3D stores forces the element exerts on nodes (start/end)
// - For diagrams, we build from equilibrium at node I:
//
// Moment Z (strong axis — Mz):
//   Mz(x) = mzStart - vyStart·x - Σ[qYI·x²/2 + (qYJ-qYI)·x³/(6L)] - Σ P·(x-a) for x>a
//
// Moment Y (weak axis — My):
//   My(x) = myStart + vzStart·x + Σ[qZI·x²/2 + (qZJ-qZI)·x³/(6L)] + Σ P·(x-a) for x>a
//   Note: positive signs because θy = -dw/dx inverts the relation dMy/dx = +Vz
//
// Shear Y (Vy):
//   Vy(x) = vyStart + Σ[qYI·x + (qYJ-qYI)·x²/(2L)] + Σ P for x>a
//
// Shear Z (Vz):
//   Vz(x) = vzStart + Σ[qZI·x + (qZJ-qZI)·x²/(2L)] + Σ P for x>a
//
// Axial N and Torsion Mx: linear interpolation (no intra-element loads)

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

  // Regular grid
  for (let i = 0; i < NUM_POINTS; i++) {
    tSet.add(i / (NUM_POINTS - 1));
  }

  // Add positions around point loads to capture discontinuities
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
 * Compute a 3D diagram for one element using analytical equilibrium equations.
 *
 * For moment and shear diagrams with distributed/point loads, uses the
 * full equilibrium equations (parabolic moments, linear shear) rather
 * than simple linear interpolation.
 */
export function computeDiagram3D(
  ef: ElementForces3D,
  kind: Diagram3DKind,
): ElementDiagram3D {
  const L = ef.length;
  const points: DiagramPoint3D[] = [];
  let maxVal = -Infinity;
  let minVal = Infinity;
  let maxAbsValue = 0;

  // Determine which point loads to use for sampling positions
  const relevantPointLoads =
    kind === 'momentZ' || kind === 'shearY'
      ? ef.pointLoadsY
      : kind === 'momentY' || kind === 'shearZ'
        ? ef.pointLoadsZ
        : [];

  const positions = buildSamplingPositions(L, relevantPointLoads);

  // Sort point loads for efficient processing
  const sortedPLY = [...ef.pointLoadsY].sort((a, b) => a.a - b.a);
  const sortedPLZ = [...ef.pointLoadsZ].sort((a, b) => a.a - b.a);

  for (const t of positions) {
    const x = t * L;
    let value: number;

    switch (kind) {
      case 'momentZ': {
        // Mz(x) = mzStart - vyStart·x - Σ∫q(ξ)·(x-ξ)dξ - Σ P·(x-a)
        value = ef.mzStart - ef.vyStart * x;

        for (const dl of ef.distributedLoadsY) {
          const a = dl.a;
          const b = dl.b;
          const span = b - a;
          if (span < 1e-12) continue;
          const dq = dl.qJ - dl.qI;

          // Upper integration limit
          const xClamp = Math.min(x, b);
          if (xClamp <= a) continue;

          const s = xClamp - a; // integration length

          // ∫_a^xClamp q(ξ)·(x - ξ) dξ where q(ξ) = qI + dq·(ξ-a)/span
          // = ∫_0^s [qI + dq·u/span]·(x - a - u) du
          // = qI·[s·(x-a) - s²/2] + dq/span·[s²/2·(x-a) - s³/3]
          value -= dl.qI * (s * (x - a) - s * s / 2)
                 + dq / span * (s * s / 2 * (x - a) - s * s * s / 3);
        }

        // Point loads in Y
        for (const pl of sortedPLY) {
          if (pl.a < x - 1e-10) {
            value -= pl.p * (x - pl.a);
          }
        }
        break;
      }

      case 'momentY': {
        // My(x) = myStart + vzStart·x + Σ distributed + Σ point loads
        // Note: positive signs because of θy = -dw/dx convention
        value = ef.myStart + ef.vzStart * x;

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

        for (const pl of sortedPLZ) {
          if (pl.a < x - 1e-10) {
            value += pl.p * (x - pl.a);
          }
        }
        break;
      }

      case 'shearY': {
        // Vy(x) = vyStart + Σ[qYI·x + ...] + Σ P for x>a
        value = ef.vyStart;

        for (const dl of ef.distributedLoadsY) {
          const a = dl.a;
          const b = dl.b;
          const span = b - a;
          if (span < 1e-12) continue;
          const dq = dl.qJ - dl.qI;

          const xClamp = Math.min(x, b);
          if (xClamp <= a) continue;
          const s = xClamp - a;

          // ∫_a^xClamp q(ξ) dξ = qI·s + dq·s²/(2·span)
          value += dl.qI * s + dq * s * s / (2 * span);
        }

        for (const pl of sortedPLY) {
          if (pl.a < x - 1e-10) {
            value += pl.p;
          }
        }
        break;
      }

      case 'shearZ': {
        // Vz(x) = vzStart + Σ distributed Z loads + Σ point loads Z
        value = ef.vzStart;

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

        for (const pl of sortedPLZ) {
          if (pl.a < x - 1e-10) {
            value += pl.p;
          }
        }
        break;
      }

      case 'axial':
        // N(x) — linear interpolation (no intra-element axial loads)
        value = ef.nStart + t * (ef.nEnd - ef.nStart);
        break;

      case 'torsion':
        // Mx(x) — linear interpolation (no intra-element torque)
        value = ef.mxStart + t * (ef.mxEnd - ef.mxStart);
        break;
    }

    points.push({ t, value });

    if (value > maxVal) maxVal = value;
    if (value < minVal) minVal = value;
    if (Math.abs(value) > Math.abs(maxAbsValue)) {
      maxAbsValue = value;
    }
  }

  return {
    elementId: ef.elementId,
    points,
    maxValue: maxVal,
    minValue: minVal,
    maxAbsValue,
  };
}

/**
 * Compute the global maximum absolute value for a diagram kind across all elements.
 * Now computes the full diagram to find mid-element extrema (e.g., parabolic moments).
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
 * Each internal-force diagram lives in the local plane where it acts:
 * - Mz, Vy  → bending in local XY plane  → perpendicular = ey  → return 'y'
 * - My, Vz  → bending in local XZ plane  → perpendicular = ez  → return 'z'
 * - N, Mx   → drawn in local XZ plane    → perpendicular = ez  → return 'z'
 *
 * For a horizontal beam (+X, right-hand terna):
 *   ey = (0,0,1), ez = (0,-1,0)
 *   Gravity (−Y global) projects onto ez → produces My/Vz
 *   My/Vz drawn with ez → diagram extends in −Y global (in-plane with gravity) ✓
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
 * Uses the same analytical equations as computeDiagram3D but for a single point.
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
  // Negate moments for display (internal: hogging=+, display: sagging=+)
  const displayVal = isMoment ? -value : value;
  const abs = Math.abs(displayVal);
  const sign = displayVal < 0 ? '-' : '';
  const formatted = abs >= 100 ? abs.toFixed(0) : abs >= 10 ? abs.toFixed(1) : abs.toFixed(2);
  const unit = isMoment ? ' kN·m' : ' kN';
  return sign + formatted + unit;
}
