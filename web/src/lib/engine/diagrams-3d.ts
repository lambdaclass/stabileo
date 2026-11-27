// 3D Diagram Computation — Analytical equations
// Compute diagram values (My, Mz, Vy, Vz, N, Mx) along each 3D element
// using equilibrium equations with distributed and point loads.

import { type UnitSystem, formatDiagramValue } from '../utils/units';
import { componentMagnitude, type MagnitudeMethod, addMagnitudeBounds, checkedCurveValue, diagramCurvePoints, fullSpanFallback, indexDiagramExtrema, memberDiagram, prepareCurveExtrema, prepareMagnitudeExtrema, sortedStations, unavailableDiagramExtrema, type DiagramCurve, type DiagramExtremum, type DiagramStation } from './member-diagram';
import type { ElementForces3D, EnvelopeDiagramData3D } from './types-3d';

export type Diagram3DKind = 'momentY' | 'momentZ' | 'shearY' | 'shearZ' | 'axial' | 'torsion';

export interface DiagramPoint3D extends DiagramStation {
  /** Diagram value at this point (kN or kN·m) */
  value: number;
}

export interface ElementDiagram3D {
  elementId: number;
  points: DiagramPoint3D[];
  maxValue: number;
  minValue: number;
  maxAbsValue: number;
  extrema?: 'bounded';
}

const diagramKinds = ['momentY', 'momentZ', 'shearY', 'shearZ', 'axial', 'torsion'] as const;

interface SpatialCurve extends Pick<DiagramCurve, 'cuts' | 'cutDistances' | 'value'> {
  polynomial?: DiagramCurve['polynomial'];
  extrema: (at?: number) => DiagramExtremum[];
  magnitudeBound?: () => number;
}

function maxMagnitude(curve: SpatialCurve): number {
  if (curve.magnitudeBound) return curve.magnitudeBound();
  return diagramCurvePoints(curve, curve.extrema()).reduce((max, p) => Math.max(max, Math.abs(p.value)), 0);
}

function transverseActions(ef: ElementForces3D, aboutY: boolean) {
  const loads = aboutY ? fullSpanFallback(ef.length, ef.distributedLoadsZ, ef.qZI, ef.qZJ)
    : fullSpanFallback(ef.length, ef.distributedLoadsY, ef.qYI, ef.qYJ);
  const points = (aboutY ? ef.pointLoadsZ : ef.pointLoadsY) ?? [];
  return { loads, points };
}

function usesSampledBending(ef: ElementForces3D, kind: Diagram3DKind): boolean {
  if (ef.combined || ef.pieces?.length || (kind !== 'momentY' && kind !== 'momentZ')) return false;
  const { loads, points } = transverseActions(ef, kind === 'momentY');
  return points.length === 0 && loads.every(d => d.a === 0 && d.b === ef.length && d.qI === d.qJ);
}

function leafCurve(ef: ElementForces3D, kind: Diagram3DKind): DiagramCurve {
  const L = ef.length;
  if (kind === 'axial') {
    const points = ef.pointLoadsX ?? [];
    const loads = ef.distributedLoadsX ?? [];
    const change = points.length || loads.length ? 0 : ef.nEnd - ef.nStart;
    return memberDiagram(L, ef.nStart, change, loads, points.map(p => ({ a: p.a, jump: -p.p })), 'force', -1);
  }
  if (kind === 'torsion') return memberDiagram(L, ef.mxStart, ef.mxEnd - ef.mxStart, [], []);
  const aboutY = kind === 'momentY' || kind === 'shearZ';
  const { loads, points } = transverseActions(ef, aboutY);
  const shear = aboutY ? ef.vzStart : ef.vyStart;
  if (kind === 'shearY' || kind === 'shearZ') {
    return memberDiagram(L, shear, 0, loads, points.map(p => ({ a: p.a, jump: p.p })));
  }
  const sign = aboutY ? 1 : -1;
  return memberDiagram(L, aboutY ? ef.myStart : ef.mzStart, 0, loads,
    points.map(p => ({ a: p.a, jump: 0, slope: sign * p.p })), 'moment', sign, sign * shear);
}

function joinedCutDistances(curves: Iterable<ReadonlyMap<number, number>>): Map<number, number> {
  const distances = new Map<number, number>();
  for (const curve of curves) {
    for (const [t, x] of curve) {
      const existing = distances.get(t);
      if (existing !== undefined && existing !== x) throw unavailableDiagramExtrema();
      distances.set(t, x);
    }
  }
  return distances;
}

function magnitudeCurve(curves: SpatialCurve[], method: MagnitudeMethod, length: number): SpatialCurve {
  let cutDistances: Map<number, number> | undefined;
  const distances = () => cutDistances ??= joinedCutDistances([new Map([[0, 0], [1, length]]), ...curves.map(c => c.cutDistances)]);
  const cuts = () => sortedStations(distances().keys());
  const polynomialParts = curves.flatMap(c => c.polynomial ? [{ polynomial: c.polynomial }] : []);
  const exact = polynomialParts.length === curves.length;
  const combine = (station: DiagramStation) => {
    distances();
    const values = curves.map(curve => curve.value(station));
    return componentMagnitude(values, method);
  };
  const magnitudeBound = () => curves.reduce((bound, curve) => addMagnitudeBounds(bound, maxMagnitude(curve)), 0);
  return {
    get cuts() { return cuts(); },
    get cutDistances() { return distances(); },
    extrema: exact ? prepareMagnitudeExtrema(polynomialParts, method, distances, length)
      : () => curves.flatMap(curve => curve.extrema().map(({ t }) => ({ t, value: combine({ t }), canTransfer: () => false }))),
    ...(!exact ? { magnitudeBound } : {}),
    value: combine,
  };
}

export function hasUnsignedForces(member: ElementForces3D): boolean {
  return !!member.combined || !!member.pieces?.some(piece => hasUnsignedForces(piece.forces));
}

function spatialCurve(ef: ElementForces3D, kind: Diagram3DKind): SpatialCurve {
  if (ef.combined) {
    const { method, parts } = ef.combined;
    const curves = parts.map(p => spatialCurve(p, kind));
    return magnitudeCurve(curves, method, ef.length);
  }
  if (ef.pieces?.length) {
    const pieces = ef.pieces.map(p => {
      const start = p.x0 / ef.length, end = p.x1 / ef.length;
      const curve = spatialCurve(p.forces, kind);
      const distance = (t: number) => t === 0 ? p.x0 : t === 1 ? p.x1 : p.x0 + (p.x1 - p.x0) * t;
      const parent = (t: number) => distance(t) / ef.length;
      let boundaries: Map<number, number> | undefined;
      const cutMap = () => {
        if (boundaries) return boundaries;
        const mapped = new Map(curve.cuts.map(t => [parent(t), t]));
        if (mapped.size !== curve.cuts.length) throw unavailableDiagramExtrema();
        return boundaries = mapped;
      };
      const local = (t: number) => cutMap().get(t) ?? Math.max(0, Math.min(1, (t - start) / (end - start)));
      return { end, curve, parent, local, cutMap, distance };
    });
    const pieceAt = ({ t, right }: DiagramStation) =>
      pieces.find(p => right ? t < p.end : t <= p.end) ?? pieces[pieces.length - 1]!;
    const magnitudeBound = pieces.some(p => p.curve.magnitudeBound) ? () => Math.max(...pieces.map(p => maxMagnitude(p.curve))) : undefined;
    let cutDistances: Map<number, number> | undefined;
    const distances = () => cutDistances ??= joinedCutDistances(pieces.map(p =>
      new Map([...p.cutMap()].map(([t, local]) => [t, p.distance(local)]))));
    let extrema: DiagramExtremum[] | undefined;
    return {
      magnitudeBound,
      get cuts() { return sortedStations(this.cutDistances.keys()); },
      get cutDistances() { return distances(); },
      extrema: () => extrema ??= pieces.flatMap(p => p.curve.extrema().map(peak => {
        const t = p.parent(peak.t);
        if (p.cutMap().has(t)) throw unavailableDiagramExtrema();
        return { t, value: peak.value, canTransfer: station => p === pieceAt({ t: station }) && peak.canTransfer(p.local(station)) };
      })),
      value(station) {
        distances();
        const p = pieceAt(station);
        const t = p.local(station.t);
        return p.curve.value({ t, right: station.right || p.parent(t) < station.t });
      },
      ...(pieces.every(p => p.curve.polynomial) ? { polynomial(lo: number, hi: number) {
        const p = pieceAt({ t: lo, right: true });
        return p.curve.polynomial!(p.local(lo), p.local(hi));
      } } : {}),
    };
  }
  const curve = leafCurve(ef, kind);
  return {
    get cuts() { return curve.cuts; },
    get cutDistances() { return curve.cutDistances; },
    value: curve.value, polynomial: curve.polynomial, extrema: prepareCurveExtrema(curve, ef.length),
  };
}

export function transverseResultantMax3D(forces: ElementForces3D[], kind: 'moment' | 'shear') {
  let maximum = 0;
  let bounded = false;
  for (const ef of forces) {
    const parts = ef.combined?.parts ?? [ef];
    const curves = parts.flatMap(part => (['Y', 'Z'] as const).map(axis => spatialCurve(part, `${kind}${axis}`)));
    const method = ef.combined?.method === 'abs' ? 'transverseAbs' : 'srss';
    const magnitude = magnitudeCurve(curves, method, ef.length);
    maximum = Math.max(maximum, maxMagnitude(magnitude));
    bounded ||= !!magnitude.magnitudeBound || hasUnsignedForces(ef);
  }
  return { maximum, bounded };
}

export function criticalDiagramStations3D(ef: ElementForces3D, purpose: 'diagram' | 'concrete-design' = 'diagram'): DiagramStation[] {
  const curves = diagramKinds.map(kind => ({ kind, curve: spatialCurve(ef, kind) }));
  if (curves.some(({ curve }) => curve.magnitudeBound)) throw unavailableDiagramExtrema();
  const cuts = joinedCutDistances(curves.map(({ curve }) => curve.cutDistances));
  const extrema = curves.flatMap(({ kind, curve }) => {
    const peaks = [...indexDiagramExtrema(curve.extrema()).values()];
    if (peaks.some(peak => cuts.has(peak.t) || !peak.canTransfer(peak.t))) throw unavailableDiagramExtrema();
    return purpose === 'concrete-design' && usesSampledBending(ef, kind) ? [] : peaks;
  });
  return sortedStations([...cuts.keys(), ...extrema.map(peak => peak.t)]).flatMap(t => {
    const left = { t };
    const right = { t, right: true };
    return t < 1 && cuts.has(t) && curves.some(({ curve }) => curve.value(left) !== curve.value(right)) ? [left, right] : [left];
  });
}

export function computeDiagram3D(
  ef: ElementForces3D,
  kind: Diagram3DKind,
): ElementDiagram3D {
  const curve = spatialCurve(ef, kind);
  const points = diagramCurvePoints(curve, curve.extrema());
  let maxVal = -Infinity;
  let minVal = Infinity;
  let maxAbsValue = 0;

  for (const { value } of points) {
    if (value > maxVal) maxVal = value;
    if (value < minVal) minVal = value;
    if (Math.abs(value) > Math.abs(maxAbsValue)) maxAbsValue = value;
  }

  if (curve.magnitudeBound) {
    const bound = curve.magnitudeBound();
    if (!Number.isFinite(bound)) throw unavailableDiagramExtrema();
    return { elementId: ef.elementId, points, maxValue: bound, minValue: ef.combined ? 0 : -bound, maxAbsValue: bound, extrema: 'bounded' };
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
export function evaluateDiagramAt(ef: ElementForces3D, kind: Diagram3DKind, t: number, right = false): number {
  return evaluateSpatialCurve(spatialCurve(ef, kind), { t, right });
}

export function prepareDiagramEvaluator3D(ef: ElementForces3D, kind: Diagram3DKind): (t: number, right?: boolean) => number {
  const curve = spatialCurve(ef, kind);
  return (t, right = false) => evaluateSpatialCurve(curve, { t, right });
}

function evaluateSpatialCurve(curve: SpatialCurve, station: DiagramStation): number {
  if (curve.magnitudeBound) return curve.value(station);
  const extrema = curve.extrema(station.t);
  return extrema.length === 0 ? curve.value(station) : checkedCurveValue(curve, station, indexDiagramExtrema(extrema));
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
