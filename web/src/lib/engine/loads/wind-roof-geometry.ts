import { roofMembers, type WindModel } from './wind-cases';

const Z = (n: { z?: number }) => n.z ?? 0;

export function windRoofGeometry(model: WindModel, only?: ReadonlySet<number>): { axis: 'x' | 'y'; ridge: number; slopeDeg: number } | null {
  const roof = roofMembers(model, only);
  if (roof.length === 0) return null;
  let ax = 0, ay = 0, slopeSum = 0, sloped = 0;
  for (const m of roof) {
    const s = Math.abs(m.dz) / Math.max(m.lh, 1e-9);
    if (s > Math.tan((1 * Math.PI) / 180)) {
      ax += Math.abs(m.dx); ay += Math.abs(m.dy);
      slopeSum += (Math.atan(s) * 180) / Math.PI; sloped++;
    }
  }
  const nodes = new Set<number>();
  for (const e of model.elements.values()) if (roof.some((r) => r.id === e.id)) { nodes.add(e.nodeI); nodes.add(e.nodeJ); }
  const pts = [...nodes].map((id) => model.nodes.get(id)!).filter(Boolean);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const axis: 'x' | 'y' = sloped > 0 ? (ax >= ay ? 'x' : 'y')
    : (Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 'y' : 'x');
  const coord = (p: { x: number; y: number }) => (axis === 'x' ? p.x : p.y);
  const zMax = Math.max(...pts.map(Z));
  const top = pts.filter((p) => Z(p) > zMax - 0.05);
  const ridge = top.reduce((s, p) => s + coord(p), 0) / top.length;
  return { axis, ridge, slopeDeg: sloped > 0 ? slopeSum / sloped : 0 };
}
