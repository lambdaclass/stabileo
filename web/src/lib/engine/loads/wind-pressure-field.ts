import type { WindModel, WindCaseLoads } from './wind-cases';
import { levelLoadTorqueSupportedAlong, prepareLevelLoads } from './wind-plan-forces';

export class WindPressureRefusal extends Error {}

export interface WindPressurePart {
  a: number;
  b: number;
  q: number;
  qJ: number;
  force: number;
  first: number;
}

const inner = Math.sqrt((3 - 2 * Math.sqrt(6 / 5)) / 7), outer = Math.sqrt((3 + 2 * Math.sqrt(6 / 5)) / 7);
const innerWeight = (18 + Math.sqrt(30)) / 36, outerWeight = (18 - Math.sqrt(30)) / 36;
export const pressureQuadrature = [[-outer, outerWeight], [-inner, innerWeight], [inner, innerWeight], [outer, outerWeight]] as const;

const pressureFitStations = [0, ...pressureQuadrature.map(([x]) => (1 + x) / 2), 1];

type PiecewiseConvexity = { readonly curvatureBreaks?: readonly number[] };
const relativePressureLimit = 1e-4;

function pressureEnvelope(a: number, b: number, value: (s: number) => number, curvatureBreaks: readonly number[]) {
  const sample = (s: number) => ({ s, pressure: value(s) });
  const stations = pressureFitStations.map(t => sample(t === 1 ? b : a + (b - a) * t));
  const cuts = [...stations, ...curvatureBreaks.filter(s => s > a && s < b).map(sample)].sort((p, r) => p.s - r.s);
  let chordErrorBound = 0, absolutePressureLowerBound = 0;
  for (let i = 1; i < cuts.length; i++) {
    const left = cuts[i - 1]!, right = cuts[i]!, width = right.s - left.s;
    if (width === 0) continue;
    const center = left.s + width / 2;
    if (!(left.s < center && center < right.s)) {
      chordErrorBound = Infinity;
      continue;
    }
    const leftWidth = center - left.s, rightWidth = right.s - center;
    const chordAtCenter = (rightWidth / width) * left.pressure + (leftWidth / width) * right.pressure;
    const meanChordGapBound = Math.abs(chordAtCenter - value(center)) * (width / (2 * Math.min(leftWidth, rightWidth)));
    const chordMean = left.pressure / 2 + right.pressure / 2;
    chordErrorBound += width * meanChordGapBound;
    absolutePressureLowerBound += width * Math.max(0, Math.abs(chordMean) - meanChordGapBound);
  }
  const fits = (part: WindPressurePart, budget: number, checkStations: boolean) => {
    const error = ({ s, pressure }: typeof stations[number]) => {
      const t = (s - part.a) / (part.b - part.a);
      return Math.abs((1 - t) * part.q + t * part.qJ - pressure);
    };
    if (checkStations && stations.some(p => error(p) > relativePressureLimit * Math.abs(p.pressure))) return false;
    const errors = cuts.map(error);
    let bound = chordErrorBound;
    for (let i = 1; i < cuts.length; i++) {
      bound += (cuts[i]!.s - cuts[i - 1]!.s) * ((errors[i - 1]! + errors[i]!) / 2);
    }
    return Number.isFinite(budget) && bound <= budget;
  };
  return { a, b, budget: relativePressureLimit * absolutePressureLowerBound, fits };
}

function cutForceCertificate(a: number, b: number, value: (s: number) => number, curvatureBreaks: readonly number[]) {
  const mid = (a + b) / 2;
  const halves = [pressureEnvelope(a, mid, value, curvatureBreaks), pressureEnvelope(mid, b, value, curvatureBreaks)];
  return (parts: WindPressurePart[]) => parts.every(part => halves.every(half => {
    const lo = Math.max(part.a, half.a), hi = Math.min(part.b, half.b);
    if (lo >= hi) return true;
    if (lo === half.a && hi === half.b) return half.fits(part, half.budget, parts.length === 2);
    const portion = pressureEnvelope(lo, hi, value, curvatureBreaks);
    const budget = half.budget * ((hi - lo) / (half.b - half.a));
    return portion.fits(part, budget, parts.length === 2);
  }));
}

export function integrateWindPressure(length: number, boundaries: readonly number[], pressure: ((s: number) => number) & PiecewiseConvexity): WindPressurePart[] {
  if (!(Number.isFinite(length) && length > 0)) throw new WindPressureRefusal('wind.pressure.invalidCarrier');
  const cuts = [...new Set([0, ...boundaries.filter(s => s > 0 && s < length), length])].sort((a, b) => a - b);
  const curvatureBreaks = pressure.curvatureBreaks?.every(Number.isFinite)
    ? [...new Set(pressure.curvatureBreaks.filter(s => s > 0 && s < length))].sort((a, b) => a - b)
    : undefined;
  type Moments = [number, number, number, number];
  type Integral = { moments: Moments; min: number; max: number };
  const value = (s: number) => {
    const p = pressure(s);
    if (!Number.isFinite(p)) throw new WindPressureRefusal('wind.pressure.nonFinite');
    return p;
  };
  const gauss = (a: number, b: number, origin: number): Integral => {
    const mid = (a + b) / 2, half = (b - a) / 2;
    const moments: Moments = [0, 0, 0, 0];
    let min = Infinity, max = -Infinity;
    for (const [x, w] of pressureQuadrature) {
      const s = mid + half * x!, p = value(s);
      min = Math.min(min, p); max = Math.max(max, p);
      const weighted = half * w * p, offset = s - origin;
      moments[0] += weighted;
      moments[1] += weighted * offset;
      moments[2] += weighted * offset ** 2;
      moments[3] += weighted * offset ** 3;
    }
    return { moments, min, max };
  };
  const combine = (left: Integral, right: Integral): Integral => ({
    moments: left.moments.map((v, k) => v + right.moments[k]!) as Moments,
    min: Math.min(left.min, right.min), max: Math.max(left.max, right.max),
  });
  const integrateSmooth = (a: number, b: number, origin: number, depth: number): Integral => {
    const whole = gauss(a, b, origin), mid = (a + b) / 2;
    const split = combine(gauss(a, mid, origin), gauss(mid, b, origin));
    if (split.moments.every((v, k) => Math.abs(v - whole.moments[k]!) <= 1e-12 * (b - a) / length * Math.max(1, Math.abs(v)))) return split;
    if (depth === 24) throw new WindPressureRefusal('wind.pressure.integrationUnresolved');
    return combine(integrateSmooth(a, mid, origin, depth + 1), integrateSmooth(mid, b, origin, depth + 1));
  };
  const integrate = (a: number, b: number): Integral => {
    const ends = [...(curvatureBreaks?.filter(s => s > a && s < b) ?? []), b];
    let integral = integrateSmooth(a, ends[0]!, a, 0);
    for (let i = 1; i < ends.length; i++) {
      integral = combine(integral, integrateSmooth(ends[i - 1]!, ends[i]!, a, 0));
    }
    return integral;
  };
  const carriesWork = (integral: Integral, replacement: number[], span: number) =>
    integral.moments.every((v, k) => Math.abs(v - replacement[k]!) <=
      1e-14 * span / Math.max(1, length) * Math.max(1, Math.abs(integral.moments[0]) * span ** k));
  const twoParts = (a: number, b: number, integral: Integral): [WindPressurePart, WindPressurePart] | null => {
    const span = b - a, mid = (a + b) / 2, peak = Math.max(Math.abs(integral.min), Math.abs(integral.max));
    const I = (n: number, c: number, d: number) => (d ** (n + 1) - c ** (n + 1)) / (n + 1);
    const piece = (k: number, c: number, d: number) => [(d * I(k, c, d) - I(k + 1, c, d)) / (d - c), (I(k + 1, c, d) - c * I(k, c, d)) / (d - c)];
    const split = (mid - a) / span;
    const matrix = [0, 1, 2, 3].map((k) => [...piece(k, 0, split), ...piece(k, split, 1)]);
    const rows = matrix.map((row, k) => [...row, integral.moments[k]! / span ** (k + 1)]);
    for (let c = 0; c < 4; c++) {
      let p = c;
      for (let r = c + 1; r < 4; r++) if (Math.abs(rows[r]![c]!) > Math.abs(rows[p]![c]!)) p = r;
      [rows[c], rows[p]] = [rows[p]!, rows[c]!];
      for (let r = 0; r < 4; r++) {
        if (r === c) continue;
        const f = rows[r]![c]! / rows[c]![c]!;
        for (let j = c; j < 5; j++) rows[r]![j] = rows[r]![j]! - f * rows[c]![j]!;
      }
    }
    const values = rows.map((r, i) => r[4]! / r[i]!);
    const nonNegative = integral.min >= 0 && value(a) >= 0 && value(b) >= 0, nonPositive = integral.max <= 0 && value(a) <= 0 && value(b) <= 0;
    if (values.some((v) => !Number.isFinite(v) || (nonNegative && v < -1e-12 * peak) || (nonPositive && v > 1e-12 * peak))) return null;
    const [u1, v1, u2, v2] = values.map((v) => (nonNegative ? Math.max(0, v) : nonPositive ? Math.min(0, v) : v)) as [number, number, number, number];
    const fit = matrix.map((row, k) => (row[0]! * u1 + row[1]! * v1 + row[2]! * u2 + row[3]! * v2) * span ** (k + 1));
    if (!carriesWork(integral, fit, span)) return null;
    const part = (c: number, d: number, q: number, qJ: number): WindPressurePart =>
      ({ a: c, b: d, q, qJ, force: (q + qJ) / 2 * (d - c), first: (d - c) * (q * (2 * c + d) + qJ * (c + 2 * d)) / 6 });
    const parts: [WindPressurePart, WindPressurePart] = [part(a, mid, u1, v1), part(mid, b, u2, v2)];
    return Math.abs(parts[0].force - integrate(a, mid).moments[0]) <= relativePressureLimit * peak * span ? parts : null;
  };
  const approximate = (a: number, b: number, depth: number, certifiesCuts: ReturnType<typeof cutForceCertificate> | undefined): WindPressurePart[] => {
    const span = b - a, integral = integrate(a, b), [force, first] = integral.moments;
    const mean = force / span, delta = 6 * (first - span / 2 * force) / span ** 2;
    let q = mean - delta, qJ = mean + delta;
    if (q < 0 || qJ < 0) {
      if (integral.min >= 0 && value(a) >= 0 && value(b) >= 0) { q = Math.max(0, Math.min(2 * mean, q)); qJ = 2 * mean - q; }
    }
    if (q > 0 || qJ > 0) {
      if (integral.max <= 0 && value(a) <= 0 && value(b) <= 0) { q = Math.min(0, Math.max(2 * mean, q)); qJ = 2 * mean - q; }
    }
    const replacement = integral.moments.map((_v, k) => span ** (k + 1) * (q / (k + 1) + (qJ - q) / (k + 2))) as Moments;
    const accurate = carriesWork(integral, replacement, span);
    const mid = (a + b) / 2;
    let parts: [WindPressurePart] | [WindPressurePart, WindPressurePart] | null = null;
    if (accurate) parts = [{ a, b, q, qJ, force: replacement[0], first: a * replacement[0] + replacement[1] }];
    else if (depth === 0 && certifiesCuts) parts = twoParts(a, b, integral);
    if (parts && (!certifiesCuts || certifiesCuts(parts))) return parts;
    if (depth === 24) throw new WindPressureRefusal('wind.pressure.integrationUnresolved');
    const breaks = curvatureBreaks?.filter(s => s > a && s < b);
    const split = breaks?.length ? breaks[Math.floor(breaks.length / 2)]! : mid;
    return [...approximate(a, split, depth + 1, certifiesCuts), ...approximate(split, b, depth + 1, certifiesCuts)];
  };
  return cuts.slice(1).flatMap((b, k) => {
    const a = cuts[k]!;
    const certifiesCuts = curvatureBreaks ? cutForceCertificate(a, b, value, curvatureBreaks) : undefined;
    return approximate(a, b, 0, certifiesCuts);
  });
}

export function windPressureCoordinate(value: number, boundaries: readonly number[]): number {
  return boundaries.find(b => Math.abs(value - b) <= 64 * Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(b))) ?? value;
}

export function windStationCuts(start: number, end: number, zones: readonly number[], length: number): number[] {
  return start === end ? [] : zones.map(z => (z - start) / (end - start) * length);
}

type Point = { id: number; x: number; y: number; z?: number };
const Z = (p: Point) => p.z ?? 0;

type HeightMember = { elementId: number; a: number; b: number; q: number; qJ: number };
type TorqueMember = HeightMember & { torque: 'resolved'; cx: number; cxJ: number; cy: number; cyJ: number; cm: number; cmJ: number };
type WindHeightMember = TorqueMember | (HeightMember & { torque: 'unsupported' });
export type WindHeightResult = {
  loads: Map<number, number>;
  baseLoads: Map<number, number>;
  torque: 'unsupported' | 'resolved';
  members: WindHeightMember[];
};

export function globalMemberLine(elementId: number, a: number, b: number, qX: number, qXJ: number, qY: number, qYJ: number) {
  return { elementId, a, b, q: 0, qJ: 0, qX, qXJ, qY, qYJ, frame: 'global' as const };
}

export function windHeightLoads(field: WindHeightResult, fx: number, fy: number, eccentricity = 0): Pick<WindCaseLoads, 'nodal' | 'baseLoads' | 'distributed'> {
  const distributed = field.members.map(p => {
    if (eccentricity !== 0 && p.torque === 'unsupported' && (p.q !== 0 || p.qJ !== 0)) throw new WindPressureRefusal('wind.pressure.distributedTorqueUnsupported');
    const torque = p.torque === 'resolved' ? p : { cx: 0, cxJ: 0, cy: 0, cyJ: 0, cm: 0, cmJ: 0 };
    if (eccentricity !== 0 && (torque.cm !== 0 || torque.cmJ !== 0)) throw new WindPressureRefusal('wind.pressure.distributedTorqueUnsupported');
    return { ...globalMemberLine(p.elementId, p.a, p.b,
      fx * p.q + eccentricity * torque.cx, fx * p.qJ + eccentricity * torque.cxJ,
      fy * p.q + eccentricity * torque.cy, fy * p.qJ + eccentricity * torque.cyJ), facet: -1 };
  });
  return { nodal: [], baseLoads: [], distributed };
}

function heightMembers(model: WindModel, from: number, to: number, region?: ReadonlySet<number>) {
  const members = [...model.elements.values()].flatMap(e => {
    const p = model.nodes.get(e.nodeI)!, q = model.nodes.get(e.nodeJ)!;
    const a = Z(p) <= Z(q) ? p : q, b = a === p ? q : p;
    if (Z(b) - Z(a) <= 1e-8) return [];
    return [{ a, b, e }];
  });
  const at = (m: typeof members[number], z: number) => {
    const t = (z - Z(m.a)) / (Z(m.b) - Z(m.a));
    return { x: m.a.x + t * (m.b.x - m.a.x), y: m.a.y + t * (m.b.y - m.a.y) };
  };
  const coincides = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y) <= 64 * Number.EPSILON * Math.max(1, Math.abs(p.x), Math.abs(p.y), Math.abs(q.x), Math.abs(q.y));
  const chains = members.map(m => {
    const connected = members.filter(n => coincides(at(m, Z(n.a)), n.a) && coincides(at(m, Z(n.b)), n.b));
    const intervals = connected.map(n => [Z(n.a), Z(n.b)] as [number, number]).sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const interval of intervals) {
      const last = merged[merged.length - 1];
      if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
      else merged.push([...interval]);
    }
    const [lo, hi] = merged.find(([lo, hi]) => lo <= Z(m.a) && hi >= Z(m.b))!;
    const slope = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y) / (Z(m.b) - Z(m.a));
    return { m, lo, hi, slope, lower: connected.find(n => Z(n.a) === lo)!.a, upper: connected.find(n => Z(n.b) === hi)!.b };
  });
  return members.flatMap((m, i) => {
    if (Z(m.b) <= from || Z(m.a) >= to) return [];
    if (region && !(region.has(m.a.id) && region.has(m.b.id)) && !(region.has(m.b.id) && Z(m.a) <= from)) return [];
    const chain = chains[i]!;
    const legs = chains.filter(c => c.lo <= chain.lo && c.hi >= chain.hi && c.slope < chain.slope - 64 * Number.EPSILON * Math.max(c.slope, chain.slope));
    const connectsLegs = legs.some(c => coincides(at(c.m, chain.lo), at(m, chain.lo))) && legs.some(c => coincides(at(c.m, chain.hi), at(m, chain.hi)));
    return connectsLegs ? [] : [{ ...m, lo: chain.lo, hi: chain.hi, lower: chain.lower, upper: chain.upper }];
  });
}

const sectionAt = (members: ReturnType<typeof heightMembers>, z: number) => members.map(m => {
  const t = (z - Z(m.a)) / (Z(m.b) - Z(m.a));
  return { x: m.a.x + t * (m.b.x - m.a.x), y: m.a.y + t * (m.b.y - m.a.y) };
});

export function windHeightWidth(model: WindModel, axis: 'x' | 'y', from: number, to: number): number {
  return heightWidth(heightMembers(model, from, to), axis, from, to);
}

function heightWidth(members: ReturnType<typeof heightMembers>, axis: 'x' | 'y', from: number, to: number): number {
  const cross = axis === 'x' ? 'y' : 'x';
  const cuts = [...new Set([from, to, ...members.flatMap(m => [Z(m.a), Z(m.b)])])].filter(z => z >= from && z <= to).sort((a, b) => a - b);
  let width = 0;
  for (let k = 1; k < cuts.length; k++) {
    const lo = cuts[k - 1]!, hi = cuts[k]!, mid = (lo + hi) / 2;
    const active = members.filter(m => Z(m.a) < mid && Z(m.b) > mid);
    for (const z of [lo, hi]) {
      const coords = sectionAt(active, z).map(p => p[cross]);
      if (coords.length) width = Math.max(width, Math.max(...coords) - Math.min(...coords));
    }
  }
  return width;
}

function carrierShares(points: Array<{ x: number; y: number }>, axis: 'x' | 'y'): number[] {
  const unique = points.filter((p, i) => points.findIndex(q => q.x === p.x && q.y === p.y) === i);
  if (unique.length === 1) return points.map(() => 1 / points.length);
  const origin = unique[0]!;
  const diameter = Math.max(...unique.flatMap(p => unique.map(q => Math.hypot(p.x - q.x, p.y - q.y))));
  const tolerance = 64 * Number.EPSILON * diameter;
  if (unique.length === 3) {
    const [a, b, c] = unique;
    const area2 = (b!.x - a!.x) * (c!.y - a!.y) - (b!.y - a!.y) * (c!.x - a!.x);
    if (Math.abs(area2) > tolerance * diameter) {
      const cross = axis === 'x' ? 'y' : 'x';
      const [lo, mid, hi] = [...unique].sort((p, q) => p[cross] - q[cross]);
      if (Math.abs((mid![cross] - lo![cross]) - (hi![cross] - mid![cross])) > tolerance || Math.abs(lo![axis] - hi![axis]) > tolerance) throw new WindPressureRefusal('wind.pressure.triangularCentroidUnsupported');
      return points.map(p => 1 / (3 * points.filter(q => p.x === q.x && p.y === q.y).length));
    }
  }
  for (const p of unique.slice(1)) {
    const length = Math.hypot(p.x - origin.x, p.y - origin.y), ux = (p.x - origin.x) / length, uy = (p.y - origin.y) / length;
    const local = points.map(p => [(p.x - origin.x) * ux + (p.y - origin.y) * uy, -(p.x - origin.x) * uy + (p.y - origin.y) * ux] as const);
    const levels = [0, 1].map(k => local.map(p => p[k]!).sort((a, b) => a - b).filter((p, i, a) => i === 0 || p - a[i - 1]! > tolerance));
    const indices = local.map(p => p.map((x, k) => levels[k]!.findIndex(v => Math.abs(v - x) <= tolerance)));
    const cells = new Set(indices.map(p => p.join(':')));
    if (cells.size !== levels[0]!.length * levels[1]!.length) continue;
    const share = (k: number, i: number) => { const xs = levels[k]!; if (xs.length === 1) return 1; return ((xs[i + 1] ?? xs[i]!) - (xs[i - 1] ?? xs[i]!)) / (2 * (xs[xs.length - 1]! - xs[0]!)); };
    return indices.map(p => share(0, p[0]!) * share(1, p[1]!) / indices.filter(q => p[0] === q[0] && p[1] === q[1]).length);
  }
  throw new WindPressureRefusal('wind.pressure.carrierPartitionUnresolved');
}

export function windHeightField(input: {
  model: WindModel;
  axis: 'x' | 'y';
  from: number;
  to: number;
  pressure: ((z: number, width: number, widthKind: 'physical' | 'declared') => number) & PiecewiseConvexity;
  boundaries?: readonly number[];
  width?: number;
  region?: ReadonlySet<number>;
}): WindHeightResult {
  const { model, axis, from, to } = input;
  const members = heightMembers(model, from, to, input.region);
  if (!members.length && to > from) throw new WindPressureRefusal('wind.pressure.noHeightCarriers');
  const cuts = [...new Set([from, to, ...members.flatMap(m => [Z(m.a), Z(m.b)]), ...(input.boundaries ?? [])])].filter(z => z >= from && z <= to).sort((a, b) => a - b);
  const loads = new Map<number, number>(), baseLoads = new Map<number, number>();
  const memberLoads: WindHeightMember[] = [];
  const add = (id: number, f: number) => { const map = Z(model.nodes.get(id)!) <= from ? baseLoads : loads; map.set(id, (map.get(id) ?? 0) + f); };
  const cross = axis === 'x' ? 'y' : 'x';
  const carrierCuts = [...new Set([from, to, ...members.flatMap(m => [m.lo, m.hi])])].filter(z => z >= from && z <= to).sort((a, b) => a - b);
  const widthModes: Array<'physical' | 'declared'> = carrierCuts.slice(1).map((hi, k) => heightWidth(members, axis, carrierCuts[k]!, hi) > 0.05 ? 'physical' : 'declared');
  const bands = cuts.slice(1).map((hi, k) => {
    const lo = cuts[k]!, mid = (lo + hi) / 2;
    const active = members.filter(m => Z(m.a) < mid && Z(m.b) > mid);
    const band = carrierCuts.findIndex(z => z > mid);
    const widthKind = widthModes[band - 1]!;
    const endpoint = (key: 'lower' | 'upper') => active.length > 1 && active.every(m => m[key].x === active[0]![key].x && m[key].y === active[0]![key].y && Z(m[key]) === Z(active[0]![key]));
    const referenceZ = endpoint('lower') ? Math.min(...active.map(m => m.hi)) : endpoint('upper') ? Math.max(...active.map(m => m.lo)) : undefined;
    const reference = referenceZ === undefined || widthKind !== 'physical' ? undefined : sectionAt(active, referenceZ);
    const coords = reference?.map(p => p[cross]);
    const width = coords ? Math.max(...coords) - Math.min(...coords) : 0;
    const apex = reference && width > 0 && levelLoadTorqueSupportedAlong(reference, reference)
      ? prepareLevelLoads(new Map(reference.map((p, id) => [id, { ...p, id }])), reference.map((_p, id) => id))(0, 0, width)
      : undefined;
    return { lo, hi, mid, active, widthKind, apex, supported: !!apex || levelLoadTorqueSupportedAlong(sectionAt(active, lo), sectionAt(active, hi)) };
  });
  for (const { lo, hi, mid, active, widthKind, apex, supported } of bands) {
    if (!active.length) throw new WindPressureRefusal('wind.pressure.heightGap');
    const stationary = active.every(m => m.a.x === m.b.x && m.a.y === m.b.y);
    const geometry = (z: number) => {
      const pts = sectionAt(active, z);
      const coords = [...new Set(pts.map(p => p[cross]))].sort((a, b) => a - b);
      const width = coords[coords.length - 1]! - coords[0]!;
      if (widthKind === 'physical' && width === 0 && (z === lo || z === hi)) return null;
      const actual = widthKind === 'physical' ? width : input.width;
      if (!(actual !== undefined && actual > 0)) throw new WindPressureRefusal('wind.pressure.missingWidth');
      const shares = carrierShares(pts, axis);
      const points = new Map(pts.map((p, id) => [id, { ...p, id }]));
      return { width: actual, weights: pts.map((_p, j) => actual * shares[j]!), torsion: prepareLevelLoads(points, [...points.keys()]) };
    };
    const fixedGeometry = stationary ? geometry(mid) : undefined;
    const stations = new Map<number, { density: number[]; torsion: WindCaseLoads['nodal'] }>();
    const station = (z: number) => {
      if (!stations.has(z)) {
        const g = fixedGeometry ?? geometry(z);
        if (g === null) {
          stations.set(z, { density: active.map(() => 0), torsion: active.map((_m, nodeId) => ({ nodeId, fx: 0, fy: 0, mz: 0 })) });
          return stations.get(z)!;
        }
        const pressure = input.pressure(z, g.width, widthKind);
        const density = g.weights.map(share => pressure * share);
        const torque = density.reduce((sum, p) => sum + p, 0);
        stations.set(z, { density, torsion: g.torsion(0, 0, torque) });
      }
      return stations.get(z)!;
    };
    const torsion = (z: number) => {
      if (!apex) return station(z).torsion;
      const pts = sectionAt(active, z), coords = pts.map(p => p[cross]);
      const width = Math.max(...coords) - Math.min(...coords);
      const pressure = input.pressure(z, width, 'physical');
      return apex.map(p => ({ nodeId: p.nodeId, fx: pressure * p.fx, fy: pressure * p.fy, mz: 0 }));
    };
    const pressureBreaks = input.pressure.curvatureBreaks?.map(z => z - lo);
    const curvatureBreaks = fixedGeometry ? pressureBreaks : undefined;
    const boundaries = fixedGeometry ? [] : pressureBreaks ?? [];
    const fixedIntegrals = new Map<string, WindPressurePart[]>();
    active.forEach((m, j) => {
      const density = (z: number) => station(z).density[j]!;
      const length = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y, Z(m.b) - Z(m.a));
      const scale = (Z(m.b) - Z(m.a)) / length;
      const components = supported ? [density, ...(['fx', 'fy', 'mz'] as const).map(c => (z: number) => torsion(z)[j]![c])] : [density];
      const componentKeys = fixedGeometry ? [`density:${fixedGeometry.weights[j]}`, `fx:${m.a.y}`, `fy:${m.a.x}`, 'mz'] : [];
      const parts = components.map((f, i) => {
        const key = componentKeys[i];
        if (key !== undefined && fixedIntegrals.has(key)) return fixedIntegrals.get(key)!;
        const parts = integrateWindPressure(hi - lo, boundaries, Object.assign((s: number) => f(lo + s), { curvatureBreaks }));
        if (key !== undefined) fixedIntegrals.set(key, parts);
        return parts;
      });
      const cuts = [...new Set(parts.flatMap(ps => ps.flatMap(p => [p.a, p.b])))].sort((a, b) => a - b);
      const cursors = parts.map(() => 0);
      for (let k = 1; k < cuts.length; k++) {
        const a = cuts[k - 1]!, b = cuts[k]!;
        const values = parts.map((ps, i) => {
          while (ps[cursors[i]!]!.b < (a + b) / 2) cursors[i]!++;
          const p = ps[cursors[i]!]!;
          const q = p.q + (p.qJ - p.q) * (a - p.a) / (p.b - p.a), qJ = p.q + (p.qJ - p.q) * (b - p.a) / (p.b - p.a);
          const force = (q + qJ) * (b - a) / 2;
          const first = (b - a) ** 2 * (q + 2 * qJ) / 6;
          return { q, qJ, force, first };
        });
        const forward = m.e.nodeI === m.a.id;
        const start = Math.max(0, (lo + a - Z(m.a)) / scale), end = Math.min(length, (lo + b - Z(m.a)) / scale);
        const endpoints = values.map(p => forward ? [p.q * scale, p.qJ * scale] : [p.qJ * scale, p.q * scale]);
        const member = { elementId: m.e.id, a: forward ? start : length - end, b: forward ? end : length - start, q: endpoints[0]![0]!, qJ: endpoints[0]![1]! };
        memberLoads.push(supported
          ? { ...member, torque: 'resolved', cx: endpoints[1]![0]!, cxJ: endpoints[1]![1]!, cy: endpoints[2]![0]!, cyJ: endpoints[2]![1]!, cm: endpoints[3]![0]!, cmJ: endpoints[3]![1]! }
          : { ...member, torque: 'unsupported' });
        const p = values[0]!;
        const upper = (p.first + (lo + a - Z(m.a)) * p.force) / (Z(m.b) - Z(m.a));
        add(m.a.id, p.force - upper); add(m.b.id, upper);
      }
    });
  }
  return { loads, baseLoads, torque: bands.every(b => b.supported) ? 'resolved' : 'unsupported', members: memberLoads };
}
