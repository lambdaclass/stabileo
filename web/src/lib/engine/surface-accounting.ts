import polygonClipping, { type Ring } from 'polygon-clipping';
import { orient2d } from 'robust-predicates';
import { MIN_SHELL_REGION_PROJECTION, type ShellLoadSpec } from './shell-load-integration';
import { add, cross, dot, dyadicInteger, LoadScalar, LoadVector, mul, norm, polygonMeasure, roundoff, sub, Sum, unit, zero, type Vector, type Wrench } from './accounting-math';

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

export class SingularSurfaceProjection extends Error {}

type Point2 = Ring[number];

function edges(ring: Ring): [Point2, Point2][] {
  return ring.map((point, i) => [point, ring[(i + 1) % ring.length]!]);
}

function withinBounds(value: number, a: number, b: number): boolean {
  return value >= Math.min(a, b) && value <= Math.max(a, b);
}

function sideOf(a: Point2, b: Point2, p: Point2): number {
  const side = orient2d(...a, ...b, ...p);
  if (side !== 0 && Number.isFinite(side)) return Math.sign(side);
  const ax = dyadicInteger(a[0]), ay = dyadicInteger(a[1]);
  const bx = dyadicInteger(b[0]) - ax, by = dyadicInteger(b[1]) - ay;
  const px = dyadicInteger(p[0]) - ax, py = dyadicInteger(p[1]) - ay;
  const exact = by * px - bx * py;
  return exact < 0n ? -1 : exact > 0n ? 1 : 0;
}

function ringContains(ring: Ring, p: Point2): boolean {
  let inside = false;
  for (const [a, b] of edges(ring)) {
    const side = sideOf(a, b, p);
    if (side === 0 && withinBounds(p[0], a[0], b[0]) && withinBounds(p[1], a[1], b[1])) return true;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && (side < 0) === (b[1] > a[1])) inside = !inside;
  }
  return inside;
}

function edgesMeet([a, b]: [Point2, Point2], [c, d]: [Point2, Point2]): boolean {
  if ([0, 1].some(axis => Math.max(a[axis]!, b[axis]!) < Math.min(c[axis]!, d[axis]!)
      || Math.max(c[axis]!, d[axis]!) < Math.min(a[axis]!, b[axis]!))) return false;
  return sideOf(a, b, c) * sideOf(a, b, d) <= 0 && sideOf(c, d, a) * sideOf(c, d, b) <= 0;
}

function boundariesMeet(a: Ring, b: Ring): boolean {
  const sides = edges(a);
  return edges(b).some(edge => sides.some(side => edgesMeet(side, edge)));
}

function meetsFootprint(shell: Ring, outer: Ring, holes: Ring[]): boolean {
  if (!shell.some(p => ringContains(outer, p)) && !outer.some(p => ringContains(shell, p))
      && !boundariesMeet(shell, outer)) return false;
  return !holes.some(hole => shell.every(p => ringContains(hole, p)) && !boundariesMeet(shell, hole));
}

function clipSurfaceRegion(
  points: Vector[], normal: Vector, spec: ShellLoadSpec & { region: NonNullable<ShellLoadSpec['region']> },
): Vector[][][] | null {
  const { region, vary } = spec;
  const projection = unit(region.normal);
  const denominator = dot(projection, normal);
  if (!Number.isFinite(denominator)) return null;
  const origin = points[0]!;
  const ex = unit(cross(projection, Math.abs(projection[0]) < Math.abs(projection[1]) ? [1, 0, 0] : [0, 1, 0]));
  const ey = cross(projection, ex);
  const planar = (p: Vector): Point2 => {
    const delta = sub(p, origin);
    return [dot(delta, ex), dot(delta, ey)];
  };
  const outer = region.points.map(planar);
  const holes = (region.holes ?? []).map(ring => ring.map(planar));
  const shell = points.map(planar);
  if ([outer, ...holes].some(ring => ring.length < 3)
      || [shell, outer, ...holes].some(ring => ring.some(point => !point.every(Number.isFinite)))) return null;
  if (Math.abs(denominator) < MIN_SHELL_REGION_PROJECTION) {
    if (vary ? vary.q1 === 0 && vary.q2 === 0 : spec.q === 0) return [];
    if (spec.frame === 'projected' && dot(unit(spec.dir ?? [0, 0, -1]), normal) === 0) return [];
    let active = points;
    if (vary) {
      const axis = norm(vary.dir) === 0 ? zero() : unit(vary.dir);
      if (!axis.every(Number.isFinite)) return null;
      const low = Math.min(vary.c1, vary.c2), high = Math.max(vary.c1, vary.c2);
      active = clip(clip(active, p => dot(axis, p) - low), p => high - dot(axis, p));
    }
    const activeFootprint = active.map(planar);
    if (activeFootprint.some(p => !p.every(Number.isFinite))) return null;
    if (meetsFootprint(activeFootprint, outer, holes)) throw new SingularSurfaceProjection();
    return [];
  }
  const lift = ([x, y]: Point2): Vector => {
    const delta = add(mul(ex, x), mul(ey, y));
    return sub(delta, mul(projection, dot(delta, normal) / denominator));
  };
  try {
    const footprint = holes.length ? polygonClipping.difference([outer], ...holes.map(hole => [hole])) : [[outer]];
    return polygonClipping.intersection([shell], footprint).map(polygon => polygon.map(ring => ring.map(lift)));
  } catch {
    return null;
  }
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
  const polygons = region ? clipSurfaceRegion(points, normal, { ...spec, region }) : [[points]];
  if (!polygons) return false;
  for (const polygon of polygons) {
    for (const [index, ring] of polygon.entries()) {
      let loop = region ? ring.map(p => add(origin, p)) : ring;
      const sign = region ? Math.sign(polygonMeasure(ring, zero(), normal).area) * (index === 0 ? 1 : -1) : 1;
      if (vary) {
        const lo = Math.min(vary.c1, vary.c2), hi = Math.max(vary.c1, vary.c2);
        loop = clip(clip(loop, p => coordinate(p) - lo), p => hi - coordinate(p));
      }
      integratePolygon(out, loop, normal, force.scale(sign), field);
    }
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

function surfaceGeometry(points: Vector[]) {
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
  return { triangle, origin, u, v, normal, jac, w, along, across };
}

function nonAffineQuad({ u, v, w }: NonNullable<ReturnType<typeof surfaceGeometry>>): boolean {
  return norm(w) > roundoff * Math.max(norm(u), norm(v));
}

export function accountUniformClippedSurface(out: Wrench, points: Vector[], spec: ShellLoadSpec): boolean {
  const geometry = surfaceGeometry(points), region = spec.region;
  if (!geometry || !region || spec.vary || spec.qNodes || !Number.isFinite(spec.q)) return false;
  const { origin, u, v, normal } = geometry;
  const scale = Math.max(...points.map(norm), norm(u), norm(v));
  if (points.some(p => !(Math.abs(dot(sub(p, origin), normal)) <= roundoff * scale))) return false;

  if (spec.frame && spec.frame !== 'local' && spec.frame !== 'global' && spec.frame !== 'projected') return false;
  const direction: Vector = spec.frame === 'local' ? normal : spec.frame ? unit(spec.dir ?? [0, 0, -1]) : [0, 0, -1];
  const force = LoadVector.from(direction).scale(spec.frame === 'projected' ? Math.abs(dot(direction, normal)) : 1).scale(spec.q);
  if (!force.value.every(Number.isFinite)) return false;
  const clipped = clipSurfaceRegion(points, normal, { ...spec, region });
  if (!clipped) return false;
  for (const polygon of clipped) {
    for (const [index, ring] of polygon.entries()) {
      const { area, first } = polygonMeasure(ring, zero(), normal);
      if (!Number.isFinite(area) || !first.every(Number.isFinite)) return false;
      const sign = Math.sign(area) * (index === 0 ? 1 : -1);
      out.apply(origin, force.scale(sign * area), force.momentAt(mul(first, sign)));
    }
  }
  return true;
}

export function expectedSurfaceNodeForces(points: Vector[], spec: ShellLoadSpec): LoadVector[] | null {
  const geometry = surfaceGeometry(points);
  if (!geometry) return null;
  const { triangle, u, v, normal, jac, along, across } = geometry;

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
  const shell: Ring = triangle ? [[0, 0], [1, 0], [0, 1]] : quadCorners.map(([s, t]) => [s, t]);
  let rings = [[shell]];
  if (spec.region) {
    const clipped = clipSurfaceRegion(points, normal, { ...spec, region: spec.region });
    if (!clipped) return null;
    if (!clipped.length) return points.map(() => LoadVector.from(zero()));
    const toNatural = (p: Vector): Point2 => [dot(cross(p, v), normal) / jac, dot(cross(u, p), normal) / jac];
    rings = clipped.map(polygon => polygon.map(ring => ring.map(toNatural)));
  }
  if (nonAffineQuad(geometry)) return null;
  const coordinate = ([s, t]: Vector) => coords[0]! + s * dot(axis, u) + t * dot(axis, v);
  return clippedAffineForces(triangle, jac, rings, coordinate, spec).map(integral => integral.force(force));
}
