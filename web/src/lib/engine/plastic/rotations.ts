/**
 * Member-end rotations of a solved plane frame, and the rotation jump at a
 * hinge: what the plastic hinge turns by in one step of the collapse analysis.
 *
 * At a released end the member's own slope is not the joint's, and the solver
 * reports only the joint. It follows from the member's elastic curve: with the
 * curvature κ = M/EI (sagging positive),
 *   θ_I = (v_J − v_I)/L − (1/L) ∫ (L − x) κ dx,   θ_J = θ_I + ∫ κ dx,
 * v being the end displacements across the member. Gauss points between the
 * member's load positions make the integrals exact for its moment diagram.
 */
import type { AnalysisResults, ElementForces, SolverInput } from '../types';
import { computeDiagramValueAt } from '../diagrams';

const G = [-Math.sqrt(3 / 5), 0, Math.sqrt(3 / 5)];
const W = [5 / 9, 8 / 9, 5 / 9];

export function memberEndRotations(input: SolverInput, res: { displacements: AnalysisResults['displacements'] }, ef: ElementForces): { ti: number; tj: number } | null {
  const e = input.elements.get(ef.elementId);
  if (!e || e.type === 'truss') return null;
  const a = input.nodes.get(e.nodeI)!, b = input.nodes.get(e.nodeJ)!;
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  const c = (b.x - a.x) / L, s = (b.z - a.z) / L;
  const EI = (input.materials.get(e.materialId)?.e ?? 0) * 1000 * (input.sections.get(e.sectionId)?.iz ?? 0);
  if (!(EI > 0)) return null;
  const da = res.displacements.find((d) => d.nodeId === e.nodeI), db = res.displacements.find((d) => d.nodeId === e.nodeJ);
  if (!da || !db) return null;
  const vI = -da.ux * s + da.uz * c, vJ = -db.ux * s + db.uz * c;
  const cuts = new Set<number>([0, L]);
  for (const p of ef.pointLoads ?? []) if (p.a > 0 && p.a < L) cuts.add(p.a);
  for (const d of ef.distributedLoads ?? []) { if (d.a > 0 && d.a < L) cuts.add(d.a); if (d.b > 0 && d.b < L) cuts.add(d.b); }
  const xs = [...cuts].sort((x, y) => x - y);
  let k0 = 0, k1 = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const h = (xs[i + 1] - xs[i]) / 2, mid = (xs[i + 1] + xs[i]) / 2;
    if (h < 1e-14) continue;
    G.forEach((g, j) => {
      const x = mid + g * h;
      const kappa = -computeDiagramValueAt('moment', x / L, ef) / EI;
      k0 += W[j] * h * kappa;
      k1 += W[j] * h * kappa * (L - x);
    });
  }
  const ti = (vJ - vI) / L - k1 / L;
  return { ti, tj: ti + k0 };
}
