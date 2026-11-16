import { expect } from 'vitest';
import type { snowLoadCases } from '../snow-loads';
import type { LoadModelData } from '../load-plan';
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

export function snowDistributedResultant(model: Model, loads: Output['cases'][number]['distributed'], ids: ReadonlySet<number>, origin = [0, 0], direction = [0, 1]) {
  return loads.filter(d => ids.has(d.elementId)).reduce(([force, moment], d) => {
    const e = model.elements.get(d.elementId)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const length = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
    const lo = d.a ?? 0, hi = d.b ?? length, span = hi - lo;
    const q0 = d.q, q1 = d.qJ ?? q0, f = span * (q0 + q1) / 2;
    const station = (a.x - origin[0]!) * direction[0]! + (a.y - origin[1]!) * direction[1]!;
    const rate = ((b.x - a.x) * direction[0]! + (b.y - a.y) * direction[1]!) / length;
    return [force! + f, moment! + (station + rate * lo) * f + rate * span * span * (q0 + 2 * q1) / 6];
  }, [0, 0]);
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
    for (const s of refined.segments) for (const t of [0.125, 0.375, 0.625, 0.875]) {
      const refinedLoads = c.distributed.map(d => ({ ...d, b: d.b ?? (s.to - s.from) * s.length }));
      const baseLoads = reference.distributed.map(d => ({ ...d, b: d.b ?? s.length }));
      expect(pressure(refinedLoads, s.id, t * (s.to - s.from) * s.length), `refinement ${JSON.stringify([...subdivisions])}, case ${k}, edge ${s.source}, segment ${s.from}, station ${t}`).toBeCloseTo(pressure(baseLoads, s.source, (s.from + t * (s.to - s.from)) * s.length), 10);
    }
    for (const source of model.elements.keys()) {
      const ids = new Set(refined.segments.filter(s => s.source === source).map(s => s.id));
      for (const direction of [[1, 0], [0, 1]]) {
        const expected = snowDistributedResultant(model, reference.distributed, new Set([source]), [0, 0], direction);
        const actual = snowDistributedResultant(refined.model, c.distributed, ids, [0, 0], direction);
        for (const [j, value] of actual.entries()) expect(value, `case ${k}, physical edge ${source}, resultant ${j}`).toBeCloseTo(expected[j]!, 10);
      }
    }
    const resultant = (loads: Output['cases'][number]['nodal'], m: Model) => loads.reduce((sum, n) => {
      const p = m.nodes.get(n.nodeId)!;
      return [sum[0]! + n.fx, sum[1]! + n.fy, sum[2]! + n.fz, sum[3]! + p.y * n.fz - (p.z ?? 0) * n.fy, sum[4]! + (p.z ?? 0) * n.fx - p.x * n.fz, sum[5]! + p.x * n.fy - p.y * n.fx];
    }, [0, 0, 0, 0, 0, 0]);
    for (const [j, force] of resultant(c.nodal, refined.model).entries()) expect(force).toBeCloseTo(resultant(reference.nodal, model)[j]!, 10);
  }
  return { base, out, refined };
}
