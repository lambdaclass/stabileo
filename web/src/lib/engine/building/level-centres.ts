/**
 * The centre of mass and the centre of rigidity of each level, and the eccentricity between them:
 * what tells a building that twists under a lateral load from one that does not.
 *
 * The mass is the members' and shells' own weight, lumped half to each end or a quarter to each
 * corner, plus each gravity case's loads times the mass source's factor for it; the mass of a
 * level is what lands on its nodes. The rigidity is the storey's: each column below the level
 * resists a drift along X or Y with 12·E·I/h³, I its inertia about the axis that drift bends it
 * about, and each wall along its own length with E·t / ((h/L)³ + 3·h/L), a panel fixed at both
 * ends with its shear deformation. A storey approximation under a rigid diaphragm, said as such.
 */
import { computeLocalAxes3D } from '../local-axes-3d';

type Node = { id: number; x: number; y: number; z?: number };
type Elem = { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number; rollAngle?: number };
type Sec = { a: number; iy?: number; iz: number; b?: number; h?: number };
type Mat = { e: number; rho: number };
type Quad = { nodes: number[]; materialId: number; thickness: number };
type Load = { type: string; data: Record<string, unknown> };

export interface CentresInput {
  nodes: ReadonlyMap<number, Node>;
  elements: ReadonlyMap<number, Elem>;
  sections: ReadonlyMap<number, Sec>;
  materials: ReadonlyMap<number, Mat>;
  quads: ReadonlyMap<number, Quad>;
  loads: readonly Load[];
  /** The mass source's factor per load case. */
  massFactor: (caseId: number) => number;
  /** The levels, low to high. */
  levels: ReadonlyArray<{ id: string; name: string; z: number }>;
  /** Walls: their shells' node ids. */
  walls?: ReadonlyArray<{ nodes: number[]; thickness: number; materialId: number }>;
}

export interface LevelCentres {
  levelId: string; name: string; z: number;
  /** Weight on the level, kN, and where it acts. */
  weight: number; cm: { x: number; y: number } | null;
  /** Storey stiffness along X and Y, kN/m, and where it acts. */
  kx: number; ky: number; cr: { x: number; y: number } | null;
  /** CM − CR, m. */
  ex: number | null; ey: number | null;
}

const TOL = 1e-3;

export function levelCentres(m: CentresInput): LevelCentres[] {
  // ── Weights on nodes, kN ──
  const w = new Map<number, number>();
  const add = (id: number, kn: number) => w.set(id, (w.get(id) ?? 0) + kn);
  const P = (id: number) => m.nodes.get(id);
  for (const e of m.elements.values()) {
    const a = P(e.nodeI), b = P(e.nodeJ), s = m.sections.get(e.sectionId), mat = m.materials.get(e.materialId);
    if (!a || !b || !s || !mat) continue;
    const L = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
    const W = mat.rho * s.a * L;
    add(a.id, W / 2); add(b.id, W / 2);
  }
  const quadArea = (q: Quad) => {
    const p = q.nodes.map((id) => P(id)).filter(Boolean) as Node[];
    if (p.length < 3) return 0;
    let ax = 0, ay = 0, az = 0;
    for (let i = 1; i + 1 < p.length; i++) {
      const u = [p[i]!.x - p[0]!.x, p[i]!.y - p[0]!.y, (p[i]!.z ?? 0) - (p[0]!.z ?? 0)];
      const v = [p[i + 1]!.x - p[0]!.x, p[i + 1]!.y - p[0]!.y, (p[i + 1]!.z ?? 0) - (p[0]!.z ?? 0)];
      ax += u[1]! * v[2]! - u[2]! * v[1]!; ay += u[2]! * v[0]! - u[0]! * v[2]!; az += u[0]! * v[1]! - u[1]! * v[0]!;
    }
    return Math.hypot(ax, ay, az) / 2;
  };
  for (const q of m.quads.values()) {
    const mat = m.materials.get(q.materialId);
    if (!mat) continue;
    const W = mat.rho * q.thickness * quadArea(q);
    for (const n of q.nodes) add(n, W / q.nodes.length);
  }
  for (const l of m.loads) {
    const f = m.massFactor(Number(l.data.caseId ?? 1));
    if (!(f > 0)) continue;
    if (l.type === 'nodal3d' || l.type === 'nodal') {
      const down = -Number(l.data.fz ?? 0) * f;
      if (down > 0) add(Number(l.data.nodeId), down);
    } else if (l.type === 'distributed3d') {
      const e = m.elements.get(Number(l.data.elementId));
      const a = e && P(e.nodeI), b = e && P(e.nodeJ);
      if (!e || !a || !b) continue;
      const L = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
      const q = -(Number(l.data.qZI ?? 0) + Number(l.data.qZJ ?? 0)) / 2;
      if (q > 0) { add(a.id, q * L * f / 2); add(b.id, q * L * f / 2); }
    } else if (l.type === 'surface3d') {
      const q = m.quads.get(Number(l.data.quadId));
      const p = Number(l.data.q ?? 0);
      if (q && p > 0) for (const n of q.nodes) add(n, p * quadArea(q) * f / q.nodes.length);
    }
  }

  const out: LevelCentres[] = [];
  m.levels.forEach((lv, k) => {
    // ── Mass ──
    let W = 0, wx = 0, wy = 0;
    for (const [id, kn] of w) {
      const n = P(id);
      if (!n || Math.abs((n.z ?? 0) - lv.z) > TOL) continue;
      W += kn; wx += kn * n.x; wy += kn * n.y;
    }
    // ── Rigidity of the storey below ──
    const below = k > 0 ? m.levels[k - 1]!.z : null;
    let kx = 0, ky = 0, kxy = 0, kyx = 0;
    if (below !== null) {
      for (const e of m.elements.values()) {
        const a = P(e.nodeI), b = P(e.nodeJ), s = m.sections.get(e.sectionId), mat = m.materials.get(e.materialId);
        if (!a || !b || !s || !mat) continue;
        const [lo, hi] = (a.z ?? 0) <= (b.z ?? 0) ? [a, b] : [b, a];
        if (Math.abs((lo.z ?? 0) - below) > TOL || Math.abs((hi.z ?? 0) - lv.z) > TOL || Math.hypot(hi.x - lo.x, hi.y - lo.y) > TOL) continue;
        const h = (hi.z ?? 0) - (lo.z ?? 0);
        const ax = computeLocalAxes3D({ id: lo.id, x: lo.x, y: lo.y, z: lo.z ?? 0 }, { id: hi.id, x: hi.x, y: hi.y, z: hi.z ?? 0 }, undefined, e.rollAngle);
        const Iy = s.iy ?? s.iz, Iz = s.iz;
        // A drift along X bends the column about global Y, and one along Y about global X.
        const aboutY = Iy * ax.ey[1] ** 2 + Iz * ax.ez[1] ** 2;
        const aboutX = Iy * ax.ey[0] ** 2 + Iz * ax.ez[0] ** 2;
        const E = mat.e * 1000; // kN/m²
        const kX = (12 * E * aboutY) / h ** 3, kY = (12 * E * aboutX) / h ** 3;
        kx += kX; ky += kY; kyx += kY * lo.x; kxy += kX * lo.y;
      }
      for (const wall of m.walls ?? []) {
        const pts = wall.nodes.map((id) => P(id)).filter(Boolean) as Node[];
        const mat = m.materials.get(wall.materialId);
        if (pts.length < 3 || !mat) continue;
        const zs = pts.map((p) => p.z ?? 0);
        if (Math.abs(Math.min(...zs) - below) > TOL || Math.abs(Math.max(...zs) - lv.z) > TOL) continue;
        const base = pts.filter((p) => Math.abs((p.z ?? 0) - below) < TOL);
        const p0 = base[0]!, far = base.reduce((f, p) => (Math.hypot(p.x - p0.x, p.y - p0.y) > Math.hypot(f.x - p0.x, f.y - p0.y) ? p : f), p0);
        const L = Math.hypot(far.x - p0.x, far.y - p0.y), h = lv.z - below;
        if (L < TOL) continue;
        const kw = (mat.e * 1000 * wall.thickness) / ((h / L) ** 3 + 3 * (h / L));
        const c = Math.abs(far.x - p0.x) / L, sn = Math.abs(far.y - p0.y) / L;
        const cx = (p0.x + far.x) / 2, cy = (p0.y + far.y) / 2;
        kx += kw * c * c; ky += kw * sn * sn; kyx += kw * sn * sn * cx; kxy += kw * c * c * cy;
      }
    }
    const cm = W > 0 ? { x: wx / W, y: wy / W } : null;
    const cr = kx > 0 && ky > 0 ? { x: kyx / ky, y: kxy / kx } : null;
    out.push({
      levelId: lv.id, name: lv.name, z: lv.z, weight: W, cm, kx, ky, cr,
      ex: cm && cr ? cm.x - cr.x : null, ey: cm && cr ? cm.y - cr.y : null,
    });
  });
  return out;
}
