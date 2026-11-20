export const DIAGRAM_EXTREMA_UNAVAILABLE = 'solver.diagramExtremaUnavailable';

export interface DiagramStation {
  t: number;
  right?: boolean;
}

export interface DiagramExtremum {
  t: number;
  value: number;
  canTransfer: (t: number) => boolean;
}

export interface DiagramCurve {
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

export function memberDiagram(
  length: number, start: number, change: number, distributed: DistributedAction[],
  points: PointAction[], order: 'force' | 'moment' = 'force', sign = 1, rate = 0,
): DiagramCurve {
  const at = (x: number) => x / length;
  let cutDistances: ReadonlyMap<number, number> | undefined;
  const distances = () => {
    if (cutDistances) return cutDistances;
    if (!(length > 0 && Number.isFinite(length))) throw unavailableDiagramExtrema();
    const xs = sortedStations([0, length, ...distributed.flatMap(d => [d.a, d.b]), ...points.map(p => p.a)]
      .filter(x => x >= 0 && x <= length));
    const mapped = new Map(xs.map(x => [at(x), x]));
    if (mapped.size !== xs.length) throw unavailableDiagramExtrema();
    return cutDistances = mapped;
  };
  const component = order === 'force' ? 0 : 1;
  const physicalValue = (x: number, t: number, right: boolean) => {
    let result = start + rate * x + change * t;
    for (const load of distributed) result += sign * distributedActionTerms(load, x)[component];
    for (const point of points) {
      if (point.a < x || (right && point.a === x)) {
        if (point.slope) result += point.slope * (x - point.a);
        result += point.jump;
      }
    }
    return result;
  };

  return {
    get cuts() { return [...distances().keys()]; },
    get cutDistances() { return distances(); },
    value({ t, right }) {
      const cut = distances().get(t);
      if (cut !== undefined) return physicalValue(cut, t, right === true);
      const x = t * length;
      const rounded = distances().get(at(x));
      return physicalValue(x, t, rounded === x ? at(x) < t : right === true);
    },
    polynomial(lo, hi, x0 = distances().get(lo) ?? lo * length, x1 = distances().get(hi) ?? hi * length) {
      const width = x1 - x0;
      let linear = rate * width + change * (width / length);
      let quadratic = 0;
      let cubic = 0;
      for (const point of points) {
        if (point.slope && point.a <= x0) linear += point.slope * width;
      }
      for (const load of distributed) {
        if (component === 1) linear += sign * distributedActionTerms(load, x0)[0] * width;
        if (x0 < load.a || x0 >= load.b) continue;
        const span = load.b - load.a;
        const u = (x0 - load.a) / span;
        const initial = (sign * width) * (load.qI * (1 - u) + load.qJ * u);
        const fraction = width / span;
        const delta = (sign * width) * (load.qJ * fraction) - (sign * width) * (load.qI * fraction);
        if (component === 0) {
          linear += initial;
          quadratic += delta / 2;
        } else {
          quadratic += initial * (width / 2);
          cubic += delta * (width / 6);
        }
      }
      return [physicalValue(x0, lo, true), linear, quadratic, cubic];
    },
  };
}

function diagramExtremum(
  lo: number, hi: number, u: number, x0: number, x1: number, length: number,
  polynomials: readonly number[][],
  combine: (values: number[]) => number,
): DiagramExtremum | undefined {
  const t = lo + (hi - lo) * u;
  const ordinates = polynomials.map(p => polynomialValue(p, u));
  const value = combine(ordinates);
  if (!Number.isFinite(value)) throw unavailableDiagramExtrema();
  if (!(t > lo && t < hi)) {
    if (value !== combine(polynomials.map(p => polynomialValue(p, t === lo ? 0 : 1)))) throw unavailableDiagramExtrema();
    return undefined;
  }
  const canTransfer = (station: number) => {
    const local = (station * length - x0) / (x1 - x0);
    if (!(local > 0 && local < 1)) return false;
    const step = local - u;
    return combine(polynomials.map((p, i) => {
      const [, linear = 0, quadratic = 0, cubic = 0] = p;
      const slope = linear + u * (2 * quadratic + u * 3 * cubic);
      const change = step * (slope + step * (quadratic + 3 * u * cubic + step * cubic));
      return ordinates[i]! + change;
    })) === value;
  };
  return { t, value, canTransfer };
}

export function curveExtrema(curve: DiagramCurve, length: number): DiagramExtremum[] {
  const roots: DiagramExtremum[] = [];
  const cuts = [...curve.cutDistances.entries()];
  for (let k = 1; k < cuts.length; k++) {
    const [lo, x0] = cuts[k - 1]!, [hi, x1] = cuts[k]!;
    const polynomial = curve.polynomial(lo, hi);
    for (const u of polynomialRootCandidates(polynomialDerivative(polynomial))) {
      if (u <= 0 || u >= 1) continue;
      const point = diagramExtremum(lo, hi, u, x0, x1, length, [polynomial], ([value]) => value!);
      if (point) roots.push(point);
    }
  }
  return roots;
}

export function diagramCurvePoints(curve: Pick<DiagramCurve, 'cuts' | 'value'>, critical: readonly DiagramExtremum[]): { t: number; value: number }[] {
  const jumps = new Map<number, number>();
  for (const t of curve.cuts) {
    if (t === 1) continue;
    const right = curve.value({ t, right: true });
    if (right !== curve.value({ t })) jumps.set(t, right);
  }
  const extrema = new Map<number, number[]>();
  for (const { t, value } of critical) {
    const values = extrema.get(t) ?? [];
    if (!values.includes(value)) values.push(value);
    extrema.set(t, values);
  }
  const displayNeighbors = [...jumps.keys()].flatMap(t => [t - 1e-6, t + 1e-6].filter(u => u > 0 && u < 1));
  const boundaries = new Set(curve.cuts);
  return sortedStations([...regularStations, ...boundaries, ...extrema.keys(), ...displayNeighbors]).flatMap(t => {
    const values = extrema.get(t) ?? [];
    const left = values.length === 0 || boundaries.has(t) ? [curve.value({ t })] : [];
    const right = jumps.get(t);
    const points = [...left, ...values, ...(right === undefined ? [] : [right])];
    if (points.some(value => !Number.isFinite(value))) throw unavailableDiagramExtrema();
    return points.map(value => ({ t, value }));
  });
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

export function magnitudeExtrema(parts: readonly Pick<DiagramCurve, 'polynomial'>[], method: 'abs' | 'srss', distances: ReadonlyMap<number, number>, length: number): DiagramExtremum[] {
  const cuts = sortedStations(distances.keys());
  const extrema: DiagramExtremum[] = [];
  const combine = (values: number[]) => method === 'srss' ? Math.hypot(...values) : values.reduce((sum, v) => sum + Math.abs(v), 0);
  for (let k = 0; k + 1 < cuts.length; k++) {
    const lo = cuts[k]!, hi = cuts[k + 1]!, width = hi - lo;
    if (!(width > 0)) continue;
    const polynomials = parts.map(part => part.polynomial(lo, hi, distances.get(lo), distances.get(hi)));
    const scale = polynomials.reduce((max, p) => Math.max(max, ...p.map(Math.abs)), 0);
    if (!Number.isFinite(scale)) throw unavailableDiagramExtrema();
    if (scale === 0) continue;
    const normalized = polynomials.map(p => p.map(c => c / scale));
    const add = (u: number) => {
      if (u === 0 || u === 1) return;
      const point = diagramExtremum(lo, hi, u, distances.get(lo)!, distances.get(hi)!, length, polynomials, combine);
      if (point) extrema.push(point);
    };
    if (method === 'srss') {
      const squared = Array<number>(7).fill(0);
      for (const p of normalized) p.forEach((a, i) => p.forEach((b, j) => { squared[i + j] += a * b; }));
      for (const u of polynomialRootCandidates(polynomialDerivative(squared))) add(u);
    } else {
      const zeros = [...new Set([0, 1, ...normalized.flatMap(p => polynomialRootCandidates(p))])].sort((a, b) => a - b);
      for (const u of zeros) add(u);
      for (let j = 0; j + 1 < zeros.length; j++) {
        const a = zeros[j]!, b = zeros[j + 1]!;
        const sum = Array<number>(4).fill(0);
        for (const p of normalized) {
          const sign = polynomialValue(p, a + (b - a) / 2) < 0 ? -1 : 1;
          p.forEach((c, i) => { sum[i] += sign * c; });
        }
        for (const u of polynomialRootCandidates(polynomialDerivative(sum), a, b)) add(u);
      }
    }
  }
  return extrema;
}
