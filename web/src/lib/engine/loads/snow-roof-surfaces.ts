import { roofMembers, type WindModel } from './wind-cases';
import type { GravityLayout } from './plan-gravity';

type P2 = [number, number];
const Z = (n: { z?: number }) => n.z ?? 0;

export function insideSnowPanel(pt: P2, poly: ReadonlyArray<P2>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function containsSnowPanel(pt: P2, poly: ReadonlyArray<P2>): boolean {
  return insideSnowPanel(pt, poly) || poly.some((a, k) => {
    const b = poly[(k + 1) % poly.length]!, dx = b[0] - a[0], dy = b[1] - a[1];
    const t = ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / (dx * dx + dy * dy);
    return t >= 0 && t <= 1 && Math.hypot(pt[0] - a[0] - t * dx, pt[1] - a[1] - t * dy) < 1e-9;
  });
}

export function snowRoofSurfaces(model: WindModel, layout?: GravityLayout) {
  const sloped = roofMembers(model).filter(m => Math.abs(m.dz) / Math.max(m.lh, 1e-9) > Math.tan(Math.PI / 180)).map(m => {
    const e = model.elements.get(m.id)!;
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    return { m, a, b, low: Math.min(Z(a), Z(b)), deg: Math.atan(Math.abs(m.dz) / m.lh) * 180 / Math.PI };
  });
  const cache = new Map<number, ReturnType<typeof read>>();
  function read(index: number) {
    const panel = layout?.panels[index];
    const over = panel ? sloped.filter(x => {
      const pt: P2 = [x.m.mid.x, x.m.mid.y];
      return x.low >= panel.z - 0.05 && insideSnowPanel(pt, panel.polygon)
        && !layout!.panels.some(other => other.z > panel.z + 0.05 && other.z <= x.low + 0.05 && containsSnowPanel(pt, other.polygon));
    }) : [];
    const length = over.reduce((sum, x) => sum + x.m.lh, 0);
    const slope = length > 0 ? over.reduce((sum, x) => sum + x.deg * x.m.lh, 0) / length : 0;
    const datum = panel ? [...model.nodes.values()].filter(n => Math.abs(Z(n) - panel.z) <= 0.05 && panel.polygon.some(v => Math.hypot(n.x - v[0], n.y - v[1]) < 1e-6))
      .sort((a, b) => Math.abs(Z(a) - panel.z) - Math.abs(Z(b) - panel.z))[0] : undefined;
    const elevation = (pt: P2) => {
      let distance = Infinity, z = datum ? Z(datum) : panel?.z ?? 0;
      for (const { a, b } of over) {
        const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
        const t = ((pt[0] - a.x) * dx + (pt[1] - a.y) * dy) / l2;
        if (t < -1e-6 || t > 1 + 1e-6) continue;
        const d = Math.hypot(pt[0] - a.x - t * dx, pt[1] - a.y - t * dy);
        if (d < distance) { distance = d; z = Z(a) + Math.max(0, Math.min(1, t)) * (Z(b) - Z(a)); }
      }
      return z;
    };
    return { slope, elevation };
  }
  return (index: number) => {
    let surface = cache.get(index);
    if (!surface) { surface = read(index); cache.set(index, surface); }
    return surface;
  };
}

export function snowRoofSteps(model: WindModel, layout: GravityLayout) {
  const surfaces = snowRoofSurfaces(model, layout);
  const steps: Array<{ lower: number; upper: number; a: P2; b: P2 }> = [];
  for (const [lower, L] of layout.panels.entries()) for (const [upper, U] of layout.panels.entries()) {
    if (!L.roof || !U.roof || lower === upper) continue;
    for (let e = 0; e < L.polygon.length; e++) {
      const a = L.polygon[e]!, b = L.polygon[(e + 1) % L.polygon.length]!;
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;
      const u: P2 = [dx / len, dy / len];
      let t0 = Infinity, t1 = -Infinity;
      for (let f = 0; f < U.polygon.length; f++) {
        const c = U.polygon[f]!, d = U.polygon[(f + 1) % U.polygon.length]!;
        const normal = (p: P2) => (p[0] - a[0]) * -u[1] + (p[1] - a[1]) * u[0];
        if (Math.abs(normal(c)) > 0.01 || Math.abs(normal(d)) > 0.01) continue;
        const along = (p: P2) => (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1];
        const lo = Math.max(0, Math.min(along(c), along(d))), hi = Math.min(len, Math.max(along(c), along(d)));
        if (hi - lo > 0.1) { t0 = Math.min(t0, lo); t1 = Math.max(t1, hi); }
      }
      if (!(t1 > t0)) continue;
      const point = (t: number): P2 => [a[0] + t * u[0], a[1] + t * u[1]];
      if (![t0, (t0 + t1) / 2, t1].some(t => surfaces(upper).elevation(point(t)) - surfaces(lower).elevation(point(t)) > 0.1)) continue;
      steps.push({ lower, upper, a: point(t0), b: point(t1) });
    }
  }
  return steps;
}
