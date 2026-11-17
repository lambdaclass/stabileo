import { diagramStations, loadPrecedesStation, parentStations } from './load-station';
import { integrateQuadratic } from './member-moments';
// 3D Diagram Computation — Analytical equations
// Compute diagram values (My, Mz, Vy, Vz, N, Mx) along each 3D element
// using equilibrium equations with distributed and point loads.

import { type UnitSystem, formatDiagramValue } from '../utils/units';
import type { ElementForces3D, EnvelopeDiagramData3D } from './types-3d';

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

/**
 * Build sorted, unique sampling positions (as t ∈ [0,1]) including
 * regular grid points and positions just before/after each point load
 * to capture discontinuities in shear diagrams.
 */
function samplingPositions(ef: ElementForces3D, kind: Diagram3DKind): number[] {
  if (ef.pieces?.length) return [...new Set(ef.pieces.flatMap(p => parentStations(ef.length, p.x0, p.x1, samplingPositions(p.forces, kind))))].sort((a, b) => a - b);
  if (ef.combined) return [...new Set(ef.combined.parts.flatMap(p => samplingPositions(p, kind)))].sort((a, b) => a - b);
  const loads = kind === 'momentZ' || kind === 'shearY' ? ef.pointLoadsY : kind === 'momentY' || kind === 'shearZ' ? ef.pointLoadsZ : kind === 'torsion' ? ef.pointTorques ?? [] : [];
  const densities = [...ef.distributedLoadsY ?? [], ...ef.distributedLoadsZ ?? [], ...ef.distributedLoadsX ?? [], ...ef.memberMoments ?? []];
  return diagramStations(ef.length, [...loads, ...ef.pointTorques ?? []], densities.flatMap(d => [d.a, d.b]), t => evaluateDiagramAt(ef, kind, t));
}

/**
 * Compute a 3D diagram for one element.
 * Delegates to evaluateDiagramAt for each sample point.
 */
export function computeDiagram3D(
  ef: ElementForces3D,
  kind: Diagram3DKind,
): ElementDiagram3D {
  const positions = samplingPositions(ef, kind);
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
 * A member's envelope as diagrams: its positive and its negative station curve, each drawn as it
 * stands. Envelope end forces (`maxAbsResults3D`) are each end's largest from its own
 * combination, no load state to integrate with `computeDiagram3D`.
 */
export function envelopeDiagrams3D(env: EnvelopeDiagramData3D, elementId: number): ElementDiagram3D[] {
  const e = env.elements.find((e) => e.elementId === elementId);
  if (!e) return [];
  return [e.posValues, e.negValues].map((values) => {
    let maxValue = -Infinity, minValue = Infinity, maxAbsValue = 0;
    const points = e.tPositions.map((t, i) => {
      const value = values[i] ?? 0;
      maxValue = Math.max(maxValue, value); minValue = Math.min(minValue, value);
      if (Math.abs(value) > Math.abs(maxAbsValue)) maxAbsValue = value;
      return { t, value };
    });
    return { elementId, points, maxValue, minValue, maxAbsValue };
  }).filter((d) => d.points.length > 0);
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
  // A combination by SRSS or ABS: its cases' values here, combined (`combination-methods.ts`).
  if (ef.combined) {
    const vs = ef.combined.parts.map((p) => evaluateDiagramAt(p, kind, t));
    return ef.combined.method === 'srss' ? Math.sqrt(vs.reduce((s, v) => s + v * v, 0)) : vs.reduce((s, v) => s + Math.abs(v), 0);
  }
  const L = ef.length;
  const x = t * L;
  // A member of variable section is read on the piece the point falls in (`variable-members.ts`).
  if (ef.pieces?.length) {
    const p = ef.pieces.find((q) => !loadPrecedesStation(q.x1, L, t)) ?? ef.pieces[ef.pieces.length - 1]!;
    return evaluateDiagramAt(p.forces, kind, Math.min(1, Math.max(0, (x - p.x0) / Math.max(p.x1 - p.x0, 1e-12))));
  }

  switch (kind) {
    case 'momentZ': {
      let value = ef.mzStart - ef.vyStart * x;
      for (const m of ef.memberMoments ?? []) value += integrateQuadratic(m.moments.z, m.a, m.b, x);
      for (const p of ef.pointTorques ?? []) if (loadPrecedesStation(p.a, L, t)) value += p.z ?? 0;
      for (const dl of ef.distributedLoadsY ?? []) {
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
      for (const pl of ef.pointLoadsY ?? []) {
        if (loadPrecedesStation(pl.a, L, t)) value -= pl.p * (x - pl.a);
      }
      return value;
    }
    case 'momentY': {
      let value = ef.myStart + ef.vzStart * x;
      for (const m of ef.memberMoments ?? []) value += integrateQuadratic(m.moments.y, m.a, m.b, x);
      for (const p of ef.pointTorques ?? []) if (loadPrecedesStation(p.a, L, t)) value += p.y ?? 0;
      for (const dl of ef.distributedLoadsZ ?? []) {
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
      for (const pl of ef.pointLoadsZ ?? []) {
        if (loadPrecedesStation(pl.a, L, t)) value += pl.p * (x - pl.a);
      }
      return value;
    }
    case 'shearY': {
      let value = ef.vyStart;
      for (const dl of ef.distributedLoadsY ?? []) {
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
      for (const pl of ef.pointLoadsY ?? []) {
        if (loadPrecedesStation(pl.a, L, t)) value += pl.p;
      }
      return value;
    }
    case 'shearZ': {
      let value = ef.vzStart;
      for (const dl of ef.distributedLoadsZ ?? []) {
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
      for (const pl of ef.pointLoadsZ ?? []) {
        if (loadPrecedesStation(pl.a, L, t)) value += pl.p;
      }
      return value;
    }
    case 'axial': {
      if (!ef.distributedLoadsX?.length) return ef.nStart + t * (ef.nEnd - ef.nStart);
      let value = ef.nStart;
      for (const dl of ef.distributedLoadsX) {
        const span = dl.b - dl.a;
        if (span <= 0) continue;
        const s = Math.max(0, Math.min(x - dl.a, span));
        value -= dl.qI * s + (dl.qJ - dl.qI) * s * s / (2 * span);
      }
      return value;
    }
    case 'torsion': {
      if (!ef.memberMoments?.length && !ef.pointTorques?.length) return ef.mxStart + t * (ef.mxEnd - ef.mxStart);
      return ef.mxStart + (ef.memberMoments ?? []).reduce((sum,m) => sum+integrateQuadratic(m.moments.x,m.a,m.b,x),0)
        + (ef.pointTorques ?? []).reduce((sum,p) => sum+(loadPrecedesStation(p.a, L, t) ? p.p : 0),0);
    }
  }
}

/** Format a 3D diagram value for display.
 *  Bending moments are negated: internal convention is hogging=positive,
 *  but standard engineering convention is sagging=positive. A torque has no
 *  sagging side: it reads as every table reads Mx, so the moment's flip in
 *  `formatDiagramValue` is undone for it — the label said −5 where the tables said 5. */
export function formatDiagramValue3D(value: number, kind: Diagram3DKind, system: UnitSystem = 'SI'): string {
  const isMoment = kind === 'momentY' || kind === 'momentZ' || kind === 'torsion';
  return formatDiagramValue(kind === 'torsion' ? -value : value, isMoment ? 'moment' : 'force', system);
}
