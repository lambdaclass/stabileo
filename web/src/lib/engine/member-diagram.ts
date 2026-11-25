import { EngineMessageError } from '../codes/message';

export const DIAGRAM_EXTREMA_UNAVAILABLE = 'solver.diagramExtremaUnavailable';

export interface DiagramDistance {
  x: number;
  residual: number;
}

export interface DiagramStation {
  t: number;
  right?: boolean;
  x?: number;
  distance?: DiagramDistance;
}

export interface DiagramExtremum {
  t: number;
  distance: DiagramDistance;
  value: number;
  canTransfer: (station: DiagramStation) => boolean;
}

export interface DiagramCurve {
  hasDistributedActions: boolean;
  cuts: number[];
  cutDistances: ReadonlyMap<number, DiagramDistance>;
  value: (station: DiagramStation) => number;
  polynomial: (lo: DiagramStation, hi: DiagramStation) => number[];
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

export function normalizeDiagramDistance({ x, residual }: DiagramDistance, length: number): number {
  let t = x / length;
  if (residual === 0) return t;
  if (!(t >= 0 && Number.isFinite(t))) throw unavailableDiagramExtrema();
  const twiceDistance = (binary64Units(x) + binary64Units(residual)) << (binary64UnitsExponent + 1n);
  const divisor = binary64Units(length);
  const step = residual > 0 ? 1n : -1n;
  floatBits.setFloat64(0, t);
  let bits = floatBits.getBigUint64(0);
  while (bits !== 0n || step > 0n) {
    floatBits.setBigUint64(0, bits + step);
    const next = floatBits.getFloat64(0);
    if (!Number.isFinite(next)) throw unavailableDiagramExtrema();
    const midpoint = (binary64Units(t) + binary64Units(next)) * divisor;
    const comparison = (twiceDistance - midpoint) * step;
    if (comparison < 0n || (comparison === 0n && (bits & 1n) === 0n)) break;
    t = next;
    bits += step;
  }
  return t;
}

export function shiftDiagramDistance(distance: DiagramDistance, origin: number): DiagramDistance {
  const shifted = rebaseDiagramDistance(origin, distance.x);
  return rebaseDiagramDistance(shifted.x, shifted.residual + distance.residual);
}

export function compareDiagramDistance(a: DiagramDistance, b: DiagramDistance): number {
  return a.x === b.x ? a.residual - b.residual : a.x - b.x;
}

function diagramDistanceBetween(to: DiagramDistance, from: DiagramDistance): number {
  const shifted = shiftDiagramDistance(to, -from.x);
  return sumDiagramTerms([shifted.x, shifted.residual, -from.residual]);
}

export function fullSpanFallback(length: number, loads: DistributedAction[] | undefined, qI: number, qJ: number): DistributedAction[] {
  return loads?.length ? loads : qI || qJ ? [{ a: 0, b: length, qI, qJ }] : [];
}

export function distributedActionTerms(load: DistributedAction, x: number): [force: number, moment: number] {
  return distributedTermsAtDistance(load, x - load.a);
}

function distributedTermsAtDistance(load: DistributedAction, distance: number): [number, number] {
  const span = load.b - load.a;
  if (span <= 0 || distance <= 0) return [0, 0];
  const s = Math.min(span, distance);
  const u = s / span;
  const left = load.qI * s;
  const right = load.qJ * s;
  const force = load.qI === load.qJ ? left : left * (1 - u / 2) + right * (u / 2);
  return [force, (left * (0.5 - u / 6) + right * (u / 6)) * s + force * (distance - s)];
}

function distributedTermResidual(load: DistributedAction, { x, residual }: DiagramDistance, force: number, component: number): number {
  if (residual === 0 || x < 0 || (x === 0 && residual < 0)) return 0;
  const span = load.b - load.a;
  if (x > span || (x === span && residual > 0)) return component === 0 ? 0 : force * residual;
  const u = x / span;
  const q = load.qI * (1 - u) + load.qJ * u;
  const du = residual / span;
  const dq = load.qJ * du - load.qI * du;
  return component === 0 ? residual * (q + dq / 2)
    : residual * (force + residual * (q / 2 + dq / 6));
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
  let cutDistances: ReadonlyMap<number, DiagramDistance> | undefined;
  const distances = () => {
    if (cutDistances) return cutDistances;
    const xs = sortedStations([0, length, ...distributed.flatMap(d => [d.a, d.b]), ...points.map(p => p.a)]
      .filter(x => x >= 0 && x <= length));
    const mapped = new Map(xs.map(x => [at(x), { x, residual: 0 }]));
    if (mapped.size !== xs.length) throw unavailableDiagramExtrema();
    return cutDistances = mapped;
  };
  const component = order === 'force' ? 0 : 1;
  const stationDistance = ({ t, distance }: DiagramStation): DiagramDistance =>
    distance ?? distances().get(t) ?? { x: t * length, residual: 0 };
  const valueAt = (distance: DiagramDistance, t: number, right: boolean) => {
    const { x, residual } = distance;
    if (!hasActions && residual === 0) return diagramLineValue(start, change, rate, x, t);
    const contributions = [start, rate * x, change * t, rate * residual, change * (residual / length)];
    for (const load of distributed) {
      if (!(load.b > load.a)) continue;
      const shifted = shiftDiagramDistance(distance, -load.a);
      const terms = distributedTermsAtDistance(load, shifted.x);
      contributions.push(sign * terms[component], sign * distributedTermResidual(load, shifted, terms[0], component));
    }
    for (const point of points) {
      const dx = shiftDiagramDistance(distance, -point.a);
      const side = dx.x || dx.residual;
      if (side > 0 || (right && side === 0)) {
        if (point.slope) contributions.push(point.slope * dx.x, point.slope * dx.residual);
        contributions.push(point.jump);
      }
    }
    return sumDiagramTerms(contributions);
  };

  const polynomial: DiagramCurve['polynomial'] = (lo, hi) => {
    const x0 = stationDistance(lo), x1 = stationDistance(hi);
    const width = diagramDistanceBetween(x1, x0);
    const linear = [rate * width, change * (width / length)];
    const quadratic: number[] = [];
    const cubic: number[] = [];
    for (const point of points) {
      if (point.slope && compareDiagramDistance(x0, { x: point.a, residual: 0 }) >= 0) linear.push(point.slope * width);
    }
    for (const load of distributed) {
      if (!(load.b > load.a)) continue;
      const shifted = shiftDiagramDistance(x0, -load.a);
      const span = load.b - load.a;
      if (component === 1) {
        const force = distributedTermsAtDistance(load, shifted.x)[0];
        linear.push(sign * force * width, sign * distributedTermResidual(load, shifted, force, 0) * width);
      }
      if ((shifted.x || shifted.residual) < 0 || compareDiagramDistance(shifted, { x: span, residual: 0 }) >= 0) continue;
      const u = (shifted.x + shifted.residual) / span;
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
    return [valueAt(x0, lo.distance ? x0.x / length : lo.t, true),
      sumDiagramTerms(linear), sumDiagramTerms(quadratic), sumDiagramTerms(cubic)];
  };

  return {
    hasDistributedActions,
    get cuts() { return [...distances().keys()]; },
    get cutDistances() { return distances(); },
    value(station) {
      const { t, right } = station;
      let distance = !hasActions && !station.distance ? { x: t * length, residual: 0 } : stationDistance(station);
      if (!station.distance && hasActions && !distances().has(t)) {
        const rounded = distance.x / length;
        if (distances().get(rounded)?.x === distance.x && rounded !== t) {
          distance = rebaseDiagramDistance(distance.x, (t - rounded) * length);
        }
      }
      return valueAt(distance, station.distance ? distance.x / length : t, right === true);
    },
    polynomial,
  };
}

function sumDiagramTerms(terms: readonly number[]): number {
  const partials: number[] = [];
  for (let high of terms) {
    if (!Number.isFinite(high)) return NaN;
    let retained = 0;
    for (let low of partials) {
      if (Math.abs(high) < Math.abs(low)) [high, low] = [low, high];
      const sum = high + low;
      if (!Number.isFinite(sum)) return NaN;
      const error = low - (sum - high);
      if (error !== 0) partials[retained++] = error;
      high = sum;
    }
    partials.length = retained;
    partials.push(high);
  }
  let high = partials.pop() ?? 0;
  while (partials.length) {
    const low = partials.pop()!;
    const sum = high + low;
    const error = low - (sum - high);
    high = sum;
    if (error === 0) continue;
    const next = partials.at(-1) ?? 0;
    if ((error > 0 && next > 0) || (error < 0 && next < 0)) {
      const twice = 2 * error;
      const rounded = high + twice;
      if (rounded - high === twice) return rounded;
    }
    break;
  }
  return high;
}

function intervalChange([, linear = 0, quadratic = 0, cubic = 0]: readonly number[], from: number, to: number): number {
  return (to - from) * (linear + quadratic * (to + from) + cubic * (to * to + to * from + from * from));
}

function diagramExtremum(
  lo: DiagramStation & { distance: DiagramDistance }, hi: DiagramStation & { distance: DiagramDistance },
  u: number, length: number, polynomials: readonly number[][], curves: readonly Pick<DiagramCurve, 'value'>[],
  combine: (values: number[]) => number, at?: number,
): DiagramExtremum | undefined {
  const t = lo.t + (hi.t - lo.t) * u;
  if (at !== undefined && t !== at) return undefined;
  const x0 = lo.distance;
  const width = diagramDistanceBetween(hi.distance, x0);
  if (!(t > lo.t && t < hi.t)) {
    const atStart = t === lo.t;
    const boundary = atStart ? { ...lo, right: true } : hi;
    const ordinates = curves.map(curve => curve.value(boundary));
    const value = combine(ordinates);
    const peak = combine(ordinates.map((ordinate, i) => ordinate + intervalChange(polynomials[i]!, atStart ? 0 : 1, u)));
    if (!Number.isFinite(value) || peak !== value) throw unavailableDiagramExtrema();
    return undefined;
  }
  const offset = width * u;
  const distance = shiftDiagramDistance(x0, offset);
  const ordinates = curves.map(curve => curve.value({ t, distance }));
  const value = combine(ordinates);
  if (!Number.isFinite(value)) throw unavailableDiagramExtrema();
  const localOffset = (position: DiagramDistance) => diagramDistanceBetween(position, x0);
  const canTransfer = (station: DiagramStation) => {
    if (station.distance && compareDiagramDistance(station.distance, distance) === 0) return true;
    const local = localOffset(station.distance ?? { x: station.t * length, residual: 0 }) / width;
    if (!(local > 0 && local < 1)) return false;
    return combine(ordinates.map((ordinate, i) => ordinate + intervalChange(polynomials[i]!, u, local))) === value;
  };
  return { t, distance, value, canTransfer };
}

interface ExtremaInterval {
  polynomials: number[][];
  roots: number[];
}

function prepareIntervalExtrema(
  getCuts: () => (DiagramStation & { distance: DiagramDistance })[], length: number,
  curves: readonly Pick<DiagramCurve, 'value'>[], combine: (values: number[]) => number,
  prepare: (lo: DiagramStation, hi: DiagramStation) => ExtremaInterval,
): (at?: number) => DiagramExtremum[] {
  let cuts: ReturnType<typeof getCuts> | undefined;
  const intervals: ExtremaInterval[] = [];
  return at => {
    cuts ??= getCuts();
    const extrema: DiagramExtremum[] = [];
    for (let k = 1; k < cuts.length; k++) {
      const lo = cuts[k - 1]!, hi = cuts[k]!;
      if (!(hi.t > lo.t) || (at !== undefined && !(lo.t <= at && at <= hi.t))) continue;
      const { polynomials, roots } = intervals[k] ??= prepare(lo, hi);
      for (const u of roots) {
        const point = diagramExtremum(lo, hi, u, length, polynomials, curves, combine, at);
        if (point) extrema.push(point);
      }
    }
    return extrema;
  };
}

export function prepareCurveExtrema(curve: DiagramCurve, length: number): (at?: number) => DiagramExtremum[] {
  if (!curve.hasDistributedActions) return () => [];
  const cuts = () => [...curve.cutDistances].map(([t, distance]) => ({ t, distance }));
  return prepareIntervalExtrema(cuts, length, [curve], ([value]) => value!, (lo, hi) => {
    const polynomial = curve.polynomial(lo, hi);
    const roots = scalarStationaryPoints(polynomial).filter(u => u > 0 && u < 1);
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
    } else if (previous.canTransfer({ t: peak.t }) && !peak.canTransfer({ t: peak.t })) {
      byStation.set(peak.t, peak);
    }
  }
  return byStation;
}

export function checkedCurveValue(curve: Pick<DiagramCurve, 'value'>, station: DiagramStation, critical: ReadonlyMap<number, DiagramExtremum>): number {
  const peak = critical.get(station.t);
  if (peak) {
    if (!peak.canTransfer(station)) throw unavailableDiagramExtrema();
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

const binary64UnitsExponent = 1074n;

function binary64Units(value: number): bigint {
  floatBits.setFloat64(0, value);
  const bits = floatBits.getBigUint64(0);
  const exponent = (bits >> 52n) & 0x7ffn;
  const fraction = bits & 0xfffffffffffffn;
  const magnitude = exponent === 0n ? fraction : ((1n << 52n) | fraction) << (exponent - 1n);
  return bits >> 63n ? -magnitude : magnitude;
}

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

function scalarStationaryPoints([, linear = 0, quadratic = 0, cubic = 0]: number[]): number[] {
  if (![linear, quadratic, cubic].every(Number.isFinite)) throw unavailableDiagramExtrema();
  const scale = Math.max(Math.abs(linear), Math.abs(quadratic), Math.abs(cubic));
  if (scale === 0) return [];
  const a = 3 * (cubic / scale), b = 2 * (quadratic / scale), c = linear / scale;
  if (a === 0) return b === 0 ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  if (discriminant === 0) return [-b / (2 * a)];
  const q = -0.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(discriminant));
  return [q / a, c / q];
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
  parts: readonly Pick<DiagramCurve, 'polynomial' | 'value'>[], method: 'abs' | 'srss',
  distances: () => ReadonlyMap<number, DiagramDistance>, length: number,
): (at?: number) => DiagramExtremum[] {
  const combine = (values: number[]) => method === 'srss' ? Math.hypot(...values) : values.reduce((sum, v) => sum + Math.abs(v), 0);
  const cuts = () => [...distances()].sort(([a], [b]) => a - b).map(([t, distance]) => ({ t, distance }));
  return prepareIntervalExtrema(cuts, length, parts, combine, (lo, hi) => {
    const polynomials = parts.map(part => part.polynomial(lo, hi));
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
