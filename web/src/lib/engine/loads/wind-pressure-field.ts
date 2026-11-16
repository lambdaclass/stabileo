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
  return cuts.slice(1).map((b, k) => {
    const a = cuts[k]!, span = b - a, [force, first] = integrate(a, b, 0);
    const mean = force / span, delta = 6 * (first - (a + b) / 2 * force) / span ** 2;
    return { a, b, q: mean - delta, qJ: mean + delta, force, first };
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

export interface WindHeightResult {
  loads: Map<number, number>;
  baseLoads: Map<number, number>;
  couple: Map<number, { fx: number; fy: number; mz: number }>;
}

export function windHeightLoads(field: WindHeightResult, fx: number, fy: number, eccentricity = 0): Pick<WindCaseLoads, 'nodal' | 'baseLoads'> {
  const points = new Map<number, WindCaseLoads['nodal'][number]>();
  for (const [nodeId, force] of [...field.baseLoads, ...field.loads]) points.set(nodeId, { nodeId, fx: fx * force, fy: fy * force, mz: 0 });
  if (eccentricity !== 0) for (const [nodeId, p] of field.couple) {
    const point = points.get(nodeId)!;
    point.fx += eccentricity * p.fx; point.fy += eccentricity * p.fy; point.mz += eccentricity * p.mz;
  }
  const nodal = [...points.values()];
  return { nodal, baseLoads: nodal.filter(p => field.baseLoads.has(p.nodeId)) };
}

function heightMembers(model: WindModel, from: number, to: number, region?: ReadonlySet<number>) {
  return [...model.elements.values()].flatMap(e => {
    const p = model.nodes.get(e.nodeI)!, q = model.nodes.get(e.nodeJ)!;
    const a = Z(p) <= Z(q) ? p : q, b = a === p ? q : p;
    if (Z(b) - Z(a) <= 1e-8 || Z(b) <= from || Z(a) >= to) return [];
    if (region && !(region.has(a.id) && region.has(b.id)) && !(region.has(b.id) && Z(a) <= from)) return [];
    return [{ a, b }];
  });
}

const sectionAt = (members: ReturnType<typeof heightMembers>, z: number) => members.map(m => {
  const t = (z - Z(m.a)) / (Z(m.b) - Z(m.a));
  return { x: m.a.x + t * (m.b.x - m.a.x), y: m.a.y + t * (m.b.y - m.a.y) };
});

export function windHeightWidth(model: WindModel, axis: 'x' | 'y', from: number, to: number): number {
  const cross = axis === 'x' ? 'y' : 'x';
  const members = heightMembers(model, from, to);
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

export function windHeightField(input: {
  model: WindModel;
  axis: 'x' | 'y';
  from: number;
  to: number;
  pressure: (z: number, width: number, measuredWidth: number) => number;
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
  const add = (id: number, f: number) => { const map = Z(model.nodes.get(id)!) <= from ? baseLoads : loads; map.set(id, (map.get(id) ?? 0) + f); };
  const cross = axis === 'x' ? 'y' : 'x';
  for (let k = 1; k < cuts.length; k++) {
    const lo = cuts[k - 1]!, hi = cuts[k]!, mid = (lo + hi) / 2;
    const active = members.filter(m => Z(m.a) < mid && Z(m.b) > mid);
    if (!active.length) throw new WindPressureRefusal('wind.pressure.heightGap');
    const weights = (z: number) => {
      const pts = sectionAt(active, z);
      const coords = [...new Set(pts.map(p => p[cross]))].sort((a, b) => a - b);
      const width = coords[coords.length - 1]! - coords[0]!;
      const actual = width > 0.05 ? width : input.width;
      if (!(actual !== undefined && actual > 0)) throw new WindPressureRefusal('wind.pressure.missingWidth');
      return pts.map(p => {
        const j = coords.indexOf(p[cross]);
        const w = width > 0 ? actual * ((coords[j + 1] ?? p[cross]) - (coords[j - 1] ?? p[cross])) / (2 * width) : actual;
        const row = pts.filter(q => q[cross] === p[cross]);
        const along = [...new Set(row.map(q => q[axis]))].sort((a, b) => a - b), span = along[along.length - 1]! - along[0]!;
        const i = along.indexOf(p[axis]);
        const share = span > 0 ? ((along[i + 1] ?? p[axis]) - (along[i - 1] ?? p[axis])) / (2 * span) : 1;
        return { width: actual, measuredWidth: width, share: w * share / row.filter(q => q[axis] === p[axis]).length };
      });
    };
    const stations = new Map<number, { weights: ReturnType<typeof weights>; torsion: ReturnType<typeof levelLoads> }>();
    const station = (z: number) => {
      if (!stations.has(z)) {
        const w = weights(z);
        const pts = new Map(sectionAt(active, z).map((p, id) => [id, { ...p, id }]));
        const torque = w.reduce((sum, p) => sum + input.pressure(z, p.width, p.measuredWidth) * p.share, 0);
        stations.set(z, { weights: w, torsion: levelLoads(pts, [...pts.keys()], 0, 0, torque) });
      }
      return stations.get(z)!;
    };
    active.forEach((m, j) => {
      const transfer = (density: (z: number) => number, addForce: (id: number, f: number) => void) => {
        const parts = integrateWindPressure(hi - lo, [], s => density(lo + s));
        for (const p of parts) {
          const upper = (p.first + (lo - Z(m.a)) * p.force) / (Z(m.b) - Z(m.a));
          addForce(m.a.id, p.force - upper); addForce(m.b.id, upper);
        }
      };
      transfer(z => { const w = station(z).weights[j]!; return input.pressure(z, w.width, w.measuredWidth) * w.share; }, add);
      for (const component of ['fx', 'fy', 'mz'] as const) transfer(z => station(z).torsion[j]![component], (id, f) => {
        const point = couple.get(id) ?? { fx: 0, fy: 0, mz: 0 };
        point[component] += f;
        couple.set(id, point);
      });
    });
  }
  return { loads, baseLoads, couple };
}
