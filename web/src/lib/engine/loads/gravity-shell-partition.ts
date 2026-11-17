import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import { MEMBER_GEOMETRY_LIMIT } from '../member-span-loads';
import { EngineCheckError } from '../engine-unavailable';
import { signedArea, type Side, type SideShare } from './floor-tributary';

type Point = [number, number];

export function refuseGravityGeometry(reason: string): never {
  throw new EngineCheckError('gravity load plan', reason);
}

export function ringArea(ring: Point[]): number {
  const [x, y] = ring[0] ?? [0, 0];
  return Math.abs(signedArea(ring.map(p => [p[0] - x, p[1] - y])));
}

function area(region: MultiPolygon): number {
  return region.reduce((total, [outer, ...holes]) => total + ringArea(outer!) - holes.reduce((sum, hole) => sum + ringArea(hole), 0), 0);
}

type Partition = { kind: 'uncovered' | 'shell' } | { kind: 'strips'; shares: SideShare[] };

export function partitionShellCoverage(sides: Side[], holes: Side[][], shells: Polygon[], span?: Point): Partition {
  if (!shells.length) return { kind: 'uncovered' };

  const basis = sides[0]!;
  const corners = sides.map(side => side.a);
  const boxPoints = [...corners, ...holes.flat().map(side => side.a)];
  const error = 64 * Number.EPSILON * Math.max(...boxPoints.flat().map(Math.abs), ...sides.map(side => side.len));
  if (error / Math.min(...sides.map(side => side.len)) >= MEMBER_GEOMETRY_LIMIT) {
    refuseGravityGeometry('Shell coverage coordinates exceed the supported member interval precision.');
  }
  const project = (p: Point): Point => {
    const x = p[0] - basis.a[0], y = p[1] - basis.a[1];
    return [x * basis.u[0] + y * basis.u[1], x * basis.n[0] + y * basis.n[1]];
  };
  const stations = [0, 1].map(k => boxPoints.map(p => project(p)[k]!));
  const local = (p: Point) => project(p).map((v, k) => stations[k]!.find(s => Math.abs(s - v) <= error) ?? v) as Point;
  const boundary = [corners.map(local), ...holes.map(hole => hole.map(side => local(side.a)))];
  const localShells = shells.map(poly => poly.map(ring => ring.map(local)));
  const [remaining, covered] = (() => {
    try {
      const footprint = polygonClipping.union(localShells[0]!, ...localShells.slice(1));
      return [polygonClipping.difference(boundary, footprint), polygonClipping.intersection(boundary, footprint)];
    } catch (err) {
      return refuseGravityGeometry(`Shell footprint partition failed: ${String(err)}`);
    }
  })();
  if (!remaining.length) return { kind: 'shell' };
  if (!(area(covered) > 0)) return { kind: 'uncovered' };

  const fail = (): never => refuseGravityGeometry('Partial shell coverage requires full-span strips between opposite carriers of a rectangular beam panel.');
  if (holes.length || sides.length !== 4) return fail();

  const bounds = (ring: Point[], k: number): [number, number] => {
    const values = ring.map(p => p[k]!);
    return [Math.min(...values), Math.max(...values)];
  };
  const isRectangle = (ring: Point[], x: [number, number], y: [number, number]) =>
    x[1] > x[0] && y[1] > y[0]
    && ring.every((p, k) => {
      const next = ring[(k + 1) % ring.length]!;
      return (x.includes(p[0]) && p[0] === next[0]) || (y.includes(p[1]) && p[1] === next[1]);
    })
    && Math.abs(ringArea(ring) - (x[1] - x[0]) * (y[1] - y[0])) <= error * ((x[1] - x[0]) + (y[1] - y[0]));
  const panel = boundary[0]!;
  const panelBounds = [bounds(panel, 0), bounds(panel, 1)];
  if (!isRectangle(panel, panelBounds[0]!, panelBounds[1]!)) return fail();

  const candidates = [0, 1].filter(k => remaining.every(([outer, ...inner]) => {
    const x = bounds(outer!, 0), y = bounds(outer!, 1);
    const across = k === 0 ? y : x;
    const full = panelBounds[1 - k]!;
    return inner.length === 0 && across[0] === full[0] && across[1] === full[1] && isRectangle(outer!, x, y);
  }));
  if (candidates.length !== 1) return fail();
  const stationAxis = candidates[0]!;
  if (span) {
    const overall = stationAxis === 0 ? basis.n : basis.u;
    const transverse = stationAxis === 0 ? basis.u : basis.n;
    const alignment = (axis: Point) => Math.abs(axis[0] * span[0] + axis[1] * span[1]);
    if (alignment(overall) - alignment(transverse) <= 64 * Number.EPSILON) return fail();
  }

  const depth = panelBounds[1 - stationAxis]![1] - panelBounds[1 - stationAxis]![0];
  return {
    kind: 'strips',
    shares: sides.map(side => {
      const start = local(side.a)[stationAxis]!, end = local(side.b)[stationAxis]!;
      const pieces = Math.abs(end - start) <= error ? [] : remaining.map(([outer]) => {
        const [a, b] = bounds(outer!, stationAxis);
        const station = (v: number) => (v - start) / (end - start) * side.len;
        const sa = station(a), sb = station(b);
        return { s0: Math.min(sa, sb), s1: Math.max(sa, sb), q0: depth / 2, q1: depth / 2 };
      });
      return { pieces, atA: 0, atB: 0 };
    }),
  };
}

export function assertPlanarShell(id: number, vertices: Array<[number, number, number]>): void {
  const origin = vertices[0]!;
  const [a, b, c] = vertices.slice(1).map(p => p.map((v, k) => v - origin[k]!) as [number, number, number]);
  if (!a || !b || !c) return;
  const cross = (u: typeof a, v: typeof a) => [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  const normal = [cross(a, b), cross(a, c), cross(b, c)].sort((u, v) => Math.hypot(...v) - Math.hypot(...u))[0]!;
  const scale = Math.max(...vertices.flat().map(Math.abs), Math.hypot(...a), Math.hypot(...b), Math.hypot(...c));
  const distance = Math.max(...[a, b, c].map(p => Math.abs(p.reduce((sum, v, k) => sum + v * normal[k]!, 0))));
  if (distance > 64 * Number.EPSILON * scale * Math.hypot(...normal)) refuseGravityGeometry(`Quad ${id} is nonplanar. Gravity shell coverage requires a planar shell.`);
}
