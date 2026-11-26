// 3D Diagram Computation — Analytical equations
// Compute diagram values (My, Mz, Vy, Vz, N, Mx) along each 3D element
// using equilibrium equations with distributed and point loads.

import { type UnitSystem, formatDiagramValue } from '../utils/units';
import { absolutePolynomialBranches, addMagnitudeBounds, checkedCurveValue, boundMemberEnvelopeDiagram, diagramCriticalPoints, diagramCurvePoints, envelopeMemberEndValues, fullSpanFallback, indexDiagramExtrema, inwardMemberEndValues, diagramOrdinateExtrema, memberEndFace, memberSectionStation, memberDiagram, curveExtrema, prepareCurveExtrema, prepareMagnitudeExtrema, sortedStations, spanCuts, spanResultantExtrema, unavailableDiagramExtrema, visitContinuousSpanCriticalPoints, visitMemberCriticalPoints, type DiagramCurve, type DiagramExtremum, type DiagramOrdinate, type DiagramStation, type PolynomialBranch } from './member-diagram';
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

interface SpatialCurve extends Pick<DiagramCurve, 'cuts' | 'mayHaveJump' | 'value'> {
  readonly length: number;
  cutLocations: ReadonlyMap<number, DiagramCutLocation>;
  polynomials?: {
    signed: boolean;
    branches: (start: DiagramStation, end: DiagramStation) => PolynomialBranch[];
  };
  squaredParts?: readonly SpatialCurve[];
  extrema: (at?: number) => DiagramExtremum[];
  magnitudeBound?: () => number;
}

function maxMagnitude(curve: SpatialCurve): number {
  return Math.abs(spatialExtrema(curve, spatialCriticalPoints(curve)).maxAbsValue);
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

function joinedCutLocations(curves: Iterable<ReadonlyMap<number, DiagramCutLocation>>, length?: number): Map<number, DiagramCutLocation> {
  const locations = new Map<number, DiagramCutLocation>();
  if (length !== undefined) {
    locations.set(0, { x: 0 });
    locations.set(1, { x: length });
  }
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

class SpatialLeafCurve implements SpatialCurve {
  private locations?: ReadonlyMap<number, DiagramCutLocation>;
  readonly extrema: SpatialCurve['extrema'];
  private branches?: NonNullable<SpatialCurve['polynomials']>;

  constructor(readonly length: number, private readonly curve: DiagramCurve) {
    this.extrema = prepareCurveExtrema(curve, length);
  }

  get polynomials() {
    return this.branches ??= {
      signed: true,
      branches: (start, end) => [this.polyBranch(start, end)],
    };
  }

  get mayHaveJump() { return this.curve.mayHaveJump; }
  get cuts() { return this.curve.cuts; }
  get cutLocations() {
    if (!this.locations) {
      const locations = new Map<number, DiagramCutLocation>();
      for (const [t, x] of this.curve.cutDistances) locations.set(t, { x });
      this.locations = locations;
    }
    return this.locations;
  }

  value(station: DiagramStation): number {
    this.checkLocation(station);
    return this.curve.value(station);
  }

  private checkLocation({ location }: DiagramStation): void {
    if (location?.rebased && exactCutUnits(location) !== distanceUnits(location.x)) throw unavailableDiagramExtrema();
  }

  private polyBranch(start: DiagramStation, end: DiagramStation): PolynomialBranch {
    this.checkLocation(start);
    this.checkLocation(end);
    return {
      from: 0, to: 1, polynomial: this.curve.polynomial(start.t, end.t, start.distance, end.distance),
    };
  }
}

function magnitudeCurve(
  components: readonly SpatialCurve[], method: 'srss' | 'abs', length: number, forResultant = false,
): SpatialCurve {
  const curves = method === 'srss' && components.some(component => component.squaredParts)
    ? components.flatMap(component => component.squaredParts ?? [component]) : components;
  let cutLocations: Map<number, DiagramCutLocation> | undefined;
  const locations = () => cutLocations ??= joinedCutLocations(curves.map(c => c.cutLocations), length);
  let cutStations: number[] | undefined;
  const cuts = () => cutStations ??= sortedStations(locations().keys());
  const distances = (): [number, number][] => cuts().map(t => [t, locations().get(t)!.x]);
  const branches = curves.flatMap(({ polynomials }) =>
    polynomials && (polynomials.signed || method === 'srss') ? [polynomials.branches] : []);
  const exact = branches.length === curves.length;
  const intervalBranches = (lo: number, hi: number, x0: number, x1: number) => {
    const start = atCut({ t: lo, distance: x0, right: true });
    const end = atCut({ t: hi, distance: x1 });
    return branches.map(branch => branch(start, end));
  };
  function atCut(station: DiagramStation): DiagramStation {
    const published = locations().get(station.t);
    const location = station.location ?? (station.distance === undefined || station.distance === published?.x ? published : undefined);
    return { ...station, distance: station.distance ?? location?.x, location };
  }
  const combine = (station: DiagramStation) => {
    const at = atCut(station);
    if (method === 'srss' && curves.length === 2) return Math.hypot(curves[0]!.value(at), curves[1]!.value(at));
    const values = curves.map(curve => curve.value(at));
    return method === 'srss' ? Math.hypot(...values) : values.reduce((sum, value) => sum + Math.abs(value), 0);
  };
  const keepAlias = forResultant ? (t: number) => locations().get(t)?.rebased !== undefined : undefined;
  const magnitudeBound = () => curves.reduce((bound, curve) => addMagnitudeBounds(bound, maxMagnitude(curve)), 0);
  return {
    length,
    mayHaveJump: curves.some(curve => curve.mayHaveJump),
    get cuts() { return cuts(); },
    get cutLocations() { return locations(); },
    extrema: exact ? prepareMagnitudeExtrema(intervalBranches, method, distances, length, keepAlias)
      : () => curves.flatMap(curve => curve.extrema().map(({ t }) => ({ t, value: combine({ t }), canTransfer: () => false, fallback: true }))),
    ...(!exact ? { magnitudeBound } : {}),
    ...(method === 'abs' && exact ? { polynomials: {
      signed: false,
      branches: (start: DiagramStation, end: DiagramStation) =>
        absolutePolynomialBranches(branches.map(branch => branch(start, end))),
    } } : {}),
    ...(method === 'srss' ? { squaredParts: curves }
      : curves.length === 1 ? { squaredParts: curves[0]!.squaredParts ?? curves } : {}),
    value: combine,
  };
}

function spatialCurve(ef: ElementForces3D, kind: Diagram3DKind): SpatialCurve {
  const { length, combined, pieces: memberPieces } = ef;
  if (combined) {
    const { method, parts } = combined;
    return magnitudeCurve(parts.map(p => spatialCurve(p, kind)), method, length);
  }
  if (memberPieces?.length) {
    const pieces = memberPieces.map(({ x0, x1, forces }) => {
      const end = x1 / length;
      const curve = spatialCurve(forces, kind);
      const pieceLength = curve.length;
      const distance = (x: number) => x === 0 ? x0 : x === pieceLength ? x1 : x0 + x;
      const parent = (t: number) => distance(curve.cutLocations.get(t)?.x ?? t * pieceLength) / length;
      const localDistance = (x: number) => x === x1 ? pieceLength : x - x0;
      type PieceCut = { t: number; location: DiagramCutLocation; localX: number };
      let boundaries: Map<number, PieceCut> | undefined;
      let stations: [number, PieceCut][] | undefined;
      const cutMap = () => {
        if (boundaries) return boundaries;
        const localCuts = curve.cutLocations;
        const mapped = new Map([...localCuts].map(([t, local]) => {
          const x = distance(local.x);
          const location = t === 0 || t === 1 ? { x } : { x, rebased: { offset: x0, local } };
          return [x / length, { t, location, localX: local.x }];
        }));
        if (mapped.size !== localCuts.size) throw unavailableDiagramExtrema();
        return boundaries = mapped;
      };
      const local = ({ t, right, distance, location }: DiagramStation): DiagramStation => {
        if (location?.rebased?.offset === x0) {
          const child = location.rebased.local;
          return { t: child.x / pieceLength, right, distance: child.x, location: child };
        }
        const cuts = cutMap();
        const cut = cuts.get(distance === undefined ? t : distance / length);
        if (cut && (distance === undefined || distance === cut.location.x)) {
          return { t: cut.t, right, distance: cut.localX, location: cut.location.rebased?.local };
        }
        if (distance !== undefined) {
          const x = localDistance(distance);
          if (location?.rebased && distanceUnits(x0) + distanceUnits(x) !== exactCutUnits(location)) {
            throw unavailableDiagramExtrema();
          }
          const localT = x / pieceLength;
          const hit = curve.cutLocations.get(localT);
          if (hit?.x === x) {
            const physicalCut = distanceUnits(x0) + exactCutUnits(hit);
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
        const scale = length / pieceLength;
        const localT = fromLeft <= fromRight ? left.t + fromLeft * scale : next.t - fromRight * scale;
        if (localT <= left.t) return { t: left.t, right: true };
        if (localT >= next.t) return { t: next.t, right: false };
        return { t: localT };
      };
      return { end, x1, curve, parent, local, cutMap };
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
      length,
      mayHaveJump: true,
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
      ...(pieces.every(p => p.curve.polynomials) ? { polynomials: {
        signed: pieces.every(p => p.curve.polynomials!.signed),
        branches(start: DiagramStation, end: DiagramStation) {
          const p = pieceAt(start);
          return p.curve.polynomials!.branches(p.local(start), p.local(end));
        },
      } } : {}),
    };
  }
  return new SpatialLeafCurve(length, leafCurve(ef, kind));
}

export function sampleMemberResultant3D(
  members: readonly ElementForces3D[], kinds: readonly [Diagram3DKind, Diagram3DKind], displayStations: readonly number[],
) {
  const length = members[0]?.length;
  if (length === undefined || members.some(member => member.length !== length)) throw unavailableDiagramExtrema();
  const sources = members.map(member => {
    requireConcurrentSectionForces(member);
    const curve = magnitudeCurve(kinds.map(kind => spatialCurve(member, kind)), 'srss', length, true);
    if (curve.magnitudeBound) throw unavailableDiagramExtrema();
    const extrema = curve.extrema();
    const points = spatialCriticalPoints(curve, undefined, extrema);
    return { curve, points, critical: indexDiagramExtrema(extrema.filter(point => !point.aliased)) };
  });
  const cuts = joinedCutLocations(sources.map(({ curve }) => curve.cutLocations));
  const ts = sortedStations([...displayStations, ...cuts.keys(), ...sources.flatMap(({ points }) => points.map(point => point.t))]);
  const valueAt = (at: DiagramStation) => sources.reduce(
    (max, { curve, critical }) => Math.max(max, checkedCurveValue(curve, at, critical)), 0);
  const stations = ts.flatMap(t => {
    const location = cuts.get(t);
    const cut = memberSectionStation(location ? { t, distance: location.x, location } : { t });
    const value = valueAt(cut);
    if (!location || memberEndFace(t) !== undefined) return [{ t, value }];
    const right = valueAt({ ...cut, right: true });
    return value === right ? [{ t, value }] : [{ t, value }, { t, value: right }];
  });
  const peak = sources.reduce((max, { points }) => Math.max(max, diagramOrdinateExtrema(points).max.value), 0);
  return { stations, peak };
}

export function stationaryBendingStations3D(ef: ElementForces3D, kind: 'momentY' | 'momentZ'): number[] {
  const curve = spatialCurve(ef, kind);
  if (!curve.polynomials?.signed) return [];
  const peaks = [...indexDiagramExtrema(curve.extrema()).values()];
  if (peaks.some(peak => !peak.canTransfer(peak.t))) throw unavailableDiagramExtrema();
  return peaks.map(peak => peak.t);
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
    if (memberEndFace(t) !== undefined) return [memberSectionStation(left)];
    const right = { ...left, right: true };
    return x !== undefined && curves.some(({ curve }) => curve.value(left) !== curve.value(right)) ? [left, right] : [left];
  });
}

type CriticalDiagram3DKind = Diagram3DKind | readonly [Diagram3DKind, Diagram3DKind];
type VisitSpatialOrdinate = (column: number, t: number, value: number, x: number, right?: true, side?: DiagramOrdinate['side']) => void;

export function memberCriticalOrdinates3D(ef: ElementForces3D, kind: CriticalDiagram3DKind) {
  const ordinates: (DiagramOrdinate & { x: number })[] = [];
  visitMemberCriticalOrdinates3D(ef, [kind], (_column, t, value, x, right, side) => {
    ordinates.push({ t, value, ...(right && { right }), ...(side && { side }), x });
  });
  return ordinates;
}

function visitSpatialCriticalOrdinates(curve: SpatialCurve, emit: VisitSpatialOrdinate, column: number): void {
  if (curve.magnitudeBound) throw unavailableDiagramExtrema();
  const extrema = curve.extrema();
  const locations = curve.cutLocations;
  const visit = (t: number, value: number, right?: true, side?: DiagramOrdinate['side']) =>
    emit(column, t, value, locations.get(t)?.x ?? t * curve.length, right, side);
  if (!extrema.some(peak => peak.aliased)) {
    visitMemberCriticalPoints(curve, extrema, visit);
    return;
  }
  for (const { t, value, right, side } of spatialCriticalPoints(curve, undefined, extrema)) {
    visit(t, value, right ? true : undefined, side);
  }
}

function spatialCriticalPoints(curve: SpatialCurve, faces?: 'diagram', extrema = curve.extrema()): DiagramOrdinate[] {
  const aliased = extrema.filter(peak => peak.aliased);
  if (!aliased.length) return diagramCriticalPoints(curve, extrema, faces);
  const points = diagramCriticalPoints(curve, extrema.filter(peak => !peak.aliased), faces);
  const { min, max } = diagramOrdinateExtrema(points);
  if (aliased.some(peak => peak.value < min.value || peak.value > max.value)) throw unavailableDiagramExtrema();
  return points;
}

const spanStart = Object.freeze(memberSectionStation({ t: 0 }));
const spanEnd = Object.freeze(memberSectionStation({ t: 1 }));

function visitLeafCriticalOrdinates(
  ef: ElementForces3D, kinds: readonly CriticalDiagram3DKind[], visit: VisitSpatialOrdinate,
): void {
  const { length } = ef;
  const curves: Partial<Record<Diagram3DKind, DiagramCurve>> = {};
  const component = (kind: Diagram3DKind) => curves[kind] ??= leafCurve(ef, kind);
  for (let column = 0; column < kinds.length; column++) {
    const kind = kinds[column]!;
    if (typeof kind === 'string') {
      const curve = component(kind);
      visitMemberCriticalPoints(curve, curveExtrema(curve, length), (t, value, right, side) => {
        const x = t === 0 || t === 1 ? t * length : curve.cutDistances.get(t) ?? t * length;
        visit(column, t, value, x, right, side);
      });
      continue;
    }
    const a = component(kind[0]), b = component(kind[1]);
    if (a.cuts === spanCuts && b.cuts === spanCuts) {
      const extrema = a.constant && b.constant ? []
        : spanResultantExtrema(a.polynomial(0, 1, 0, length), b.polynomial(0, 1, 0, length), length);
      const value = (station: DiagramStation) => Math.hypot(a.value(station), b.value(station));
      const emit = (t: number, ordinate: number, right?: true, side?: DiagramOrdinate['side']) =>
        visit(column, t, ordinate, t * length, right, side);
      if (!a.mayHaveJump && !b.mayHaveJump) {
        visitContinuousSpanCriticalPoints(value(spanStart), value(spanEnd), extrema, emit);
      } else {
        visitMemberCriticalPoints({ cuts: spanCuts, mayHaveJump: true, value }, extrema, emit);
      }
      continue;
    }
    const curve = magnitudeCurve([new SpatialLeafCurve(length, a), new SpatialLeafCurve(length, b)], 'srss', length, true);
    visitSpatialCriticalOrdinates(curve, visit, column);
  }
}

export function visitMemberCriticalOrdinates3D(
  ef: ElementForces3D, kinds: readonly CriticalDiagram3DKind[], visit: VisitSpatialOrdinate,
): void {
  if (!ef.combined && !ef.pieces?.length) {
    visitLeafCriticalOrdinates(ef, kinds, visit);
    return;
  }
  const curves: Partial<Record<Diagram3DKind, SpatialCurve>> = {};
  const component = (kind: Diagram3DKind) => curves[kind] ??= spatialCurve(ef, kind);
  for (let column = 0; column < kinds.length; column++) {
    const kind = kinds[column]!;
    const curve = typeof kind === 'string' ? component(kind)
      : magnitudeCurve([component(kind[0]), component(kind[1])], 'srss', ef.length, true);
    visitSpatialCriticalOrdinates(curve, visit, column);
  }
}

function spatialExtrema(curve: SpatialCurve, critical: readonly DiagramOrdinate[]) {
  const { min, max, abs } = diagramOrdinateExtrema(critical);
  if (curve.magnitudeBound) {
    const bound = Math.max(curve.magnitudeBound(), Math.abs(abs.value));
    if (!Number.isFinite(bound)) throw unavailableDiagramExtrema();
    return { maxValue: bound, minValue: -bound, maxAbsValue: bound, extrema: 'bounded' as const };
  }
  const locate = (point: DiagramOrdinate) => ({ ...point, x: curve.cutLocations.get(point.t)?.x ?? point.t * curve.length });
  return {
    min: locate(min), max: locate(max), absolute: locate(abs), maxValue: max.value, minValue: min.value,
    maxAbsValue: abs.value, maxAbsX: locate(abs).x, maxAbsSide: abs.side,
  };
}

const leafEndFields = {
  axial: ['nStart', 'nEnd', 'pointLoadsX'],
  shearY: ['vyStart', 'vyEnd', 'pointLoadsY'],
  shearZ: ['vzStart', 'vzEnd', 'pointLoadsZ'],
  torsion: ['mxStart', 'mxEnd'],
  momentY: ['myStart', 'myEnd'],
  momentZ: ['mzStart', 'mzEnd'],
} as const;

export function memberEndForces3D(ef: ElementForces3D, kind: Diagram3DKind): [number, number] {
  const envelopeEnds = envelopeMemberEndValues(ef, kind);
  if (envelopeEnds) return envelopeEnds;
  if (ef.combined || ef.pieces?.length) {
    const evaluate = prepareDiagramEvaluator3D(ef, kind);
    return [evaluate(spanStart), evaluate(spanEnd)];
  }
  const [start, end, jumpLoads] = leafEndFields[kind];
  return inwardMemberEndValues(ef.length, [ef[start], ef[end]],
    x => jumpLoads !== undefined && (ef[jumpLoads]?.some(p => p.a === x && p.p !== 0) ?? false),
    () => prepareDiagramEvaluator3D(ef, kind));
}

export function requireConcurrentSectionForces(ef: ElementForces3D): void {
  if (ef.combined || boundMemberEnvelopeDiagram(ef, 'axial')) throw unavailableDiagramExtrema();
}

export function memberEndSections3D(ef: ElementForces3D) {
  const [ni, nj] = memberEndForces3D(ef, 'axial');
  const [vyi, vyj] = memberEndForces3D(ef, 'shearY');
  const [vzi, vzj] = memberEndForces3D(ef, 'shearZ');
  const [mxi, mxj] = memberEndForces3D(ef, 'torsion');
  const [myi, myj] = memberEndForces3D(ef, 'momentY');
  const [mzi, mzj] = memberEndForces3D(ef, 'momentZ');
  return [
    { n: ni, vy: vyi, vz: vzi, mx: mxi, my: myi, mz: mzi },
    { n: nj, vy: vyj, vz: vzj, mx: mxj, my: myj, mz: mzj },
  ] as const;
}

export function computeSpatialDiagramExtrema(ef: ElementForces3D, kind: Diagram3DKind, faces?: 'diagram') {
  const curve = spatialCurve(ef, kind);
  const critical = spatialCriticalPoints(curve, faces);
  const range = spatialExtrema(curve, critical);
  return {
    ...range,
    minValue: range.extrema && ef.combined ? 0 : range.minValue,
    startValue: critical[0]!.value,
    endValue: critical.at(-1)!.value,
  };
}

export function computeDiagram3D(ef: ElementForces3D, kind: Diagram3DKind): ElementDiagram3D {
  const curve = spatialCurve(ef, kind);
  const critical = spatialCriticalPoints(curve, 'diagram');
  const points = diagramCurvePoints(curve, critical);
  const range = spatialExtrema(curve, critical);
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
    const d = computeSpatialDiagramExtrema(ef, kind, 'diagram');
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
  if (!e?.tPositions.length) return [];
  return [e.posValues, e.negValues].map((values) => {
    const points = e.tPositions.map((t, i) => ({ t, value: values[i]! }));
    const { min, max, abs } = diagramOrdinateExtrema(points);
    return { elementId, points, maxValue: max.value, minValue: min.value, maxAbsValue: abs.value };
  });
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
export function evaluateDiagramAt(ef: ElementForces3D, kind: Diagram3DKind, station: number | DiagramStation, right?: boolean): number {
  return prepareDiagramEvaluator3D(ef, kind)(station, right);
}

export function prepareDiagramEvaluator3D(ef: ElementForces3D, kind: Diagram3DKind): (station: number | DiagramStation, right?: boolean) => number {
  const curve = spatialCurve(ef, kind);
  return (station, right) => {
    const at = typeof station === 'number' ? { t: station, right: false } : station;
    return evaluateSpatialCurve(curve, right === undefined ? at : { ...at, right });
  };
}

function evaluateSpatialCurve(curve: SpatialCurve, station: DiagramStation): number {
  const at = station.distance === undefined ? station : { ...station, t: station.distance / curve.length };
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
