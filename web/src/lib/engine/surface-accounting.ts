import type { ShellLoadSpec } from './shell-load-integration';
import { add, cross, dot, mul, norm, roundoff, sub, unit, type Vector, type Wrench } from './accounting-math';

function clip(points: Vector[], distance: (p: Vector) => number): Vector[] {
  const result: Vector[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!;
    const da = distance(a), db = distance(b);
    if (da >= 0) result.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) result.push(add(a, mul(sub(b, a), da / (da - db))));
  }
  return result;
}

function integratePolygon(out: Wrench, points: Vector[], normal: Vector, force: Vector, field: (point: Vector) => number): void {
  for (let i = 1; i + 1 < points.length; i++) {
    const a = points[0]!, b = points[i]!, c = points[i + 1]!;
    const area = dot(cross(sub(b, a), sub(c, a)), normal) / 2;
    for (const point of [mul(add(a, b), 0.5), mul(add(b, c), 0.5), mul(add(c, a), 0.5)]) {
      out.apply(point, mul(force, area * field(point) / 3));
    }
  }
}

export function accountSurface(out: Wrench, points: Vector[], spec: ShellLoadSpec): boolean {
  const origin = points[0]!;
  const u = sub(points[1]!, origin), v = sub(points[points.length - 1]!, origin);
  const normal = unit(cross(u, v));
  const scale = Math.max(...points.map(norm), norm(u), norm(v));
  if (points.some(p => !(Math.abs(dot(sub(p, origin), normal)) <= roundoff * scale))) return false;

  if (spec.frame && spec.frame !== 'local' && spec.frame !== 'global' && spec.frame !== 'projected') return false;
  const direction = spec.frame === 'local' ? normal : unit(spec.frame ? (spec.dir ?? [0, 0, -1]) : [0, 0, -1]);
  const force = spec.frame === 'projected' ? mul(direction, Math.abs(dot(direction, normal))) : direction;
  if (spec.qNodes) {
    if (spec.region || spec.vary || spec.qNodes.length !== points.length) return false;
    if (points.length === 3) {
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3;
        out.apply(mul(add(points[i]!, points[j]!), 0.5),
          mul(force, norm(cross(u, v)) * (spec.qNodes[i]! + spec.qNodes[j]!) / 12));
      }
      return true;
    }
    const w = sub(sub(sub(points[2]!, origin), u), v);
    const g = Math.sqrt(3 / 5) / 2;
    const rule = [[0.5 - g, 5 / 18], [0.5, 4 / 9], [0.5 + g, 5 / 18]] as const;
    for (const [s, ws] of rule) {
      for (const [t, wt] of rule) {
        const at = add(origin, add(mul(u, s), add(mul(v, t), mul(w, s * t))));
        const jac = dot(cross(add(u, mul(w, t)), add(v, mul(w, s))), normal);
        const [a, b, c, d] = spec.qNodes;
        const q = (1 - t) * ((1 - s) * a! + s * b!) + t * ((1 - s) * d! + s * c!);
        out.apply(at, mul(force, ws * wt * jac * q));
      }
    }
    return true;
  }

  const vary = spec.vary;
  if (vary && vary.c1 === vary.c2) return true;
  const coordinate = vary ? (p: Vector) => dot(unit(vary.dir), p) : () => 0;
  const field = vary ? (p: Vector) => vary.q1 + (vary.q2 - vary.q1) * ((coordinate(p) - vary.c1) / (vary.c2 - vary.c1))
    : () => spec.q;
  const region = spec.region;
  if ((region?.holes?.length ?? 0) > 1) return false;
  const loops = region ? [region.points, ...(region.holes ?? [])] : [points];
  for (const [index, loop] of loops.entries()) {
    let polygon = loop;
    if (region) {
      const projection = unit(region.normal), den = dot(projection, normal);
      if (!Number.isFinite(den)) return false;
      if (den === 0) return true;
      polygon = loop.map(p => add(p, mul(projection, dot(sub(origin, p), normal) / den)));
      const orientation = polygon.reduce((sum, p, i) =>
        sum + dot(cross(sub(p, origin), sub(polygon[(i + 1) % polygon.length]!, origin)), normal), 0);
      if (orientation < 0) polygon.reverse();
      for (let i = 0; i < points.length; i++) {
        const a = points[i]!, edge = sub(points[(i + 1) % points.length]!, a);
        const inward = cross(normal, edge);
        polygon = clip(polygon, p => dot(sub(p, a), inward));
      }
    }
    if (vary) {
      const lo = Math.min(vary.c1, vary.c2), hi = Math.max(vary.c1, vary.c2);
      polygon = clip(clip(polygon, p => coordinate(p) - lo), p => hi - coordinate(p));
    }
    integratePolygon(out, polygon, normal, index === 0 ? force : mul(force, -1), field);
  }
  return true;
}
