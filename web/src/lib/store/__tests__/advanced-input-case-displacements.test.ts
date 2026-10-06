/**
 * The input every advanced analysis is built on (`modelStore.buildSolverInput3D`: buckling, modal,
 * the dynamic ones, staged, influence lines, the kinematic report). A load case's imposed
 * displacement is that case's action, solved with the case (`engine/case-displacements.ts`); none of
 * these is a case's static solve, so it must not reach their supports as a settlement. A support's
 * own settlement still does.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import '../index';
import { initSolver, solve3D } from '../../engine/wasm-solver';
import { solvePDelta3DCorrected } from '../../engine/pdelta-forces';
import { evaluateDiagramAt } from '../../engine/diagrams-3d';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); });

describe("the advanced analyses' input", () => {
  it("carries no load case's imposed displacement on the supports", () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(5, 0, 0);
    modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(b, 'fixed3d');
    modelStore.addLoadEntry({ type: 'displacement3d', data: { id: 0, nodeId: b, dz: -0.01 } });
    const input = modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;
    const sb = [...input.supports.values()].find((s) => s.nodeId === b)!;
    expect(sb.dz ?? 0).toBe(0);
    // With no force, a structure on its supports alone does not move.
    const r = solve3D(input);
    if (typeof r === 'string') throw new Error(r);
    expect(Math.max(...r.elementForces.map((f) => Math.abs(f.myStart)))).toBeLessThan(1e-9);
  });

  it("keeps a support's own settlement, which happens once whatever the analysis", () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(5, 0, 0);
    modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(b, 'fixed3d');
    modelStore.updateSupport([...modelStore.supports.values()][1]!.id, { dz: -0.01 } as never);
    const input = modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;
    expect([...input.supports.values()].find((s) => s.nodeId === b)!.dz).toBeCloseTo(-0.01, 12);
  });

  /*
   * P-Delta of every load (the toolbar's and the PRO advanced tab's) solves what the linear "All
   * loads" solve does, every case at factor one: the cases' displacements are among those loads.
   */
  it('P-Delta of every load takes them, as the linear All-loads solve does', () => {
    const L = 5, DZ = -0.01, q = 10;
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(b, 'fixed3d');
    const [c1, c2] = modelStore.model.loadCases;
    modelStore.addLoadEntry({ type: 'displacement3d', data: { id: 0, nodeId: b, dz: DZ, caseId: c1!.id } });
    modelStore.addDistributedLoad3D(e, 0, 0, -q, -q, undefined, undefined, c2!.id);
    const sec = [...modelStore.sections.values()][0]!, mat = [...modelStore.materials.values()][0]!;
    const EI = mat.e * 1000 * sec.iy!;
    // As the toolbar builds it.
    const input = modelStore.buildSolverInput3D(false, false, { basic: false, expandMemberOffsets: false, caseDisplacements: true })!;
    const pd = solvePDelta3DCorrected(input);
    const linear = modelStore.solve3D(false, false, true);
    if (!linear || typeof linear === 'string') throw new Error(String(linear));
    expect(pd.results.displacements.find((d: { nodeId: number }) => d.nodeId === b)!.uz).toBeCloseTo(DZ, 9);
    const m0 = (r: typeof linear) => evaluateDiagramAt(r.elementForces.find((f) => f.elementId === e)!, 'momentY', 0);
    // No axial force: second order is first order, and both are the linear All-loads moment.
    expect(m0(pd.results)).toBeCloseTo(m0(linear), 6);
    // Which is the load's qL²/12 and the displacement's 6EIΔ/L² (Bernoulli; shear deformation
    // softens the engine's by a fraction of a percent).
    const settle = Math.abs(Math.abs(m0(pd.results)) - (q * L * L) / 12);
    const settleAlt = Math.abs(m0(pd.results)) + (q * L * L) / 12;
    const closed = (6 * EI * Math.abs(DZ)) / (L * L);
    expect(Math.min(Math.abs(settle / closed - 1), Math.abs(settleAlt / closed - 1))).toBeLessThan(0.005);
  });
});
