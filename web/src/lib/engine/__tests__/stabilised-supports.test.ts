/**
 * The vanishing rotational springs `stabiliseOrphanRotations3D` adds are not
 * part of the structure. Every 3D path that returns reactions drops the rows
 * of nodes it supported only for that (single solve, multi-case with its
 * combinations and envelope, P-Delta), and the force method counts the
 * user's own springs on a stabilised support — the stiffness-method check
 * has to agree.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, uiStore } from '../../store';
import { solvePDelta3D, solveMultiCase3D } from '../wasm-solver';
import { stabiliseOrphanRotations3D } from '../orphan-rotations-3d';
import { solveForceMethod3D } from '../force-method/solve-3d';
import type { AnalysisResults3D, SolverInput3D, SolverSupport3D } from '../types-3d';

/** Space portal + a free apex node n7 met only by truss bars (gets a 'created' support). */
function portalWithTrussApex() {
  historyStore.clear(); uiStore.analysisMode = '3d'; modelStore.clear();
  const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(0, 0, 3), modelStore.addNode(4, 0, 3), modelStore.addNode(4, 2, 3), modelStore.addNode(4, 2, 0)];
  modelStore.addElement(n[0], n[1]); modelStore.addElement(n[1], n[2]);
  modelStore.addElement(n[2], n[3]); modelStore.addElement(n[3], n[4]);
  modelStore.addSupport(n[0], 'fixed3d' as never);
  modelStore.addSupport(n[4], 'fixed3d' as never);
  const n7 = modelStore.addNode(2, 1, 5);
  modelStore.addElement(n[1], n7, 'truss');
  modelStore.addElement(n[2], n7, 'truss');
  modelStore.addElement(n[3], n7, 'truss');
  // Dead (case 1) and Live (case 2) — the default combinations use both.
  modelStore.addNodalLoad3D(n[2], 5, 5, -10, 0, 0, 0, 1);
  modelStore.addNodalLoad3D(n7, 0, 0, -6, 0, 0, 0, 2);
  return { real: [n[0], n[4]].sort(), n7 };
}
const ids = (r: AnalysisResults3D) => r.reactions.map((x) => x.nodeId).sort();

describe('a node supported only by the stabiliser reports no reaction, on any path', () => {
  beforeEach(() => { uiStore.analysisMode = '3d'; });

  it('single solve (control): no reaction row at the truss-only free node', () => {
    const { real } = portalWithTrussApex();
    const r = modelStore.solve3D(false, false, false);
    expect(typeof r, String(r)).not.toBe('string');
    expect(ids(r as AnalysisResults3D)).toEqual(real);
  });

  it('solveCombinations3D: per-case, per-combo and envelope carry no reaction row at the free node', () => {
    const { real, n7 } = portalWithTrussApex();
    const b = modelStore.solveCombinations3D(false, false, false);
    expect(typeof b, String(b)).not.toBe('string');
    const bundle = b as Exclude<typeof b, string | null>;
    const leaks: string[] = [];
    for (const [k, r] of bundle.perCase) if (ids(r).includes(n7)) leaks.push(`case ${k}`);
    for (const [k, r] of bundle.perCombo) if (ids(r).includes(n7)) leaks.push(`combo ${k}`);
    const env = bundle.envelope.maxAbsResults3D;
    if (env && ids(env).includes(n7)) leaks.push('envelope');
    expect(leaks, `leaking node ${n7}; real supports ${real}`).toEqual([]);
  });

  it('solveMultiCase3D (PRO multi-case panel path) carries no reaction row at the free node', () => {
    const { n7 } = portalWithTrussApex();
    const base = modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;
    const out = solveMultiCase3D({
      solver: { ...base, loads: [] },
      loadCases: [{ name: 'A', loads: base.loads }],
      combinations: [{ name: 'C', factors: { A: 1.5 } }],
    });
    const leaks = [...out.caseResults, ...out.combinationResults]
      .filter((c: { results: AnalysisResults3D }) => ids(c.results).includes(n7)).map((c: { name: string }) => c.name);
    expect(leaks).toEqual([]);
  });

  it('P-Delta 3D carries no reaction row at the free node', () => {
    const { n7 } = portalWithTrussApex();
    const input = modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;
    const r = solvePDelta3D(input);
    const res: AnalysisResults3D = r.results ?? r;
    expect(ids(res)).not.toContain(n7);
  });
});

/* ── The force method on a stabilised support ─────────────────────── */

const el = (id: number, i: number, j: number, rel: Record<string, boolean> = {}) => ({
  id, type: 'frame' as const, nodeI: i, nodeJ: j, materialId: 1, sectionId: 1,
  releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false, ...rel,
});
function portalInput(footRel: Record<string, boolean>, foot: SolverSupport3D): SolverInput3D {
  const P: Array<[number, number, number, number]> = [[1, 0, 0, 0], [2, 0, 0, 3], [3, 4, 0, 3], [4, 4, 2, 3], [5, 4, 2, 0]];
  return {
    nodes: new Map(P.map(([id, x, y, z]) => [id, { id, x, y, z }])),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 2e-4, j: 1.5e-4 }]]),
    elements: new Map([el(1, 1, 2, footRel), el(2, 2, 3), el(3, 3, 4), el(4, 4, 5)].map((e) => [e.id, e])),
    supports: new Map([[0, foot], [1, { nodeId: 5, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
    loads: [{ type: 'nodal', data: { nodeId: 3, fx: 5, fy: -3, fz: -10, mx: 0, my: 0, mz: 0 } }],
  } as unknown as SolverInput3D;
}

describe('a user rotational spring on a stabilised support still counts', () => {
  // Column 1→2 runs along global z; its torsion resists rotation about z at node 1.
  // The user gives the foot a torsional spring krz = 500. Releasing My at the foot
  // leaves one rotation unresisted, so the stabiliser adds krx/kry and marks 'springs'.
  const foot = (): SolverSupport3D => ({ nodeId: 1, rx: true, ry: true, rz: true, rrx: false, rry: false, rrz: false, krz: 500 });

  it('stabiliser keeps krz = 500 and marks the support springs (precondition)', () => {
    const input = portalInput({ releaseMyStart: true }, foot());
    stabiliseOrphanRotations3D(input);
    const s = input.supports.get(0)!;
    expect(s.stabilised).toBe('springs');
    expect(s.krz).toBe(500);
  });

  it('control: same spring, no release (not stabilised) — counted and verified', () => {
    const input = portalInput({}, foot());
    stabiliseOrphanRotations3D(input);
    expect(input.supports.get(0)!.stabilised).toBeUndefined();
    const r = solveForceMethod3D(input);
    expect(r.count.springs).toBe(1);
    expect(r.verification.ok).toBe(true);
  });

  it('the force method counts the user spring and matches the stiffness method', () => {
    const input = portalInput({ releaseMyStart: true }, foot());
    stabiliseOrphanRotations3D(input);
    const r = solveForceMethod3D(input);
    const report = { springs: r.count.springs, gh: r.count.gh, verification: r.verification };
    expect(report.springs, JSON.stringify(report)).toBe(1);
    expect(r.verification.ok, JSON.stringify(report)).toBe(true);
  });
});
