import { dot, type Vec3 } from '../edit/affine';
import { frameOfLoop, plateKindOf, plateLoops, plateProblem, plateSurfaceOf, type PlateModel } from './plate';

type Shell = { id: number; nodes: readonly number[] };
type PlateGroup = {
  id: number;
  name?: string;
  members: { nodes?: number[]; quads?: number[]; plates?: number[] };
  data?: Record<string, unknown>;
};
export type PlateAnalysisModel = PlateModel & {
  groups?: ReadonlyMap<number, PlateGroup>;
  quads?: ReadonlyMap<number, Shell>;
  plates?: ReadonlyMap<number, Shell>;
  materials?: ReadonlyMap<number, unknown>;
};

export function invalidPlateDefinition(model: PlateAnalysisModel, group: PlateGroup): boolean {
  const surface = plateSurfaceOf(group);
  if (!surface || !surface.loops.every(n => Number.isInteger(n) && n >= 3)) return true;
  const loopNodes = surface.loops.reduce((sum, n) => sum + n, 0);
  const nodes = group.members.nodes;
  if (!Array.isArray(nodes) || loopNodes > nodes.length
    || (surface.arcMids !== undefined && (!Array.isArray(surface.arcMids)
      || surface.arcMids.some(n => !Number.isInteger(n) || n < 0 || n >= loopNodes)))
    || !surface.mesh || !Number.isFinite(surface.mesh.size) || surface.mesh.size <= 0
    || !Number.isFinite(surface.thickness) || surface.thickness <= 0
    || (model.materials && !model.materials.has(surface.materialId))) return true;
  const { outer, holes } = plateLoops(group);
  return plateProblem(model, outer, holes, surface.arcMids) !== null;
}

export function physicalPlateProblems(model: PlateAnalysisModel): { invalid: string[]; unmeshed: string[] } {
  const invalid: string[] = [], unmeshed: string[] = [];
  for (const group of model.groups?.values() ?? []) {
    if (group.data?.surface === undefined) continue;
    const name = group.name ?? `#${group.id}`;
    const { quads = [], plates = [] } = group.members;
    const mesh = plateSurfaceOf(group)?.meshed;
    if (invalidPlateDefinition(model, group) || !Array.isArray(quads) || !Array.isArray(plates)
      || quads.some(id => !model.quads?.has(id)) || plates.some(id => !model.plates?.has(id))
      || (mesh && mesh.cells !== quads.length + plates.length)) {
      invalid.push(name);
    } else if (!quads.length && !plates.length) {
      unmeshed.push(name);
    }
  }
  return { invalid, unmeshed };
}

export const PLATE_EDGE_TOL = 1e-7;
const axes = [0, 1, 2] as const;
type Axis = typeof axes[number];
type Vertex = { id: number; point: Vec3; shell: string };
type Cell = { key: string; vertices: Vertex[] };

function stationIndex(cells: Cell[]) {
  const vertices = [...new Map(cells.flatMap(cell => cell.vertices.map(v => [v.id, v] as const))).values()];
  return axes.map(axis => [...vertices].sort((a, b) => a.point[axis] - b.point[axis]));
}

function bound(vertices: Vertex[], axis: Axis, coordinate: number, upper: boolean): number {
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

function hangingVertex(cell: Cell, stations: Vertex[][]): Vertex | undefined {
  const ids = new Set(cell.vertices.map(v => v.id));
  for (const [i, vertex] of cell.vertices.entries()) {
    const a = vertex.point, b = cell.vertices[(i + 1) % cell.vertices.length]!.point;
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
      if (t <= 0 || t >= 1) continue;
      const distance = Math.hypot(p[0] - t * v[0], p[1] - t * v[1], p[2] - t * v[2]);
      if (distance <= PLATE_EDGE_TOL) return station;
    }
  }
  return undefined;
}

export function nonconformingWallSlab(model: PlateAnalysisModel): { wall: string; slab: string; node: number } | null {
  const cells: Record<'slab' | 'wall', Cell[]> = { slab: [], wall: [] };
  for (const [prefix, shells] of [['q', model.quads], ['p', model.plates]] as const) {
    for (const shell of shells?.values() ?? []) {
      const key = `${prefix}${shell.id}`;
      const vertices: Vertex[] = [];
      for (const id of shell.nodes) {
        const node = model.nodes.get(id);
        if (node) vertices.push({ id, point: [node.x, node.y, node.z ?? 0], shell: key });
      }
      if (vertices.length !== shell.nodes.length) continue;
      const frame = frameOfLoop(vertices.map(v => v.point));
      if (frame && Number.isFinite(frame.n[2])) cells[plateKindOf({ frame })].push({ key, vertices });
    }
  }
  if (!cells.slab.length || !cells.wall.length) return null;
  const names = new Map<string, string>();
  const label = (key: string) => names.get(key) ?? key;
  for (const group of model.groups?.values() ?? []) {
    if (!group.name || !plateSurfaceOf(group)) continue;
    for (const id of group.members.quads ?? []) names.set(`q${id}`, group.name);
    for (const id of group.members.plates ?? []) names.set(`p${id}`, group.name);
  }
  for (const [edge, vertex] of [['slab', 'wall'], ['wall', 'slab']] as const) {
    const stations = stationIndex(cells[vertex]);
    for (const cell of cells[edge]) {
      const hanging = hangingVertex(cell, stations);
      if (hanging) {
        const edgeName = label(cell.key), vertexName = label(hanging.shell);
        return edge === 'slab'
          ? { slab: edgeName, wall: vertexName, node: hanging.id }
          : { wall: edgeName, slab: vertexName, node: hanging.id };
      }
    }
  }
  return null;
}

export function plateAnalysisIssue(model: PlateAnalysisModel) {
  if (!model.quads && !model.plates) return null;
  const { invalid, unmeshed } = physicalPlateProblems(model);
  if (invalid.length) return { kind: 'invalid' as const, names: invalid };
  if (unmeshed.length) return { kind: 'unmeshed' as const, names: unmeshed };
  const joint = nonconformingWallSlab(model);
  return joint && { kind: 'wallSlab' as const, joint };
}
