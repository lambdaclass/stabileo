import type { FloorLoadResult } from '../floor-loads';
import { computeLocalAxes3D } from '../../local-axes-3d';
import { distributedGlobalEnds } from '../../member-loads';
import { expect } from 'vitest';
import type { LoadModelData } from '../load-plan';
import { shellLoadForces, type ShellLoadSpec } from '../../shell-load-integration';

export type RegionModel = LoadModelData & { quads: Map<number, { id: number; nodes: number[]; thickness: number; materialId: number }> };
export type Resultant = [number, number, number];
type Loads = {
  distributed: Array<{ elementId: number; q: number; qJ?: number; a?: number; b?: number; frame?: string }>;
  nodal: Array<{ nodeId: number; fz: number; mx?: number; my?: number }>;
  surface: Array<{ quadId: number; q: number; region?: ShellLoadSpec['region'] }>;
};

export function regionModel(rings: number[][][], shells: number[][][] = []): RegionModel {
  const nodes: RegionModel['nodes'] = new Map();
  const elements: RegionModel['elements'] = new Map();
  const quads: RegionModel['quads'] = new Map();
  const node = (p: number[]) => {
    const old = [...nodes.values()].find(n => n.x === p[0] && n.y === p[1] && n.z === (p[2] ?? 3));
    if (old) return old.id;
    const id = nodes.size + 1;
    nodes.set(id, { id, x: p[0]!, y: p[1]!, z: p[2] ?? 3 });
    return id;
  };
  for (const r of rings) for (let k = 0; k < r.length; k++) {
    const nodeI = node(r[k]!), nodeJ = node(r[(k + 1) % r.length]!);
    if ([...elements.values()].some(e => e.nodeI === nodeI && e.nodeJ === nodeJ || e.nodeI === nodeJ && e.nodeJ === nodeI)) continue;
    const id = elements.size + 1;
    elements.set(id, { id, nodeI, nodeJ, sectionId: 1, materialId: 1, type: 'frame' });
  }
  for (const r of shells) { const id = quads.size + 1; quads.set(id, { id, nodes: r.map(node), thickness: 0.1, materialId: 1 }); }
  return { nodes, elements, quads, materials: new Map([[1, { id: 1, rho: 25 }]]), sections: new Map([[1, { id: 1, a: 0.1 }]]), loadCases: [] };
}

export function rectangle(x0 = 0, y0 = 0, x1 = 10, y1 = 6, z = 3): number[][] {
  return [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]];
}

export function loadResultant(m: LoadModelData, loads: Loads): Resultant {
  const values: [number[], number[], number[]] = [[], [], []];
  const add = (f: number, x: number, y: number) => { values[0].push(f); values[1].push(x); values[2].push(y); };
  const point = (nodeId: number, fz: number, mx = 0, my = 0) => {
    const n = m.nodes.get(nodeId)!;
    add(-fz, -fz * n.x + my, -fz * n.y - mx);
  };
  for (const d of loads.distributed) {
    const e = m.elements.get(d.elementId)!, a = m.nodes.get(e.nodeI)!, b = m.nodes.get(e.nodeJ)!;
    const L = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)), h = (d.b ?? L) - (d.a ?? 0);
    const scale = d.frame === 'projected' ? Math.hypot(b.x - a.x, b.y - a.y) / L : 1;
    const f = -(d.q + (d.qJ ?? d.q)) * h / 2 * scale;
    const first = (d.a ?? 0) * f - h * h * (d.q + 2 * (d.qJ ?? d.q)) / 6 * scale;
    add(f, a.x * f + (b.x - a.x) / L * first, a.y * f + (b.y - a.y) / L * first);
  }
  for (const n of loads.nodal) point(n.nodeId, n.fz, n.mx, n.my);
  for (const s of loads.surface) {
    const q = m.quads!.get(s.quadId)!;
    const out = shellLoadForces('quad', q.nodes.map(id => m.nodes.get(id)!), s)!;
    out.forces.forEach((f, i) => point(q.nodes[i]!, f[2]));
  }
  return values.map(vs => {
    let sum = 0, error = 0;
    for (const v of vs) { const next = sum + v; error += Math.abs(sum) >= Math.abs(v) ? (sum - next) + v : (v - next) + sum; sum = next; }
    return sum + error;
  }) as Resultant;
}

export type RegionVariant = 'base' | 'rotate' | 'mirror' | 'remesh' | 'ids';
export function regionVariant<T extends LoadModelData>(original: T, variant: RegionVariant): { model: T; back: (r: Resultant) => Resultant; point: (p: number[]) => [number, number, number] } {
  const model = structuredClone(original);
  const angle = variant === 'rotate' ? 0.37 : variant === 'mirror' ? 0.61 : 0;
  const mirror = variant === 'mirror' ? -1 : 1, c = Math.cos(angle), s = Math.sin(angle);
  const point = (p: number[]): [number, number, number] => [mirror * p[0]! * c - p[1]! * s, mirror * p[0]! * s + p[1]! * c, p[2] ?? 3];
  if (variant === 'remesh') {
    let next = Math.max(0, ...model.nodes.keys()) + 1;
    let el = Math.max(0, ...model.elements.keys()) + 1;
    const inserted = new Map<string, number>();
    for (const e of [...model.elements.values()]) {
      const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
      if (Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)) / 8 < 0.01) continue;
      let prev = e.nodeI;
      for (const t of [0.125, 0.5, 0.875]) {
        const key = e.nodeI < e.nodeJ ? `${e.nodeI},${e.nodeJ},${t}` : `${e.nodeJ},${e.nodeI},${1 - t}`;
        let id = inserted.get(key);
        if (id === undefined) {
          id = next++; inserted.set(key, id);
          model.nodes.set(id, { id, x: (1 - t) * a.x + t * b.x, y: (1 - t) * a.y + t * b.y, z: (1 - t) * (a.z ?? 0) + t * (b.z ?? 0) });
        }
        model.elements.set(el, { ...e, id: el++, nodeI: prev, nodeJ: id }); prev = id;
      }
      model.elements.set(e.id, { ...e, nodeI: prev });
    }
    if (model.quads) {
      let qid = Math.max(0, ...model.quads.keys()) + 1;
      const node = (ids: number[]) => {
        const sorted = [...ids].sort((a, b) => a - b);
        const key = ids.length === 2 ? `${sorted[0]},${sorted[1]},0.5` : sorted.join(',');
        const previous = inserted.get(key);
        if (previous !== undefined) return previous;
        const ns = ids.map(id => model.nodes.get(id)!);
        const id = next++; inserted.set(key, id);
        model.nodes.set(id, { id, x: ns.reduce((s, n) => s + n.x, 0) / ns.length, y: ns.reduce((s, n) => s + n.y, 0) / ns.length, z: ns.reduce((s, n) => s + (n.z ?? 0), 0) / ns.length });
        return id;
      };
      for (const q of [...model.quads.values()]) {
        const center = node(q.nodes), mids = q.nodes.map((id, i) => node([id, q.nodes[(i + 1) % q.nodes.length]!]));
        model.quads.delete(q.id);
        q.nodes.forEach((id, i) => { model.quads!.set(qid, { ...q, id: qid++, nodes: [id, mids[i]!, center, mids[(i + mids.length - 1) % mids.length]!] }); });
      }
    }
  }
  for (const n of model.nodes.values()) { const p = point([n.x, n.y, n.z ?? 0]); n.x = p[0]; n.y = p[1]; n.z = p[2]; }
  if (variant === 'ids') {
    const id = (n: number) => 10000 + n * 17;
    model.nodes = new Map([...model.nodes.values()].reverse().map(n => [id(n.id), { ...n, id: id(n.id) }]));
    model.elements = new Map([...model.elements.values()].reverse().map(e => [id(e.id), { ...e, id: id(e.id), nodeI: id(e.nodeJ), nodeJ: id(e.nodeI) }]));
    if (model.quads) model.quads = new Map([...model.quads.values()].reverse().map(q => [id(q.id), { ...q, id: id(q.id), nodes: q.nodes.map(id).reverse() }]));
  }
  return { model, point, back: ([f, x, y]) => [f, mirror * (x * c + y * s), -x * s + y * c] };
}

export function expectResultant(actual: Resultant, expected: Resultant, label = ''): void {
  actual.forEach((v, i) => expect(v, `${label} resultant component ${i}`).toBeCloseTo(expected[i]!, 8));
}

export function assertRegionInvariant<T extends LoadModelData>(model: T, generate: (m: T, point: (p: number[]) => [number, number, number]) => Resultant, expected?: Resultant): void {
  const base = generate(model, p => [p[0]!, p[1]!, p[2] ?? 3]);
  if (expected) expectResultant(base, expected);
  for (const variant of ['rotate', 'mirror', 'remesh', 'ids'] as const) {
    const changed = regionVariant(model, variant);
    expectResultant(changed.back(generate(changed.model, changed.point)), expected ?? base, variant);
  }
}

export function floorResultant(m: LoadModelData, out: FloorLoadResult, leftHand = false): Resultant {
  const distributed = out.loads.map(l => {
    const e = m.elements.get(l.elementId)!, a = m.nodes.get(e.nodeI)!, b = m.nodes.get(e.nodeJ)!;
    const axes = computeLocalAxes3D({ ...a, z: a.z ?? 0 }, { ...b, z: b.z ?? 0 }, undefined, 0, false);
    const L = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
    const field = distributedGlobalEnds(l, { ...axes, L }, leftHand);
    for (const g of [field.gI, field.gJ]) { expect(g[0]).toBeCloseTo(0, 10); expect(g[1]).toBeCloseTo(0, 10); }
    return { elementId: l.elementId, q: field.gI[2], qJ: field.gJ[2], a: field.a, b: field.b };
  });
  return loadResultant(m, { distributed, nodal: out.nodal, surface: [] });
}
