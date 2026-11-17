import { EngineCheckError } from '../engine-unavailable';
import { sameCarrierPlane, physicalRegion, regionIntegral } from './physical-region-loads';
import { widthSpans, type GravityModel, type GravityLayout } from './plan-gravity';

type Point = [number, number, number];
export const GRAVITY_SHELL_COVERAGE_TOLERANCE = 0.05;
export const GRAVITY_FIRST_MOMENT_PRECISION = 5e-9;

export function refuseGravityGeometry(reason: string): never {
  throw new EngineCheckError('gravity load plan', reason);
}

export function assertGravityShells(model: GravityModel): void {
  for (const q of model.quads?.values() ?? []) {
    const nodes = q.nodes.map(id => model.nodes.get(id));
    if (nodes.some(n => !n)) continue;
    const points = nodes.map(n => [n!.x, n!.y, n!.z ?? 0] as Point);
    if (points.length >= 4 && regionIntegral(physicalRegion(points.map(p => [p[0], p[1]]))).area > 0 && !sameCarrierPlane(points, points)) {
      refuseGravityGeometry(`Quad ${q.id}: nonplanar shell; gravity area and slope classification are not invariant under subdivision`);
    }
  }
}

export function assertGravitySlope(id: number, a: Point, b: Point): void {
  const dz = Math.abs(b[2] - a[2]), length = Math.hypot(...b.map((x, k) => x - a[k]!));
  const error = 64 * Number.EPSILON * (Math.abs(a[2]) + Math.abs(b[2]) + length);
  if (length > 0 && Math.abs(dz - length / 2) <= error) {
    refuseGravityGeometry(`Member ${id}: area-load slope boundary; rotation roundoff can change whether the member carries gravity area`);
  }
}

export function assertConstantShellCoverage(id: number, a: Point, b: Point, shells: Array<{ poly: Array<[number, number]>; pts: Point[] }>, inShell: (p: Point) => boolean): void {
  const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
  if (!(length2 > 0)) return;
  const cuts = [0, 1];
  const error = 64 * Number.EPSILON * Math.max(1, ...a.map(Math.abs), ...b.map(Math.abs)) / Math.sqrt(length2);
  const add = (t: number) => { if (t > error && t < 1 - error) cuts.push(t); };
  const tolerance = GRAVITY_SHELL_COVERAGE_TOLERANCE;
  for (const { poly: ring, pts } of shells) {
    const origin = pts[0]!;
    let normal: Point = [0, 0, 0];
    for (const p of pts.slice(1)) for (const q of pts.slice(1)) {
      const u = p.map((v, k) => v-origin[k]!), v = q.map((x, k) => x-origin[k]!);
      const n: Point = [u[1]!*v[2]!-u[2]!*v[1]!, u[2]!*v[0]!-u[0]!*v[2]!, u[0]!*v[1]!-u[1]!*v[0]!];
      if (Math.hypot(...n) > Math.hypot(...normal)) normal = n;
    }
    if (normal[2] !== 0) {
      const heightDifference = (p: Point) => p[2]-origin[2]+(normal[0]*(p[0]-origin[0])+normal[1]*(p[1]-origin[1]))/normal[2];
      const start = heightDifference(a), end = heightDifference(b);
      if (start !== end) for (const h of [-tolerance, tolerance]) add((h-start)/(end-start));
    }
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length]!, ex = q[0] - p[0], ey = q[1] - p[1];
      const det = dx * ey - dy * ex;
      const edgeLength = Math.hypot(ex, ey);
      if (det !== 0) for (const distance of [-tolerance, tolerance]) add((distance*edgeLength-((a[0]-p[0])*ey-(a[1]-p[1])*ex))/det);
      const px = a[0]-p[0], py = a[1]-p[1], linear = px*dx+py*dy;
      const discriminant = linear**2-length2*(px**2+py**2-tolerance**2);
      if (discriminant >= 0) for (const sign of [-1, 1]) add((-linear+sign*Math.sqrt(discriminant))/length2);
      if (det !== 0) {
        const u = ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / det;
        if (u >= -error && u <= 1 + error) add(((p[0] - a[0]) * ey - (p[1] - a[1]) * ex) / det);
      }
      if (Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx) <= error * length2) {
        for (const v of [p, q]) add(((v[0] - a[0]) * dx + (v[1] - a[1]) * dy) / length2);
      }
    });
  }
  cuts.sort((x, y) => x - y);
  const classifications = cuts.slice(1).flatMap((t, i) => {
    if (t - cuts[i]! <= error) return [];
    const mid = (cuts[i]! + t) / 2;
    return [inShell(a.map((x, k) => x + mid * (b[k]! - x)) as Point)];
  });
  if (classifications.some(v => v !== classifications[0])) {
    refuseGravityGeometry(`Member ${id}: partial member shell coverage; midpoint classification cannot preserve its loading under subdivision`);
  }
}

export function assertGravityPrecision(model: GravityModel, layout: GravityLayout, width: number): void {
  const area = [...layout.areaByLevel.values()].reduce((sum, a) => sum + a, 0)
    + layout.shellQuads.filter(q => q.cos !== 1).reduce((sum, q) => sum + q.area, 0)
    + layout.widthMembers.reduce((sum, m) => sum + m.horizontalLength * widthSpans(m, width).reduce((a, s) => a + (s.t1-s.t0)*(s.width+(s.widthJ??s.width))/2, 0), 0);
  const members = new Set([...layout.pieces, ...layout.moments, ...layout.widthMembers].map(m => m.elementId));
  const nodeIds = new Set([...members].flatMap(id => { const e = model.elements.get(id); return e ? [e.nodeI, e.nodeJ] : []; }));
  for (const q of layout.shellQuads) for (const id of model.quads?.get(q.quadId)?.nodes ?? []) nodeIds.add(id);
  const radius = Math.max(0, ...[...nodeIds].map(id => { const n = model.nodes.get(id)!; return Math.hypot(n.x, n.y); }));
  const budget = 8 * Number.EPSILON * area * radius;
  if (!Number.isFinite(budget) || budget > GRAVITY_FIRST_MOMENT_PRECISION) {
    refuseGravityGeometry(`Gravity first-moment precision: geometry roundoff budget ${budget} exceeds ${GRAVITY_FIRST_MOMENT_PRECISION}; this region scale is outside the supported first-moment precision range`);
  }
}
