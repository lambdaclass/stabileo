import { roofMembers, type WindModel } from './wind-cases';
import { beamLike, type GravityLayout } from './plan-gravity';

type P2 = [number, number];
type Point = { x: number; y: number; z?: number };
const Z = (p: Point) => p.z ?? 0;
const cross = (a: P2, b: P2, c: P2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function hull(points: P2[]): P2[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (ps: P2[]) => {
    const out: P2[] = [];
    for (const p of ps) {
      while (out.length > 1 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

export function containsSnowPanel(pt: P2, poly: ReadonlyArray<P2>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j]!, b = poly[i]!;
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l2)) : 0;
    if (Math.hypot(pt[0] - a[0] - t * dx, pt[1] - a[1] - t * dy) <= 1e-8) return true;
    if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}


function insideSnowPanel(pt: P2, poly: ReadonlyArray<P2>): boolean {
  return containsSnowPanel(pt, poly) && !poly.some((a, k) => {
    const b = poly[(k + 1) % poly.length]!, dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l2 : 0;
    return t >= 0 && t <= 1 && Math.hypot(pt[0] - a[0] - t * dx, pt[1] - a[1] - t * dy) <= 1e-8;
  });
}


function overlaps(a: P2[], b: P2[]): boolean {
  const centre = (poly: P2[]): P2 => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
  if (a.some(p => insideSnowPanel(p, b)) || b.some(p => insideSnowPanel(p, a))) return true;
  if (insideSnowPanel(centre(b), a) || insideSnowPanel(centre(a), a) && insideSnowPanel(centre(a), b)) return true;
  return a.some((p, i) => b.some((r, j) => {
    const q = a[(i + 1) % a.length]!, s = b[(j + 1) % b.length]!;
    const opposite = (x: number, y: number, length: number) => x > 1e-8 * length && y < -1e-8 * length || y > 1e-8 * length && x < -1e-8 * length;
    return opposite(cross(p, q, r), cross(p, q, s), Math.hypot(q[0] - p[0], q[1] - p[1]))
      && opposite(cross(r, s, p), cross(r, s, q), Math.hypot(s[0] - r[0], s[1] - r[1]));
  }));
}

export interface SnowPlane {
  kind: 'plane' | 'section';
  origin: Point;
  gradient: P2;
  polygon: P2[];
  members: Set<number>;
  slope: number;
  W: number;
  elevation: (pt: P2) => number;
}

export function roofSurfaceModel(model: WindModel, only?: ReadonlySet<number>) {
  const roofIds = new Set(roofMembers(model, only).map(m => m.id));
  const roof = [...model.elements.values()].filter(e => (!only || only.has(e.id)) && (e as { type?: string }).type !== 'truss' && beamLike(model, e).ok).flatMap(e => {
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    if (Z(a) <= 0.05 || Z(b) <= 0.05) return [];
    const dx = b.x - a.x, dy = b.y - a.y, dz = Z(b) - Z(a);
    return [{ id: e.id, a, b, dx, dy, dz, lh: Math.hypot(dx, dy), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }];
  });
  const parent = roof.map((_, k) => k);
  const root = (k: number): number => parent[k] === k ? k : (parent[k] = root(parent[k]!));
  const samePoint = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, Z(a) - Z(b)) <= 1e-8;
  for (let a = 0; a < roof.length; a++) for (let b = a + 1; b < roof.length; b++) {
    if ([roof[a]!.a, roof[a]!.b].some(p => [roof[b]!.a, roof[b]!.b].some(q => samePoint(p, q)))) parent[root(a)] = root(b);
  }
  const component = new Map(roof.map((m, k) => [m.id, root(k)]));
  const sloped = roof.filter(m => Math.abs(m.dz) > 1e-8 * m.lh);
  const planes: SnowPlane[] = [];
  const atMember = new Map<number, SnowPlane>();
  for (const m of sloped) {
    const connected = roof.filter(r => component.get(r.id) === component.get(m.id));
    const parallel = roof.filter(r => Math.abs(r.dx * m.dy - r.dy * m.dx) <= 1e-8 * r.lh * m.lh
      && Math.abs(Math.min(Z(r.a), Z(r.b)) - Math.min(Z(m.a), Z(m.b))) <= 1e-8
      && Math.abs(Math.max(Z(r.a), Z(r.b)) - Math.max(Z(m.a), Z(m.b))) <= 1e-8);
    const candidates: Array<{ gradient: P2; supported: typeof roof; score: number }> = [];
    for (const pool of [connected, parallel]) {
      for (const other of pool) {
        if (other.id === m.id) continue;
        for (const p of [other.a, other.b]) {
          const x = p.x - m.a.x, y = p.y - m.a.y, z = Z(p) - Z(m.a);
          const det = m.dx * y - m.dy * x;
          if (Math.abs(det) <= 1e-10 * m.lh * Math.hypot(x, y)) continue;
          const gradient: P2 = [(m.dz * y - m.dy * z) / det, (m.dx * z - m.dz * x) / det];
          const on = (q: Point) => Math.abs(Z(q) - Z(m.a) - gradient[0] * (q.x - m.a.x) - gradient[1] * (q.y - m.a.y)) <= 1e-8;
          if (!on(other.a) || !on(other.b)) continue;
          const supported = pool.filter(r => on(r.a) && on(r.b));
          candidates.push({ gradient, supported, score: supported.reduce((s, r) => s + r.lh, 0) });
        }
      }
      if (candidates.length) break;
    }
    candidates.sort((a, b) => b.score - a.score || Math.hypot(...a.gradient) - Math.hypot(...b.gradient));
    const best = candidates[0];
    const gradient: P2 = best?.gradient ?? [m.dz * m.dx / m.lh ** 2, m.dz * m.dy / m.lh ** 2];
    const supported = best?.supported ?? [m];
    if (!supported.some(r => roofIds.has(r.id))) continue;
    const existing = planes.find(p => [...p.members].some(id => supported.some(r => r.id === id)) && Math.hypot(p.gradient[0] - gradient[0], p.gradient[1] - gradient[1]) < 1e-8 && Math.abs(p.elevation([m.a.x, m.a.y]) - Z(m.a)) < 1e-8);
    if (existing) { atMember.set(m.id, existing); continue; }
    const norm = Math.hypot(...gradient);
    const points = supported.flatMap(r => [r.a, r.b]);
    const coordinates = points.map(p => ((p.x - m.a.x) * gradient[0] + (p.y - m.a.y) * gradient[1]) / norm);
    const plane: SnowPlane = {
      kind: best ? 'plane' : 'section', origin: m.a, gradient, members: new Set(supported.map(r => r.id)),
      polygon: hull(points.map(p => [p.x, p.y])), slope: Math.atan(norm) * 180 / Math.PI,
      W: Math.max(...coordinates) - Math.min(...coordinates),
      elevation: pt => Z(m.a) + gradient[0] * (pt[0] - m.a.x) + gradient[1] * (pt[1] - m.a.y),
    };
    planes.push(plane); atMember.set(m.id, plane);
  }
  for (const m of roof) {
    if (atMember.has(m.id)) continue;
    const on = planes.filter(p => p.members.has(m.id));
    if (on.length) atMember.set(m.id, on[0]!);
  }
  const readPanel = (index: number, layout?: GravityLayout) => {
    const p = layout?.panels[index];
    const datum = p ? [...model.nodes.values()].filter(n => Math.abs(Z(n) - p.z) <= 0.05 && p.polygon.some(v => Math.hypot(n.x - v[0], n.y - v[1]) < 1e-8))
      .sort((a, b) => Math.abs(Z(a) - p.z) - Math.abs(Z(b) - p.z))[0] : undefined;
    const eligible = planes.filter(sf => p && sf.polygon.length >= 3 && overlaps(p.polygon, sf.polygon));
    const at = (pt: P2) => eligible.filter(sf => sf.elevation(pt) >= (p?.z ?? 0) - 0.05 && containsSnowPanel(pt, sf.polygon))
      .filter(sf => !layout?.panels.some(other => other !== p && other.z > (p?.z ?? 0) + 0.05 && other.z <= sf.elevation(pt) + 0.05 && insideSnowPanel(pt, other.polygon)))
      .sort((a, b) => a.elevation(pt) - b.elevation(pt))[0];
    const centre: P2 = p ? [p.polygon.reduce((s, v) => s + v[0], 0) / p.polygon.length, p.polygon.reduce((s, v) => s + v[1], 0) / p.polygon.length] : [0, 0];
    const resolved = !p || !planes.some(sf => sf.kind === 'section' && [...sf.members].some(id => {
      const m = roof.find(r => r.id === id)!;
      return (Z(m.a) + Z(m.b)) / 2 > p.z + 1e-8 && containsSnowPanel([m.mid.x, m.mid.y], p.polygon);
    }));
    return { resolved, planeAt: at, slope: at(centre)?.slope ?? 0, slopeAt: (pt: P2) => at(pt)?.slope ?? 0, elevation: (pt: P2) => at(pt)?.elevation(pt) ?? (datum ? Z(datum) : p?.z ?? 0) };
  };
  const cache = new WeakMap<GravityLayout, Map<number, ReturnType<typeof readPanel>>>();
  const panel = (index: number, layout?: GravityLayout) => {
    if (!layout) return readPanel(index);
    let byIndex = cache.get(layout);
    if (!byIndex) { byIndex = new Map(); cache.set(layout, byIndex); }
    let value = byIndex.get(index);
    if (!value) { value = readPanel(index, layout); byIndex.set(index, value); }
    if (!value.resolved) throw new Error('snow.refused.roofPlane');
    return value;
  };
  const resolves = (layout: GravityLayout) => layout.panels.every((p, k) => !p.roof || readPanel(k, layout).resolved);
  return { planes, atMember, roof: roof.filter(m => roofIds.has(m.id)), panel, resolves };
}

export function snowRoofSurfaces(model: WindModel, layout?: GravityLayout, surfaces = roofSurfaceModel(model)) {
  return (index: number) => surfaces.panel(index, layout);
}

export function snowRoofSteps(model: WindModel, layout: GravityLayout, surfaces = snowRoofSurfaces(model, layout)) {
  const steps: Array<{ lower: number; upper: number; a: P2; b: P2 }> = [];
  for (const [lower, L] of layout.panels.entries()) for (const [upper, U] of layout.panels.entries()) {
    if (!L.roof || !U.roof || lower === upper) continue;
    for (let e = 0; e < L.polygon.length; e++) {
      const a = L.polygon[e]!, b = L.polygon[(e + 1) % L.polygon.length]!;
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;
      const u: P2 = [dx / len, dy / len];
      for (let f = 0; f < U.polygon.length; f++) {
        const c = U.polygon[f]!, d = U.polygon[(f + 1) % U.polygon.length]!;
        const normal = (p: P2) => (p[0] - a[0]) * -u[1] + (p[1] - a[1]) * u[0];
        if (Math.abs(normal(c)) > 0.01 || Math.abs(normal(d)) > 0.01) continue;
        const along = (p: P2) => (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1];
        const lo = Math.max(0, Math.min(along(c), along(d))), hi = Math.min(len, Math.max(along(c), along(d)));
        if (hi - lo <= 0.1) continue;
        const point = (t: number): P2 => [a[0] + t * u[0], a[1] + t * u[1]];
        if (![lo, (lo + hi) / 2, hi].some(t => surfaces(upper).elevation(point(t)) - surfaces(lower).elevation(point(t)) > 1e-8)) continue;
        steps.push({ lower, upper, a: point(lo), b: point(hi) });
      }
    }
  }
  return steps;
}
