import type { Constraint3D, LinearMpcConstraint } from '../../engine/types-3d';
import { cross, dot, type Vec3 } from '../edit/affine';
import { pieceOf, type PieceModel } from '../curve-entity';
import {
  arcInterior, circleThrough, externalFeatures, frameOfLoop, plateGeometry, plateKindOf, plateLoops,
  PLANE_TOL, plateProblem, plateSignature, plateSurfaceOf, type ArcSampler, type PlateFrame, type PlateMeshSpec,
} from './plate';

type Shell = { id: number; nodes: readonly number[]; curved?: boolean };
type PlateGroup = {
  id: number;
  name?: string;
  members: { nodes?: number[]; quads?: number[]; plates?: number[] };
  data?: Record<string, unknown>;
};
export type PlateAnalysisModel = PieceModel & {
  groups?: ReadonlyMap<number, PlateGroup>;
  quads?: ReadonlyMap<number, Shell>;
  plates?: ReadonlyMap<number, Shell>;
  materials?: ReadonlyMap<number, unknown>;
  constraints?: readonly (Constraint3D | Record<string, unknown>)[];
};

function invalidPlateDefinition(model: PlateAnalysisModel, group: PlateGroup): boolean {
  const surface = plateSurfaceOf(group);
  if (!surface || !surface.loops.every(n => Number.isInteger(n) && n >= 3)) return true;
  const loopNodes = surface.loops.reduce((sum, n) => sum + n, 0);
  const nodes = group.members?.nodes;
  if (!Array.isArray(nodes) || loopNodes > nodes.length
    || (surface.arcMids !== undefined && (!Array.isArray(surface.arcMids)
      || surface.arcMids.some(n => !Number.isInteger(n) || n < 0 || n >= loopNodes)))
    || !surface.mesh || !Number.isFinite(surface.mesh.size) || surface.mesh.size <= 0
    || !Number.isFinite(surface.thickness) || surface.thickness <= 0
    || (model.materials && !model.materials.has(surface.materialId))) return true;
  const { outer, holes } = plateLoops(group);
  return plateProblem(model, outer, holes, surface.arcMids) !== null;
}

function* arcEdgesBetween(model: PieceModel, a: number, b: number): Generator<{ arcId: number; nodes: number[] }> {
  const seen = new Set<number>();
  for (const e of model.elements.values()) {
    if (!e.arc || seen.has(e.arc.id)) continue;
    seen.add(e.arc.id);
    const p = pieceOf(model, e.id);
    if (!p || p.kind !== 'arc') continue;
    if (!((p.start === a && p.end === b) || (p.start === b && p.end === a))) continue;
    const nodes = [p.start];
    for (const segment of p.segments) {
      const element = model.elements.get(segment.elementId)!;
      nodes.push(segment.reversed ? element.nodeI : element.nodeJ);
    }
    yield { arcId: e.arc.id, nodes: p.start === a ? nodes : nodes.reverse() };
  }
}

export function arcEdgeBetween(model: PieceModel, a: number, b: number) {
  return arcEdgesBetween(model, a, b).next().value ?? null;
}

function meshSampler(model: PieceModel, size: number): ArcSampler {
  return (a, mid, b) => {
    const ci = circleThrough(a.p, mid.p, b.p);
    if (!ci || !Number.isFinite(ci.r) || !(ci.sweep > 0 && ci.sweep < 2 * Math.PI)) return null;
    const chord = sub(b.p, a.p);
    const length = norm(chord);
    const side = (p: Vec3) => dot(cross(chord, sub(p, a.p)), ci.n) / length;
    const midSide = side(mid.p);
    if (!(Math.abs(midSide) > PLANE_TOL)) return null;
    const start = sub(a.p, ci.c);
    for (const edge of arcEdgesBetween(model, a.id, b.id)) {
      const pts = edge.nodes.slice(1, -1).map((id): Vec3 => {
        const node = model.nodes.get(id)!;
        return [node.x, node.y, node.z ?? 0];
      });
      if (!pts.length || !pts.every(p => {
        const r = sub(p, ci.c);
        return Math.abs(dot(r, ci.n)) <= PLANE_TOL && Math.abs(norm(r) - ci.r) < PLANE_TOL;
      })) continue;

      const sides = pts.map(p => Math.sign(midSide) * side(p));
      if (sides.every(distance => distance < -PLANE_TOL)) continue;
      if (!sides.every(distance => distance > PLANE_TOL)) return null;

      let previous = 0;
      for (const p of pts) {
        const radial = sub(p, ci.c);
        const angle = Math.atan2(dot(cross(start, radial), ci.n), dot(start, radial));
        const station = angle < 0 ? angle + 2 * Math.PI : angle;
        if (!(station > previous && station < ci.sweep)) return null;
        previous = station;
      }
      return pts;
    }
    return arcInterior(a.p, mid.p, b.p, Math.max(2, Math.ceil((ci.r * ci.sweep) / size)));
  };
}

export function plateMeshFeatures(model: PlateAnalysisModel, group: PlateGroup, spec: PlateMeshSpec) {
  if (invalidPlateDefinition(model, group)) return { refused: 'invalid' as const };
  const geo = plateGeometry(model, group, meshSampler(model, spec.size));
  if (!geo) return { refused: 'ambiguousSweep' as const };
  const loops = plateLoops(group);
  const mine = new Set(loops.owned);
  const owned = new Set<number>();
  for (const g of model.groups?.values() ?? []) {
    if (Array.isArray(g.members?.nodes)) for (const n of plateLoops(g).owned) owned.add(n);
  }
  const neighbours = new Set<number>();
  for (const [shells, members] of [[model.quads, group.members.quads], [model.plates, group.members.plates]] as const) {
    const memberIds = new Set(members);
    for (const shell of shells?.values() ?? []) {
      if (!memberIds.has(shell.id)) shell.nodes.forEach(n => neighbours.add(n));
    }
  }
  const loopNodes = new Set([...loops.outer, ...loops.holes.flat()]);
  return { geo, features: externalFeatures(model, geo, owned, loopNodes, { mine, neighbours }) };
}

export type PlateStatus = 'unmeshed' | 'current' | 'stale' | 'invalid';

function plateMeshStatus(model: PlateAnalysisModel, group: PlateGroup): PlateStatus | 'ambiguousSweep' {
  const surface = plateSurfaceOf(group);
  if (!surface) return 'invalid';
  const { quads = [], plates = [] } = group.members ?? {};
  if (!Array.isArray(quads) || !Array.isArray(plates)
    || quads.some(id => !model.quads?.has(id)) || plates.some(id => !model.plates?.has(id))) return 'invalid';
  const count = quads.length + plates.length;
  if (surface.meshed && surface.meshed.cells !== count) return 'invalid';
  const mesh = plateMeshFeatures(model, group, surface.mesh);
  if (mesh.refused) return mesh.refused;
  if (!count || !surface.meshed) return 'unmeshed';
  return plateSignature(mesh.geo, surface.mesh, mesh.features) === surface.meshed.signature ? 'current' : 'stale';
}

export function plateStatusOf(model: PlateAnalysisModel, group: PlateGroup): PlateStatus {
  const status = plateMeshStatus(model, group);
  return status === 'ambiguousSweep' ? 'invalid' : status;
}

export function physicalPlateProblems(model: PlateAnalysisModel) {
  const invalid: string[] = [];
  const ambiguousSweep: string[] = [];
  const needsMesh: Array<{ id: number; name: string; status: 'stale' | 'unmeshed' }> = [];
  for (const group of model.groups?.values() ?? []) {
    if (group.data?.surface === undefined) continue;
    const name = group.name ?? `#${group.id}`;
    const status = plateMeshStatus(model, group);
    if (status === 'ambiguousSweep') ambiguousSweep.push(name);
    if (status === 'invalid') invalid.push(name);
    if (status === 'stale' || status === 'unmeshed') needsMesh.push({ id: group.id, name, status });
  }
  return { invalid, ambiguousSweep, needsMesh };
}

export const PLATE_EDGE_TOL = 1e-7;
const axes = [0, 1, 2] as const;
type Axis = typeof axes[number];
type Vertex = { id: number; point: Vec3; shell: string; curved?: boolean };
type Cell = { key: string; vertices: Vertex[]; frame: PlateFrame };

type Station = Vertex & { incident: Array<{ point: Vec3; shell: string; curved?: boolean }> };

function stationIndex(cells: Cell[]) {
  const byNode = new Map<number, Station>();
  for (const { vertices, key } of cells) {
    for (const [i, vertex] of vertices.entries()) {
      let station = byNode.get(vertex.id);
      if (!station) {
        station = { ...vertex, incident: [] };
        byNode.set(vertex.id, station);
      }
      const prev = vertices[(i + vertices.length - 1) % vertices.length]!;
      const next = vertices[(i + 1) % vertices.length]!;
      station.incident.push({ point: prev.point, shell: key, curved: prev.curved }, { point: next.point, shell: key, curved: next.curved });
    }
  }
  return axes.map(axis => [...byNode.values()].sort((a, b) => a.point[axis] - b.point[axis]));
}

function bound(vertices: Station[], axis: Axis, coordinate: number, upper: boolean): number {
  let lo = 0, hi = vertices.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const value = vertices[mid]!.point[axis];
    if (value < coordinate || (upper && value === coordinate)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

const norm = (p: Vec3) => Math.hypot(p[0], p[1], p[2]);
const lineDistance = (p: Vec3, direction: Vec3, t: number) =>
  Math.hypot(p[0] - t * direction[0], p[1] - t * direction[1], p[2] - t * direction[2]);

type EdgeEquations = Map<number, LinearMpcConstraint['terms'][]>;

function edgeEquations(constraints: PlateAnalysisModel['constraints']): EdgeEquations {
  const byNode: EdgeEquations = new Map();
  for (const constraint of constraints ?? []) {
    if (constraint?.type !== 'linearMPC' || !Array.isArray(constraint.terms)) continue;
    const terms = constraint.terms as LinearMpcConstraint['terms'];
    if ((terms.length !== 2 && terms.length !== 3)
      || terms.some(term => !term || !Number.isInteger(term.nodeId) || term.dof !== terms[0]?.dof
        || !Number.isFinite(term.coefficient) || term.coefficient === 0)
      || new Set(terms.map(term => term.nodeId)).size !== terms.length) continue;
    for (const { nodeId } of terms) {
      const atNode = byNode.get(nodeId);
      if (atNode) atNode.push(terms);
      else byNode.set(nodeId, [terms]);
    }
  }
  return byNode;
}

function tiedToEdge(equations: EdgeEquations, station: Vertex, a: Vertex, b: Vertex, t: number): boolean {
  const rows = equations.get(station.id);
  if (!rows || station.curved || a.curved || b.curved
    || !axes.every(axis => station.point[axis] === a.point[axis] + t * (b.point[axis] - a.point[axis]))) return false;
  const weights = new Map<number, number>();
  if (t !== 1) weights.set(a.id, 1 - t);
  if (t !== 0) weights.set(b.id, t);
  const matched = new Set<number>();
  for (const terms of rows) {
    if (terms.length !== weights.size + 1) continue;
    const dependent = terms.find(term => term.nodeId === station.id)!;
    if (terms.every(term => term === dependent || -term.coefficient / dependent.coefficient === weights.get(term.nodeId))) {
      matched.add(dependent.dof);
    }
  }
  return [0, 1, 2, 3, 4, 5].every(dof => matched.has(dof));
}

function unmatchedVertex(cell: Cell, stations: Station[][], equations: EdgeEquations): Vertex | undefined {
  const ids = new Set(cell.vertices.map(v => v.id));
  for (const [i, vertex] of cell.vertices.entries()) {
    const end = cell.vertices[(i + 1) % cell.vertices.length]!;
    const a = vertex.point, b = end.point;
    const v = sub(b, a);
    const length2 = dot(v, v);
    if (!(length2 > 0)) continue;
    const min = axes.map(axis => Math.min(a[axis], b[axis]) - PLATE_EDGE_TOL);
    const max = axes.map(axis => Math.max(a[axis], b[axis]) + PLATE_EDGE_TOL);
    const ranges = axes.map(axis => {
      const index = stations[axis]!;
      return { index, lo: bound(index, axis, min[axis]!, false), hi: bound(index, axis, max[axis]!, true) };
    });
    const { index, lo, hi } = ranges.reduce((best, range) => range.hi - range.lo < best.hi - best.lo ? range : best);
    for (let j = lo; j < hi; j++) {
      const station = index[j]!;
      if (ids.has(station.id) || axes.some(axis => station.point[axis] < min[axis]! || station.point[axis] > max[axis]!)) continue;
      const p = sub(station.point, a);
      const t = dot(p, v) / length2;
      if (t > 0 && t < 1 && lineDistance(p, v, t) <= PLATE_EDGE_TOL) {
        if (!tiedToEdge(equations, station, vertex, end, t)) return station;
        continue;
      }
      if (norm(p) > PLATE_EDGE_TOL && norm(sub(station.point, b)) > PLATE_EDGE_TOL) continue;
      const overlap = station.incident.find(({ point }) => {
        const other = sub(point, a);
        const u = dot(other, v) / length2;
        return Math.max(0, Math.min(t, u)) < Math.min(1, Math.max(t, u))
          && lineDistance(other, v, u) <= PLATE_EDGE_TOL;
      });
      if (overlap) {
        const coincident = { ...station, shell: overlap.shell, curved: overlap.curved };
        if (!tiedToEdge(equations, coincident, vertex, end, t < 0.5 ? 0 : 1)) return coincident;
      }
    }
  }
  return undefined;
}

type FaceSide = { point: Vec3; inward: Vec3; shared: boolean };
type SectionPoint = { point: Vec3; nodes: readonly number[] };
type Interval = [number, number];

function signedDistance(point: Vec3, origin: Vec3, direction: Vec3): number {
  const delta = sub(point, origin);
  const distance = dot(delta, direction);
  const magnitude = axes.reduce<number>((sum, axis) => sum + Math.abs(delta[axis] * direction[axis]), 0);
  return Math.abs(distance) <= 4 * Number.EPSILON * magnitude ? 0 : distance;
}

function clipInterval(interval: Interval, from: number, to: number): boolean {
  if (from < 0 && to < 0) return false;
  if (from < 0) interval[0] = Math.max(interval[0], from / (from - to));
  if (to < 0) interval[1] = Math.min(interval[1], from / (from - to));
  return interval[0] <= interval[1];
}

function segmentMeetsFace(
  first: Vec3, last: Vec3, sides: readonly FaceSide[], interval: Interval, includeBoundary: boolean,
): boolean {
  for (const { point, inward } of sides) {
    const from = signedDistance(first, point, inward);
    const to = signedDistance(last, point, inward);
    if ((!includeBoundary && from === 0 && to === 0) || !clipInterval(interval, from, to)) return false;
  }
  return interval[0] < interval[1];
}

function pointMeetsFace(section: SectionPoint, sides: readonly FaceSide[]): boolean {
  let onSeam = false;
  for (const { point, inward, shared } of sides) {
    const distance = signedDistance(section.point, point, inward);
    if (distance < 0) return false;
    if (distance > 0) continue;
    if (!shared || onSeam || section.nodes.length === 1) return false;
    onSeam = true;
  }
  return true;
}

function hasSectionEdge(cell: Cell, first: SectionPoint, last: SectionPoint): boolean {
  if (first.nodes.length !== 1 || last.nodes.length !== 1) return false;
  const a = first.nodes[0], b = last.nodes[0];
  return cell.vertices.some(({ id }, index, vertices) => {
    const next = vertices[(index + 1) % vertices.length]!.id;
    return (id === a && next === b) || (id === b && next === a);
  });
}

function wallFaceContact(wall: Cell, slab: Cell, sides: readonly FaceSide[]): readonly number[] | undefined {
  const { o, u, v, n } = slab.frame;
  const slabNodes = new Set(slab.vertices.map(vertex => vertex.id));
  const distances = wall.vertices.map(({ id, point }) => slabNodes.has(id) ? 0 : signedDistance(point, o, n));
  const section: SectionPoint[] = [];
  for (const [index, first] of wall.vertices.entries()) {
    const next = (index + 1) % wall.vertices.length;
    const last = wall.vertices[next]!;
    const from = distances[index]!, to = distances[next]!;
    if (from === 0) section.push({ point: first.point, nodes: [first.id] });
    if ((from < 0 && to > 0) || (from > 0 && to < 0)) {
      const t = from / (from - to);
      const point = axes.map(axis => first.point[axis] + t * (last.point[axis] - first.point[axis])) as Vec3;
      section.push({ point, nodes: [first.id, last.id] });
    }
  }
  if (section.length === 1) {
    const point = section[0]!;
    if (pointMeetsFace(point, sides)) return point.nodes;
  } else if (section.length > 1) {
    const direction = cross(wall.frame.n, n);
    const start = section[0]!.point;
    section.sort((a, b) => dot(sub(a.point, start), direction) - dot(sub(b.point, start), direction));
    const first = section[0]!, last = section[section.length - 1]!;
    const wallEdge = hasSectionEdge(wall, first, last);
    if (section.length === 2 && wallEdge && hasSectionEdge(slab, first, last)) return undefined;
    if (segmentMeetsFace(first.point, last.point, sides, [0, 1], !wallEdge)) {
      return [...new Set([...first.nodes, ...last.nodes])];
    }
  }

  for (const [index, first] of wall.vertices.entries()) {
    const next = (index + 1) % wall.vertices.length;
    const last = wall.vertices[next]!;
    const from = distances[index]!, to = distances[next]!;
    if (!(from > 0 && to > 0) && !(from < 0 && to < 0)) continue;
    const interval: Interval = [0, 1];
    if (!clipInterval(interval, PLATE_EDGE_TOL - Math.abs(from), PLATE_EDGE_TOL - Math.abs(to))) continue;
    if (norm(sub(last.point, first.point)) <= PLATE_EDGE_TOL
      || (signedDistance(last.point, first.point, u) === 0 && signedDistance(last.point, first.point, v) === 0)) continue;
    if (segmentMeetsFace(first.point, last.point, sides, interval, false)) return [first.id, last.id];
  }
  return undefined;
}

function faceBounds(vertices: readonly Vertex[], padding: number) {
  return axes.map(axis => {
    const coordinates = vertices.map(vertex => vertex.point[axis]);
    return { lo: Math.min(...coordinates) - padding, hi: Math.max(...coordinates) + padding };
  });
}

function interiorContact(walls: readonly Cell[], slabs: readonly Cell[]) {
  const slabEdges = new Map<string, FaceSide>();
  const faces = slabs.map(cell => {
    const { vertices, frame } = cell;
    const sides = vertices.map(({ id, point }, index) => {
      const next = vertices[(index + 1) % vertices.length]!;
      const edge = sub(next.point, point);
      const length = norm(edge);
      const key = `${Math.min(id, next.id)}:${Math.max(id, next.id)}`;
      const other = slabEdges.get(key);
      const side: FaceSide = { point, inward: cross(frame.n, edge).map(value => value / length) as Vec3, shared: !!other };
      if (other) other.shared = true;
      else slabEdges.set(key, side);
      return side;
    });
    return { cell, bounds: faceBounds(vertices, PLATE_EDGE_TOL), sides };
  }).sort((a, b) => a.bounds[0]!.lo - b.bounds[0]!.lo);

  for (const wall of walls) {
    const wallBounds = faceBounds(wall.vertices, 0);
    for (const { cell, bounds, sides } of faces) {
      if (bounds[0]!.lo > wallBounds[0]!.hi) break;
      if (axes.some(axis => wallBounds[axis]!.lo > bounds[axis]!.hi || wallBounds[axis]!.hi < bounds[axis]!.lo)) continue;
      const contact = wallFaceContact(wall, cell, sides);
      if (contact) return { wall: wall.key, slab: cell.key, contact };
    }
  }
  return null;
}

type WallSlabJoint = { wall: string; slab: string } & ({ node: number } | { contact: readonly number[] });

export function nonconformingWallSlab(model: PlateAnalysisModel): WallSlabJoint | null {
  const cells: Record<'slab' | 'wall', Cell[]> = { slab: [], wall: [] };
  for (const [prefix, shells] of [['q', model.quads], ['p', model.plates]] as const) {
    for (const shell of shells?.values() ?? []) {
      const key = `${prefix}${shell.id}`;
      const vertices: Vertex[] = [];
      for (const id of shell.nodes) {
        const node = model.nodes.get(id);
        if (node) vertices.push({ id, point: [node.x, node.y, node.z ?? 0], shell: key, curved: shell.curved });
      }
      if (vertices.length !== shell.nodes.length) continue;
      const frame = frameOfLoop(vertices.map(v => v.point));
      if (frame && Number.isFinite(frame.n[2])) cells[plateKindOf({ frame })].push({ key, vertices, frame });
    }
  }
  if (!cells.slab.length || !cells.wall.length) return null;
  const equations = edgeEquations(model.constraints);
  const names = new Map<string, string>();
  const label = (key: string) => names.get(key) ?? key;
  for (const group of model.groups?.values() ?? []) {
    if (!group.name || !plateSurfaceOf(group)) continue;
    for (const id of group.members?.quads ?? []) names.set(`q${id}`, group.name);
    for (const id of group.members?.plates ?? []) names.set(`p${id}`, group.name);
  }
  for (const [edge, vertex] of [['slab', 'wall'], ['wall', 'slab']] as const) {
    const stations = stationIndex(cells[vertex]);
    for (const cell of cells[edge]) {
      const hanging = unmatchedVertex(cell, stations, equations);
      if (hanging) {
        const edgeName = label(cell.key), vertexName = label(hanging.shell);
        return edge === 'slab'
          ? { slab: edgeName, wall: vertexName, node: hanging.id }
          : { wall: edgeName, slab: vertexName, node: hanging.id };
      }
    }
  }
  const interior = interiorContact(cells.wall, cells.slab);
  return interior && { ...interior, wall: label(interior.wall), slab: label(interior.slab) };
}

export function plateAnalysisIssue(model: PlateAnalysisModel) {
  if (!model.quads && !model.plates) return null;
  const { invalid, ambiguousSweep, needsMesh } = physicalPlateProblems(model);
  if (ambiguousSweep.length) return { kind: 'ambiguousSweep' as const, names: ambiguousSweep };
  if (invalid.length) return { kind: 'invalid' as const, names: invalid };
  const joint = nonconformingWallSlab(model);
  if (joint) return { kind: 'wallSlab' as const, joint };
  if (!needsMesh.length) return null;
  return {
    kind: needsMesh.some(p => p.status === 'stale') ? 'stale' as const : 'unmeshed' as const,
    names: needsMesh.map(p => p.name),
  };
}
