import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import { agrees, Sum } from '../accounting-math';
import { MEMBER_GEOMETRY_LIMIT } from '../member-span-loads';
import { EngineMessageError, msg, type EngineMessage } from '../../codes/message';
import { type Side, type SideShare } from './floor-tributary';

type Point = [number, number];
type Point3 = [number, number, number];
export type ShellPlane = (point: Point) => number;
export type PlaneBasis = [Point3, Point3, Point3];
export type FittedShellPlane = ShellPlane & { basis: PlaneBasis };

export function refuseGravityGeometry(reason: EngineMessage): never {
  throw new EngineMessageError(reason);
}

export function samePhysicalDeck(elevations: ReadonlyArray<readonly [number, number]>, tolerance: number): boolean {
  let matches = true;
  for (const [height, reference] of elevations) {
    const separation = height - reference;
    if (!Number.isFinite(separation)) refuseGravityGeometry(msg('loadPlan.gravity.coveragePrecision'));
    if (Math.abs(separation) > tolerance) matches = false;
  }
  return elevations.length > 0 && matches;
}

export function ringArea(ring: Point[]): number {
  const [x, y] = ring[0] ?? [0, 0];
  const local = ring.map(([px, py]) => [px - x, py - y] as Point);
  const twiceArea = new Sum();
  for (const [i, a] of local.entries()) {
    const b = local[(i + 1) % local.length]!;
    twiceArea.add(a[0] * b[1] - a[1] * b[0]);
  }
  return Math.abs(twiceArea.value / 2);
}

export type GravityShellTarget = { quadId: number; on?: 'plate' };
export type GravityShellKey = `${'quad' | 'plate'}:${number}`;

export function gravityShellKey(target: GravityShellTarget): GravityShellKey {
  return `${target.on ?? 'quad'}:${target.quadId}`;
}

export function shellEdgeComponents<S>(shells: readonly S[], nodesOf: (shell: S) => readonly number[]) {
  const edges = (nodes: readonly number[]) => nodes.map((a, i) => {
    const b = nodes[(i + 1) % nodes.length]!;
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  });
  const byEdge = new Map<string, S[]>();
  for (const shell of shells) for (const edge of edges(nodesOf(shell))) {
    const adjacent = byEdge.get(edge) ?? [];
    adjacent.push(shell);
    byEdge.set(edge, adjacent);
  }
  const components = new Map<S, S[]>();
  for (const seed of shells) {
    if (components.has(seed)) continue;
    const connected = new Set([seed]);
    for (const shell of connected) for (const edge of edges(nodesOf(shell))) {
      for (const neighbour of byEdge.get(edge) ?? []) connected.add(neighbour);
      byEdge.delete(edge);
    }
    const group = [...connected];
    for (const shell of group) components.set(shell, group);
  }
  return components;
}

export function* gravityShellCells<Cell extends { id: number }>(model: {
  quads?: ReadonlyMap<number, Cell>;
  plates?: ReadonlyMap<number, Cell>;
}): Iterable<{ cell: Cell; target: GravityShellTarget }> {
  for (const cell of model.quads?.values() ?? []) yield { cell, target: { quadId: cell.id } };
  for (const cell of model.plates?.values() ?? []) yield { cell, target: { quadId: cell.id, on: 'plate' } };
}

export function gravityShellSurfaceArea(p: Array<[number, number, number]>): number {
  let s = 0;
  for (let i = 1; i + 1 < p.length; i++) {
    const a = p[0]!, b = p[i]!, c = p[i + 1]!;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    s += Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!) / 2;
  }
  return s;
}

export function triangularGravityFootprint(model: {
  nodes: ReadonlyMap<number, { x: number; y: number }>;
  plates?: ReadonlyMap<number, { id: number; nodes: readonly number[] }>;
}): number | undefined {
  for (const plate of model.plates?.values() ?? []) {
    const nodes = plate.nodes.map(id => model.nodes.get(id));
    if (nodes.length !== 3 || nodes.some(node => !node)) continue;
    if (ringArea(nodes.map(node => [node!.x, node!.y])) > 0) return plate.id;
  }
  return undefined;
}

export function footprintArea(region: MultiPolygon): number {
  const area = new Sum();
  for (const poly of region) {
    poly.forEach((ring, index) => area.add((index === 0 ? 1 : -1) * ringArea(ring)));
  }
  return area.value;
}

export interface UncoveredStrips {
  kind: 'strips';
  span: number;
  polygons: Point[][];
}

export type ShellCoverage = { kind: 'shell' } | UncoveredStrips;
export type BayPartition = { kind: 'uncovered' } | { kind: 'shell' } | (UncoveredStrips & { shares: SideShare[] });

export function bayFrame(sides: Side[], holes: Side[][]) {
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
  const inPlan = ([x, y]: Point): Point => [
    basis.a[0] + x * basis.u[0] + y * basis.n[0],
    basis.a[1] + x * basis.u[1] + y * basis.n[1],
  ];
  return { error, basis, local, inPlan, boundary };
}

export function partitionShellCoverage(sides: Side[], holes: Side[][], shells: Polygon[], span?: Point): BayPartition {
  if (!shells.length) return { kind: 'uncovered' };
  const { error, basis, local, inPlan, boundary } = bayFrame(sides, holes);

  const localShells = shells.map(poly => poly.map(ring => ring.map(local)));
  const [remaining, covered] = (() => {
    try {
      const footprint = polygonClipping.union(localShells[0]!, ...localShells.slice(1));
      return [polygonClipping.difference(boundary, footprint), polygonClipping.intersection(boundary, footprint)];
    } catch (err) {
      return refuseGravityGeometry(msg('loadPlan.gravity.partitionFailed', { detail: String(err) }));
    }
  })();
  const originalArea = footprintArea([boundary]);
  const coveredArea = footprintArea(covered), remainingArea = footprintArea(remaining);
  if (!agrees(coveredArea + remainingArea, originalArea, originalArea)) {
    refuseGravityGeometry(msg('loadPlan.gravity.coveragePrecision'));
  }
  if (!remaining.length) return { kind: 'shell' };
  if (!(coveredArea > 0)) return { kind: 'uncovered' };

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
    polygons: remaining.map(([outer]) => outer!.slice(0, -1).map(inPlan)),
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

export function planarShell(id: number, vertices: Point3[]): FittedShellPlane | undefined {
  const [origin, ...corners] = [...vertices].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  if (!origin) return undefined;
  const edges = corners.map(p => p.map((v, k) => v - origin[k]!) as Point3);
  const [a, b, c] = edges;
  if (!a || !b) return undefined;
  const cross = (u: Point3, v: Point3) => [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  const pairs: [number, number][] = c ? [[0, 1], [0, 2], [1, 2]] : [[0, 1]];
  const { normal, basis } = pairs.map(([i, j]) => ({
    normal: cross(edges[i]!, edges[j]!), basis: [origin, corners[i]!, corners[j]!] as PlaneBasis,
  })).sort((u, v) => Math.hypot(...v.normal) - Math.hypot(...u.normal))[0]!;
  const norm = Math.hypot(...normal);
  const scale = Math.max(...vertices.flat().map(Math.abs), ...edges.map(edge => Math.hypot(...edge)));
  const error = 64 * Number.EPSILON * scale * norm;
  if (!vertices.every(p => Math.abs(p.reduce((sum, v, k) => sum + (v - origin[k]!) * normal[k]!, 0)) <= error)) {
    refuseGravityGeometry(msg('loadPlan.gravity.nonplanarShell', { id }));
  }
  const height: ShellPlane = ([x, y]) => origin[2] - ((x - origin[0]) * normal[0]! + (y - origin[1]) * normal[1]!) / normal[2]!;
  return Object.assign(height, { basis });
}

type Footprint = Polygon | MultiPolygon;

export function footprintIntersection(a: Footprint, b: Footprint): MultiPolygon {
  try {
    return polygonClipping.intersection(a, b);
  } catch (err) {
    return refuseGravityGeometry(msg('loadPlan.gravity.deckCheckFailed', { detail: String(err) }));
  }
}

export function footprintsOverlap(a: Footprint, b: Footprint): boolean {
  return footprintArea(footprintIntersection(a, b)) > 0;
}

export type ShellFootprint = { id: number; poly: Point[]; pts: Point3[]; plane?: ShellPlane };

export function shellOverlapMessage(a: ShellFootprint, b: ShellFootprint): EngineMessage {
  return msg('loadPlan.gravity.overlappingShells', { first: Math.min(a.id, b.id), second: Math.max(a.id, b.id) });
}

export function unionFootprints(footprints: Polygon[]): MultiPolygon {
  if (footprints.length <= 1) return footprints;
  try {
    return polygonClipping.union(footprints[0]!, ...footprints.slice(1));
  } catch (err) {
    return refuseGravityGeometry(msg('loadPlan.gravity.partitionFailed', { detail: String(err) }));
  }
}

export function subtractFootprints(boundary: Polygon, covering: Polygon[]): MultiPolygon {
  try {
    return polygonClipping.difference(boundary, ...covering);
  } catch (err) {
    return refuseGravityGeometry(msg('loadPlan.gravity.partitionFailed', { detail: String(err) }));
  }
}

export function canonicalFootprint(ring: Point[]): Point[] {
  const compare = (a: Point, b: Point) => a[0] - b[0] || a[1] - b[1];
  const start = ring.reduce((first, point, i) => compare(point, ring[first]!) < 0 ? i : first, 0);
  const next = ring[(start + 1) % ring.length]!, previous = ring[(start + ring.length - 1) % ring.length]!;
  const step = compare(next, previous) <= 0 ? 1 : -1;
  return ring.map((_, i) => ring[(start + step * i + ring.length) % ring.length]!);
}

export function footprintBounds(ring: Point[]) {
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
  return { left: Math.min(...xs), right: Math.max(...xs), bottom: Math.min(...ys), top: Math.max(...ys) };
}

export function* potentiallyOverlapping<T>(items: readonly T[], outline: (item: T) => Point[]): Iterable<[T, T]> {
  const ordered = items.map(item => ({ item, ...footprintBounds(outline(item)) })).sort((a, b) => a.left - b.left);
  for (const [i, a] of ordered.entries()) {
    for (let j = i + 1; j < ordered.length; j++) {
      const b = ordered[j]!;
      if (b.left >= a.right) break;
      if (b.bottom < a.top && b.top > a.bottom) yield [a.item, b.item];
    }
  }
}
