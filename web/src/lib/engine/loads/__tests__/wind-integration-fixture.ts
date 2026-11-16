import { expect } from 'vitest';
import { mesh } from './snow-surface-round2-fixture';
import type { WindDirection, WindAxis, WindModel } from '../wind-cases';

export { mesh };
export const windProject = { basicSpeed: 40, exposure: 'C' as const, siteAltitudeM: 0, kzt: 1, kztSurveyed: true, structureKind: 'building' as const, enclosure: 'open' as const, meanRoofHeight: 3, L: 10, B: 6, roofSlopeDeg: 0, rigid: true };
export const windAxis: WindAxis = { axis: 'x', across: 6, along: 10, pressureField: { loads: new Map(), baseLoads: new Map(), couple: new Map(), members: [] }, project: windProject, qhNm2: 1000, gcpi: 0, G: 0.85 };
export const variants = ['base', 'uniform', 'uneven', 'rotate', 'mirror'] as const;
export type Variant = typeof variants[number];
export function remeshWind(model: ReturnType<typeof mesh>, variant: Variant) {
  const out = mesh([]);
  const sources = new Map<number, number>();
  const cuts = variant === 'uniform' ? [0, 0.25, 0.5, 0.75, 1] : variant === 'uneven' ? [0, 0.17, 0.63, 1] : [0, 1];
  const forward = (x: number, y: number): [number, number] => variant === 'rotate' ? [-y, x] : variant === 'mirror' ? [-x, y] : [x, y];
  const back = (x: number, y: number): [number, number] => variant === 'rotate' ? [y, -x] : variant === 'mirror' ? [-x, y] : [x, y];
  const node = (x: number, y: number, z: number) => {
    const p = [...out.nodes.values()].find(n => Math.hypot(n.x - x, n.y - y, (n.z ?? 0) - z) < 1e-10);
    if (p) return p.id;
    const id = out.nodes.size + 1;
    out.nodes.set(id, { id, x, y, z });
    return id;
  };
  for (const e of model.elements.values()) {
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const ids = cuts.map(t => { const [x, y] = forward(a.x + t * (b.x - a.x), a.y + t * (b.y - a.y)); return node(x, y, (a.z ?? 0) + t * ((b.z ?? 0) - (a.z ?? 0))); });
    for (let k = 1; k < ids.length; k++) {
      const id = out.elements.size + 1;
      out.elements.set(id, { ...e, id, nodeI: ids[k - 1]!, nodeJ: ids[k]! });
      sources.set(id, e.id);
    }
  }
  const direction = (d: WindDirection): WindDirection => {
    const [x, y] = forward(d.endsWith('x') ? (d[0] === '+' ? 1 : -1) : 0, d.endsWith('y') ? (d[0] === '+' ? 1 : -1) : 0);
    return `${(x || y) > 0 ? '+' : '-'}${x ? 'x' : 'y'}` as WindDirection;
  };
  return { model: out, sources, back, forward, direction };
}

type Line = { elementId: number; q: number; qJ?: number; a?: number; b?: number; qX?: number; qXJ?: number; qY?: number; qYJ?: number; frame?: string; caseType?: string; caseIndex?: number };
type Point = { nodeId: number; fx: number; fy: number; fz?: number; mz?: number; caseType?: string; caseIndex?: number };
export function windResultants(model: ReturnType<typeof mesh>, lines: Line[], points: Point[] = [], back = (x: number, y: number): [number, number] => [x, y]) {
  const sum = [0, 0, 0, 0, 0, 0];
  const add = (x: number, y: number, z: number, fx: number, fy: number, fz: number, mz = 0) => {
    [x, y] = back(x, y); [fx, fy] = back(fx, fy);
    const v = [fx, fy, fz, y * fz - z * fy, z * fx - x * fz, x * fy - y * fx + mz];
    v.forEach((n, k) => { sum[k]! += n; });
  };
  for (const d of lines) {
    const e = model.elements.get(d.elementId)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const length = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
    const lo = d.a ?? 0, hi = d.b ?? length;
    for (const u of [(1 - 1 / Math.sqrt(3)) / 2, (1 + 1 / Math.sqrt(3)) / 2]) {
      const t = (lo + (hi - lo) * u) / length, weight = (hi - lo) / 2;
      add(a.x + t * (b.x - a.x), a.y + t * (b.y - a.y), (a.z ?? 0) + t * ((b.z ?? 0) - (a.z ?? 0)), ((d.qX ?? 0) + ((d.qXJ ?? d.qX ?? 0) - (d.qX ?? 0)) * u) * weight, ((d.qY ?? 0) + ((d.qYJ ?? d.qY ?? 0) - (d.qY ?? 0)) * u) * weight, (d.q + ((d.qJ ?? d.q) - d.q) * u) * weight);
    }
  }
  for (const p of points) { const n = model.nodes.get(p.nodeId)!; add(n.x, n.y, n.z ?? 0, p.fx, p.fy, p.fz ?? 0, p.mz); }
  return sum;
}
export function assertWindResultants(actual: number[], expected: number[]) {
  actual.forEach((v, k) => expect(v).toBeCloseTo(expected[k]!, 8));
}
export function columns(cuts = [0, 6], width = 6, length = 12) {
  return mesh([0, length].flatMap(x => [0, width].flatMap(y => cuts.slice(1).map((z, k) => [[x, y, cuts[k]!], [x, y, z]]))));
}

export function windEndResultants(model: WindModel, lines: Line[], points: Point[] = []) {
  const out = [...points];
  for (const d of lines) {
    const e = model.elements.get(d.elementId)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const length = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)), lo = d.a ?? 0, hi = d.b ?? length;
    const ends = (i: number, j: number) => { const force = (i + j) * (hi - lo) / 2, first = lo * force + (hi - lo) ** 2 * (i + 2 * j) / 6; return [force - first / length, first / length]; };
    const fx = ends(d.qX ?? 0, d.qXJ ?? d.qX ?? 0), fy = ends(d.qY ?? 0, d.qYJ ?? d.qY ?? 0), fz = ends(d.q, d.qJ ?? d.q);
    for (const [i, n] of [a, b].entries()) out.push({ ...d, nodeId: n.id, fx: fx[i]!, fy: fy[i]!, fz: fz[i]!, mz: 0 });
  }
  return out;
}
