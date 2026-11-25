// 3D Diagram Computation — Analytical equations
// Compute diagram values (My, Mz, Vy, Vz, N, Mx) along each 3D element
// using equilibrium equations with distributed and point loads.

import { type UnitSystem, formatDiagramValue } from '../utils/units';
import { absolutePolynomialBranches, addMagnitudeBounds, checkedCurveValue, diagramCriticalPoints, diagramCurvePoints, fullSpanFallback, indexDiagramExtrema, maxAbsDiagramOrdinate, memberDiagram, prepareCurveExtrema, prepareMagnitudeExtrema, sortedStations, unavailableDiagramExtrema, type DiagramCurve, type DiagramExtremum, type DiagramOrdinate, type DiagramStation, type PolynomialBranch } from './member-diagram';
import { distanceUnits, exactCutUnits, sameCutLocation, type DiagramCutLocation } from './diagram-cut';
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

interface SpatialCurve extends Pick<DiagramCurve, 'cuts' | 'value'> {
  cutLocations: ReadonlyMap<number, DiagramCutLocation>;
  polynomials?: (start: DiagramStation, end: DiagramStation) => PolynomialBranch[];
  squaredParts?: readonly SpatialCurve[];
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

function joinedCutLocations(curves: Iterable<ReadonlyMap<number, DiagramCutLocation>>): Map<number, DiagramCutLocation> {
  const locations = new Map<number, DiagramCutLocation>();
  for (const curve of curves) {
    for (const [t, cut] of curve) {
      const existing = locations.get(t);
      if (!existing) {
        locations.set(t, cut);
      } else if (!sameCutLocation(existing, cut)) {
        throw unavailableDiagramExtrema();
      }
    }
  }
  return locations;
}

function magnitudeCurve(
  components: readonly SpatialCurve[], method: 'srss' | 'abs', length: number, forResultant = false,
): SpatialCurve {
  const curves = method === 'srss' ? components.flatMap(component => component.squaredParts ?? [component]) : components;
  let cutLocations: Map<number, DiagramCutLocation> | undefined;
  const locations = () => cutLocations ??= joinedCutLocations([
    new Map([[0, { x: 0 }], [1, { x: length }]]), ...curves.map(c => c.cutLocations),
  ]);
  const distances = () => new Map([...locations()].map(([t, cut]) => [t, cut.x]));
  const cuts = () => sortedStations(locations().keys());
  const polynomialParts = curves.flatMap(c => c.polynomials ? [
    (lo: number, hi: number, x0: number, x1: number) =>
      c.polynomials!(atCut({ t: lo, distance: x0, right: true }), atCut({ t: hi, distance: x1 })),
  ] : []);
  const exact = polynomialParts.length === curves.length;
  function atCut(station: DiagramStation): DiagramStation {
    const published = locations().get(station.t);
    const location = station.location ?? (station.distance === undefined || station.distance === published?.x ? published : undefined);
    return { ...station, distance: station.distance ?? location?.x, location };
  }
  const combine = (station: DiagramStation) => {
    const at = atCut(station);
    const values = curves.map(curve => curve.value(at));
    return method === 'srss' ? Math.hypot(...values) : values.reduce((sum, value) => sum + Math.abs(value), 0);
  };
  const keepAlias = forResultant ? (t: number) => locations().get(t)?.rebased !== undefined : undefined;
  const magnitudeBound = () => curves.reduce((bound, curve) => addMagnitudeBounds(bound, maxMagnitude(curve)), 0);
  return {
    get cuts() { return cuts(); },
    get cutLocations() { return locations(); },
    extrema: exact ? prepareMagnitudeExtrema(polynomialParts, method, distances, length, keepAlias)
      : () => curves.flatMap(curve => curve.extrema().map(({ t }) => ({ t, value: combine({ t }), canTransfer: () => false, fallback: true }))),
    ...(!exact ? { magnitudeBound } : {}),
    ...(method === 'abs' && exact ? { polynomials: (start: DiagramStation, end: DiagramStation) =>
      absolutePolynomialBranches(curves.map(curve => curve.polynomials!(start, end))) } : {}),
    ...(method === 'srss' ? { squaredParts: curves }
      : curves.length === 1 ? { squaredParts: curves[0]!.squaredParts ?? curves } : {}),
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
      const distance = (x: number) => x === 0 ? p.x0 : x === p.forces.length ? p.x1 : p.x0 + x;
      const parent = (t: number) => distance(curve.cutLocations.get(t)?.x ?? t * p.forces.length) / ef.length;
      const localDistance = (x: number) => x === p.x1 ? p.forces.length : x - p.x0;
      type PieceCut = { t: number; location: DiagramCutLocation; localX: number };
      let boundaries: Map<number, PieceCut> | undefined;
      let stations: [number, PieceCut][] | undefined;
      const cutMap = () => {
        if (boundaries) return boundaries;
        const localCuts = curve.cutLocations;
        const mapped = new Map([...localCuts].map(([t, local]) => {
          const x = distance(local.x);
          const location = t === 0 || t === 1 ? { x } : { x, rebased: { offset: p.x0, local } };
          return [x / ef.length, { t, location, localX: local.x }];
        }));
        if (mapped.size !== localCuts.size) throw unavailableDiagramExtrema();
        return boundaries = mapped;
      };
      const local = ({ t, right, distance, location }: DiagramStation): DiagramStation => {
        if (location?.rebased?.offset === p.x0) {
          const child = location.rebased.local;
          return { t: child.x / p.forces.length, right, distance: child.x, location: child };
        }
        const cuts = cutMap();
        const cut = cuts.get(distance === undefined ? t : distance / ef.length);
        if (cut && (distance === undefined || distance === cut.location.x)) {
          return { t: cut.t, right, distance: cut.localX, location: cut.location.rebased?.local };
        }
        if (distance !== undefined) {
          const x = localDistance(distance);
          if (location?.rebased && distanceUnits(p.x0) + distanceUnits(x) !== exactCutUnits(location)) {
            throw unavailableDiagramExtrema();
          }
          const localT = x / p.forces.length;
          const hit = curve.cutLocations.get(localT);
          if (hit?.x === x) {
            const physicalCut = distanceUnits(p.x0) + exactCutUnits(hit);
            const query = distanceUnits(distance);
            if (query !== physicalCut) return { t: localT, distance: x, right: query > physicalCut };
          }
          return { t: localT, right, distance: x };
        }
        stations ??= [...cuts].sort(([a], [b]) => a - b);
        const upper = stations.findIndex(([at]) => at > t);
        if (upper <= 0) throw unavailableDiagramExtrema();
        const [lo, left] = stations[upper - 1]!, [hi, next] = stations[upper]!;
        const fromLeft = t - lo, fromRight = hi - t;
        const scale = ef.length / p.forces.length;
        const localT = fromLeft <= fromRight ? left.t + fromLeft * scale : next.t - fromRight * scale;
        if (localT <= left.t) return { t: left.t, right: true };
        if (localT >= next.t) return { t: next.t, right: false };
        return { t: localT };
      };
      return { end, x1: p.x1, curve, parent, local, cutMap };
    });
    const pieceAt = ({ t, right, distance, location }: DiagramStation) =>
      pieces.find(p => {
        const x = distance ?? t;
        const end = distance === undefined ? p.end : p.x1;
        if (x === end && location?.rebased) {
          const cut = exactCutUnits(location), boundary = distanceUnits(p.x1);
          return right ? cut < boundary : cut <= boundary;
        }
        return right ? x < end : x <= end;
      }) ?? pieces[pieces.length - 1]!;
    const magnitudeBound = pieces.some(p => p.curve.magnitudeBound) ? () => Math.max(...pieces.map(p => maxMagnitude(p.curve))) : undefined;
    let cutLocations: Map<number, DiagramCutLocation> | undefined;
    const locations = () => cutLocations ??= joinedCutLocations(pieces.map(p =>
      new Map([...p.cutMap()].map(([t, cut]) => [t, cut.location]))));
    let extrema: DiagramExtremum[] | undefined;
    return {
      magnitudeBound,
      get cuts() { return sortedStations(locations().keys()); },
      get cutLocations() { return locations(); },
      extrema: () => extrema ??= pieces.flatMap(p => p.curve.extrema().map(peak => {
        const t = p.parent(peak.t);
        if (p.cutMap().has(t)) throw unavailableDiagramExtrema();
        return { t, value: peak.value, canTransfer: (station, distance) => {
          const at = { t: station, distance };
          if (p !== pieceAt(at)) return false;
          const local = p.local(at);
          return peak.canTransfer(local.t, local.distance);
        } };
      })),
      value(station) {
        locations();
        const p = pieceAt(station);
        return p.curve.value(p.local(station));
      },
      ...(pieces.every(p => p.curve.polynomials) ? { polynomials(start: DiagramStation, end: DiagramStation) {
        const p = pieceAt(start);
        return p.curve.polynomials!(p.local(start), p.local(end));
      } } : {}),
    };
  }
  const curve = leafCurve(ef, kind);
  let cutLocations: Map<number, DiagramCutLocation> | undefined;
  const distance = ({ distance, location }: DiagramStation) => {
    if (location?.rebased && exactCutUnits(location) !== distanceUnits(location.x)) throw unavailableDiagramExtrema();
    return distance;
  };
  return {
    get cuts() { return curve.cuts; },
    get cutLocations() { return cutLocations ??= new Map([...curve.cutDistances].map(([t, x]) => [t, { x }])); },
    value: station => curve.value({ ...station, distance: distance(station) }),
    polynomials: (start, end) => [{
      from: 0, to: 1, polynomial: curve.polynomial(start.t, end.t, distance(start), distance(end)),
    }],
    extrema: prepareCurveExtrema(curve, ef.length),
  };
}

export function criticalDiagramStations3D(ef: ElementForces3D, purpose: 'diagram' | 'concrete-design' = 'diagram'): DiagramStation[] {
  const curves = diagramKinds.map(kind => ({ kind, curve: spatialCurve(ef, kind) }));
  if (curves.some(({ curve }) => curve.magnitudeBound)) throw unavailableDiagramExtrema();
  const cuts = joinedCutLocations(curves.map(({ curve }) => curve.cutLocations));
  const extrema = curves.flatMap(({ kind, curve }) => {
    const sampled = purpose === 'concrete-design' && usesSampledBending(ef, kind);
    const peaks = [...indexDiagramExtrema(curve.extrema()).values()];
    if (peaks.some(peak => cuts.has(peak.t) || (!sampled && !peak.canTransfer(peak.t)))) throw unavailableDiagramExtrema();
    return sampled ? [] : peaks;
  });
  return sortedStations([...cuts.keys(), ...extrema.map(peak => peak.t)]).flatMap(t => {
    const location = cuts.get(t);
    const x = location?.x;
    const left = location ? { t, distance: x, ...(location.rebased && { location }) } : { t };
    const right = { ...left, right: true };
    return t < 1 && x !== undefined && curves.some(({ curve }) => curve.value(left) !== curve.value(right)) ? [left, right] : [left];
  });
}

export function memberCriticalOrdinates3D(
  ef: ElementForces3D, kind: Diagram3DKind | readonly [Diagram3DKind, Diagram3DKind], inwardAtI = false,
) {
  const curve = typeof kind === 'string' ? spatialCurve(ef, kind)
    : magnitudeCurve(kind.map(component => spatialCurve(ef, component)), 'srss', ef.length, true);
  if (curve.magnitudeBound) throw unavailableDiagramExtrema();
  const extrema = curve.extrema();
  const critical = diagramCriticalPoints(curve, extrema.filter(peak => !peak.aliased), inwardAtI);
  if (extrema.some(peak => peak.aliased)) {
    let min = Infinity, max = -Infinity;
    for (const { value } of critical) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    if (extrema.some(peak => peak.aliased && (peak.value < min || peak.value > max))) throw unavailableDiagramExtrema();
  }
  return critical.map(point => ({
    ...point,
    x: curve.cutLocations.get(point.t)?.x ?? point.t * ef.length,
  }));
}

function spatialExtrema(curve: SpatialCurve, critical: readonly DiagramOrdinate[], length: number) {
  let maxValue = -Infinity, minValue = Infinity;
  for (const { value } of critical) {
    if (value > maxValue) maxValue = value;
    if (value < minValue) minValue = value;
  }
  if (curve.magnitudeBound) {
    const bound = curve.magnitudeBound();
    if (!Number.isFinite(bound)) throw unavailableDiagramExtrema();
    return { maxValue: bound, minValue: -bound, maxAbsValue: bound, extrema: 'bounded' as const };
  }
  const { t, value: maxAbsValue, side: maxAbsSide } = maxAbsDiagramOrdinate(critical);
  return { maxValue, minValue, maxAbsValue, maxAbsX: curve.cutLocations.get(t)?.x ?? t * length, maxAbsSide };
}

export function computeSpatialDiagramExtrema(ef: ElementForces3D, kind: Diagram3DKind, inwardAtI = false) {
  const curve = spatialCurve(ef, kind);
  const range = spatialExtrema(curve, diagramCriticalPoints(curve, curve.extrema(), inwardAtI), ef.length);
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
export function evaluateDiagramAt(ef: ElementForces3D, kind: Diagram3DKind, station: number | DiagramStation, right = false): number {
  return evaluateSpatialCurve(spatialCurve(ef, kind), ef.length, typeof station === 'number' ? { t: station, right } : station);
}

export function prepareDiagramEvaluator3D(ef: ElementForces3D, kind: Diagram3DKind): (station: number | DiagramStation, right?: boolean) => number {
  const curve = spatialCurve(ef, kind);
  return (station, right = false) => evaluateSpatialCurve(curve, ef.length, typeof station === 'number' ? { t: station, right } : station);
}

function evaluateSpatialCurve(curve: SpatialCurve, length: number, station: DiagramStation): number {
  const at = station.distance === undefined ? station : { ...station, t: station.distance / length };
  if (curve.magnitudeBound) return curve.value(at);
  return checkedCurveValue(curve, at, indexDiagramExtrema(curve.extrema(at.t)));
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
