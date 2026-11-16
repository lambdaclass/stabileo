import { expect } from 'vitest';
import type { snowLoadCases } from '../snow-loads';
import type { LoadModelData } from '../load-plan';
import { snowCoordinate } from '../snow-roof-surfaces';
import { pressure } from './snow-roof-plane-fixture';

type Model = LoadModelData;
type Output = NonNullable<ReturnType<typeof snowLoadCases>>;

export function remeshSnowRoof(model: Model, subdivisions: ReadonlyMap<number, number>) {
  const nodes = new Map([...model.nodes].map(([id, n]) => [id, { ...n }]));
  const elements = new Map<number, Model['elements'] extends Map<number, infer E> ? E : never>();
  let nextNode = Math.max(...nodes.keys()) + 1, nextElement = Math.max(...model.elements.keys()) + 1;
  const segments: Array<{ id: number; source: number; from: number; to: number; length: number }> = [];
  for (const e of model.elements.values()) {
    const a = nodes.get(e.nodeI)!, b = nodes.get(e.nodeJ)!, count = subdivisions.get(e.id) ?? 1;
    const length = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
    let nodeI = e.nodeI;
    for (let k = 0; k < count; k++) {
      const nodeJ = k === count - 1 ? e.nodeJ : nextNode++;
      if (nodeJ !== e.nodeJ) nodes.set(nodeJ, { id: nodeJ, x: a.x + (b.x - a.x) * (k + 1) / count, y: a.y + (b.y - a.y) * (k + 1) / count, z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * (k + 1) / count });
      const id = k === 0 ? e.id : nextElement++;
      elements.set(id, { ...e, id, nodeI, nodeJ });
      segments.push({ id, source: e.id, from: k / count, to: (k + 1) / count, length });
      nodeI = nodeJ;
    }
  }
  return { model: { ...model, nodes, elements }, segments };
}

export function snowDistributedResultant(model: Model, loads: Output['cases'][number]['distributed'], ids: ReadonlySet<number>, origin = [0, 0], direction = [0, 1], region?: [number, number]) {
  return loads.filter(d => ids.has(d.elementId)).reduce(([force, moment], d) => {
    const e = model.elements.get(d.elementId)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const length = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
    const start = d.a ?? 0, end = d.b ?? length;
    const station = snowCoordinate([a.x, a.y], [origin[0]!, origin[1]!], [direction[0]!, direction[1]!], region?.filter(Number.isFinite));
    const rate = snowCoordinate([b.x, b.y], [a.x, a.y], [direction[0]!, direction[1]!], [0]) / length;
    let lo = start, hi = end;
    if (region) {
      if (rate === 0 && (station < region[0] || station > region[1])) return [force!, moment!];
      if (rate !== 0) {
        const cuts = region.map(x => (x - station) / rate).sort((a, b) => a - b);
        lo = Math.max(lo, cuts[0]!); hi = Math.min(hi, cuts[1]!);
      }
    }
    if (hi <= lo) return [force!, moment!];
    const cos = Math.hypot(b.x - a.x, b.y - a.y) / length;
    const q = (x: number) => (d.q + ((d.qJ ?? d.q) - d.q) * (x - start) / (end - start)) * cos;
    const span = hi - lo, q0 = q(lo), q1 = q(hi), f = span * (q0 + q1) / 2;
    return [force! + f, moment! + (station + rate * lo) * f + rate * span * span * (q0 + 2 * q1) / 6];
  }, [0, 0]);
}

type MemberInterval = { a: number; b: number; q: number; qJ: number };

export function memberResponse(intervals: MemberInterval[], length: number, station: number) {
  const integrate = (weight: (x: number) => number, from: number) => intervals.reduce((sum, d) => {
    const lo = Math.max(from, d.a), hi = d.b;
    if (hi <= lo) return sum;
    const mid = (lo + hi) / 2, half = (hi - lo) / 2;
    return sum + half * [-Math.sqrt(3 / 5), 0, Math.sqrt(3 / 5)].reduce((v, t, k) => {
      const x = mid + half * t, q = d.q + (d.qJ - d.q) * (x - d.a) / (d.b - d.a);
      return v + [5 / 9, 8 / 9, 5 / 9][k]! * q * weight(x);
    }, 0);
  }, 0);
  return [integrate(() => 1, station), integrate(x => x - station, station), integrate(x => x, 0), integrate(x => x * x * (3 * length - x) / 6, 0)];
}

export function assertSnowRemeshInvariant(model: Model, subdivisions: ReadonlyMap<number, number>, generate: (model: Model) => Output) {
  const base = generate(model), refined = remeshSnowRoof(model, subdivisions), out = generate(refined.model);
  expect(out.result.refused).toBe(base.result.refused);
  expect(out.geometry.W).toBeCloseTo(base.geometry.W, 10);
  expect(out.geometry.ridge).toBeCloseTo(base.geometry.ridge, 10);
  expect(out.geometry.slopeDeg).toBeCloseTo(base.geometry.slopeDeg, 10);
  for (const j of [0, 1] as const) {
    expect(out.geometry.direction[j]).toBeCloseTo(base.geometry.direction[j], 10);
    expect(out.geometry.transverse[j]).toBeCloseTo(base.geometry.transverse[j], 10);
  }
  expect(out.cases).toHaveLength(base.cases.length);
  for (const [k, c] of out.cases.entries()) {
    const reference = base.cases[k]!;
    expect(c.nameKey).toBe(reference.nameKey);
    expect(c.nameParams).toEqual(reference.nameParams);
    for (const source of model.elements.keys()) for (const direction of [[1, 0], [0, 1]]) {
      const ids = new Set(refined.segments.filter(s => s.source === source).map(s => s.id));
      const expected = snowDistributedResultant(model, reference.distributed, new Set([source]), [0, 0], direction);
      const actual = snowDistributedResultant(refined.model, c.distributed, ids, [0, 0], direction);
      for (const [j, value] of actual.entries()) expect(value, `physical region ${source}, resultant ${j}, case ${k}`).toBeCloseTo(expected[j]!, 10);
    }
    for (const source of model.elements.keys()) for (const region of [[-Infinity, base.geometry.ridge], [base.geometry.ridge, Infinity]] as Array<[number, number]>) {
      const ids = new Set(refined.segments.filter(s => s.source === source).map(s => s.id));
      const origin = [base.geometry.origin.x, base.geometry.origin.y], direction = base.geometry.direction;
      const expected = snowDistributedResultant(model, reference.distributed, new Set([source]), origin, direction, region);
      const actual = snowDistributedResultant(refined.model, c.distributed, ids, origin, direction, region);
      for (const [j, value] of actual.entries()) expect(value, `roof region ${region}, edge ${source}, resultant ${j}, case ${k}`).toBeCloseTo(expected[j]!, 10);
    }
    for (const source of model.elements.keys()) {
      const e = model.elements.get(source)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
      const length = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
      const referenceIntervals = reference.distributed.filter(d => d.elementId === source).map(d => ({ a: d.a ?? 0, b: d.b ?? length, q: d.q, qJ: d.qJ ?? d.q }));
      const actualIntervals = refined.segments.filter(s => s.source === source).flatMap(s => c.distributed.filter(d => d.elementId === s.id).map(d => ({ a: s.from * length + (d.a ?? 0), b: s.from * length + (d.b ?? (s.to - s.from) * length), q: d.q, qJ: d.qJ ?? d.q })));
      for (const station of [0.1, 0.3, 0.6, 0.9]) {
        const expected = memberResponse(referenceIntervals, length, station * length);
        const actual = memberResponse(actualIntervals, length, station * length);
        for (const [j, value] of actual.entries()) expect(value, `carrier ${source}, case ${k}, station ${station}, shear/moment/axial displacement/deflection ${j}`).toBeCloseTo(expected[j]!, 10);
      }
    }
    for (const s of refined.segments) for (const t of [0.125, 0.375, 0.625, 0.875]) {
      const refinedLoads = c.distributed.map(d => ({ ...d, b: d.b ?? (s.to - s.from) * s.length }));
      const baseLoads = reference.distributed.map(d => ({ ...d, b: d.b ?? s.length }));
      expect(pressure(refinedLoads, s.id, t * (s.to - s.from) * s.length), `refinement ${JSON.stringify([...subdivisions])}, case ${k}, edge ${s.source}, segment ${s.from}, station ${t}`).toBeCloseTo(pressure(baseLoads, s.source, (s.from + t * (s.to - s.from)) * s.length), 10);
    }
    const resultant = (loads: Output['cases'][number]['nodal'], m: Model) => loads.reduce((sum, n) => {
      const p = m.nodes.get(n.nodeId)!;
      return [sum[0]! + n.fx, sum[1]! + n.fy, sum[2]! + n.fz, sum[3]! + p.y * n.fz - (p.z ?? 0) * n.fy, sum[4]! + (p.z ?? 0) * n.fx - p.x * n.fz, sum[5]! + p.x * n.fy - p.y * n.fx];
    }, [0, 0, 0, 0, 0, 0]);
    for (const [j, force] of resultant(c.nodal, refined.model).entries()) expect(force).toBeCloseTo(resultant(reference.nodal, model)[j]!, 10);
  }
  return { base, out, refined };
}
