/**
 * Sway storeys and their moment magnifier δs, CIRSOC 201-2025 §6.6.4.3 and §6.6.4.6.
 *
 * A storey sways when its stability index Q = ΣPu·Δo / (Vus·lc) passes 0,05 in some combination
 * (§6.6.4.3(a)): ΣPu the axial load of its columns, Vus their shear and Δo the first-order drift
 * between its floors, both along the same horizontal direction, lc the storey height. Each
 * direction is read on its own and only where the storey carries a lateral shear, so a gravity
 * combination's numerical residue never makes a storey sway.
 *
 * δs = 1/(1 − Q) where that is at most 1,5 (§6.6.4.6.2(a)); past it, 1/(1 − ΣPu/(0,75·ΣPc)) with
 * Pc = π²·0,4·Ec·Ig/(k·lu)² and k the sway effective-length factor from Ψ (b). A storey whose ΣPu
 * reaches 0,75·ΣPc is unstable: δs is infinite and its columns fail.
 *
 * Ig is the column's smaller inertia, which gives the smaller Pc and the larger δs.
 */
import { computeLocalAxes3D } from '../local-axes-3d';
import type { AnalysisResults3D } from '../types-3d';

export const SWAY_Q_LIMIT = 0.05;

export interface StoreyStability {
  zLo: number; zHi: number;
  columns: number[];
  /** The largest Q over combinations and directions, its combination and direction. */
  Q: number; combo: string | null; direction: 'X' | 'Y' | null;
  sway: boolean;
  deltaS: number;
  method: 'nonSway' | 'Q' | 'Pc' | 'unstable';
}

type N = { id: number; x: number; y: number; z?: number };
type E = { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number; rollAngle?: number };

/** The sway effective-length factor from the joint restraints (the alignment chart's closed form). */
export function swayK(psiA: number, psiB: number): number {
  const a = Math.max(0, Math.min(20, psiA)), b = Math.max(0, Math.min(20, psiB));
  return Math.max(1, Math.sqrt((1.6 * a * b + 4 * (a + b) + 7.5) / (a + b + 7.5)));
}

export function storeyStability(input: {
  nodes: ReadonlyMap<number, N>;
  elements: ReadonlyMap<number, E>;
  sections: ReadonlyMap<number, { iz: number; iy?: number }>;
  materials: ReadonlyMap<number, { e: number }>;
  columns: readonly number[];
  perCombo: ReadonlyMap<number, AnalysisResults3D>;
  comboNames?: ReadonlyMap<number, string>;
  psi?: (columnId: number) => { psiA: number; psiB: number };
}): StoreyStability[] {
  const key = (z: number) => Math.round(z * 1000);
  const storeys = new Map<string, { zLo: number; zHi: number; cols: Array<{ id: number; lo: number; hi: number; lc: number; ex: [number, number, number]; ey: [number, number, number]; ez: [number, number, number]; Ig: number; Ec: number }> }>();
  for (const id of input.columns) {
    const e = input.elements.get(id);
    const a = e && input.nodes.get(e.nodeI), b = e && input.nodes.get(e.nodeJ);
    if (!e || !a || !b) continue;
    const [lo, hi] = (a.z ?? 0) <= (b.z ?? 0) ? [a, b] : [b, a];
    const lc = (hi.z ?? 0) - (lo.z ?? 0);
    if (!(lc > 1e-3)) continue;
    const ax = computeLocalAxes3D({ id: a.id, x: a.x, y: a.y, z: a.z ?? 0 }, { id: b.id, x: b.x, y: b.y, z: b.z ?? 0 }, undefined, e.rollAngle);
    const s = input.sections.get(e.sectionId), m = input.materials.get(e.materialId);
    const k = `${key(lo.z ?? 0)}:${key(hi.z ?? 0)}`;
    const st = storeys.get(k) ?? { zLo: lo.z ?? 0, zHi: hi.z ?? 0, cols: [] };
    st.cols.push({ id, lo: lo.id, hi: hi.id, lc, ex: ax.ex, ey: ax.ey, ez: ax.ez, Ig: s ? Math.min(s.iz, s.iy ?? s.iz) : 0, Ec: (m?.e ?? 0) * 1000 });
    storeys.set(k, st);
  }

  const out: StoreyStability[] = [];
  for (const st of storeys.values()) {
    let Q = 0, combo: string | null = null, direction: 'X' | 'Y' | null = null, sumPu = 0;
    for (const [cid, res] of input.perCombo) {
      const forces = new Map(res.elementForces.map((f) => [f.elementId, f]));
      const disp = new Map(res.displacements.map((d) => [d.nodeId, d]));
      let P = 0, Vx = 0, Vy = 0, dx = 0, dy = 0, n = 0, lc = 0;
      for (const c of st.cols) {
        const f = forces.get(c.id);
        if (!f) continue;
        P += Math.max(0, -Math.min(f.nStart, f.nEnd));
        // The column's shear as a global vector: Vy along local y, Vz along local z.
        Vx += f.vyStart * c.ey[0] + f.vzStart * c.ez[0];
        Vy += f.vyStart * c.ey[1] + f.vzStart * c.ez[1];
        const u = disp.get(c.hi), l = disp.get(c.lo);
        if (u && l) { dx += u.ux - l.ux; dy += u.uy - l.uy; n++; }
        lc += c.lc;
      }
      if (n === 0 || !(P > 0)) continue;
      lc /= st.cols.length; dx /= n; dy /= n;
      for (const [V, d, dir] of [[Vx, dx, 'X'], [Vy, dy, 'Y']] as const) {
        if (Math.abs(V) < Math.max(0.5, 1e-3 * P)) continue;
        const q = (P * Math.abs(d)) / (Math.abs(V) * lc);
        if (q > Q) { Q = q; combo = input.comboNames?.get(cid) ?? String(cid); direction = dir; sumPu = P; }
      }
    }
    const sway = Q > SWAY_Q_LIMIT;
    let deltaS = 1, method: StoreyStability['method'] = 'nonSway';
    if (sway) {
      const a = Q < 1 ? 1 / (1 - Q) : Number.POSITIVE_INFINITY;
      if (a <= 1.5) { deltaS = a; method = 'Q'; }
      else {
        const sumPc = st.cols.reduce((s, c) => {
          const psi = input.psi?.(c.id) ?? { psiA: 1, psiB: 1 };
          const k = swayK(psi.psiA, psi.psiB);
          return s + (Math.PI ** 2 * 0.4 * c.Ec * c.Ig) / (k * c.lc) ** 2;
        }, 0);
        const r = sumPu / (0.75 * sumPc);
        if (r < 1) { deltaS = Math.max(1, 1 / (1 - r)); method = 'Pc'; }
        else { deltaS = Number.POSITIVE_INFINITY; method = 'unstable'; }
      }
    }
    out.push({ zLo: st.zLo, zHi: st.zHi, columns: st.cols.map((c) => c.id), Q, combo, direction, sway, deltaS, method });
  }
  return out.sort((a, b) => a.zLo - b.zLo);
}
