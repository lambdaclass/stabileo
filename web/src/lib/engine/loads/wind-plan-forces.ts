import type { WindModel, WindCaseLoads } from './wind-cases';

export function levelLoads(
  nodes: WindModel['nodes'], ids: number[], fx: number, fy: number, mt: number,
): WindCaseLoads['nodal'] {
  return prepareLevelLoads(nodes, ids)(fx, fy, mt);
}

export function prepareLevelLoads(nodes: WindModel['nodes'], ids: number[]): (fx: number, fy: number, mt: number) => WindCaseLoads['nodal'] {
  const pts = ids.map((id) => nodes.get(id)).filter((n): n is NonNullable<typeof n> => !!n);
  if (pts.length === 0) return () => [];
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const ip = pts.reduce((s, p) => s + (p.x - cx) ** 2 + (p.y - cy) ** 2, 0);
  const n = pts.length;
  if (ip < 1e-9) {
    return (fx, fy, mt) => pts.map((p, i) => ({ nodeId: p.id, fx: fx / n, fy: fy / n, mz: i === 0 ? mt : 0 }));
  }
  return (fx, fy, mt) => pts.map((p) => ({
    nodeId: p.id,
    fx: fx / n - (mt * (p.y - cy)) / ip,
    fy: fy / n + (mt * (p.x - cx)) / ip,
    mz: 0,
  }));
}
