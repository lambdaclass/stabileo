import { tp } from '../i18n';
import { plateLoops, plateSurfaceOf } from '../model/physical/plate';
import type { ShellOffset } from '../model/element-3d-metadata';
import { resolveShellOffsetGlobal } from './shell-offsets';
import type { ModelData } from './solver-service';
import type { SolverInput3D } from './types-3d';
import { add, agrees, cross, dot, mul, norm, polygonMeasure, roundoff, sub, Sum, unit, xyz, zero, type Vector } from './accounting-math';

type PlateGroup = NonNullable<ModelData['groups']> extends Map<number, infer Group> ? Group : never;
type Edge = { a: Vector; b: Vector; from: number; to: number; count: number };
type Interval = { start: number; end: number; a: Vector };
type Side = {
  length: number;
  arc?: { radius: number; sweep: number };
  station: (point: Vector) => number;
  intervals: Interval[];
};

export class SolveAccountingError extends Error {}

export interface PlateMeasure {
  name: string;
  area: number;
  specifiedArea: number;
  centroid: Vector;
  normal: Vector;
}

function angle(centre: Vector, a: Vector, b: Vector, normal: Vector): number {
  const u = sub(a, centre), v = sub(b, centre);
  return Math.atan2(dot(cross(u, v), normal), dot(u, v));
}

function positiveAngle(value: number): number {
  return value < 0 ? value + 2 * Math.PI : value;
}

function sideOf(a: Vector, b: Vector, mid: Vector | undefined, normal: Vector, scale: number): Side {
  const chord = sub(b, a);
  const length = norm(chord);
  if (!mid) {
    const direction = mul(chord, 1 / length);
    return { length, intervals: [], station: point => {
      const fromA = sub(point, a);
      const s = dot(fromA, direction);
      return norm(sub(fromA, mul(direction, s))) <= roundoff * scale ? s : NaN;
    } };
  }
  const half = sub(mid, a);
  const n = cross(chord, half);
  const centre = add(a, mul(add(
    mul(cross(half, n), dot(chord, chord)), mul(cross(n, chord), dot(half, half)),
  ), 1 / (2 * dot(n, n))));
  const radius = norm(sub(a, centre));
  const end = positiveAngle(angle(centre, a, b, normal));
  const through = positiveAngle(angle(centre, a, mid, normal));
  const sweep = through < end ? end : end - 2 * Math.PI;
  const sign = Math.sign(sweep);
  return {
    length: radius * Math.abs(sweep), arc: { radius, sweep }, intervals: [],
    station: point => {
      if (!agrees(norm(sub(point, centre)), radius, scale)) return NaN;
      const theta = sign * angle(centre, a, point, normal);
      return radius * (Math.abs(theta) <= roundoff ? 0 : positiveAngle(theta));
    },
  };
}

function boundaryOf(points: Vector[], mids: boolean[], normal: Vector, scale: number): Side[] {
  const sides: Side[] = [];
  for (let i = 0; i < points.length; i++) {
    if (mids[i]) continue;
    const j = (i + 1) % points.length;
    const k = (i + 2) % points.length;
    sides.push(mids[j] ? sideOf(points[i]!, points[k]!, points[j], normal, scale)
      : sideOf(points[i]!, points[j]!, undefined, normal, scale));
  }
  return sides;
}

function boundarySegments(edges: Iterable<Edge>, limit: number, knots: ReadonlySet<number>): Array<[Vector, Vector]> | null {
  const boundary = new Map<number, { p: Vector; links: number[] }>();
  function connect(from: number, to: number, p: Vector) {
    const vertex = boundary.get(from);
    if (vertex) vertex.links.push(to);
    else boundary.set(from, { p, links: [to] });
  }
  for (const { a, b, from, to, count } of edges) {
    if (count > 2) return null;
    if (count !== 1) continue;
    connect(from, to, a);
    connect(to, from, b);
  }
  if ([...boundary.values()].some(v => v.links.length !== 2)) return null;

  const visited = new Set<number>();
  const segments: Array<[Vector, Vector]> = [];
  for (const start of boundary.keys()) {
    if (visited.has(start)) continue;
    const loop: Array<{ id: number; p: Vector }> = [];
    let previous = start, next = boundary.get(start)!.links[0]!;
    while (!visited.has(next)) {
      const vertex = boundary.get(next)!;
      visited.add(next);
      loop.push({ id: next, p: vertex.p });
      const following = vertex.links[0] === previous ? vertex.links[1]! : vertex.links[0]!;
      previous = next;
      next = following;
    }
    if (previous !== start || loop.length < 3) return null;
    const corners = loop.filter(({ id, p }, i) => {
      if (knots.has(id)) return true;
      const a = sub(p, loop[(i + loop.length - 1) % loop.length]!.p);
      const b = sub(loop[(i + 1) % loop.length]!.p, p);
      return dot(a, b) <= 0 || norm(cross(a, b)) > limit * (norm(a) + norm(b));
    });
    if (corners.length < 3) return null;
    corners.forEach(({ p }, i) => segments.push([p, corners[(i + 1) % corners.length]!.p]));
  }
  return segments;
}

function circularSegment(radius: number, sweep: number): number {
  return (radius ** 2 / 2) * (sweep - Math.sin(sweep));
}

function measurePlate(model: ModelData, input: SolverInput3D, group: PlateGroup): PlateMeasure {
  const name = group.name ?? String(group.id);
  const surface = plateSurfaceOf(group)!;
  const { outer, holes } = plateLoops(group);
  const rawLoops = [outer, ...holes].map(ids => ids.map(id => {
    const point = model.nodes.get(id);
    if (!point) throw new SolveAccountingError(tp('svc.accountingArea', { plate: name, entered: '—', assembled: '—' }));
    return xyz(point);
  }));
  const outside = rawLoops[0]!;
  const origin = outside[0]!;
  const normal = unit(outside.reduce((v, p, i) =>
    add(v, cross(sub(p, origin), sub(outside[(i + 1) % outside.length]!, origin))), zero()));
  const scale = rawLoops.reduce((max, points) => points.reduce((m, p) => Math.max(m, norm(p), norm(sub(p, origin))), max), 0);
  const diameter = rawLoops.reduce((max, points) => points.reduce((m, p) => Math.max(m, norm(sub(p, origin))), max), 0);
  const mids = new Set(surface.arcMids);
  let index = 0;
  const loops = rawLoops.map(points => {
    const flags = points.map(() => mids.has(index++));
    const sides = boundaryOf(points, flags, normal, scale);
    const chord = polygonMeasure(points.filter((_, i) => !flags[i]), origin, normal).area;
    const arcArea = sides.reduce((area, side) => side.arc ? area + circularSegment(side.arc.radius, side.arc.sweep) : area, 0);
    return { sides, area: chord + arcArea };
  });
  const specifiedArea = loops.reduce((area, loop, i) => area + (i === 0 ? 1 : -1) * Math.abs(loop.area), 0);
  const assembled = new Sum();
  const edges = new Map<string, Edge>();
  const shells = [
    ...(group.members.plates ?? []).map(id => ({ declared: model.plates?.get(id), wire: input.plates?.get(id) })),
    ...(group.members.quads ?? []).map(id => {
      const declared = model.quads?.get(id);
      return { declared, wire: (declared?.curved ? input.curvedShells : input.quads)?.get(id) };
    }),
  ];
  const geometryError = (sweep: boolean) => new SolveAccountingError(tp(
    sweep ? 'svc.accountingSweep' : 'svc.accountingArea',
    { plate: name, entered: specifiedArea, assembled: assembled.value },
  ));

  for (const { declared, wire } of shells) {
    if (!declared || !wire) throw geometryError(false);
    const points = wire.nodes.map(id => {
      const point = input.nodes.get(id);
      if (!point) throw geometryError(false);
      return xyz(point);
    });
    const nodeIds = declared.nodes;
    const corners = nodeIds.map(id => {
      const point = model.nodes.get(id);
      if (!point) throw geometryError(false);
      return { x: point.x, y: point.y, z: point.z ?? 0 };
    });
    const offset = (declared as { offset?: ShellOffset }).offset;
    const shift = offset ? resolveShellOffsetGlobal(offset, corners) : null;
    const expectedShift = shift ? xyz(shift) : zero();
    const boundaryPoints = corners.map(xyz);
    if (points.some((p, i) => norm(sub(sub(p, boundaryPoints[i]!), expectedShift)) > roundoff * scale)) {
      throw geometryError(false);
    }
    const shellNormal = unit(cross(sub(points[1]!, points[0]!), sub(points[2]!, points[0]!)));
    const cell = polygonMeasure(points, points[0]!, shellNormal).area;
    if (!(cell > 0) || !agrees(Math.abs(dot(normal, shellNormal)), 1, 1)) throw geometryError(false);
    assembled.add(cell);
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      const a = boundaryPoints[i]!, b = boundaryPoints[j]!;
      if (!agrees(dot(normal, sub(a, origin)), 0, scale)) throw geometryError(false);
      const ni = nodeIds[i]!, nj = nodeIds[j]!;
      const key = ni < nj ? `${ni}:${nj}` : `${nj}:${ni}`;
      const old = edges.get(key);
      if (old) old.count++;
      else edges.set(key, { a, b, from: ni, to: nj, count: 1 });
    }
  }

  const sides = loops.flatMap(loop => loop.sides);
  const hasArcs = mids.size > 0;
  const limit = roundoff * scale;
  const boundary = boundarySegments(edges.values(), limit, new Set([...outer, ...holes.flat()]));
  if (!boundary) throw geometryError(false);
  const boundaryPoint = (p: Vector) => sub(p, mul(normal, dot(normal, sub(p, origin))));
  for (const [a, b] of boundary) {
    const pa = boundaryPoint(a), pb = boundaryPoint(b);
    const side = sides.find(candidate => {
      const u = candidate.station(pa), v = candidate.station(pb);
      const start = Math.min(u, v), end = Math.max(u, v);
      if (!(start >= -limit && end <= candidate.length + limit && end > start)) return false;
      if (candidate.arc && end - start >= Math.PI * candidate.arc.radius) return false;
      candidate.intervals.push({ start, end, a: u < v ? pa : pb });
      return true;
    });
    if (!side) throw geometryError(hasArcs);
  }

  const area = new Sum(), corrections = new Sum();
  let first = zero();
  for (const [i, loop] of loops.entries()) {
    const boundary: Vector[] = [];
    const correction = new Sum();
    for (const side of loop.sides) {
      side.intervals.sort((a, b) => a.start - b.start);
      if (side.arc && side.intervals.length < 2) throw geometryError(true);
      let covered = 0;
      for (const interval of side.intervals) {
        if (!agrees(covered, interval.start, scale)) throw geometryError(hasArcs);
        covered = interval.end;
        boundary.push(interval.a);
        if (side.arc) correction.add(circularSegment(side.arc.radius,
          Math.sign(side.arc.sweep) * (interval.end - interval.start) / side.arc.radius));
      }
      if (!agrees(covered, side.length, scale)) throw geometryError(hasArcs);
    }
    const measure = polygonMeasure(boundary, origin, normal);
    const sign = (i === 0 ? 1 : -1) * Math.sign(measure.area);
    area.add(sign * measure.area);
    corrections.add(sign * correction.value);
    first = add(first, mul(measure.first, sign));
  }
  const areaScale = scale * diameter;
  if (!(specifiedArea > 0 && area.value > 0)
    || !agrees(area.value, assembled.value, areaScale)
    || !agrees(specifiedArea, assembled.value + corrections.value, areaScale)) throw geometryError(false);
  return { name, specifiedArea, area: area.value, centroid: add(origin, mul(first, 1 / area.value)), normal };
}

export function accountPlateGeometry(model: ModelData, input: SolverInput3D): Map<number, PlateMeasure> {
  const plates = new Map<number, PlateMeasure>();
  for (const [id, group] of model.groups ?? []) {
    if (plateSurfaceOf(group)) plates.set(id, measurePlate(model, input, group));
  }
  return plates;
}
