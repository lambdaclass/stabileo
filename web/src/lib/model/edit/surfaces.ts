/**
 * Curved surfaces as shells: cylinder, cone, spherical cap and zone, hyperboloid of one sheet
 * (a cooling tower) and hyperbolic paraboloid, meshed in quadrilaterals marked `curved` so the
 * engine solves them as its curved shell.
 *
 * Every surface is built in its own frame, axis along +Z with the base centre at the origin (the
 * paraboloid centred on the origin), and handed over as a fragment: placed with the ghost like
 * anything else, or with its axis along two picked points.
 *
 * Pure: geometry and a fragment, no store.
 */
import type { Fragment } from './fragment';
import type { Vec3 } from './affine';
import { generateMesh, MAX_MESH_CELLS } from './mesher';
import { DEFAULT_WELD, NodeIndex } from './node-index';

export const SURFACE_KINDS = ['cylinder', 'cone', 'sphericalCap', 'sphericalZone', 'hyperboloid', 'hypar'] as const;
export type SurfaceKind = (typeof SURFACE_KINDS)[number];

export type SurfaceParams = Record<string, number>;

export const SURFACE_DEFAULTS: Record<SurfaceKind, SurfaceParams> = {
  cylinder: { radius: 3, height: 6, angle: 360, around: 24, along: 8 },
  cone: { radius: 3, topRadius: 1, height: 5, around: 24, along: 8 },
  sphericalCap: { baseRadius: 6, rise: 2, size: 0.6 },
  sphericalZone: { radius: 6, fromDeg: 30, toDeg: 80, around: 32, along: 6 },
  hyperboloid: { waist: 4, bottomRadius: 6, topRadius: 5, height: 20, waistAt: 14, around: 32, along: 16 },
  hypar: { lx: 8, ly: 8, rise: 1.5, nx: 10, ny: 10 },
};

export interface SurfaceMesh { points: Vec3[]; cells: number[][] }

/** A structured patch: `at(i, j)` for i in 0..nu (wrapping when `closed`), j in 0..nv. */
function patch(nu: number, nv: number, closed: boolean, at: (i: number, j: number) => Vec3): SurfaceMesh | null {
  if (nu * nv > MAX_MESH_CELLS) return null;
  const points: Vec3[] = [];
  const cols = closed ? nu : nu + 1;
  const idx = (i: number, j: number) => j * cols + (closed ? i % nu : i);
  for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) points.push(at(i, j));
  const cells: number[][] = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) cells.push([idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)]);
  return { points, cells };
}

const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

export function validSurface(kind: SurfaceKind, p: SurfaceParams): boolean {
  const pos = (...k: string[]) => k.every((x) => Number.isFinite(p[x]) && p[x]! > 0);
  switch (kind) {
    case 'cylinder': return pos('radius', 'height', 'angle', 'around', 'along') && p.angle! <= 360;
    // A quad strip needs a nonzero end ring. A pole needs a different topology, not welded
    // copies of its corner node (which produce degenerate shell elements).
    case 'cone': return pos('radius', 'height', 'around', 'along', 'topRadius');
    case 'sphericalCap': return pos('baseRadius', 'rise', 'size') && p.rise! <= p.baseRadius!;
    case 'sphericalZone': return pos('radius', 'around', 'along') && p.fromDeg! >= 0 && p.toDeg! > p.fromDeg! && p.toDeg! < 90;
    case 'hyperboloid': return pos('waist', 'bottomRadius', 'topRadius', 'height', 'around', 'along') && p.waistAt! > 0 && p.waistAt! < p.height!
      && p.bottomRadius! > p.waist! && p.topRadius! > p.waist!;
    case 'hypar': return pos('lx', 'ly', 'nx', 'ny') && Number.isFinite(p.rise);
  }
}

/** Reject meshes whose cells collapse under the same weld used during placement. */
export function surfaceMesh(kind: SurfaceKind, p: SurfaceParams): SurfaceMesh | null {
  const mesh = buildSurfaceMesh(kind, p);
  if (!mesh || mesh.points.some((p) => !p.every(Number.isFinite))) return null;
  const index = new NodeIndex(DEFAULT_WELD);
  const ids = mesh.points.map((p, i) => {
    const hit = index.find(p, (id) => mesh.points[id]);
    if (hit !== null) return hit;
    index.add(i, p);
    return i;
  });
  if (mesh.cells.some((cell) => new Set(cell.map((i) => ids[i])).size !== cell.length)) return null;
  return mesh;
}

function buildSurfaceMesh(kind: SurfaceKind, p: SurfaceParams): SurfaceMesh | null {
  if (!validSurface(kind, p)) return null;
  switch (kind) {
    case 'cylinder': {
      const n = clampInt(p.around!, 3, 720), m = clampInt(p.along!, 1, 500);
      const full = Math.abs(p.angle! - 360) < 1e-9;
      const th = (p.angle! * Math.PI) / 180;
      return patch(n, m, full, (i, j) => { const a = (i * th) / n; return [p.radius! * Math.cos(a), p.radius! * Math.sin(a), (j * p.height!) / m]; });
    }
    case 'cone': {
      const n = clampInt(p.around!, 3, 720), m = clampInt(p.along!, 1, 500);
      return patch(n, m, true, (i, j) => {
        const a = (2 * Math.PI * i) / n, t = j / m, r = p.radius! + (p.topRadius! - p.radius!) * t;
        return [r * Math.cos(a), r * Math.sin(a), t * p.height!];
      });
    }
    case 'sphericalCap': {
      // The O-grid of the base circle, lifted onto the sphere through the base and the crown.
      const a = p.baseRadius!, h = p.rise!, R = (a * a + h * h) / (2 * h);
      const flat = generateMesh({ outer: { kind: 'circle', center: [0, 0, 0], radius: a }, holes: [], size: p.size!, element: 'quad' });
      if (!flat) return null;
      return {
        points: flat.points.map(([x, y]) => [x, y, Math.sqrt(Math.max(0, R * R - x * x - y * y)) - (R - h)] as Vec3),
        cells: flat.cells,
      };
    }
    case 'sphericalZone': {
      const n = clampInt(p.around!, 3, 720), m = clampInt(p.along!, 1, 500);
      const f0 = (p.fromDeg! * Math.PI) / 180, f1 = (p.toDeg! * Math.PI) / 180, R = p.radius!;
      // Latitude from the equator: fromDeg at the base ring, toDeg towards the pole; base at z = 0.
      const z0 = R * Math.sin(f0);
      return patch(n, m, true, (i, j) => {
        const a = (2 * Math.PI * i) / n, phi = f0 + ((f1 - f0) * j) / m;
        return [R * Math.cos(phi) * Math.cos(a), R * Math.cos(phi) * Math.sin(a), R * Math.sin(phi) - z0];
      });
    }
    case 'hyperboloid': {
      // r(z)² = a² (1 + (z − z0)² / c²), the waist a at z0. One c fits the bottom radius and
      // another the top, so below and above the waist are two hyperbolas meeting at the waist
      // with the same radius and a vertical tangent: the usual cooling-tower profile.
      const a = p.waist!, H = p.height!, z0 = p.waistAt!, rb = p.bottomRadius!;
      const c = z0 / Math.sqrt(rb * rb / (a * a) - 1);
      const cTop = (H - z0) / Math.sqrt(p.topRadius! * p.topRadius! / (a * a) - 1);
      const n = clampInt(p.around!, 3, 720), m = clampInt(p.along!, 1, 500);
      return patch(n, m, true, (i, j) => {
        const ang = (2 * Math.PI * i) / n, z = (j * H) / m;
        const cc = z <= z0 ? c : cTop;
        const r = a * Math.sqrt(1 + ((z - z0) / cc) ** 2);
        return [r * Math.cos(ang), r * Math.sin(ang), z];
      });
    }
    case 'hypar': {
      // z = 4·h·x·y / (lx·ly): straight lines both ways, corners at ±h.
      const nx = clampInt(p.nx!, 1, 500), ny = clampInt(p.ny!, 1, 500), lx = p.lx!, ly = p.ly!, h = p.rise!;
      return patch(nx, ny, false, (i, j) => {
        const x = -lx / 2 + (i * lx) / nx, y = -ly / 2 + (j * ly) / ny;
        return [x, y, (4 * h * x * y) / (lx * ly)];
      });
    }
  }
}

/** The surface as a fragment of curved quadrilaterals on the given material and thickness. */
export function surfaceFragment(m: SurfaceMesh, materialId: number, thickness: number, material?: import('../../store/model.svelte').Material): Fragment {
  return {
    nodes: m.points.map((p, i) => ({ id: i + 1, x: p[0], y: p[1], z: p[2] })),
    elements: [], plates: [], supports: [], loads: [], groups: [], sections: [], loadCases: [],
    quads: m.cells.map((c, k) => ({ id: k + 1, nodes: c.map((i) => i + 1) as [number, number, number, number], materialId, thickness, curved: true })),
    materials: material ? [JSON.parse(JSON.stringify(material))] : [],
    local: true,
  };
}

/** Area of a surface mesh (sum of its quads split in two), for checks. */
export function surfaceArea(m: SurfaceMesh): number {
  let s = 0;
  for (const c of m.cells) {
    const [a, b, d, e] = c.map((i) => m.points[i]!) as [Vec3, Vec3, Vec3, Vec3];
    const tri = (p: Vec3, q: Vec3, r: Vec3) => {
      const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], v = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
      return Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!) / 2;
    };
    s += tri(a, b, d) + tri(a, d, e);
  }
  return s;
}
