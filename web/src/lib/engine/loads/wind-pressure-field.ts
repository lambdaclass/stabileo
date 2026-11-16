import type { WindModel, WindCaseLoads } from './wind-cases';
import { levelLoads } from './wind-plan-forces';

export class WindPressureRefusal extends Error {}

export interface WindPressurePart {
  a: number;
  b: number;
  q: number;
  qJ: number;
  force: number;
  first: number;
}

export function integrateWindPressure(length: number, boundaries: readonly number[], pressure: (s: number) => number): WindPressurePart[] {
  if (!(Number.isFinite(length) && length > 0)) throw new WindPressureRefusal('wind.pressure.invalidCarrier');
  const cuts = [...new Set([0, ...boundaries.filter(s => s > 0 && s < length), length])].sort((a, b) => a - b);
  const gauss = (a: number, b: number): [number, number] => {
    const mid = (a + b) / 2, half = (b - a) / 2;
    let force = 0, first = 0;
    for (const [x, w] of [[-Math.sqrt(3 / 5), 5 / 9], [0, 8 / 9], [Math.sqrt(3 / 5), 5 / 9]] as const) {
      const s = mid + half * x, p = pressure(s);
      if (!Number.isFinite(p)) throw new WindPressureRefusal('wind.pressure.nonFinite');
      force += half * w * p; first += half * w * p * s;
    }
    return [force, first];
  };
  const integrate = (a: number, b: number, depth: number): [number, number] => {
    const whole = gauss(a, b), mid = (a + b) / 2, left = gauss(a, mid), right = gauss(mid, b);
    const split: [number, number] = [left[0] + right[0], left[1] + right[1]];
    if (split.every((v, k) => Math.abs(v - whole[k]!) <= 1e-12 * Math.max(1, Math.abs(v)))) return split;
    if (depth === 24) throw new WindPressureRefusal('wind.pressure.integrationUnresolved');
    const l = integrate(a, mid, depth + 1), r = integrate(mid, b, depth + 1);
    return [l[0] + r[0], l[1] + r[1]];
  };
  const approximate = (a: number, b: number, depth: number): WindPressurePart[] => {
    const span = b - a, [force, first] = integrate(a, b, 0);
    const mean = force / span, delta = 6 * (first - (a + b) / 2 * force) / span ** 2;
    const q = mean - delta, qJ = mean + delta;
    let secondError = 0, thirdError = 0;
    for (const [x, w] of [[-Math.sqrt(3 / 5), 5 / 9], [0, 8 / 9], [Math.sqrt(3 / 5), 5 / 9]] as const) {
      const t = (x + 1) / 2, at = a + span * t;
      const error = pressure(at) - (q + (qJ - q) * t);
      secondError += span / 2 * w * error * at ** 2;
      thirdError += span / 2 * w * error * at ** 3;
    }
    const accurate = Math.abs(secondError) <= 1e-12 * Math.max(1, Math.abs(force) * b ** 2) && Math.abs(thirdError) <= 1e-12 * Math.max(1, Math.abs(force) * b ** 3);
    if (accurate) return [{ a, b, q, qJ, force, first }];
    if (depth === 24) throw new WindPressureRefusal('wind.pressure.integrationUnresolved');
    const mid = (a + b) / 2;
    return [...approximate(a, mid, depth + 1), ...approximate(mid, b, depth + 1)];
  };
  return cuts.slice(1).flatMap((b, k) => approximate(cuts[k]!, b, 0));
}

export function windPressureCoordinate(value: number, boundaries: readonly number[]): number {
  return boundaries.find(b => Math.abs(value - b) <= 64 * Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(b))) ?? value;
}

export function windStationCuts(start: number, end: number, zones: readonly number[], length: number): number[] {
  return start === end ? [] : zones.map(z => (z - start) / (end - start) * length);
}

type Point = { id: number; x: number; y: number; z?: number };
const Z = (p: Point) => p.z ?? 0;

export interface WindHeightResult {
  loads: Map<number, number>;
  baseLoads: Map<number, number>;
  couple: Map<number, { fx: number; fy: number; mz: number }>;
  members: Array<{ elementId: number; a: number; b: number; q: number; qJ: number; cx: number; cxJ: number; cy: number; cyJ: number; cm: number; cmJ: number }>;
}

export function windHeightLoads(field: WindHeightResult, fx: number, fy: number, eccentricity = 0): Pick<WindCaseLoads, 'nodal' | 'baseLoads' | 'distributed'> {
  const distributed = field.members.map(p => {
    if (eccentricity !== 0 && (p.cm !== 0 || p.cmJ !== 0)) throw new WindPressureRefusal('wind.pressure.distributedTorqueUnsupported');
    return { elementId: p.elementId, a: p.a, b: p.b, q: 0, qJ: 0, qX: fx * p.q + eccentricity * p.cx, qXJ: fx * p.qJ + eccentricity * p.cxJ, qY: fy * p.q + eccentricity * p.cy, qYJ: fy * p.qJ + eccentricity * p.cyJ, frame: 'global' as const, facet: -1 };
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
    const intervals = members.filter(n => coincides(at(m, Z(n.a)), n.a) && coincides(at(m, Z(n.b)), n.b))
      .map(n => [Z(n.a), Z(n.b)] as [number, number]).sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const interval of intervals) {
      const last = merged[merged.length - 1];
      if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
      else merged.push([...interval]);
    }
    const [lo, hi] = merged.find(([lo, hi]) => lo <= Z(m.a) && hi >= Z(m.b))!;
    const slope = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y) / (Z(m.b) - Z(m.a));
    return { m, lo, hi, slope };
  });
  return members.filter((m, i) => {
    if (Z(m.b) <= from || Z(m.a) >= to) return false;
    if (region && !(region.has(m.a.id) && region.has(m.b.id)) && !(region.has(m.b.id) && Z(m.a) <= from)) return false;
    const chain = chains[i]!;
    const legs = chains.filter(c => c.lo <= chain.lo && c.hi >= chain.hi && c.slope < chain.slope - 64 * Number.EPSILON * Math.max(c.slope, chain.slope));
    const connectsLegs = legs.some(c => coincides(at(c.m, chain.lo), at(m, chain.lo))) && legs.some(c => coincides(at(c.m, chain.hi), at(m, chain.hi)));
    return !connectsLegs;
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

function carrierShares(points: Array<{ x: number; y: number }>): number[] {
  const unique = points.filter((p, i) => points.findIndex(q => q.x === p.x && q.y === p.y) === i);
  if (unique.length === 1) return points.map(() => 1 / points.length);
  const origin = unique[0]!;
  const diameter = Math.max(...unique.flatMap(p => unique.map(q => Math.hypot(p.x - q.x, p.y - q.y))));
  const tolerance = 64 * Number.EPSILON * diameter;
  if (unique.length === 3) {
    const [a, b, c] = unique;
    const area2 = (b!.x - a!.x) * (c!.y - a!.y) - (b!.y - a!.y) * (c!.x - a!.x);
    if (Math.abs(area2) > tolerance * diameter) return points.map(p => 1 / (3 * points.filter(q => p.x === q.x && p.y === q.y).length));
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
  pressure: (z: number, width: number, widthKind: 'physical' | 'declared') => number;
  boundaries?: readonly number[];
  width?: number;
  region?: ReadonlySet<number>;
}): WindHeightResult {
  const { model, axis, from, to } = input;
  const members = heightMembers(model, from, to, input.region);
  if (!members.length && to > from) throw new WindPressureRefusal('wind.pressure.noHeightCarriers');
  const cuts = [...new Set([from, to, ...members.flatMap(m => [Z(m.a), Z(m.b)]), ...(input.boundaries ?? [])])].filter(z => z >= from && z <= to).sort((a, b) => a - b);
  const loads = new Map<number, number>(), baseLoads = new Map<number, number>();
  const couple: WindHeightResult['couple'] = new Map();
  const memberLoads: WindHeightResult['members'] = [];
  const add = (id: number, f: number) => { const map = Z(model.nodes.get(id)!) <= from ? baseLoads : loads; map.set(id, (map.get(id) ?? 0) + f); };
  const cross = axis === 'x' ? 'y' : 'x';
  const widthKind = heightWidth(members, axis, from, to) > 0.05 ? 'physical' : 'declared';
  for (let k = 1; k < cuts.length; k++) {
    const lo = cuts[k - 1]!, hi = cuts[k]!, mid = (lo + hi) / 2;
    const active = members.filter(m => Z(m.a) < mid && Z(m.b) > mid);
    if (!active.length) throw new WindPressureRefusal('wind.pressure.heightGap');
    const weights = (z: number) => {
      const pts = sectionAt(active, z);
      const coords = [...new Set(pts.map(p => p[cross]))].sort((a, b) => a - b);
      const width = coords[coords.length - 1]! - coords[0]!;
      const actual = widthKind === 'physical' ? width : input.width;
      if (!(actual !== undefined && actual > 0)) throw new WindPressureRefusal('wind.pressure.missingWidth');
      const shares = carrierShares(pts);
      return pts.map((_p, j) => ({ width: actual, share: actual * shares[j]! }));
    };
    const stations = new Map<number, { weights: ReturnType<typeof weights>; torsion: ReturnType<typeof levelLoads> }>();
    const station = (z: number) => {
      if (!stations.has(z)) {
        const w = weights(z);
        const pts = new Map(sectionAt(active, z).map((p, id) => [id, { ...p, id }]));
        const torque = w.reduce((sum, p) => sum + input.pressure(z, p.width, widthKind) * p.share, 0);
        stations.set(z, { weights: w, torsion: levelLoads(pts, [...pts.keys()], 0, 0, torque) });
      }
      return stations.get(z)!;
    };
    active.forEach((m, j) => {
      const density = (z: number) => { const w = station(z).weights[j]!; return input.pressure(z, w.width, widthKind) * w.share; };
      const length = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y, Z(m.b) - Z(m.a));
      const scale = (Z(m.b) - Z(m.a)) / length;
      const components = [density, ...(['fx', 'fy', 'mz'] as const).map(c => (z: number) => station(z).torsion[j]![c])];
      const parts = components.map(f => integrateWindPressure(hi - lo, [], s => f(lo + s)));
      const cuts = [...new Set(parts.flatMap(ps => ps.flatMap(p => [p.a, p.b])))].sort((a, b) => a - b);
      for (let k = 1; k < cuts.length; k++) {
        const a = cuts[k - 1]!, b = cuts[k]!;
        const values = parts.map(ps => {
          const p = ps.find(p => p.a <= (a + b) / 2 && p.b >= (a + b) / 2)!;
          const q = p.q + (p.qJ - p.q) * (a - p.a) / (p.b - p.a), qJ = p.q + (p.qJ - p.q) * (b - p.a) / (p.b - p.a);
          const force = (q + qJ) * (b - a) / 2;
          const first = (b - a) ** 2 * (q + 2 * qJ) / 6;
          return { q, qJ, force, first };
        });
        const forward = m.e.nodeI === m.a.id;
        const start = (lo + a - Z(m.a)) / scale, end = (lo + b - Z(m.a)) / scale;
        const endpoints = values.map(p => forward ? [p.q * scale, p.qJ * scale] : [p.qJ * scale, p.q * scale]);
        memberLoads.push({ elementId: m.e.id, a: forward ? start : length - end, b: forward ? end : length - start, q: endpoints[0]![0]!, qJ: endpoints[0]![1]!, cx: endpoints[1]![0]!, cxJ: endpoints[1]![1]!, cy: endpoints[2]![0]!, cyJ: endpoints[2]![1]!, cm: endpoints[3]![0]!, cmJ: endpoints[3]![1]! });
        const p = values[0]!;
        const upper = (p.first + (lo + a - Z(m.a)) * p.force) / (Z(m.b) - Z(m.a));
        add(m.a.id, p.force - upper); add(m.b.id, upper);
        for (const [i, component] of (['fx', 'fy', 'mz'] as const).entries()) {
          const p = values[i + 1]!;
          const upper = (p.first + (lo + a - Z(m.a)) * p.force) / (Z(m.b) - Z(m.a));
          for (const [id, f] of [[m.a.id, p.force - upper], [m.b.id, upper]] as const) {
            const point = couple.get(id) ?? { fx: 0, fy: 0, mz: 0 };
            point[component] += f; couple.set(id, point);
          }
        }
      }
    });
  }
  return { loads, baseLoads, couple, members: memberLoads };
}
