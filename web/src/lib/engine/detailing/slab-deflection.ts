/**
 * Slab deflections from the shells' own displacements.
 *
 * A point's vertical displacement is read inside the shell that holds it (bilinear on a quad,
 * its corners weighted by area on a triangle). A panel's deflection is each of its nodes' movement
 * relative to the plane its four corners move to, the largest kept: what the slab sags between
 * its supports. It is then carried to the cracked section and to the long term: the immediate
 * value times Ig/Ie (Table 24.2.3.5, the strip's service moment against its cracking moment, the
 * cracked inertia from the bars it has there) times 1 + λΔ (§24.2.4.1), against span/240 of the
 * shorter span unless the project says otherwise.
 *
 * Between two points the deflection of a third is measured against the chord between them: the
 * secant reading of a deflection, which is what a crack in a partition responds to.
 */
import { crackedInertia, crackingMoment, effectiveInertia, longTermMultiplier } from '../../codes/cirsoc201/effective-inertia';

type P = { x: number; y: number };
export interface DeflectionModel {
  nodes: ReadonlyMap<number, { x: number; y: number }>;
  shells: ReadonlyArray<{ nodes: readonly number[] }>;
  /** Vertical displacement of each node, m (positive up). */
  uz: ReadonlyMap<number, number>;
}

const cross = (a: P, b: P, c: P) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/** A point's vertical displacement, m, from the shell that holds it; null outside every shell. */
export function uzAt(m: DeflectionModel, p: P): number | null {
  for (const s of m.shells) {
    const pts = s.nodes.map((id) => m.nodes.get(id)!);
    if (pts.some((q) => !q)) continue;
    const tri = (a: number, b: number, c: number) => {
      const A = cross(pts[a]!, pts[b]!, pts[c]!);
      if (Math.abs(A) < 1e-12) return null;
      const w1 = cross(p, pts[b]!, pts[c]!) / A, w2 = cross(pts[a]!, p, pts[c]!) / A, w3 = 1 - w1 - w2;
      if (w1 < -1e-9 || w2 < -1e-9 || w3 < -1e-9) return null;
      return w1 * (m.uz.get(s.nodes[a]!) ?? 0) + w2 * (m.uz.get(s.nodes[b]!) ?? 0) + w3 * (m.uz.get(s.nodes[c]!) ?? 0);
    };
    if (pts.length === 3) { const v = tri(0, 1, 2); if (v !== null) return v; continue; }
    // A quad as its two triangles: exact for a planar rectangle's bilinear field along the diagonal.
    const v = tri(0, 1, 2) ?? tri(0, 2, 3);
    if (v !== null) return v;
  }
  return null;
}

/** The deflection of P against the chord from A to B, m (positive: P is below the chord). */
export function deflectionBetween(m: DeflectionModel, a: P, b: P, p?: P): { at: P; deflection: number; ratio: number } | null {
  const at = p ?? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const ua = uzAt(m, a), ub = uzAt(m, b), up = uzAt(m, at);
  if (ua === null || ub === null || up === null) return null;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const t = L > 0 ? ((at.x - a.x) * (b.x - a.x) + (at.y - a.y) * (b.y - a.y)) / (L * L) : 0;
  const chord = ua + (ub - ua) * t;
  const deflection = chord - up;
  return { at, deflection, ratio: Math.abs(deflection) > 1e-12 ? L / Math.abs(deflection) : Infinity };
}

export interface PanelDeflection {
  immediate: number; nodeId: number | null;
  /** Ig/Ie of the most cracked strip, and the long-term multiplier. */
  crackFactor: number; lambda: number;
  total: number; limit: number; span: number; utilization: number;
}

/**
 * A panel's deflection: its nodes against the plane of its corners, carried to the cracked section
 * and the long term. `strip` gives the service moment per metre and the bars there for the cracking.
 */
export function panelDeflection(o: {
  m: DeflectionModel; nodeIds: readonly number[]; box: { x0: number; x1: number; y0: number; y1: number };
  thickness: number; cover: number; fc: number; Ec: number;
  /** Largest service moment per metre, kN·m/m, and the tension steel per metre there, m²/m. */
  serviceMoment: number; steelThere: number;
  limitN?: number;
}): PanelDeflection {
  const c = [[o.box.x0, o.box.y0], [o.box.x1, o.box.y0], [o.box.x1, o.box.y1], [o.box.x0, o.box.y1]].map(([x, y]) => uzAt(o.m, { x: x!, y: y! }) ?? 0);
  const plane = (x: number, y: number) => {
    const u = (x - o.box.x0) / Math.max(o.box.x1 - o.box.x0, 1e-9), v = (y - o.box.y0) / Math.max(o.box.y1 - o.box.y0, 1e-9);
    return (1 - u) * (1 - v) * c[0]! + u * (1 - v) * c[1]! + u * v * c[2]! + (1 - u) * v * c[3]!;
  };
  let immediate = 0, nodeId: number | null = null;
  for (const id of o.nodeIds) {
    const n = o.m.nodes.get(id), u = o.m.uz.get(id);
    if (!n || u === undefined) continue;
    const d = plane(n.x, n.y) - u;
    if (d > immediate) { immediate = d; nodeId = id; }
  }
  // Per metre strip: b = 1, d to the bars, n = Es/Ec.
  const b = 1, h = o.thickness, d = h - o.cover - 0.006;
  const Ig = (b * h ** 3) / 12;
  const n = 200000 / Math.max(o.Ec, 1);
  const Icr = crackedInertia({ b, h, d, dPrime: 0, As: o.steelThere, AsPrime: 0, n }).Icr;
  const Ie = effectiveInertia(Ig, Icr, crackingMoment(b, h, o.fc), o.serviceMoment);
  const crackFactor = Ig / Math.max(Ie, 1e-12);
  const lambda = longTermMultiplier(0);
  const total = immediate * crackFactor * (1 + lambda);
  const span = Math.min(o.box.x1 - o.box.x0, o.box.y1 - o.box.y0);
  const limit = span / (o.limitN ?? 240);
  return { immediate, nodeId, crackFactor, lambda, total, limit, span, utilization: limit > 0 ? total / limit : Infinity };
}
