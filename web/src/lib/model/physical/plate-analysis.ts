import type { Constraint3D, LinearMpcConstraint } from '../../engine/types-3d';
import { cross, dot, unit, type Vec3 } from '../edit/affine';
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

function planeDistance(point: Vec3, { o, n }: PlateFrame): number {
  const distance = dot(sub(point, o), n);
  return Math.abs(distance) <= PLATE_EDGE_TOL ? 0 : distance;
}

function faceSection(cell: Cell, plane: PlateFrame, direction: Vec3, origin: Vec3) {
  const distances = cell.vertices.map(vertex => planeDistance(vertex.point, plane));
  const stations = cell.vertices.map(vertex => dot(sub(vertex.point, origin), direction));
  const cuts: number[] = [];
  const edges: Array<readonly [number, number]> = [];
  for (const [i, a] of distances.entries()) {
    const j = (i + 1) % distances.length;
    const b = distances[j]!, first = stations[i]!, last = stations[j]!;
    if (a === 0) cuts.push(first);
    if (a === 0 && b === 0) {
      edges.push([Math.min(first, last), Math.max(first, last)]);
    }
    if ((a < 0 && b > 0) || (a > 0 && b < 0)) cuts.push(first + a / (a - b) * (last - first));
  }
  return { lo: Math.min(...cuts), hi: Math.max(...cuts), edges };
}

function sharedBoundarySeparates(wall: Cell, slab: Cell): boolean {
  const shared = slab.vertices.filter(({ id }) => wall.vertices.some(v => v.id === id));
  if (shared.length === 0 || shared.length > 2) return false;
  const [origin, end] = shared as [Vertex, Vertex?];
  let direction: Vec3 | undefined;
  if (end) {
    const includesEdge = (cell: Cell) => cell.vertices.some(({ id }, i, vertices) => {
      const next = vertices[(i + 1) % vertices.length]!.id;
      return (id === origin.id && next === end.id) || (id === end.id && next === origin.id);
    });
    if (!includesEdge(wall) || !includesEdge(slab)) return false;
    const edge = sub(end.point, origin.point);
    if (!(norm(edge) > PLATE_EDGE_TOL)) return false;
    direction = unit(edge);
  }
  const separatedCorners = (cell: Cell) => cell.vertices
    .filter(v => v.id !== origin.id && v.id !== end?.id)
    .map(({ point }) => sub(point, origin.point));
  const wallCorners = separatedCorners(wall), slabCorners = separatedCorners(slab);
  const side = (corners: Vec3[]) => corners.reduce<Vec3>((sum, point) => {
    const vector = direction ? cross(cross(direction, point), direction) : point;
    return [sum[0] + vector[0], sum[1] + vector[1], sum[2] + vector[2]];
  }, [0, 0, 0]);
  const wallSide = side(wallCorners), slabSide = side(slabCorners);
  if (!(norm(wallSide) > PLATE_EDGE_TOL && norm(slabSide) > PLATE_EDGE_TOL)) return false;
  const normal = sub(unit(slabSide), unit(wallSide));
  const length = norm(normal);
  return slabCorners.every(point => dot(point, normal) > PLATE_EDGE_TOL * length)
    && wallCorners.every(point => dot(point, normal) < -PLATE_EDGE_TOL * length);
}

function throughFaces(wall: Cell, slab: Cell): boolean {
  const chord = cross(wall.frame.n, slab.frame.n);
  const length = norm(chord);
  if (!(length > 0)) return false;
  const direction = chord.map(v => v / length) as Vec3;
  const origin = slab.vertices[0]!.point;
  const wallSection = faceSection(wall, slab.frame, direction, origin);
  const slabSection = faceSection(slab, wall.frame, direction, origin);
  const lo = Math.max(wallSection.lo, slabSection.lo), hi = Math.min(wallSection.hi, slabSection.hi);
  if (!(hi > lo)) return false;
  return [wallSection, slabSection].some(section => {
    let end = lo;
    for (const [a, b] of section.edges.sort(([a], [b]) => a - b)) {
      if (a - end > PLATE_EDGE_TOL) break;
      if (hi - b <= PLATE_EDGE_TOL) return false;
      end = Math.max(end, b);
    }
    return true;
  });
}

function faceBounds(cell: Cell) {
  return axes.map(axis => {
    const coordinates = cell.vertices.map(vertex => vertex.point[axis]);
    return { lo: Math.min(...coordinates), hi: Math.max(...coordinates) };
  });
}

function interiorContact(walls: readonly Cell[], slabs: readonly Cell[]) {
  const faces = slabs.map(cell => {
    const { vertices, frame } = cell;
    const bounds = faceBounds(cell).map(({ lo, hi }) => ({ lo: lo - PLATE_EDGE_TOL, hi: hi + PLATE_EDGE_TOL }));
    const sides = vertices.map(({ point }, index) => {
      const edge = sub(vertices[(index + 1) % vertices.length]!.point, point);
      const length = norm(edge);
      return { point, inward: cross(frame.n, edge).map(value => value / length) as Vec3 };
    });
    return { cell, bounds, sides };
  }).sort((a, b) => a.bounds[0]!.lo - b.bounds[0]!.lo);

  for (const wall of walls) {
    const extents = faceBounds(wall);
    for (const { cell, bounds, sides } of faces) {
      if (bounds[0]!.lo > extents[0]!.hi) break;
      if (axes.some(axis => extents[axis]!.lo > bounds[axis]!.hi || extents[axis]!.hi < bounds[axis]!.lo)) continue;
      if (sharedBoundarySeparates(wall, cell)) continue;
      if (throughFaces(wall, cell)) return { wall: wall.key, slab: cell.key, trace: true as const };
      for (const [index, first] of wall.vertices.entries()) {
        const last = wall.vertices[(index + 1) % wall.vertices.length]!;
        const a = first.point, b = last.point;
        if (norm(sub(a, b)) <= PLATE_EDGE_TOL) continue;
        if (axes.some(axis => Math.min(a[axis], b[axis]) > bounds[axis]!.hi
          || Math.max(a[axis], b[axis]) < bounds[axis]!.lo)) continue;
        const fromPlane = planeDistance(a, cell.frame), toPlane = planeDistance(b, cell.frame);
        const joint = { wall: wall.key, slab: cell.key };
        const contact = { ...joint, edge: [first.id, last.id] as const };
        if (fromPlane !== 0 || toPlane !== 0) {
          const crossesPlane = (fromPlane < 0 && toPlane > 0) || (toPlane < 0 && fromPlane > 0);
          const t = fromPlane === 0 ? 0 : toPlane === 0 ? 1 : crossesPlane ? fromPlane / (fromPlane - toPlane) : null;
          if (t !== null && sides.every(({ point, inward }) =>
            (1 - t) * dot(sub(a, point), inward) + t * dot(sub(b, point), inward) > PLATE_EDGE_TOL)) {
            if (t === 0 || t === 1) return { ...joint, vertex: t === 0 ? first.id : last.id };
            return contact;
          }
          continue;
        }
        let lo = 0, hi = 1;
        for (const { point, inward } of sides) {
          const from = dot(sub(a, point), inward) - PLATE_EDGE_TOL;
          const to = dot(sub(b, point), inward) - PLATE_EDGE_TOL;
          if (from <= 0 && to <= 0) {
            hi = lo;
            break;
          }
          if (from <= 0) lo = Math.max(lo, from / (from - to));
          if (to <= 0) hi = Math.min(hi, from / (from - to));
          if (lo >= hi) break;
        }
        if (lo < hi) return contact;
      }
    }
  }
  return null;
}

type WallSlabJoint = { wall: string; slab: string } & ({ node: number } | { vertex: number } | { edge: readonly [number, number] } | { trace: true });

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
