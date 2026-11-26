import { EngineMessageError } from '../codes/message';
import { distanceUnits, envelopeJumpCuts, type DiagramCutLocation } from './diagram-cut';
import type { ElementEnvelopeDiagram, FullEnvelope } from './types';
import type { FullEnvelope3D } from './types-3d';
import { polynomialValue, preparePolynomialSign, roundDiagramSum, sumDiagramTerms, type DiagramPolynomial, type DiagramSum } from './diagram-sum';

export const DIAGRAM_EXTREMA_UNAVAILABLE = 'solver.diagramExtremaUnavailable';

export interface DiagramStation {
  t: number;
  right?: boolean;
  distance?: number;
  location?: DiagramCutLocation;
}

export interface DiagramExtremum {
  t: number;
  value: number;
  canTransfer: (t: number, distance?: number) => boolean;
  fallback?: true;
  aliased?: true;
}

export interface PolynomialBranch {
  from: number;
  to: number;
  polynomial: DiagramPolynomial;
}

type PeakTransferCertificate = (x0: number, x1: number, x: number, value: number) => boolean;

export interface DiagramCurve {
  readonly length: number;
  hasDistributedActions: boolean;
  readonly constant?: true;
  mayHaveJump: boolean;
  certifyPeakTransfer?: PeakTransferCertificate;
  cuts: readonly number[];
  cutDistances: ReadonlyMap<number, number>;
  value: (station: DiagramStation) => number;
  polynomial: (lo: number, hi: number, x0?: number, x1?: number) => DiagramPolynomial;
}

export interface DistributedAction {
  a: number;
  b: number;
  qI: number;
  qJ: number;
}

interface PointAction {
  a: number;
  jump: number;
  slope?: number;
}

const regularStations = Array.from({ length: 21 }, (_, i) => i / 20);

export function sortedStations(stations: Iterable<number>): number[] {
  return [...new Set(stations)].sort((a, b) => a - b);
}

export function fullSpanFallback(length: number, loads: DistributedAction[] | undefined, qI: number, qJ: number): DistributedAction[] {
  return loads?.length ? loads : qI || qJ ? [{ a: 0, b: length, qI, qJ }] : [];
}

export function distributedActionTerms(load: DistributedAction, x: number): [force: number, moment: number] {
  return integratedActionTerms(load.qI, load.qJ, load.b - load.a, x - load.a);
}

function integratedActionTerms(qI: number, qJ: number, span: number, distance: number): [number, number] {
  if (span <= 0 || distance <= 0) return [0, 0];
  const s = Math.min(span, distance);
  const u = s / span;
  const left = qI * s;
  const right = qJ * s;
  const force = left * (1 - u / 2) + right * (u / 2);
  return [force, (left * (0.5 - u / 6) + right * (u / 6)) * s + force * (distance - s)];
}

function addActionTerms(
  terms: number[], load: DistributedAction, x: number, component: 0 | 1, scale: number,
): void {
  const { qI, qJ, a, b } = load;
  const span = b - a, distance = x - a;
  if (qI === qJ) {
    terms.push(scale * integratedActionTerms(qI, qJ, span, distance)[component]);
    return;
  }
  const inside = Math.min(distance, span);
  const left = qI === 0 ? zeroAction : integratedActionTerms(qI, 0, span, inside);
  const right = qJ === 0 ? zeroAction : integratedActionTerms(0, qJ, span, inside);
  const add = (index: 0 | 1, factor: number) => {
    for (const term of sumDiagramTerms([left[index], right[index]])) terms.push(factor * term);
  };
  add(component, scale);
  if (component === 1 && distance > span) add(0, scale * (distance - span));
}

export function diagramLineValue(start: number, change: number, rate: number, x: number, t: number): number {
  return start + rate * x + change * t;
}

function lineTerms(start: number, change: number, rate: number, x: number, t: number): number[] {
  return [start, rate * x, change * t];
}

function lineSlopeTerms(change: number, rate: number, width: number, length: number): number[] {
  return [rate * width, change * (width / length)];
}

const emptyCoefficient: DiagramSum = [];
export const spanCuts = Object.freeze([0, 1]);
const noExtrema = (): DiagramExtremum[] => [];

class AffineMemberDiagram implements DiagramCurve {
  readonly hasDistributedActions = false;
  readonly mayHaveJump = false;
  private distances?: ReadonlyMap<number, number>;
  private fullSpanPolynomial?: DiagramPolynomial;

  constructor(
    readonly length: number, private readonly start: number,
    private readonly change: number, private readonly rate: number,
  ) {}

  get constant() { return this.change === 0 && this.rate === 0 ? true : undefined; }
  get cuts() { return spanCuts; }
  get cutDistances() { return this.distances ??= new Map([[0, 0], [1, this.length]]); }

  value({ t, distance }: DiagramStation): number {
    const station = distance === undefined ? t : distance / this.length;
    return diagramLineValue(this.start, this.change, this.rate, distance ?? t * this.length, station);
  }

  polynomial(
    lo: number, hi: number, x0 = lo === 0 ? 0 : lo * this.length, x1 = hi === 0 ? 0 : hi * this.length,
  ): DiagramPolynomial {
    const fullSpan = lo === 0 && hi === 1 && x0 === 0 && x1 === this.length;
    if (fullSpan) return this.fullSpanPolynomial ??= this.buildPolynomial(lo, x0, x1);
    return this.buildPolynomial(lo, x0, x1);
  }

  private buildPolynomial(lo: number, x0: number, x1: number): DiagramPolynomial {
    const width = x1 - x0;
    return [
      sumDiagramTerms(lineTerms(this.start, this.change, this.rate, x0, lo)),
      sumDiagramTerms(lineSlopeTerms(this.change, this.rate, width, this.length)),
      emptyCoefficient, emptyCoefficient,
    ];
  }
}

function mergeOpposingLoads(group: DistributedAction[]): DistributedAction[] {
  const opposes = (end: 'qI' | 'qJ') => group.some(load => load[end] < 0) && group.some(load => load[end] > 0);
  if (!opposes('qI') && !opposes('qJ')) return group;
  const { a, b } = group[0]!;
  const left = sumDiagramTerms(group.map(load => load.qI));
  const right = sumDiagramTerms(group.map(load => load.qJ));
  return Array.from({ length: Math.max(left.length, right.length, 1) }, (_, i) =>
    ({ a, b, qI: left[i] ?? 0, qJ: right[i] ?? 0 }));
}

function diagramLoads(loads: DistributedAction[]): DistributedAction[] {
  if (loads.length < 2) return loads;
  const first = loads[0]!;
  if (loads.every(load => load.a === first.a && load.b === first.b)) return mergeOpposingLoads(loads);
  const groups = new Map<string, DistributedAction[]>();
  for (const load of loads) {
    const key = `${load.a}:${load.b}`;
    const group = groups.get(key);
    if (group) group.push(load);
    else groups.set(key, [load]);
  }
  return [...groups.values()].flatMap(mergeOpposingLoads);
}

export function memberDiagram(
  length: number, start: number, change: number, distributedActions: readonly DistributedAction[],
  pointActions: readonly PointAction[], order: 'force' | 'moment' = 'force', sign = 1, rate = 0,
): DiagramCurve {
  if (!(length > 0 && Number.isFinite(length))) throw unavailableDiagramExtrema();
  if (distributedActions.length === 0 && pointActions.length === 0) return new AffineMemberDiagram(length, start, change, rate);
  return new LoadedMemberDiagram(length, start, change, rate, distributedActions, pointActions, order, sign);
}

class LoadedMemberDiagram implements DiagramCurve {
  private readonly distributed: readonly DistributedAction[];
  private readonly points: readonly PointAction[];
  private readonly component: 0 | 1;
  readonly hasDistributedActions: boolean;
  readonly mayHaveJump: boolean;
  readonly certifyPeakTransfer?: PeakTransferCertificate;
  private cutStations?: readonly number[];
  private physicalCuts?: readonly number[];
  private distances?: ReadonlyMap<number, number>;
  private orderedCuts?: [number, number][];
  private intervals?: Map<number, DiagramPolynomial>;
  private fullSpanPolynomial?: DiagramPolynomial;
  private startValue?: number;
  private endValue?: number;

  constructor(
    readonly length: number, private readonly start: number, private readonly change: number, private readonly rate: number,
    distributedActions: readonly DistributedAction[], pointActions: readonly PointAction[],
    order: 'force' | 'moment', private readonly sign: number,
  ) {
    const actions = distributedActions.map(action => ({ ...action }));
    this.distributed = diagramLoads(actions);
    this.points = pointActions.map(action => ({ ...action }));
    this.hasDistributedActions = this.distributed.length > 0;
    this.mayHaveJump = this.points.length > 0;
    this.component = order === 'force' ? 0 : 1;
    if (order === 'moment' && change === 0 && !this.mayHaveJump && Number.isFinite(start) && Number.isFinite(rate)
      && actions.every(load => load.a >= 0 && load.a < load.b && load.b <= length && load.qI === load.qJ && Number.isFinite(load.qI))) {
      this.certifyPeakTransfer = (x0, x1, x, value) => uniformMomentTransfers(start, rate, sign, actions, x0, x1, x, value);
    }
  }

  get cuts(): readonly number[] {
    if (this.cutStations) return this.cutStations;
    const { length, distributed, points } = this;
    const xs = [0, length];
    for (const { a, b } of distributed) {
      if (a > 0 && a < length) xs.push(a);
      if (b > 0 && b < length) xs.push(b);
    }
    for (const { a } of points) if (a > 0 && a < length) xs.push(a);
    if (xs.length === 2) {
      this.physicalCuts = xs;
      return this.cutStations = spanCuts;
    }
    const physical = sortedStations(xs);
    const cuts = physical.map(x => x / length);
    if (cuts.some((t, i) => i > 0 && cuts[i - 1] === t)) throw unavailableDiagramExtrema();
    this.physicalCuts = physical;
    return this.cutStations = cuts;
  }

  get cutDistances(): ReadonlyMap<number, number> {
    if (this.distances) return this.distances;
    const cuts = this.cuts, physical = this.physicalCuts!;
    const mapped = new Map<number, number>();
    for (let i = 0; i < cuts.length; i++) mapped.set(cuts[i]!, physical[i]!);
    return this.distances = mapped;
  }

  private boundaryValue(x: number, t: number, right: boolean): DiagramSum {
    const { start, change, rate, distributed, points, component, sign } = this;
    const contributions = lineTerms(start, change, rate, x, t);
    for (const load of distributed) addActionTerms(contributions, load, x, component, sign);
    for (const point of points) {
      if (point.a < x || (right && point.a === x)) {
        if (point.slope) contributions.push(point.slope * (x - point.a));
        contributions.push(point.jump);
      }
    }
    return sumDiagramTerms(contributions);
  }

  private buildPolynomial(lo: number, x0: number, x1: number): DiagramPolynomial {
    const { length, change, rate, points, distributed, component, sign } = this;
    const width = x1 - x0;
    const linear = lineSlopeTerms(change, rate, width, length);
    const quadratic: number[] = [];
    const cubic: number[] = [];
    for (const point of points) {
      if (point.slope && point.a <= x0) linear.push(point.slope * width);
    }
    for (const load of distributed) {
      if (component === 1) addActionTerms(linear, load, x0, 0, sign * width);
      if (x0 < load.a || x0 >= load.b) continue;
      const span = load.b - load.a;
      const u = (x0 - load.a) / span;
      const [initial, gradient, integral, gradientIntegral] = component === 0
        ? [linear, quadratic, 1, 0.5] as const
        : [quadratic, cubic, width / 2, width / 6] as const;
      const signedWidth = sign * width;
      if (load.qI === load.qJ) {
        initial.push(signedWidth * load.qI * integral);
      } else {
        initial.push(
          signedWidth * load.qI * integral, -signedWidth * (load.qI * u) * integral, signedWidth * (load.qJ * u) * integral,
        );
        const fraction = width / span;
        gradient.push(signedWidth * (load.qJ * fraction) * gradientIntegral, -signedWidth * (load.qI * fraction) * gradientIntegral);
      }
    }
    return [this.boundaryValue(x0, lo, true), sumDiagramTerms(linear), sumDiagramTerms(quadratic), sumDiagramTerms(cubic)];
  }

  polynomial(lo: number, hi: number, x0?: number, x1?: number): DiagramPolynomial {
    const cuts = this.cuts, length = this.length;
    if (cuts === spanCuts && lo === 0 && hi === 1 && (x0 === undefined || x0 === 0) && (x1 === undefined || x1 === length)) {
      return this.fullSpanPolynomial ??= this.buildPolynomial(0, 0, length);
    }
    const cutDistances = this.cutDistances;
    const start = cutDistances.get(lo), end = cutDistances.get(hi);
    x0 ??= start ?? lo * length;
    x1 ??= end ?? hi * length;
    if (x0 !== start || x1 !== end || cuts[cuts.indexOf(lo) + 1] !== hi) return this.buildPolynomial(lo, x0, x1);
    const intervals = this.intervals ??= new Map();
    const prepared = intervals.get(lo);
    if (prepared) return prepared;
    const coefficients = this.buildPolynomial(lo, x0, x1);
    intervals.set(lo, coefficients);
    return coefficients;
  }

  value({ t, right, distance }: DiagramStation): number {
    const length = this.length;
    const station = distance === undefined ? t : distance / length;
    if ((station === 0 || station === 1) && (distance === undefined || distance === station * length) && this.cuts === spanCuts) {
      const x = distance ?? (station === 0 ? 0 : length);
      if (this.mayHaveJump) return roundDiagramSum(this.boundaryValue(x, station, right === true));
      if (station === 0) {
        return this.startValue ??= roundDiagramSum(this.fullSpanPolynomial?.[0] ?? this.boundaryValue(x, 0, false));
      }
      return this.endValue ??= roundDiagramSum(this.boundaryValue(x, 1, false));
    }
    const cut = this.cutDistances.get(station);
    const x = distance ?? cut ?? t * length;
    if (x === cut || x < 0 || x > length || !Number.isFinite(x)) {
      return roundDiagramSum(this.boundaryValue(x, station, right === true));
    }
    const orderedCuts = this.orderedCuts ??= [...this.cutDistances];
    const upper = orderedCuts.findIndex(([station, physical]) => distance === undefined ? station > t : physical > distance);
    if (upper <= 0) throw unavailableDiagramExtrema();
    const [lo, x0] = orderedCuts[upper - 1]!, [hi, x1] = orderedCuts[upper]!;
    const coefficients = this.polynomial(lo, hi, x0, x1);
    const width = x1 - x0;
    const u = distance !== undefined ? (x - x0) / width
      : x <= x0 ? (t - lo) * length / width
        : x >= x1 ? 1 - (hi - t) * length / width : (x - x0) / width;
    return roundDiagramSum(polynomialValue(coefficients, u));
  }
}

function moveOrdinate(ordinate: DiagramSum, p: DiagramPolynomial, u: number, step: number, sign = 1): DiagramSum {
  const [, linear = [], quadratic = [], cubic = []] = p;
  const slope = sumDiagramTerms([
    ...linear, ...quadratic.map(term => term * (2 * u)), ...cubic.map(term => 3 * (u * (u * term))),
  ]);
  const curvature = sumDiagramTerms([...quadratic, ...cubic.map(term => term * (3 * u + step))]);
  return sumDiagramTerms([
    ...ordinate, ...slope.map(term => sign * step * term), ...curvature.map(term => sign * step * (step * term)),
  ]);
}

function diagramExtremum(
  lo: number, hi: number, u: number, x0: number, x1: number, length: number,
  polynomials: readonly DiagramPolynomial[],
  combine: (values: number[]) => number,
  at?: number,
  keepAlias?: (t: number) => boolean,
  certifyTransfer?: PeakTransferCertificate,
): DiagramExtremum | undefined {
  const projected = lo + (hi - lo) * u;
  const t = projected === hi ? hi - (hi - lo) * (1 - u) : projected;
  if (at !== undefined && t !== at) return undefined;
  const ordinates = polynomials.map(p => polynomialValue(p, u));
  const value = combine(ordinates.map(roundDiagramSum));
  if (!Number.isFinite(value)) throw unavailableDiagramExtrema();
  if (!(t > lo && t < hi)) {
    const edge = t === lo ? 0 : 1;
    const limits = polynomials.map(p => polynomialValue(p, edge));
    const boundary = combine(limits.map(roundDiagramSum));
    const interior = combine(polynomials.map((p, i) => roundDiagramSum(moveOrdinate(limits[i]!, p, u, edge - u, -1))));
    if (!Number.isFinite(interior)) throw unavailableDiagramExtrema();
    if (interior === boundary) return undefined;
    if (!keepAlias?.(t)) throw unavailableDiagramExtrema();
    return { t, value: interior, canTransfer: () => false, aliased: true };
  }
  const canTransfer = (station: number, distance?: number) => {
    const x = distance ?? station * length;
    const local = (x - x0) / (x1 - x0);
    if (!(local > 0 && local < 1)) return false;
    const moved = polynomials.map((p, i) => roundDiagramSum(moveOrdinate(ordinates[i]!, p, u, local - u)));
    return combine(moved) === value || certifyTransfer?.(x0, x1, x, value) === true;
  };
  return { t, value, canTransfer };
}

interface ExtremaInterval {
  polynomials: DiagramPolynomial[];
  roots: number[];
  certifyTransfer?: PeakTransferCertificate;
}

function prepareIntervalExtrema(
  getCuts: () => [number, number][], length: number, combine: (values: number[]) => number,
  prepare: (lo: number, hi: number, x0: number, x1: number) => ExtremaInterval[],
  keepAlias?: (t: number) => boolean,
): (at?: number) => DiagramExtremum[] {
  let cuts: [number, number][] | undefined;
  const intervals: ExtremaInterval[][] = [];
  return at => {
    cuts ??= getCuts();
    const extrema: DiagramExtremum[] = [];
    for (let k = 1; k < cuts.length; k++) {
      const [lo, x0] = cuts[k - 1]!, [hi, x1] = cuts[k]!;
      if (!(hi > lo) || (at !== undefined && !(lo <= at && at <= hi))) continue;
      const branches = intervals[k] ??= prepare(lo, hi, x0, x1);
      for (const { polynomials, roots, certifyTransfer } of branches) {
        for (const u of roots) {
          const point = diagramExtremum(lo, hi, u, x0, x1, length, polynomials, combine, at, keepAlias, certifyTransfer);
          if (point) extrema.push(point);
        }
      }
    }
    return extrema;
  };
}

function componentInterval(curve: DiagramCurve, lo: number, hi: number): ExtremaInterval {
  const polynomial = curve.polynomial(lo, hi);
  const roots = polynomialRootCandidates(polynomialDerivative(polynomial)).filter(u => u > 0 && u < 1);
  return { polynomials: [polynomial], roots, certifyTransfer: curve.certifyPeakTransfer };
}

const scalar = ([value]: number[]) => value!;

export function prepareCurveExtrema(curve: DiagramCurve, length: number): (at?: number) => DiagramExtremum[] {
  if (!curve.hasDistributedActions) return noExtrema;
  return prepareIntervalExtrema(() => [...curve.cutDistances], length, scalar, (lo, hi) => [componentInterval(curve, lo, hi)]);
}

export function curveExtrema(curve: DiagramCurve, length: number, at?: number): DiagramExtremum[] {
  if (curve.hasDistributedActions && curve.cuts === spanCuts && at === undefined) {
    const { polynomials, roots, certifyTransfer } = componentInterval(curve, 0, 1);
    const extrema: DiagramExtremum[] = [];
    for (const u of roots) {
      const peak = diagramExtremum(0, 1, u, 0, curve.length, length, polynomials, scalar, undefined, undefined, certifyTransfer);
      if (peak) extrema.push(peak);
    }
    return extrema;
  }
  return prepareCurveExtrema(curve, length)(at);
}

export function indexDiagramExtrema(critical: readonly DiagramExtremum[]): Map<number, DiagramExtremum> {
  const byStation = new Map<number, DiagramExtremum>();
  for (const peak of critical) {
    const previous = byStation.get(peak.t);
    if (!previous) {
      byStation.set(peak.t, peak);
    } else if (previous.value !== peak.value) {
      throw unavailableDiagramExtrema();
    } else if (previous.canTransfer(peak.t) && !peak.canTransfer(peak.t)) {
      byStation.set(peak.t, peak);
    }
  }
  return byStation;
}

export function checkedCurveValue(curve: Pick<DiagramCurve, 'value'>, station: DiagramStation, critical: ReadonlyMap<number, DiagramExtremum>): number {
  const peak = critical.get(station.t);
  if (peak) {
    if (!peak.canTransfer(station.t, station.distance)) throw unavailableDiagramExtrema();
    return peak.value;
  }
  return checkedSectionValue(curve, station);
}

export function checkedSectionValue(curve: Pick<DiagramCurve, 'value'>, station: DiagramStation): number {
  const value = curve.value(station);
  if (!Number.isFinite(value)) throw unavailableDiagramExtrema();
  return value;
}

export type DiagramOrdinate = DiagramStation & { value: number; side?: 'left' | 'right' };
type DiagramValues = Pick<DiagramCurve, 'cuts' | 'mayHaveJump' | 'value'>;
type VisitOrdinate = (t: number, value: number, right?: true, side?: DiagramOrdinate['side']) => void;

export function memberEndFace(t: number): boolean | undefined {
  return t === 0 ? true : t === 1 ? false : undefined;
}

export function memberSectionStation(station: DiagramStation): DiagramStation {
  const face = memberEndFace(station.t);
  return face === undefined || face === (station.right ?? false) ? station : { ...station, right: face };
}

type MemberEndRecord = { length: number; elementId: number };
const envelopeMemberDiagrams = new WeakMap<MemberEndRecord, ReadonlyMap<string, ReadonlyMap<number, ElementEnvelopeDiagram>>>();

export function bindMemberEnvelopeEnds<E extends FullEnvelope | FullEnvelope3D | null | undefined>(envelope: E): E {
  if (!envelope) return envelope;
  const members = 'maxAbsResults' in envelope ? envelope.maxAbsResults?.elementForces : envelope.maxAbsResults3D?.elementForces;
  if (!members?.length) return envelope;
  const curves = 'maxAbsResults' in envelope
    ? [envelope.moment, envelope.shear, envelope.axial]
    : [envelope.momentY, envelope.momentZ, envelope.shearY, envelope.shearZ, envelope.axial, envelope.torsion];
  const byKind = new Map<string, ReadonlyMap<number, ElementEnvelopeDiagram>>();
  for (const curve of curves) {
    if (curve?.elements) byKind.set(curve.kind, new Map(curve.elements.map(element => [element.elementId, element])));
  }
  for (const member of members) envelopeMemberDiagrams.set(member, byKind);
  return envelope;
}

export function boundMemberEnvelopeDiagram(member: MemberEndRecord, kind: string): ElementEnvelopeDiagram | undefined {
  const byKind = envelopeMemberDiagrams.get(member);
  if (!byKind) return undefined;
  const curve = byKind.get(kind)?.get(member.elementId);
  if (!curve) throw unavailableDiagramExtrema();
  return curve;
}

export function envelopeMemberEndValues(member: MemberEndRecord, kind: string): [number, number] | undefined {
  const curve = boundMemberEnvelopeDiagram(member, kind);
  if (!curve) return undefined;
  const values = memberEnvelopeOrdinates(curve, member.length);
  const i = values[0], j = values.at(-1);
  if (i?.t !== 0 || j?.t !== 1) throw unavailableDiagramExtrema();
  return [i.value, j.value];
}

export function inwardMemberEndValues(
  length: number, stored: [number, number], jumpsAt: (x: number) => boolean,
  prepare: () => (station: DiagramStation) => number,
): [number, number] {
  const atI = jumpsAt(0), atJ = jumpsAt(length);
  if (!atI && !atJ) return stored;
  const value = prepare();
  return [
    atI ? value(memberSectionStation({ t: 0 })) : stored[0],
    atJ ? value(memberSectionStation({ t: 1 })) : stored[1],
  ];
}

function isInwardEndpointFace(t: number, right?: boolean): boolean {
  const face = memberEndFace(t);
  return face === undefined || right === undefined || face === right;
}

export function memberEnvelopeBounds(diagram: ElementEnvelopeDiagram, length: number, facesMode?: 'diagram') {
  const faces = new Map<number, { x: number; side: 'left' | 'right' }>();
  for (const { index, distance: x } of envelopeJumpCuts(diagram, length)) {
    faces.set(index, { x, side: 'left' });
    faces.set(index + 1, { x, side: 'right' });
  }
  return diagram.tPositions.flatMap((t, i) => {
    const face = faces.get(i);
    if (!(facesMode === 'diagram' && t === 0) && !isInwardEndpointFace(t, face && face.side === 'right')) return [];
    const pos = diagram.posValues[i] ?? 0, neg = diagram.negValues[i] ?? 0;
    return [{ t, x: t * length, pos, neg, ...face }];
  });
}

export function memberEnvelopeOrdinates(diagram: ElementEnvelopeDiagram, length: number) {
  return memberEnvelopeBounds(diagram, length).map(({ pos, neg, ...station }) => ({
    ...station, value: Math.abs(neg) > Math.abs(pos) ? neg : pos,
  }));
}

export function envelopeForceExtrema(diagram: ElementEnvelopeDiagram, length: number, faces?: 'diagram') {
  const { tPositions, posValues, negValues } = diagram;
  if (!Number.isFinite(length) || length <= 0 ||
    tPositions.length !== posValues.length || tPositions.length !== negValues.length ||
    tPositions[0] !== 0 || tPositions.at(-1) !== 1) throw unavailableDiagramExtrema();
  for (const [i, t] of tPositions.entries()) {
    const pos = posValues[i]!, neg = negValues[i]!;
    if (!Number.isFinite(t) || (i > 0 && t < tPositions[i - 1]!) ||
      !Number.isFinite(pos) || pos < 0 || !Number.isFinite(neg) || neg > 0) throw unavailableDiagramExtrema();
  }
  const stations = memberEnvelopeBounds(diagram, length, faces);
  const upper = stations.map(({ pos, neg, ...station }) => ({ ...station, value: pos }));
  const lower = stations.map(({ pos, neg, ...station }) => ({ ...station, value: neg }));
  const max = diagramOrdinateExtrema(upper).max;
  const min = diagramOrdinateExtrema(lower).min;
  const positiveFirst = max.t < min.t ||
    (max.t === min.t && !(max.side === 'right' && min.side === 'left'));
  const { abs: absolute } = diagramOrdinateExtrema(positiveFirst ? [max, min] : [min, max]);
  return { kind: 'envelope' as const, min, max, absolute };
}

export function diagramCriticalPoints(
  curve: DiagramValues, critical: readonly DiagramExtremum[], faces: 'section' | 'diagram' = 'section',
): DiagramOrdinate[] {
  const points: DiagramOrdinate[] = [];
  visitCriticalPoints(curve, critical, (t, value, right, side) => {
    points.push({ t, value, ...(right && { right }), ...(side && { side }) });
  }, faces);
  return points;
}

const startLeft = Object.freeze({ t: 0 });
const startRight = Object.freeze(memberSectionStation(startLeft));
const endLeft = Object.freeze({ t: 1 });

function visitCut(curve: DiagramValues, t: number, faces: 'section' | 'diagram', visit: VisitOrdinate): void {
  const left = faces === 'diagram' || isInwardEndpointFace(t, false)
    ? checkedSectionValue(curve, t === 0 ? startLeft : t === 1 ? endLeft : { t }) : undefined;
  const right = isInwardEndpointFace(t, true) && (curve.mayHaveJump || left === undefined)
    ? checkedSectionValue(curve, t === 0 ? startRight : { t, right: true }) : undefined;
  const distinctRight = right !== undefined && right !== left;
  if (left !== undefined) visit(t, left, undefined, distinctRight ? 'left' : undefined);
  if (distinctRight) visit(t, right, true, left === undefined ? undefined : 'right');
}

function visitPeak(peak: DiagramExtremum, visit: VisitOrdinate): void {
  if (!Number.isFinite(peak.value)) throw unavailableDiagramExtrema();
  visit(peak.t, peak.value);
}

export function visitContinuousSpanCriticalPoints(
  start: number, end: number, peaks: readonly DiagramExtremum[], visit: VisitOrdinate,
): void {
  if (!Number.isFinite(start)) throw unavailableDiagramExtrema();
  visit(0, start, memberEndFace(0) ? true : undefined);
  for (const peak of peaks) visitPeak(peak, visit);
  if (!Number.isFinite(end)) throw unavailableDiagramExtrema();
  visit(1, end);
}

export function visitMemberCriticalPoints(
  curve: DiagramValues, critical: readonly DiagramExtremum[], visit: VisitOrdinate,
): void {
  visitCriticalPoints(curve, critical, visit, 'section');
}

function visitCriticalPoints(
  curve: DiagramValues, critical: readonly DiagramExtremum[], visit: VisitOrdinate, faces: 'section' | 'diagram',
): void {
  const cuts = curve.cuts;
  if (critical.length < 2) {
    let peak: DiagramExtremum | undefined = critical[0];
    for (const t of cuts) {
      if (peak && peak.t < t) {
        visitPeak(peak, visit);
        peak = undefined;
      }
      visitCut(curve, t, faces, visit);
      if (peak?.t === t) {
        if (!peak.fallback) visitPeak(peak, visit);
        peak = undefined;
      }
    }
    if (peak) visitPeak(peak, visit);
    return;
  }
  const boundaries = new Set(cuts);
  const extrema = indexDiagramExtrema(critical.filter(peak => !peak.fallback || !boundaries.has(peak.t)));
  for (const t of sortedStations([...cuts, ...extrema.keys()])) {
    if (boundaries.has(t)) visitCut(curve, t, faces, visit);
    const peak = extrema.get(t);
    if (peak) visitPeak(peak, visit);
  }
}

export interface DiagramOrdinateExtrema<T extends DiagramOrdinate> {
  min: T;
  max: T;
  abs: T;
}

export function includeDiagramOrdinate<T extends DiagramOrdinate>(range: DiagramOrdinateExtrema<T> | undefined, point: T): DiagramOrdinateExtrema<T> {
  if (!Number.isFinite(point.value)) throw unavailableDiagramExtrema();
  if (!range) return { min: point, max: point, abs: point };
  if (point.value < range.min.value) range.min = point;
  if (point.value > range.max.value) range.max = point;
  if (Math.abs(point.value) > Math.abs(range.abs.value)) range.abs = point;
  return range;
}

export function diagramOrdinateExtrema<T extends DiagramOrdinate>(critical: readonly T[]): DiagramOrdinateExtrema<T> {
  let range: DiagramOrdinateExtrema<T> | undefined;
  for (const point of critical) range = includeDiagramOrdinate(range, point);
  if (!range) throw unavailableDiagramExtrema();
  return range;
}

export function diagramCurvePoints(curve: DiagramValues, critical: readonly DiagramOrdinate[]): DiagramOrdinate[] {
  const occupied = new Set(critical.map(p => p.t));
  const neighbors = critical.filter(p => p.right).flatMap(({ t }) => [t - 1e-6, t + 1e-6].filter(u => u > 0 && u < 1));
  const display = sortedStations([...regularStations, ...neighbors]).filter(t => !occupied.has(t)).map(t => {
    const value = curve.value({ t });
    if (!Number.isFinite(value)) throw unavailableDiagramExtrema();
    return { t, value };
  });
  return [...critical, ...display].sort((a, b) => a.t - b.t);
}

export function unavailableDiagramExtrema(): Error {
  return new EngineMessageError({ key: DIAGRAM_EXTREMA_UNAVAILABLE });
}

const floatBits = new DataView(new ArrayBuffer(8));

export function addMagnitudeBounds(a: number, b: number): number {
  const sum = a + b;
  if (a === 0 || b === 0 || sum === Infinity) return sum;
  floatBits.setFloat64(0, sum);
  floatBits.setBigUint64(0, floatBits.getBigUint64(0) + 1n);
  return floatBits.getFloat64(0);
}

const zeroAction: readonly [number, number] = [0, 0];

function uniformMomentTransfers(
  start: number, rate: number, sign: number, loads: readonly DistributedAction[],
  x0: number, x1: number, distance: number, expected: number,
): boolean {
  const unit = 1n << 1074n;
  const denominator = 2n * unit * unit;
  const origin = distanceUnits(x0);
  const offset = distanceUnits(distance) - origin;
  const end = distanceUnits(x1) - origin;
  if (offset <= 0n || offset >= end) return false;

  let shear = distanceUnits(rate) * unit;
  let moment = distanceUnits(start) * denominator + 2n * shear * origin;
  let intensity = 0n;
  for (const load of loads) {
    if (load.a > x0) continue;
    const fromStart = origin - distanceUnits(load.a);
    const covered = distanceUnits(Math.min(x0, load.b)) - distanceUnits(load.a);
    const q = distanceUnits(sign * load.qI);
    moment += q * covered * (2n * fromStart - covered);
    shear += q * covered;
    if (load.b > x0) intensity += q;
  }

  const direction = intensity < 0n ? -1n : 1n;
  const absIntensity = intensity * direction;
  const root = -direction * shear;
  if (root <= 0n || root >= absIntensity * end) return false;

  const peak = moment * absIntensity - direction * shear * shear;
  const station = moment + 2n * shear * offset + intensity * offset * offset;
  return ordinateRoundsTo(peak, denominator * absIntensity, expected)
    && ordinateRoundsTo(station, denominator, expected);
}

function ordinateRoundsTo(numerator: bigint, denominator: bigint, expected: number): boolean {
  const magnitude = Math.abs(expected);
  const center = distanceUnits(magnitude);
  floatBits.setFloat64(0, magnitude);
  const bits = floatBits.getBigUint64(0);
  floatBits.setBigUint64(0, bits - 1n);
  const below = magnitude === 0 ? -1n : distanceUnits(floatBits.getFloat64(0));
  floatBits.setBigUint64(0, bits + 1n);
  const above = magnitude === Number.MAX_VALUE ? 2n * center - below : distanceUnits(floatBits.getFloat64(0));
  const doubled = 2n * (expected < 0 ? -numerator : numerator);
  const lower = (center + below) * denominator, upper = (center + above) * denominator;
  return (lower < doubled && doubled < upper) || ((bits & 1n) === 0n && (doubled === lower || doubled === upper));
}

function polynomialDerivative(coefficients: DiagramPolynomial): DiagramPolynomial {
  return coefficients.slice(1).map((coefficient, i) => coefficient.map(term => term * (i + 1)));
}

function polynomialScale(coefficients: DiagramPolynomial): number {
  let scale = 0;
  for (const terms of coefficients) {
    for (const term of terms) scale = Math.max(scale, Math.abs(term));
  }
  return scale;
}

function normalizedPolynomial(coefficients: DiagramPolynomial, scale: number): DiagramPolynomial {
  return coefficients.map(coefficient => coefficient.map(term => term / scale));
}

function polynomialRootCandidates(coefficients: DiagramPolynomial, lo = 0, hi = 1): number[] {
  let count = coefficients.length;
  while (count && roundDiagramSum(coefficients[count - 1]!) === 0) count--;
  if (count < 2) return [];
  const c = count === coefficients.length ? coefficients : coefficients.slice(0, count);
  const scale = polynomialScale(c);
  if (!Number.isFinite(scale)) throw unavailableDiagramExtrema();
  if (count === 2) {
    const roundNormalized = (terms: DiagramSum) => terms.length <= 1
      ? (terms[0] ?? 0) / scale : roundDiagramSum(terms.map(term => term / scale));
    const root = -roundNormalized(c[0]!) / roundNormalized(c[1]!);
    return root >= lo && root <= hi ? [root] : [];
  }
  const normalized = normalizedPolynomial(c, scale);
  const critical = polynomialRootCandidates(polynomialDerivative(normalized), lo, hi);
  const evaluate = preparePolynomialSign(normalized);
  const roots: number[] = [];
  let a = lo, fa = evaluate(a);
  if (fa === 0 || critical[0] === lo) roots.push(lo);
  for (let k = 0; k <= critical.length; k++) {
    const next = critical[k] ?? hi;
    if (next === a) continue;
    const fb = evaluate(next);
    if (fa !== 0 && fb !== 0 && (fa < 0) !== (fb < 0)) {
      let b = next;
      while (true) {
        const mid = a + (b - a) / 2;
        if (mid === a || mid === b) {
          if (roots[roots.length - 1] !== mid) roots.push(mid);
          break;
        }
        const fm = evaluate(mid);
        if (fm === 0) { roots.push(mid); break; }
        if ((fm < 0) === (fa < 0)) { a = mid; fa = fm; } else b = mid;
      }
    }
    if ((k < critical.length || fb === 0) && roots[roots.length - 1] !== next) roots.push(next);
    a = next;
    fa = fb;
  }
  return roots;
}

function alignPolynomialBranches(parts: readonly PolynomialBranch[][]) {
  if (parts.length && parts.every(branches => branches.length === 1 && branches[0]!.from === 0 && branches[0]!.to === 1)) {
    return [{ from: 0, to: 1, polynomials: parts.map(branches => branches[0]!.polynomial) }];
  }
  const boundaries = sortedStations(parts.flatMap(branches => branches.flatMap(({ from, to }) => [from, to])));
  return boundaries.slice(1).map((to, i) => {
    const from = boundaries[i]!;
    const polynomials = parts.map(branches => {
      const branch = branches.find(b => b.from <= from && to <= b.to);
      if (!branch) throw unavailableDiagramExtrema();
      return branch.polynomial;
    });
    return { from, to, polynomials };
  });
}

function absoluteBranches(polynomials: DiagramPolynomial[], from: number, to: number): PolynomialBranch[] {
  const cuts = sortedStations([from, to, ...polynomials.flatMap(p => polynomialRootCandidates(p, from, to))]);
  return cuts.slice(1).map((end, i) => {
    const start = cuts[i]!;
    const middle = start + (end - start) / 2;
    const terms = Array.from({ length: 4 }, () => [] as number[]);
    for (const p of polynomials) {
      const sign = roundDiagramSum(polynomialValue(p, middle)) < 0 ? -1 : 1;
      p.forEach((coefficient, j) => terms[j]!.push(...coefficient.map(term => sign * term)));
    }
    return { from: start, to: end, polynomial: terms.map(sumDiagramTerms) };
  });
}

export function absolutePolynomialBranches(parts: readonly PolynomialBranch[][]): PolynomialBranch[] {
  return alignPolynomialBranches(parts).flatMap(({ from, to, polynomials }) => absoluteBranches(polynomials, from, to));
}

function squaredMagnitudeDerivative(polynomials: readonly DiagramPolynomial[], scale: number): DiagramPolynomial {
  if (polynomials.length === 2 && polynomials.every(p =>
    p.every((terms, i) => terms.length <= (i < 3 ? 1 : 0)))) {
    const first = polynomials[0]!, second = polynomials[1]!;
    const a0 = (first[0]?.[0] ?? 0) / scale, a1 = (first[1]?.[0] ?? 0) / scale;
    const b0 = (second[0]?.[0] ?? 0) / scale, b1 = (second[1]?.[0] ?? 0) / scale;
    const crossA = a0 * a1, crossB = b0 * b1;
    const linear = sumDiagramTerms([crossA, crossA, crossB, crossB]);
    if (!first[2]?.length && !second[2]?.length) {
      return [linear, sumDiagramTerms([a1 * a1, b1 * b1]).map(term => term * 2)];
    }
    const a2 = (first[2]?.[0] ?? 0) / scale, b2 = (second[2]?.[0] ?? 0) / scale;
    const quadratic = sumDiagramTerms([a0 * a2, a1 * a1, a2 * a0, b0 * b2, b1 * b1, b2 * b0]);
    const cubic = sumDiagramTerms([a1 * a2, a2 * a1, b1 * b2, b2 * b1]);
    const quartic = sumDiagramTerms([a2 * a2, b2 * b2]);
    return [linear, quadratic.map(term => term * 2), cubic.map(term => term * 3), quartic.map(term => term * 4)];
  }
  const squared: number[][] = [];
  for (const polynomial of polynomials) {
    const normalized = normalizedPolynomial(polynomial, scale);
    for (let i = 0; i < normalized.length; i++) {
      const a = normalized[i]!;
      if (a.length === 0) continue;
      for (let j = i === 0 ? 1 : 0; j < normalized.length; j++) {
        const b = normalized[j]!;
        if (b.length === 0) continue;
        const terms = squared[i + j] ??= [];
        for (const left of a) for (const right of b) terms.push(left * right);
      }
    }
  }
  return Array.from({ length: Math.max(0, squared.length - 1) }, (_, i) => {
    const degree = i + 1, terms = squared[degree];
    return terms ? sumDiagramTerms(terms).map(term => term * degree) : emptyCoefficient;
  });
}

function magnitudeRoots(
  polynomials: DiagramPolynomial[], method: 'abs' | 'srss', from: number, to: number,
): number[] {
  const scale = polynomials.reduce((max, p) => Math.max(max, polynomialScale(p)), 0);
  if (!Number.isFinite(scale)) throw unavailableDiagramExtrema();
  const varies = polynomials.some(p => p.some((terms, degree) => degree > 0 && terms.length > 0));
  if (method === 'srss') {
    const roots = scale !== 0 && varies ? polynomialRootCandidates(squaredMagnitudeDerivative(polynomials, scale), from, to) : [];
    if (from > 0 && from < to && roots[0] !== from) roots.unshift(from);
    return roots.filter(u => u > 0 && u < to);
  }
  const roots = [from];
  if (scale !== 0 && varies) {
    const normalized = polynomials.map(p => normalizedPolynomial(p, scale));
    for (const branch of absoluteBranches(normalized, from, to)) {
      roots.push(branch.from, ...polynomialRootCandidates(polynomialDerivative(branch.polynomial), branch.from, branch.to));
    }
  }
  return sortedStations(roots).filter(u => u > 0 && u < to);
}

const srss = (values: number[]): number => Math.hypot(...values);

export function spanResultantExtrema(
  first: DiagramPolynomial, second: DiagramPolynomial, length: number,
): DiagramExtremum[] {
  const polynomials = [first, second];
  const extrema: DiagramExtremum[] = [];
  for (const root of magnitudeRoots(polynomials, 'srss', 0, 1)) {
    const peak = diagramExtremum(0, 1, root, 0, length, length, polynomials, srss);
    if (peak) extrema.push(peak);
  }
  return extrema;
}

export function prepareMagnitudeExtrema(
  intervalBranches: (lo: number, hi: number, x0: number, x1: number) => PolynomialBranch[][], method: 'abs' | 'srss',
  cuts: () => [number, number][], length: number,
  keepAlias?: (t: number) => boolean,
): (at?: number) => DiagramExtremum[] {
  const combine = method === 'srss' ? srss : (values: number[]) => values.reduce((sum, v) => sum + Math.abs(v), 0);
  return prepareIntervalExtrema(cuts, length, combine, (lo, hi, x0, x1) =>
    alignPolynomialBranches(intervalBranches(lo, hi, x0, x1)).map(({ from, to, polynomials }) =>
      ({ polynomials, roots: magnitudeRoots(polynomials, method, from, to) })), keepAlias);
}
