import { EngineMessageError } from '../codes/message';

export const DIAGRAM_EXTREMA_UNAVAILABLE = 'solver.diagramExtremaUnavailable';

export interface DiagramStation {
  t: number;
  right?: boolean;
  x?: number;
}

export interface DiagramExtremum {
  t: number;
  value: number;
  canTransfer: (t: number, x?: number) => boolean;
  coincides?: (x: number) => boolean;
}

export interface DiagramCurve {
  hasDistributedActions: boolean;
  cuts: number[];
  cutDistances: ReadonlyMap<number, number>;
  value: (station: DiagramStation) => number;
  polynomial: (lo: number, hi: number, x0?: number, x1?: number) => number[];
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

export function rebaseDiagramDistance(origin: number, local: number) {
  const x = origin + local;
  const offset = x - origin;
  return { x, residual: (origin - (x - offset)) + (local - offset) };
}

export function fullSpanFallback(length: number, loads: DistributedAction[] | undefined, qI: number, qJ: number): DistributedAction[] {
  return loads?.length ? loads : qI || qJ ? [{ a: 0, b: length, qI, qJ }] : [];
}

export function distributedActionTerms(load: DistributedAction, x: number): [force: number, moment: number] {
  const span = load.b - load.a;
  const distance = x - load.a;
  if (span <= 0 || distance <= 0) return [0, 0];
  const s = Math.min(span, distance);
  const u = s / span;
  const left = load.qI * s;
  const right = load.qJ * s;
  const force = left * (1 - u / 2) + right * (u / 2);
  return [force, (left * (0.5 - u / 6) + right * (u / 6)) * s + force * (distance - s)];
}

export function diagramLineValue(start: number, change: number, rate: number, x: number, t: number): number {
  return start + rate * x + change * t;
}

export function memberDiagram(
  length: number, start: number, change: number, distributed: DistributedAction[],
  points: PointAction[], order: 'force' | 'moment' = 'force', sign = 1, rate = 0,
): DiagramCurve {
  if (!(length > 0 && Number.isFinite(length))) throw unavailableDiagramExtrema();
  const hasDistributedActions = distributed.length > 0;
  const hasActions = hasDistributedActions || points.length > 0;
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
    const contributions = [diagramLineValue(start, change, rate, x, t)];
    for (const load of distributed) contributions.push(sign * distributedActionTerms(load, x)[component]);
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
      if (component === 1) linear.push(sign * distributedActionTerms(load, x0)[0] * width);
      if (x0 < load.a || x0 >= load.b) continue;
      const span = load.b - load.a;
      const u = (x0 - load.a) / span;
      const initial = (sign * width) * (load.qI * (1 - u) + load.qJ * u);
      const fraction = width / span;
      const delta = (sign * width) * (load.qJ * fraction) - (sign * width) * (load.qI * fraction);
      if (component === 0) {
        linear.push(initial);
        quadratic.push(delta / 2);
      } else {
        quadratic.push(initial * (width / 2));
        cubic.push(delta * (width / 6));
      }
    }
    return [boundaryValue(x0, lo, true), sumDiagramTerms(linear), sumDiagramTerms(quadratic), sumDiagramTerms(cubic)];
  };

  const intervals = new Map<number, number[]>();
  let cuts: [number, number][] | undefined;
  return {
    hasDistributedActions,
    get cuts() { return [...distances().keys()]; },
    get cutDistances() { return distances(); },
    value({ t, right, x = t * length }) {
      if (!hasActions) return diagramLineValue(start, change, rate, x, t);
      const cut = distances().get(t);
      if (cut !== undefined || t < 0 || t > 1 || !Number.isFinite(t)) {
        return boundaryValue(cut ?? x, t, right === true);
      }
      cuts ??= [...distances()];
      const upper = cuts.findIndex(([station]) => station > t);
      const [lo, x0] = cuts[upper - 1]!, [hi, x1] = cuts[upper]!;
      let coefficients = intervals.get(lo);
      if (!coefficients) {
        coefficients = polynomial(lo, hi, x0, x1);
        intervals.set(lo, coefficients);
      }
      const u = x <= x0 ? (t - lo) * length / (x1 - x0)
        : x >= x1 ? 1 - (hi - t) * length / (x1 - x0) : (x - x0) / (x1 - x0);
      return polynomialValue(coefficients, u);
    },
    polynomial,
  };
}

function sumDiagramTerms(terms: readonly number[]): number {
  let sum = 0, correction = 0;
  for (const term of terms) {
    const next = sum + term;
    correction += Math.abs(sum) >= Math.abs(term) ? (sum - next) + term : (term - next) + sum;
    sum = next;
  }
  return sum + correction;
}

function diagramExtremum(
  lo: number, hi: number, u: number, x0: number, x1: number, length: number,
  polynomials: readonly number[][],
  combine: (values: number[]) => number,
  at?: number,
): DiagramExtremum | undefined {
  const t = lo + (hi - lo) * u;
  if (at !== undefined && t !== at) return undefined;
  const ordinates = polynomials.map(p => polynomialValue(p, u));
  const value = combine(ordinates);
  if (!Number.isFinite(value)) throw unavailableDiagramExtrema();
  if (!(t > lo && t < hi)) {
    if (value !== combine(polynomials.map(p => polynomialValue(p, t === lo ? 0 : 1)))) throw unavailableDiagramExtrema();
    return undefined;
  }
  const canTransfer = (station: number, x = station * length) => {
    const local = (x - x0) / (x1 - x0);
    if (!(local > 0 && local < 1)) return false;
    const step = local - u;
    return combine(polynomials.map((p, i) => {
      const [, linear = 0, quadratic = 0, cubic = 0] = p;
      const slope = linear + u * (2 * quadratic + u * 3 * cubic);
      const change = step * (slope + step * (quadratic + 3 * u * cubic + step * cubic));
      return ordinates[i]! + change;
    })) === value;
  };
  return { t, value, canTransfer, coincides: x => x - x0 === (x1 - x0) * u };
}

interface ExtremaInterval {
  polynomials: number[][];
  roots: number[];
}

function prepareIntervalExtrema(
  getCuts: () => [number, number][], length: number, combine: (values: number[]) => number,
  prepare: (lo: number, hi: number, x0: number, x1: number) => ExtremaInterval,
): (at?: number) => DiagramExtremum[] {
  let cuts: [number, number][] | undefined;
  const intervals: ExtremaInterval[] = [];
  return at => {
    cuts ??= getCuts();
    const extrema: DiagramExtremum[] = [];
    for (let k = 1; k < cuts.length; k++) {
      const [lo, x0] = cuts[k - 1]!, [hi, x1] = cuts[k]!;
      if (!(hi > lo) || (at !== undefined && !(lo <= at && at <= hi))) continue;
      const { polynomials, roots } = intervals[k] ??= prepare(lo, hi, x0, x1);
      for (const u of roots) {
        const point = diagramExtremum(lo, hi, u, x0, x1, length, polynomials, combine, at);
        if (point) extrema.push(point);
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
    return { polynomials: [polynomial], roots };
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
    if (!peak.canTransfer(station.t, station.x)) throw unavailableDiagramExtrema();
    return peak.value;
  }
  const value = curve.value(station);
  if (!Number.isFinite(value)) throw unavailableDiagramExtrema();
  return value;
}

type DiagramOrdinate = DiagramStation & { value: number };
type DiagramValues = Pick<DiagramCurve, 'cuts' | 'value'>;

export function diagramCriticalPoints(
  curve: DiagramValues, critical: readonly DiagramExtremum[], inwardAtI = false,
): DiagramOrdinate[] {
  const extrema = indexDiagramExtrema(critical);
  const boundaries = new Set(curve.cuts);
  return sortedStations([...boundaries, ...extrema.keys()]).flatMap(t => {
    const peak = extrema.get(t);
    const points: DiagramOrdinate[] = [];
    if (boundaries.has(t)) {
      if (t > 0 || !inwardAtI) points.push({ t, value: curve.value({ t }) });
      if (t < 1) {
        const right = { t, right: true };
        const value = curve.value(right);
        if (value !== points[0]?.value) points.push({ ...right, value });
      }
    }
    if (peak) points.push({ t, value: peak.value });
    if (points.some(point => !Number.isFinite(point.value))) throw unavailableDiagramExtrema();
    return points;
  });
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

function polynomialValue(coefficients: readonly number[], x: number): number {
  return coefficients.reduceRight((sum, c) => sum * x + c, 0);
}

function polynomialDerivative(coefficients: readonly number[]): number[] {
  return coefficients.slice(1).map((c, i) => (i + 1) * c);
}

function polynomialRootCandidates(coefficients: readonly number[], lo = 0, hi = 1): number[] {
  const c = [...coefficients];
  while (c.length && c.at(-1) === 0) c.pop();
  if (c.length < 2) return [];
  if (c.some(v => !Number.isFinite(v))) throw unavailableDiagramExtrema();
  const scale = Math.max(...c.map(Math.abs));
  const normalized = c.map(v => v / scale);
  if (c.length === 2) {
    const root = -normalized[0]! / normalized[1]!;
    return root >= lo && root <= hi ? [root] : [];
  }
  const critical = polynomialRootCandidates(polynomialDerivative(normalized), lo, hi);
  const cuts = [...new Set([lo, ...critical, hi])].sort((a, b) => a - b);
  const roots = [...critical];
  for (let k = 0; k + 1 < cuts.length; k++) {
    let a = cuts[k]!, b = cuts[k + 1]!;
    let fa = polynomialValue(normalized, a);
    const fb = polynomialValue(normalized, b);
    if (fa === 0) roots.push(a);
    if (fb === 0) roots.push(b);
    if (fa === 0 || fb === 0 || (fa < 0) === (fb < 0)) continue;
    while (true) {
      const mid = a + (b - a) / 2;
      if (mid === a || mid === b) { roots.push(mid); break; }
      const fm = polynomialValue(normalized, mid);
      if (fm === 0) { roots.push(mid); break; }
      if ((fm < 0) === (fa < 0)) { a = mid; fa = fm; } else b = mid;
    }
  }
  return [...new Set(roots)].sort((a, b) => a - b);
}

export function prepareMagnitudeExtrema(
  parts: readonly Pick<DiagramCurve, 'polynomial'>[], method: 'abs' | 'srss',
  distances: () => ReadonlyMap<number, number>, length: number,
): (at?: number) => DiagramExtremum[] {
  const combine = (values: number[]) => method === 'srss' ? Math.hypot(...values) : values.reduce((sum, v) => sum + Math.abs(v), 0);
  const cuts = () => [...distances()].sort(([a], [b]) => a - b);
  return prepareIntervalExtrema(cuts, length, combine, (lo, hi, x0, x1) => {
    const polynomials = parts.map(part => part.polynomial(lo, hi, x0, x1));
    const scale = polynomials.reduce((max, p) => Math.max(max, ...p.map(Math.abs)), 0);
    if (!Number.isFinite(scale)) throw unavailableDiagramExtrema();
    if (scale === 0) return { polynomials, roots: [] };
    const normalized = polynomials.map(p => p.map(c => c / scale));
    const roots: number[] = [];
    if (method === 'srss') {
      const squared = Array<number>(7).fill(0);
      for (const p of normalized) p.forEach((a, i) => p.forEach((b, j) => { squared[i + j] += a * b; }));
      roots.push(...polynomialRootCandidates(polynomialDerivative(squared)));
    } else {
      const zeros = [...new Set([0, 1, ...normalized.flatMap(p => polynomialRootCandidates(p))])].sort((a, b) => a - b);
      for (const u of zeros) roots.push(u);
      for (let j = 0; j + 1 < zeros.length; j++) {
        const a = zeros[j]!, b = zeros[j + 1]!;
        const sum = Array<number>(4).fill(0);
        for (const p of normalized) {
          const sign = polynomialValue(p, a + (b - a) / 2) < 0 ? -1 : 1;
          p.forEach((c, i) => { sum[i] += sign * c; });
        }
        for (const u of polynomialRootCandidates(polynomialDerivative(sum), a, b)) roots.push(u);
      }
    }
    return { polynomials, roots: roots.filter(u => u !== 0 && u !== 1) };
  });
}
