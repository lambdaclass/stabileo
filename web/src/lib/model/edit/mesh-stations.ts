import { cross, dot, type Vec3 } from './affine';
import { validCells } from './mesh-apply';
import { MAX_MESH_CELLS, MAX_MESH_POINTS, type MeshOutput } from './mesher';

export function strictlyOrAt(p: Vec3, a: Vec3, b: Vec3, ends: boolean): boolean {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  if (L2 < 1e-18) return false;
  const t = ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2;
  const off = Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t);
  if (off > 1e-4) return false;
  const tol = 1e-6 / Math.sqrt(L2);
  return ends ? t >= -tol && t <= 1 + tol : t > tol && t < 1 - tol;
}


const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
type Edge = readonly [number, number];
const axes = [0, 1, 2] as const;
export const sameMeshNode = (a: Vec3, b: Vec3, weld: number) => axes.every(axis => Math.abs(a[axis] - b[axis]) < weld);
const edgeKey = (a: number, b: number) => a < b ? `${a},${b}` : `${b},${a}`;

interface StationIndex {
  bounds: ReadonlyArray<readonly [number, number]>;
  overlaps(other: StationIndex): boolean;
  between(a: Vec3, b: Vec3): Vec3[];
}

export function stationIndex(points: readonly Vec3[]): StationIndex {
  const sorted = axes.map(axis => [...points].sort((a, b) => a[axis] - b[axis]));
  const bounds = sorted.map((list, axis) => [list[0]?.[axis] ?? Infinity, list.at(-1)?.[axis] ?? -Infinity] as const);
  return {
    overlaps(other: StationIndex) {
      return bounds.every(([lo, hi], axis) => hi + 1e-4 >= other.bounds[axis]![0] && lo - 1e-4 <= other.bounds[axis]![1]);
    },
    bounds,
    between(a: Vec3, b: Vec3) {
      const axis = axes.reduce((best, k) => Math.abs(b[k] - a[k]) > Math.abs(b[best] - a[best]) ? k : best);
      const list = sorted[axis]!;
      const lo = Math.min(a[axis], b[axis]) - 1e-4;
      const hi = Math.max(a[axis], b[axis]) + 1e-4;
      let start = 0, end = list.length;
      while (start < end) {
        const mid = (start + end) >>> 1;
        if (list[mid]![axis] < lo) start = mid + 1;
        else end = mid;
      }
      const hits: Vec3[] = [];
      for (let i = start; i < list.length && list[i]![axis] <= hi; i++) {
        const p = list[i]!;
        if (strictlyOrAt(p, a, b, false)) hits.push(p);
      }
      return hits;
    },
  };
}

interface ShellEdges {
  id: number | undefined;
  cells: readonly (readonly Vec3[])[];
}

export function sharedFrameStations(frame: StationIndex, shells: readonly ShellEdges[]) {
  const incident = new Map<Vec3, Array<{ id: ShellEdges['id']; a: Vec3; b: Vec3 }>>();
  for (const { id, cells } of shells) {
    for (const cell of cells) cell.forEach((a, i) => {
      const b = cell[(i + 1) % cell.length]!;
      for (const p of frame.between(a, b)) {
        const edges = incident.get(p) ?? [];
        edges.push({ id, a, b });
        incident.set(p, edges);
      }
    });
  }
  return (id: number, a: Vec3, b: Vec3) => frame.between(a, b).filter(p => incident.get(p)?.some(edge => {
    if (edge.id === id) return false;
    return strictlyOrAt(a, edge.a, edge.b, true) || strictlyOrAt(b, edge.a, edge.b, true)
      || strictlyOrAt(edge.a, a, b, true) || strictlyOrAt(edge.b, a, b, true);
  }));
}

function transition(ring: number[], points: readonly Vec3[], normal: Vec3, quads: boolean): number[][] | null {
  const at = (i: number) => ({ x: points[i]![0], y: points[i]![1], z: points[i]![2] });
  const cells: number[][] = [];
  while (ring.length > 3) {
    if (quads && ring.length === 4 && validCells(ring, at).length === 1) return [...cells, ring];
    let best = -1, score = 0;
    for (let i = 0; i < ring.length; i++) {
      const ia = ring[(i + ring.length - 1) % ring.length]!, ib = ring[i]!, ic = ring[(i + 1) % ring.length]!;
      const a = points[ia]!, b = points[ib]!, c = points[ic]!;
      const ab = sub(b, a), bc = sub(c, b), ca = sub(a, c);
      const area = dot(cross(ab, bc), normal);
      if (area <= 0 || !validCells([ia, ib, ic], at).length) continue;
      if (ring.some(id => id !== ia && id !== ib && id !== ic && strictlyOrAt(points[id]!, a, c, false))) continue;
      const quality = area / (dot(ab, ab) + dot(bc, bc) + dot(ca, ca));
      if (quality > score) { best = i; score = quality; }
    }
    if (best === -1) return null;
    cells.push([ring[(best + ring.length - 1) % ring.length]!, ring[best]!, ring[(best + 1) % ring.length]!]);
    ring.splice(best, 1);
  }
  return validCells(ring, at).length ? [...cells, ring] : null;
}

export function meshStations(mesh: MeshOutput, stationsOn: (a: Vec3, b: Vec3) => Vec3[], weld: number): MeshOutput | null {
  const points = [...mesh.points];
  const boundary = new Set(mesh.boundary);
  const edges = new Map<string, number[]>();
  const add = (edge: Edge) => {
    const [i, j] = edge;
    const key = edgeKey(i, j);
    if (edges.has(key)) return;
    const a = points[i]!, b = points[j]!, dir = sub(b, a);
    const stations = stationsOn(a, b)
      .sort((p, q) => dot(sub(p, q), dir) || p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
    const interior: number[] = [];
    let previous = a;
    for (const p of stations) {
      if (sameMeshNode(p, previous, weld) || sameMeshNode(p, b, weld)) continue;
      const id = points.push(p) - 1;
      interior.push(id);
      if (mesh.boundary.has(i) && mesh.boundary.has(j)) boundary.add(id);
      previous = p;
    }
    edges.set(key, i < j ? interior : interior.reverse());
  };
  for (const cell of mesh.cells) cell.forEach((a, i) => add([a, cell[(i + 1) % cell.length]!]));
  if (points.length === mesh.points.length) return mesh;
  if (points.length > MAX_MESH_POINTS) return null;

  const cells: number[][] = [];
  const planeNormal = cross(mesh.plane.u, mesh.plane.v);
  for (const cell of mesh.cells) {
    const ring = cell.flatMap((a, i) => {
      const b = cell[(i + 1) % cell.length]!;
      const interior = edges.get(edgeKey(a, b))!;
      return [a, ...(a < b ? interior : [...interior].reverse())];
    });
    if (ring.length === cell.length) {
      cells.push(cell);
    } else {
      const a = points[cell[0]!]!, b = points[cell[1]!]!, c = points[cell[2]!]!;
      const normal = dot(cross(sub(b, a), sub(c, a)), planeNormal) > 0 ? planeNormal : cross(mesh.plane.v, mesh.plane.u);
      const next = transition(ring, points, normal, cell.length === 4);
      if (!next) return null;
      cells.push(...next);
    }
    if (cells.length > MAX_MESH_CELLS) return null;
  }
  return { ...mesh, points, cells, boundary, structured: false };
}
