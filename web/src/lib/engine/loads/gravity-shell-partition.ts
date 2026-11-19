import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import { MEMBER_GEOMETRY_LIMIT } from '../member-span-loads';
import { EngineMessageError, msg, type EngineMessage } from '../../codes/message';
import { signedArea, type Side, type SideShare } from './floor-tributary';

type Point = [number, number];
type Point3 = [number, number, number];
export type ShellPlane = (points: Point3[]) => boolean;

export function refuseGravityGeometry(reason: EngineMessage): never {
  throw new EngineMessageError(reason);
}

export function ringArea(ring: Point[]): number {
  const [x, y] = ring[0] ?? [0, 0];
  return Math.abs(signedArea(ring.map(p => [p[0] - x, p[1] - y])));
}

function area(region: MultiPolygon): number {
  return region.reduce((total, [outer, ...holes]) => total + ringArea(outer!) - holes.reduce((sum, hole) => sum + ringArea(hole), 0), 0);
}

export interface UncoveredStrips {
  kind: 'strips';
  span: number;
  polygons: Point[][];
}

export type ShellCoverage = { kind: 'shell' } | UncoveredStrips;
type Partition = { kind: 'uncovered' } | { kind: 'shell' } | (UncoveredStrips & { shares: SideShare[] });

export function partitionShellCoverage(sides: Side[], holes: Side[][], shells: Polygon[], span?: Point): Partition {
  if (!shells.length) return { kind: 'uncovered' };

  const basis = sides[0]!;
  const corners = sides.map(side => side.a);
  const boxPoints = [...corners, ...holes.flat().map(side => side.a)];
  const error = 64 * Number.EPSILON * Math.max(...boxPoints.flat().map(Math.abs), ...sides.map(side => side.len));
  if (error / Math.min(...sides.map(side => side.len)) >= MEMBER_GEOMETRY_LIMIT) {
    refuseGravityGeometry(msg('loadPlan.gravity.coveragePrecision'));
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
      return refuseGravityGeometry(msg('loadPlan.gravity.partitionFailed', { detail: String(err) }));
    }
  })();
  if (!remaining.length) return { kind: 'shell' };
  if (!(area(covered) > 0)) return { kind: 'uncovered' };

  const fail = (): never => refuseGravityGeometry(msg('loadPlan.gravity.unsupportedStrips'));
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
    const direction = stationAxis === 0 ? basis.n : basis.u;
    if (!(Math.abs(direction[0] * span[1] - direction[1] * span[0]) <= 64 * Number.EPSILON)) {
      refuseGravityGeometry(msg('loadPlan.gravity.stripDirection'));
    }
  }

  const depth = panelBounds[1 - stationAxis]![1] - panelBounds[1 - stationAxis]![0];
  return {
    kind: 'strips',
    span: depth,
    polygons: remaining.map(([outer]) => outer!.slice(0, -1).map(([x, y]) => [
      basis.a[0] + x * basis.u[0] + y * basis.n[0],
      basis.a[1] + x * basis.u[1] + y * basis.n[1],
    ])),
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

export function planarShell(id: number, vertices: Point3[]): ShellPlane | undefined {
  const origin = vertices[0]!;
  const edges = vertices.slice(1).map(p => p.map((v, k) => v - origin[k]!) as Point3);
  const [a, b, c] = edges;
  if (!a || !b) return undefined;
  const cross = (u: Point3, v: Point3) => [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  const normals = c ? [cross(a, b), cross(a, c), cross(b, c)] : [cross(a, b)];
  const normal = normals.sort((u, v) => Math.hypot(...v) - Math.hypot(...u))[0]!;
  const norm = Math.hypot(...normal);
  const scale = Math.max(...vertices.flat().map(Math.abs), ...edges.map(edge => Math.hypot(...edge)));
  const contains = (points: Point3[]) => {
    const error = 64 * Number.EPSILON * Math.max(scale, ...points.flat().map(Math.abs)) * norm;
    return points.every(p => Math.abs(p.reduce((sum, v, k) => sum + (v - origin[k]!) * normal[k]!, 0)) <= error);
  };
  if (!contains(vertices)) refuseGravityGeometry(msg('loadPlan.gravity.nonplanarShell', { id }));
  return contains;
}

export function footprintsOverlap(a: Polygon | MultiPolygon, b: Polygon | MultiPolygon): boolean {
  try {
    return area(polygonClipping.intersection(a, b)) > 0;
  } catch (err) {
    return refuseGravityGeometry(msg('loadPlan.gravity.deckCheckFailed', { detail: String(err) }));
  }
}

export function assertDisjointShells(shells: ReadonlyArray<{ id: number; pts: Point3[]; poly: Point[]; plane?: ShellPlane }>): void {
  const ordered = shells.flatMap(({ id, pts, poly, plane }) => {
    if (!plane) return [];
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
    return [{ id, pts, poly, plane, left: Math.min(...xs), right: Math.max(...xs), bottom: Math.min(...ys), top: Math.max(...ys) }];
  }).sort((a, b) => a.left - b.left);

  for (const [i, a] of ordered.entries()) {
    for (let j = i + 1; j < ordered.length; j++) {
      const b = ordered[j]!;
      if (b.left >= a.right) break;
      if (b.bottom >= a.top || b.top <= a.bottom || !a.plane(b.pts) || !b.plane(a.pts)) continue;
      if (footprintsOverlap([a.poly], [b.poly])) {
        refuseGravityGeometry(msg('loadPlan.gravity.overlappingShells', { first: Math.min(a.id, b.id), second: Math.max(a.id, b.id) }));
      }
    }
  }
}
