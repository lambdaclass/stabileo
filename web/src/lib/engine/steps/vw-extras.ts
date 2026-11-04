/**
 * The terms of the unit-load method that are not bar integrals of M and N:
 *
 *   springs        Σ r·R/k        (a spring stores virtual work like a bar)
 *   settlements    − Σ r·c        (the virtual reactions work on the imposed movements)
 *   temperature    Σ ∫ n·α·ΔT dx + Σ ∫ m·α·Δt/h dx  (the free thermal strain and curvature)
 *
 * r, n, m belong to the virtual state, R to the real one.
 */
import type { SolverInput } from '../types';
import type { PlaneModel } from './plane-model';
import type { Reference } from './reference';
import { loadAlpha, loadDepth } from '../thermal-alpha';
import { gauss } from './deformation-common';

export interface SpringTerm { node: number; comp: 0 | 1 | 2; k: number; R: number; r: number; value: number }
export interface SettlementTerm { node: number; comp: 0 | 1 | 2; c: number; r: number; value: number }
export interface ThermalTerm { member: number; dT: number; dTg: number; alpha: number; h: number; L: number; n: number; mMean: number; axial: number; bending: number; value: number }

export interface Extras {
  springs: SpringTerm[];
  settlements: SettlementTerm[];
  thermal: ThermalTerm[];
  total: number;
}

/** A spring's force in its own axes, R = −k·u, the force it puts on the structure. */
function springForce(k: number, comp: number, angle: number, d: { ux: number; uz: number; ry: number }): number {
  const c = Math.cos(angle), s = Math.sin(angle);
  const local = [c * d.ux + s * d.uz, -s * d.ux + c * d.uz, d.ry];
  return -k * local[comp];
}

export function vwExtras(pm: PlaneModel, input: SolverInput, real: Reference, virt: Reference): Extras {
  const zero = { ux: 0, uz: 0, ry: 0 };
  const springs: SpringTerm[] = [];
  const settlements: SettlementTerm[] = [];
  for (const s of input.supports.values()) {
    const dr = real.displacements.get(s.nodeId) ?? zero, dv = virt.displacements.get(s.nodeId) ?? zero;
    if (s.type === 'spring') {
      [s.kx, s.ky, s.kz].forEach((k, comp) => {
        if (!((k ?? 0) > 0)) return;
        const R = springForce(k!, comp, s.angle ?? 0, dr), r = springForce(k!, comp, s.angle ?? 0, dv);
        springs.push({ node: s.nodeId, comp: comp as 0 | 1 | 2, k: k!, R, r, value: (r * R) / k! });
      });
      continue;
    }
    const rv = virt.reactions.get(s.nodeId) ?? { rx: 0, rz: 0, my: 0 };
    [s.dx, s.dz, s.dry].forEach((c, comp) => {
      if (!c) return;
      const r = comp === 0 ? rv.rx : comp === 1 ? rv.rz : rv.my;
      settlements.push({ node: s.nodeId, comp: comp as 0 | 1 | 2, c, r, value: -r * c });
    });
  }
  const thermal: ThermalTerm[] = [];
  for (const l of input.loads) {
    if (l.type !== 'thermal') continue;
    const m = pm.members.get(l.data.elementId);
    const e = input.elements.get(l.data.elementId);
    const sec = e && input.sections.get(e.sectionId);
    if (!m || !sec) continue;
    const alpha = loadAlpha(l.data);
    const h = loadDepth(l.data.depth, sec.a, sec.iz);
    const n = virt.axial.get(m.id) ?? 0;
    const axial = n * alpha * l.data.dtUniform * m.L;
    const mMean = m.truss ? 0 : gauss(0, m.L, (x) => virt.momentAt(m.id, Math.min(Math.max(x / m.L, 1e-9), 1 - 1e-9))) / m.L;
    /* The load's ΔTg curves a member in the sense of a positive moment in the documents' sign: the tests against the matrix solve pin it. */
    const bending = m.truss || !l.data.dtGradient ? 0 : mMean * m.L * (alpha * l.data.dtGradient) / h;
    thermal.push({ member: m.id, dT: l.data.dtUniform, dTg: l.data.dtGradient ?? 0, alpha, h, L: m.L, n, mMean, axial, bending, value: axial + bending });
  }
  const total = [...springs, ...settlements, ...thermal].reduce((s, x) => s + x.value, 0);
  return { springs, settlements, thermal, total };
}
