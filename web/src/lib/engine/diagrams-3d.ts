// 3D Diagram Computation — Analytical equations
// Compute diagram values (My, Mz, Vy, Vz, N, Mx) along each 3D element
// using equilibrium equations with distributed and point loads.

import { type UnitSystem, formatDiagramValue } from '../utils/units';
import { addMagnitudeBounds, checkedCurveValue, diagramCriticalPoints, diagramCurvePoints, fullSpanFallback, indexDiagramExtrema, memberDiagram, prepareCurveExtrema, prepareMagnitudeExtrema, rebaseDiagramDistance, sortedStations, unavailableDiagramExtrema, type DiagramCurve, type DiagramExtremum, type DiagramStation } from './member-diagram';
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
  maxAbsX?: number;
  extrema?: 'bounded';
}

const diagramKinds = ['momentY', 'momentZ', 'shearY', 'shearZ', 'axial', 'torsion'] as const;

interface SpatialCurve extends Pick<DiagramCurve, 'cuts' | 'cutDistances' | 'value'> {
  cutResidual?: (t: number) => number;
  polynomial?: DiagramCurve['polynomial'];
  extrema: (at?: number) => DiagramExtremum[];
  magnitudeBound?: () => number;
}

function maxMagnitude(curve: SpatialCurve): number {
  if (curve.magnitudeBound) return curve.magnitudeBound();
  return diagramCriticalPoints(curve, curve.extrema()).reduce((max, p) => Math.max(max, Math.abs(p.value)), 0);
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

function joinedCuts(curves: Iterable<Pick<SpatialCurve, 'cutDistances' | 'cutResidual'>>) {
  const distances = new Map<number, number>();
  const residuals = new Map<number, number>();
  for (const curve of curves) {
    for (const [t, x] of curve.cutDistances) {
      const existing = distances.get(t);
      const residual = curve.cutResidual?.(t) ?? 0;
      if (existing !== undefined && (existing !== x || residuals.get(t) !== residual)) throw unavailableDiagramExtrema();
      distances.set(t, x);
      residuals.set(t, residual);
    }
  }
  return { distances, residuals };
}

function magnitudeCurve(curves: readonly SpatialCurve[], method: 'srss' | 'abs', length: number): SpatialCurve {
  let cutsByStation: ReturnType<typeof joinedCuts> | undefined;
  const joined = () => cutsByStation ??= joinedCuts([{ cutDistances: new Map([[0, 0], [1, length]]) }, ...curves]);
  const distances = () => joined().distances;
  const cuts = () => sortedStations(distances().keys());
  const polynomialParts = curves.flatMap(c => c.polynomial ? [{ polynomial: c.polynomial }] : []);
  const exact = polynomialParts.length === curves.length;
  const combine = (station: DiagramStation) => {
    distances();
    const values = curves.map(curve => curve.value(station));
    return method === 'srss' ? Math.hypot(...values) : values.reduce((sum, value) => sum + Math.abs(value), 0);
  };
  const magnitudeBound = () => curves.reduce((bound, curve) => addMagnitudeBounds(bound, maxMagnitude(curve)), 0);
  return {
    get cuts() { return cuts(); },
    get cutDistances() { return distances(); },
    cutResidual: t => joined().residuals.get(t) ?? 0,
    extrema: exact ? prepareMagnitudeExtrema(polynomialParts, method, distances, length)
      : () => curves.flatMap(curve => curve.extrema().map(({ t }) => ({ t, value: combine({ t }), canTransfer: () => false }))),
    ...(!exact ? { magnitudeBound } : {}),
    value: combine,
  };
}

function spatialCurve(ef: ElementForces3D, kind: Diagram3DKind): SpatialCurve {
  if (ef.combined) {
    const { method, parts } = ef.combined;
    return magnitudeCurve(parts.map(p => spatialCurve(p, kind)), method, ef.length);
  }
  if (ef.pieces?.length) {
    const pieces = ef.pieces.map(p => {
      const end = p.x1 / ef.length;
      const curve = spatialCurve(p.forces, kind);
      const rebase = (x: number) => x === 0 ? { x: p.x0, residual: 0 }
        : x === p.forces.length ? { x: p.x1, residual: 0 } : rebaseDiagramDistance(p.x0, x);
      const parent = (t: number) => rebase(t * p.forces.length).x / ef.length;
      type PieceCut = { t: number; localX: number; x: number; residual: number };
      let boundaries: Map<number, PieceCut> | undefined;
      let stations: [number, PieceCut][] | undefined;
      const cutMap = () => {
        if (boundaries) return boundaries;
        const mapped = new Map([...curve.cutDistances].map(([t, localX]) => {
          const { x, residual } = rebase(localX);
          return [x / ef.length, { t, localX, x, residual: residual + (curve.cutResidual?.(t) ?? 0) }];
        }));
        if (mapped.size !== curve.cutDistances.size) throw unavailableDiagramExtrema();
        return boundaries = mapped;
      };
      const local = ({ t, right, x }: DiagramStation): DiagramStation => {
        const cuts = cutMap();
        const cut = cuts.get(t);
        if (cut) return { t: cut.t, right };
        stations ??= [...cuts].sort(([a], [b]) => a - b);
        const upper = stations.findIndex(([at]) => at > t);
        if (upper <= 0) throw unavailableDiagramExtrema();
        const [lo, left] = stations[upper - 1]!, [hi, next] = stations[upper]!;
        const fromLeft = t - lo, fromRight = hi - t;
        const scale = ef.length / p.forces.length;
        const localT = fromLeft <= fromRight ? left.t + fromLeft * scale : next.t - fromRight * scale;
        if (localT <= left.t) return { t: left.t, right: true };
        if (localT >= next.t) return { t: next.t, right: false };
        const localX = x === undefined ? undefined : fromLeft <= fromRight
          ? left.localX + (x - left.x) : next.localX - (next.x - x);
        return { t: localT, x: localX };
      };
      return { end, curve, parent, local, cutMap, origin: p.x0 };
    });
    const pieceAt = ({ t, right }: DiagramStation) =>
      pieces.find(p => right ? t < p.end : t <= p.end) ?? pieces[pieces.length - 1]!;
    const magnitudeBound = pieces.some(p => p.curve.magnitudeBound) ? () => Math.max(...pieces.map(p => maxMagnitude(p.curve))) : undefined;
    let cutsByStation: ReturnType<typeof joinedCuts> | undefined;
    const joined = () => cutsByStation ??= joinedCuts(pieces.map(p => ({
      cutDistances: new Map([...p.cutMap()].map(([t, cut]) => [t, cut.x])),
      cutResidual: t => p.cutMap().get(t)?.residual ?? 0,
    })));
    const distances = () => joined().distances;
    let extrema: DiagramExtremum[] | undefined;
    return {
      magnitudeBound,
      get cuts() { return sortedStations(this.cutDistances.keys()); },
      get cutDistances() { return distances(); },
      cutResidual: t => joined().residuals.get(t) ?? 0,
      extrema: () => extrema ??= pieces.flatMap(p => p.curve.extrema().map(peak => {
        const t = p.parent(peak.t);
        if (p.cutMap().has(t)) throw unavailableDiagramExtrema();
        return {
          t, value: peak.value,
          coincides: x => peak.coincides?.(x - p.origin) ?? false,
          canTransfer(station, x) {
            if (p !== pieceAt({ t: station })) return false;
            const local = p.local({ t: station, x });
            return peak.canTransfer(local.t, local.x);
          },
        };
      })),
      value(station) {
        distances();
        const p = pieceAt(station);
        return p.curve.value(p.local(station));
      },
      ...(pieces.every(p => p.curve.polynomial) ? { polynomial(lo: number, hi: number) {
        const p = pieceAt({ t: lo, right: true });
        return p.curve.polynomial!(p.local({ t: lo, right: true }).t, p.local({ t: hi }).t);
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

export function criticalDiagramStations3D(ef: ElementForces3D, purpose: 'diagram' | 'concrete-design' = 'diagram'): DiagramStation[] {
  const curves = diagramKinds.map(kind => ({ kind, curve: spatialCurve(ef, kind) }));
  if (curves.some(({ curve }) => curve.magnitudeBound)) throw unavailableDiagramExtrema();
  const cuts = joinedCuts(curves.map(({ curve }) => curve)).distances;
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

export type MemberDiagramComponent = Diagram3DKind | readonly [Diagram3DKind, Diagram3DKind];

function componentCurve(ef: ElementForces3D, kind: MemberDiagramComponent): SpatialCurve {
  return typeof kind === 'string' ? spatialCurve(ef, kind)
    : magnitudeCurve(kind.map(component => spatialCurve(ef, component)), 'srss', ef.length);
}

export function* memberEnvelopeStations3D(forces: readonly ElementForces3D[], components: readonly MemberDiagramComponent[]) {
  const length = forces[0]!.length;
  if (forces.some(f => f.length !== length)) throw unavailableDiagramExtrema();
  const prepared = forces.map(f => components.map(kind => {
    const curve = componentCurve(f, kind);
    if (curve.magnitudeBound) throw unavailableDiagramExtrema();
    return { curve, peaks: indexDiagramExtrema(curve.extrema()) };
  }));
  const all = prepared.flat();
  const { distances, residuals } = joinedCuts(all.map(({ curve }) => curve));
  const stations = sortedStations([0.25, 0.5, 0.75, ...distances.keys(), ...all.flatMap(({ peaks }) => [...peaks.keys()])]);
  const values = (station: DiagramStation) => prepared.map(curves => curves.map(({ curve, peaks }) => checkedCurveValue(curve, station, peaks)));
  for (const t of stations) {
    const exactX = distances.get(t);
    const x = exactX ?? t * length;
    const left = { t, x: residuals.get(t) ? undefined : exactX };
    const right = { ...left, right: true };
    const jump = t < 1 && exactX !== undefined && all.some(({ curve }) => curve.value(left) !== curve.value(right));
    if (jump && all.some(({ peaks }) => {
      const peak = peaks.get(t);
      return peak && (residuals.get(t) || !peak.coincides?.(x));
    })) throw unavailableDiagramExtrema();
    yield { t, x, face: jump ? 'left' as const : undefined, values: () => values(left) };
    if (jump) yield { t, x, face: 'right' as const, values: () => values(right) };
  }
}

export function memberCriticalOrdinates3D(
  ef: ElementForces3D, kind: MemberDiagramComponent, inwardAtI = false,
) {
  const curve = componentCurve(ef, kind);
  if (curve.magnitudeBound) throw unavailableDiagramExtrema();
  return diagramCriticalPoints(curve, curve.extrema(), inwardAtI).map(point => ({
    ...point,
    x: curve.cutDistances.get(point.t) ?? point.t * ef.length,
  }));
}

function spatialExtrema(curve: SpatialCurve, critical: readonly DiagramPoint3D[], length: number) {
  let maxValue = -Infinity, minValue = Infinity;
  let maxAbsValue = 0, maxAbsT = 0;
  for (const { t, value } of critical) {
    if (value > maxValue) maxValue = value;
    if (value < minValue) minValue = value;
    if (Math.abs(value) > Math.abs(maxAbsValue)) {
      maxAbsValue = value;
      maxAbsT = t;
    }
  }
  if (curve.magnitudeBound) {
    const bound = curve.magnitudeBound();
    if (!Number.isFinite(bound)) throw unavailableDiagramExtrema();
    return { maxValue: bound, minValue: -bound, maxAbsValue: bound, extrema: 'bounded' as const };
  }
  return { maxValue, minValue, maxAbsValue, maxAbsX: curve.cutDistances.get(maxAbsT) ?? maxAbsT * length };
}

export function computeSpatialDiagramExtrema(ef: ElementForces3D, kind: Diagram3DKind) {
  const curve = spatialCurve(ef, kind);
  const range = spatialExtrema(curve, diagramCriticalPoints(curve, curve.extrema()), ef.length);
  return range.extrema && ef.combined ? { ...range, minValue: 0 } : range;
}

export function computeDiagram3D(ef: ElementForces3D, kind: Diagram3DKind): ElementDiagram3D {
  const curve = spatialCurve(ef, kind);
  const critical = diagramCriticalPoints(curve, curve.extrema());
  const points = diagramCurvePoints(curve, critical);
  const range = spatialExtrema(curve, critical, ef.length);
  return { elementId: ef.elementId, points, ...range, minValue: range.extrema && ef.combined ? 0 : range.minValue };
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
    const d = computeSpatialDiagramExtrema(ef, kind);
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
  const critical = new Map(e.criticalStations?.map(station => [station.index, station]));
  return [e.posValues, e.negValues].map((values) => {
    let maxValue = -Infinity, minValue = Infinity, maxAbsValue = 0;
    const points = e.tPositions.map((t, i) => {
      const value = values[i] ?? 0;
      maxValue = Math.max(maxValue, value); minValue = Math.min(minValue, value);
      if (Math.abs(value) > Math.abs(maxAbsValue)) maxAbsValue = value;
      const station = critical.get(i);
      return station ? { t, value, x: station.x, right: station.right } : { t, value };
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
  return checkedCurveValue(curve, station, indexDiagramExtrema(curve.extrema(station.t)));
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
