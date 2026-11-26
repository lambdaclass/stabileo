import { distanceUnits, type DiagramCutLocation } from './diagram-cut';
import { polynomialValue, prepareRoundedPolynomial, roundDiagramSum, sumDiagramTerms, type DiagramPolynomial, type DiagramSum } from './diagram-sum';

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

type PeakTransferCertificate = (x: number, value: number) => boolean;

export interface DiagramCurve {
  hasDistributedActions: boolean;
  mayHaveJump: boolean;
  certifyPeakTransfer?: PeakTransferCertificate;
  cuts: number[];
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

function diagramLoads(loads: DistributedAction[]): DistributedAction[] {
  if (loads.length < 2) return loads;
  const groups = new Map<string, DistributedAction[]>();
  for (const load of loads) {
    const key = `${load.a}:${load.b}`;
    const group = groups.get(key);
    if (group) group.push(load);
    else groups.set(key, [load]);
  }
  return [...groups.values()].flatMap(group => {
    const opposes = (end: 'qI' | 'qJ') => group.some(load => load[end] < 0) && group.some(load => load[end] > 0);
    if (!opposes('qI') && !opposes('qJ')) return group;
    const { a, b } = group[0]!;
    const left = sumDiagramTerms(group.map(load => load.qI));
    const right = sumDiagramTerms(group.map(load => load.qJ));
    return Array.from({ length: Math.max(left.length, right.length, 1) }, (_, i) =>
      ({ a, b, qI: left[i] ?? 0, qJ: right[i] ?? 0 }));
  });
}

export function memberDiagram(
  length: number, start: number, change: number, distributedActions: readonly DistributedAction[],
  pointActions: readonly PointAction[], order: 'force' | 'moment' = 'force', sign = 1, rate = 0,
): DiagramCurve {
  if (!(length > 0 && Number.isFinite(length))) throw unavailableDiagramExtrema();
  const actions = distributedActions.map(action => ({ ...action }));
  const points = pointActions.map(action => ({ ...action }));
  const distributed = diagramLoads(actions);
  const hasDistributedActions = distributed.length > 0;
  const hasActions = hasDistributedActions || points.length > 0;
  const uniformMoment = order === 'moment' && change === 0 && points.length === 0
    && Number.isFinite(start) && Number.isFinite(rate)
    && actions.every(load => load.a === 0 && load.b === length && load.qI === load.qJ && Number.isFinite(load.qI));
  const certifyPeakTransfer: PeakTransferCertificate | undefined = uniformMoment
    ? (x, value) => uniformMomentTransfers(length, start, rate, sign, actions, x, value)
    : undefined;
  const at = (x: number) => x / length;
  let cutDistances: ReadonlyMap<number, number> | undefined;
  const distances = () => {
    if (cutDistances) return cutDistances;
    const xs = sortedStations([0, length, ...distributed.flatMap(d => [d.a, d.b]), ...points.map(p => p.a)]
      .filter(x => x >= 0 && x <= length));
    const mapped = new Map(xs.map(x => [at(x), x]));
    if (mapped.size !== xs.length) throw unavailableDiagramExtrema();
    return cutDistances = mapped;
  };
  const component = order === 'force' ? 0 : 1;
  const boundaryValue = (x: number, t: number, right: boolean) => {
    const contributions = [start, rate * x, change * t];
    for (const load of distributed) addActionTerms(contributions, load, x, component, sign);
    for (const point of points) {
      if (point.a < x || (right && point.a === x)) {
        if (point.slope) contributions.push(point.slope * (x - point.a));
        contributions.push(point.jump);
      }
    }
    return sumDiagramTerms(contributions);
  };

  const polynomial: DiagramCurve['polynomial'] = (
    lo, hi, x0 = distances().get(lo) ?? lo * length, x1 = distances().get(hi) ?? hi * length,
  ) => {
    const width = x1 - x0;
    const linear = [rate * width, change * (width / length)];
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
    return [boundaryValue(x0, lo, true), sumDiagramTerms(linear), sumDiagramTerms(quadratic), sumDiagramTerms(cubic)];
  };

  const intervals = new Map<number, DiagramPolynomial>();
  let cuts: [number, number][] | undefined;
  return {
    hasDistributedActions,
    mayHaveJump: points.length > 0,
    certifyPeakTransfer,
    get cuts() { return [...distances().keys()]; },
    get cutDistances() { return distances(); },
    value({ t, right, distance }) {
      const station = distance === undefined ? t : at(distance);
      if (!hasActions) return diagramLineValue(start, change, rate, distance ?? t * length, station);
      const cut = distances().get(station);
      const x = distance ?? cut ?? t * length;
      if (x === cut || x < 0 || x > length || !Number.isFinite(x)) {
        return roundDiagramSum(boundaryValue(x, station, right === true));
      }
      cuts ??= [...distances()];
      const upper = cuts.findIndex(([station, physical]) => distance === undefined ? station > t : physical > distance);
      if (upper <= 0) throw unavailableDiagramExtrema();
      const [lo, x0] = cuts[upper - 1]!, [hi, x1] = cuts[upper]!;
      let coefficients = intervals.get(lo);
      if (!coefficients) {
        coefficients = polynomial(lo, hi, x0, x1);
        intervals.set(lo, coefficients);
      }
      const width = x1 - x0;
      const u = distance !== undefined ? (x - x0) / width
        : x <= x0 ? (t - lo) * length / width
          : x >= x1 ? 1 - (hi - t) * length / width : (x - x0) / width;
      return roundDiagramSum(polynomialValue(coefficients, u));
    },
    polynomial,
  };
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
    return combine(moved) === value || certifyTransfer?.(x, value) === true;
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

export function prepareCurveExtrema(curve: DiagramCurve, length: number): (at?: number) => DiagramExtremum[] {
  if (!curve.hasDistributedActions) return () => [];
  return prepareIntervalExtrema(() => [...curve.cutDistances], length, ([value]) => value!, (lo, hi) => {
    const polynomial = curve.polynomial(lo, hi);
    const roots = polynomialRootCandidates(polynomialDerivative(polynomial)).filter(u => u > 0 && u < 1);
    return [{ polynomials: [polynomial], roots, certifyTransfer: curve.certifyPeakTransfer }];
  });
}

export function curveExtrema(curve: DiagramCurve, length: number, at?: number): DiagramExtremum[] {
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

export function isInwardEndpointFace(t: number, right?: boolean): boolean {
  return !((t === 0 && right === false) || (t === 1 && right === true));
}

export function diagramCriticalPoints(
  curve: DiagramValues, critical: readonly DiagramExtremum[], inwardAtI = false,
): DiagramOrdinate[] {
  const cuts = curve.cuts;
  const boundaries = critical.length > 0 ? new Set(cuts) : undefined;
  const extrema = boundaries && indexDiagramExtrema(critical.filter(peak => !peak.fallback || !boundaries.has(peak.t)));
  const stations = extrema ? sortedStations([...cuts, ...extrema.keys()]) : cuts;
  const points: DiagramOrdinate[] = [];
  for (const t of stations) {
    if (!boundaries || boundaries.has(t)) {
      let left: DiagramOrdinate | undefined;
      if (!inwardAtI || isInwardEndpointFace(t, false)) {
        left = { t, value: curve.value({ t }) };
        if (!Number.isFinite(left.value)) throw unavailableDiagramExtrema();
        points.push(left);
      }
      if (isInwardEndpointFace(t, true) && (curve.mayHaveJump || !left)) {
        const right = { t, right: true };
        const value = curve.value(right);
        if (!Number.isFinite(value)) throw unavailableDiagramExtrema();
        if (value !== left?.value) {
          if (left) left.side = 'left';
          points.push({ ...right, value, ...(left && { side: 'right' }) });
        }
      }
    }
    const peak = extrema?.get(t);
    if (peak) {
      if (!Number.isFinite(peak.value)) throw unavailableDiagramExtrema();
      points.push({ t, value: peak.value });
    }
  }
  return points;
}

export function maxAbsDiagramOrdinate(critical: readonly DiagramOrdinate[]): DiagramOrdinate {
  return critical.reduce((best, point) => Math.abs(point.value) > Math.abs(best.value) ? point : best,
    { t: 0, value: 0 });
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
  return new Error(DIAGRAM_EXTREMA_UNAVAILABLE);
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
  length: number, start: number, rate: number, sign: number, loads: readonly DistributedAction[],
  distance: number, expected: number,
): boolean {
  const unit = 1n << 1074n;
  const moment = distanceUnits(start), shear = distanceUnits(rate), x = distanceUnits(distance);
  const intensity = loads.reduce((sum, load) => sum + distanceUnits(sign * load.qI), 0n);
  const direction = intensity < 0n ? -1n : 1n;
  const absIntensity = intensity * direction;
  const root = -direction * shear * unit;
  if (root <= 0n || root >= absIntensity * distanceUnits(length)) return false;

  const peakDenominator = 2n * absIntensity;
  const peakNumerator = moment * peakDenominator - direction * shear * shear;
  const stationDenominator = 2n * unit * unit;
  const stationNumerator = moment * stationDenominator + 2n * shear * x * unit + intensity * x * x;
  return ordinateRoundsTo(peakNumerator, peakDenominator, expected)
    && ordinateRoundsTo(stationNumerator, stationDenominator, expected);
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
  const c = [...coefficients];
  while (c.length && roundDiagramSum(c.at(-1)!) === 0) c.pop();
  if (c.length < 2) return [];
  const scale = polynomialScale(c);
  if (!Number.isFinite(scale)) throw unavailableDiagramExtrema();
  const normalized = normalizedPolynomial(c, scale);
  if (c.length === 2) {
    const root = -roundDiagramSum(normalized[0]!) / roundDiagramSum(normalized[1]!);
    return root >= lo && root <= hi ? [root] : [];
  }
  const critical = polynomialRootCandidates(polynomialDerivative(normalized), lo, hi);
  const cuts = [...new Set([lo, ...critical, hi])].sort((a, b) => a - b);
  const roots = [...critical];
  const evaluate = prepareRoundedPolynomial(normalized);
  for (let k = 0; k + 1 < cuts.length; k++) {
    let a = cuts[k]!, b = cuts[k + 1]!;
    let fa = evaluate(a);
    const fb = evaluate(b);
    if (fa === 0) roots.push(a);
    if (fb === 0) roots.push(b);
    if (fa === 0 || fb === 0 || (fa < 0) === (fb < 0)) continue;
    while (true) {
      const mid = a + (b - a) / 2;
      if (mid === a || mid === b) { roots.push(mid); break; }
      const fm = evaluate(mid);
      if (fm === 0) { roots.push(mid); break; }
      if ((fm < 0) === (fa < 0)) { a = mid; fa = fm; } else b = mid;
    }
  }
  return [...new Set(roots)].sort((a, b) => a - b);
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

export function prepareMagnitudeExtrema(
  parts: readonly ((lo: number, hi: number, x0: number, x1: number) => PolynomialBranch[])[], method: 'abs' | 'srss',
  distances: () => ReadonlyMap<number, number>, length: number,
  keepAlias?: (t: number) => boolean,
): (at?: number) => DiagramExtremum[] {
  const combine = (values: number[]) => method === 'srss' ? Math.hypot(...values) : values.reduce((sum, v) => sum + Math.abs(v), 0);
  const cuts = () => [...distances()].sort(([a], [b]) => a - b);
  return prepareIntervalExtrema(cuts, length, combine, (lo, hi, x0, x1) => {
    return alignPolynomialBranches(parts.map(part => part(lo, hi, x0, x1))).map(({ from, to, polynomials }) => {
      const scale = polynomials.reduce((max, p) => Math.max(max, polynomialScale(p)), 0);
      if (!Number.isFinite(scale)) throw unavailableDiagramExtrema();
      const roots = [from];
      if (scale !== 0) {
        const normalized = polynomials.map(p => normalizedPolynomial(p, scale));
        if (method === 'srss') {
          const squared = Array.from({ length: 7 }, () => [] as number[]);
          for (const p of normalized) p.forEach((a, i) => p.forEach((b, j) => {
            for (const left of a) for (const right of b) squared[i + j]!.push(left * right);
          }));
          roots.push(...polynomialRootCandidates(polynomialDerivative(squared.map(sumDiagramTerms)), from, to));
        } else {
          for (const branch of absoluteBranches(normalized, from, to)) {
            roots.push(branch.from, ...polynomialRootCandidates(polynomialDerivative(branch.polynomial), branch.from, branch.to));
          }
        }
      }
      return { polynomials, roots: sortedStations(roots).filter(u => u > 0 && u < to) };
    });
  }, keepAlias);
}
