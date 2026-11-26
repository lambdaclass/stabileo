import polygonClipping, { type Ring } from 'polygon-clipping';
import type { ShellLoadSpec } from './shell-load-integration';
import { add, cross, dot, LoadScalar, LoadVector, mul, norm, roundoff, sub, Sum, unit, zero, type Vector, type Wrench } from './accounting-math';

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

function integratePolygon(out: Wrench, points: Vector[], normal: Vector, force: LoadVector, field: (point: Vector) => LoadScalar): void {
  for (let i = 1; i + 1 < points.length; i++) {
    const a = points[0]!, b = points[i]!, c = points[i + 1]!;
    const area = new LoadScalar(dot(cross(sub(b, a), sub(c, a)), normal)).divide(2);
    for (const point of [mul(add(a, b), 0.5), mul(add(b, c), 0.5), mul(add(c, a), 0.5)]) {
      out.apply(point, force.scale(area.scale(field(point)).divide(3)));
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
  const unitForce = LoadVector.from(direction);
  const force = spec.frame === 'projected' ? unitForce.scale(Math.abs(dot(direction, normal))) : unitForce;
  if (spec.qNodes) {
    if (spec.region || spec.vary || spec.qNodes.length !== points.length) return false;
    if (points.length === 3) {
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3;
        out.apply(mul(add(points[i]!, points[j]!), 0.5),
          force.scale(new LoadScalar(norm(cross(u, v))).scale(spec.qNodes[i]! + spec.qNodes[j]!).divide(12)));
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
        const qi = new LoadScalar(1 - s).scale(a!).add(new LoadScalar(s).scale(b!));
        const qj = new LoadScalar(1 - s).scale(d!).add(new LoadScalar(s).scale(c!));
        const q = new LoadScalar(1 - t).scale(qi).add(new LoadScalar(t).scale(qj));
        out.apply(at, force.scale(new LoadScalar(ws * wt).scale(jac).scale(q)));
      }
    }
    return true;
  }

  const vary = spec.vary;
  if (vary && vary.c1 === vary.c2) return true;
  const coordinate = vary ? (p: Vector) => dot(unit(vary.dir), p) : () => 0;
  const field = vary ? (p: Vector) => new LoadScalar(coordinate(p) - vary.c1).divide(vary.c2 - vary.c1)
    .scale(vary.q2 - vary.q1).add(new LoadScalar(vary.q1)) : () => new LoadScalar(spec.q);
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
    integratePolygon(out, polygon, normal, index === 0 ? force : force.scale(-1), field);
  }
  return true;
}

const quadCorners = [[0, 0], [1, 0], [1, 1], [0, 1]] as const;
const linearMass = (a: number, b: number) => a === b ? 1 / 3 : 1 / 6;
const linearMoment = (a: number, b: number) => a === 1 && b === 1 ? 1 / 4 : 1 / 12;

class NodalPressureIntegral {
  private readonly total = new Sum();
  private readonly magnitude = new Sum();
  private readonly underflow = new Sum();

  add(pressure: number, weight: number): void {
    const term = new LoadScalar(pressure).scale(weight);
    this.total.add(term.value);
    this.magnitude.add(Math.abs(term.value));
    this.underflow.add(term.underflow);
  }

  force(direction: LoadVector): LoadVector {
    return direction.scale(new LoadScalar(this.total.value, this.underflow.value), this.magnitude.value);
  }
}

function wholeQuadForces(q: number[], jac: number, along: number, across: number): NodalPressureIntegral[] {
  const constant = q.every(value => value === q[0]);
  return quadCorners.map(([s, t]) => {
    const force = new NodalPressureIntegral();
    if (constant) {
      force.add(q[0]!, (jac + along * (1 + s) / 3 + across * (1 + t) / 3) / 4);
      return force;
    }
    for (const [i, [u, v]] of quadCorners.entries()) {
      const sx = linearMass(s, u), ty = linearMass(t, v);
      force.add(q[i]!, jac * sx * ty + along * linearMoment(s, u) * ty + across * sx * linearMoment(t, v));
    }
    return force;
  });
}

type VertexValues = [number, number, number];

function affinePressureWeights(area: number, shape: VertexValues, other?: VertexValues): number[] {
  const total = ([x, y, z]: VertexValues) => x + y + z;
  const sum = total(shape);
  if (!other) return shape.map(s => area * (sum + s) / 12);
  const otherSum = total(other);
  const common = sum * otherSum + dot(shape, other);
  return shape.map((s, i) => {
    const t = other[i]!;
    return area * (common + s * otherSum + t * sum + 2 * s * t) / 60;
  });
}

function clippedAffineForces(
  triangle: boolean, jac: number, rings: Ring[][], coordinate: (p: Vector) => number, spec: ShellLoadSpec,
): NodalPressureIntegral[] {
  const result = Array.from({ length: triangle ? 3 : 4 }, () => new NodalPressureIntegral());
  const vary = spec.vary;
  const field = (p: Vector) => vary
    ? vary.q1 + (vary.q2 - vary.q1) * (coordinate(p) - vary.c1) / (vary.c2 - vary.c1)
    : spec.q;
  for (const polygon of rings) {
    for (const [index, ring] of polygon.entries()) {
      let loop = ring.map(([s, t]): Vector => [s, t, 0]);
      if (vary) {
        const lo = Math.min(vary.c1, vary.c2), hi = Math.max(vary.c1, vary.c2);
        loop = clip(clip(loop, p => coordinate(p) - lo), p => hi - coordinate(p));
      }
      const first = loop[0];
      if (!first) continue;
      const signedArea = loop.reduce((sum, p, i) => sum + cross(sub(p, first), sub(loop[(i + 1) % loop.length]!, first))[2], 0);
      const orientation = Math.sign(signedArea) * (index === 0 ? 1 : -1);
      for (let i = 1; i + 1 < loop.length; i++) {
        const vertices = [first, loop[i]!, loop[i + 1]!] as const;
        const area = jac * orientation * cross(sub(vertices[1], first), sub(vertices[2], first))[2] / 2;
        const atVertices = (f: (p: Vector) => number): VertexValues => [f(vertices[0]), f(vertices[1]), f(vertices[2])];
        const q = atVertices(field);
        const weights = triangle
          ? [atVertices(([s, t]) => 1 - s - t), atVertices(([s]) => s), atVertices(([, t]) => t)]
            .map(shape => affinePressureWeights(area, shape))
          : quadCorners.map(([s, t]) => affinePressureWeights(area,
            atVertices(([x]) => s === 1 ? x : 1 - x), atVertices(([, y]) => t === 1 ? y : 1 - y)));
        weights.forEach((row, node) => row.forEach((weight, k) => result[node]!.add(q[k]!, weight)));
      }
    }
  }
  return result;
}

export function expectedSurfaceNodeForces(
  points: Vector[], spec: ShellLoadSpec, integrateClippedQuad?: () => LoadVector[] | undefined,
): LoadVector[] | null {
  const triangle = points.length === 3;
  if (!triangle && points.length !== 4) return null;
  const [origin, second, third] = points as [Vector, Vector, Vector, ...Vector[]];
  const u = sub(second, origin), v = sub(points.at(-1)!, origin);
  const normal = unit(triangle ? cross(u, v) : cross(sub(third, origin), sub(points[3]!, second)));
  const jac = dot(cross(u, v), normal);
  if (!(jac > 0) || !Number.isFinite(jac)) return null;
  const w = triangle ? zero() : sub(sub(sub(third, origin), u), v);
  const along = dot(cross(u, w), normal), across = dot(cross(w, v), normal);
  if (quadCorners.some(([s, t]) => !(jac + along * s + across * t > 0))) return null;

  const normalized = (direction: Vector) => norm(direction) === 0 ? zero() : unit(direction);
  const direction = spec.frame === 'local' ? normal : normalized(spec.frame ? spec.dir ?? [0, 0, -1] : [0, 0, -1]);
  const force = LoadVector.from(direction).scale(spec.frame === 'projected' ? Math.abs(dot(direction, normal)) : 1);
  const vary = spec.vary;
  if (vary && vary.c1 === vary.c2) return points.map(() => LoadVector.from(zero()));
  const axis = vary ? normalized(vary.dir) : zero();
  const coords = points.map(p => dot(axis, p));
  const whole = !vary || coords.every(c => c >= Math.min(vary.c1, vary.c2) && c <= Math.max(vary.c1, vary.c2));
  if (!spec.region && whole) {
    const q = spec.qNodes ?? coords.map(c => vary
      ? vary.q1 + (vary.q2 - vary.q1) * (c - vary.c1) / (vary.c2 - vary.c1) : spec.q);
    const integrals = triangle
      ? q.map((_, i) => {
        const integral = new NodalPressureIntegral();
        q.forEach((qi, j) => integral.add(qi, jac / (i === j ? 12 : 24)));
        return integral;
      })
      : wholeQuadForces(q, jac, along, across);
    return integrals.map(integral => integral.force(force));
  }

  if (spec.qNodes) return null;
  if (norm(w) > roundoff * Math.max(norm(u), norm(v))) {
    return spec.region ? integrateClippedQuad?.() ?? null : null;
  }
  const shell: Ring = triangle ? [[0, 0], [1, 0], [0, 1]] : quadCorners.map(([s, t]) => [s, t]);
  let rings = [[shell]];
  if (spec.region) {
    const projection = normalized(spec.region.normal);
    const den = dot(projection, normal);
    if (den === 0) return points.map(() => LoadVector.from(zero()));
    if (!Number.isFinite(den)) return null;
    const toNatural = (point: Vector): [number, number] => {
      const delta = sub(point, origin);
      const plane = sub(delta, mul(projection, dot(delta, normal) / den));
      return [dot(cross(plane, v), normal) / jac, dot(cross(u, plane), normal) / jac];
    };
    const region = [spec.region.points, ...(spec.region.holes ?? [])].map(ring => ring.map(toNatural));
    try {
      rings = polygonClipping.intersection([shell], region);
    } catch {
      return null;
    }
  }
  const coordinate = ([s, t]: Vector) => coords[0]! + s * dot(axis, u) + t * dot(axis, v);
  return clippedAffineForces(triangle, jac, rings, coordinate, spec).map(integral => integral.force(force));
}
