import type { WindModel, WindCaseLoads } from './wind-cases';

const MIN_PLAN_POLAR = 1e-9;
type PlanPoint = { x: number; y: number };
const centered = (pts: readonly PlanPoint[]) => {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return pts.map(p => ({ x: p.x - cx, y: p.y - cy }));
};

export function levelLoadTorqueSupportedAlong(start: readonly PlanPoint[], end: readonly PlanPoint[]): boolean {
  const a = centered(start), b = centered(end);
  const velocity = b.map((p, i) => ({ x: p.x - a[i]!.x, y: p.y - a[i]!.y }));
  const quadratic = velocity.reduce((s, p) => s + p.x ** 2 + p.y ** 2, 0);
  const dot = a.reduce((s, p, i) => s + p.x * velocity[i]!.x + p.y * velocity[i]!.y, 0);
  const t = quadratic === 0 ? 0 : Math.max(0, Math.min(1, -dot / quadratic));
  return a.reduce((sum, p, i) => sum + (p.x + t * velocity[i]!.x) ** 2 + (p.y + t * velocity[i]!.y) ** 2, 0) >= MIN_PLAN_POLAR;
}

export function levelLoads(
  nodes: WindModel['nodes'], ids: number[], fx: number, fy: number, mt: number,
): WindCaseLoads['nodal'] {
  return prepareLevelLoads(nodes, ids)(fx, fy, mt);
}

export function prepareLevelLoads(nodes: WindModel['nodes'], ids: number[]): (fx: number, fy: number, mt: number) => WindCaseLoads['nodal'] {
  const pts = ids.map((id) => nodes.get(id)).filter((n): n is NonNullable<typeof n> => !!n);
  if (pts.length === 0) return () => [];
  const offsets = centered(pts);
  const ip = offsets.reduce((s, p) => s + p.x ** 2 + p.y ** 2, 0);
  const n = pts.length;
  if (ip < MIN_PLAN_POLAR) {
    return (fx, fy, mt) => pts.map((p, i) => ({ nodeId: p.id, fx: fx / n, fy: fy / n, mz: i === 0 ? mt : 0 }));
  }
  return (fx, fy, mt) => pts.map((p, i) => ({
    nodeId: p.id,
    fx: fx / n - (mt * offsets[i]!.y) / ip,
    fy: fy / n + (mt * offsets[i]!.x) / ip,
    mz: 0,
  }));
}
