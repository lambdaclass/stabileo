/**
 * The direct analysis method against closed forms: a cantilever column carrying its notional
 * load, amplified on 0.8·EI exactly as the elastic P-Δ solution says; τb from C2.3(b); gravity
 * shared to the nodes by statics; and notional loads that follow the lateral load only past a
 * drift ratio of 1.7.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import '../../store/index';
import { initSolver } from '../wasm-solver';
import { evaluateDiagramAt } from '../diagrams-3d';
import { runDirectAnalysis, tauBOf, nodeGravity, notionalLoads, mainThreadPDelta } from '../direct-analysis';
import { buildSolverInput3D, caseSolverLoads3D, comboSolverLoads3D } from '../solver-service';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); });

const data = () => {
  const m = modelStore.model;
  return { nodes: m.nodes, elements: m.elements, supports: m.supports, loads: m.loads, materials: m.materials, sections: m.sections };
};

describe('τb, C2.3(b)', () => {
  it('is one up to half the squash load, then 4r(1 − r)', () => {
    expect(tauBOf(50, 100)).toBe(1);
    expect(tauBOf(75, 100)).toBeCloseTo(0.75, 12);
    expect(tauBOf(90, 100)).toBeCloseTo(0.36, 12);
    expect(tauBOf(0, 100)).toBe(1);
  });
});

describe('gravity at the nodes', () => {
  it('a uniform load on a beam goes half to each end; a point load by the lever rule', () => {
    const a = modelStore.addNode(0, 0, 3), b = modelStore.addNode(6, 0, 3);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addDistributedLoad3D(e, 0, 0, -10, -10);
    modelStore.addPointLoadOnElement3D(e, 2, 0, -9);
    const input = buildSolverInput3D({ ...data(), loads: [] }, false, false)!;
    const loads = comboSolverLoads3D({ id: 1, name: 'c', factors: [{ caseId: 1, factor: 1 }] } as never, caseSolverLoads3D(data(), modelStore.model.loadCases, false, false));
    const { gravity, lateral } = nodeGravity(input, loads);
    expect(gravity.get(a)! + gravity.get(b)!).toBeCloseTo(60 + 9, 9);
    expect(gravity.get(a)!).toBeCloseTo(30 + 6, 9);
    expect(Math.hypot(lateral.x, lateral.y)).toBeLessThan(1e-9);
    const n = notionalLoads(gravity, 0.002, 1, 0);
    expect(n.reduce((s, l) => s + (l.data as { fx: number }).fx, 0)).toBeCloseTo(0.002 * 69, 12);
  });
});

describe('past the critical load', () => {
  it('a combination with no second-order equilibrium is flagged and publishes no forces', async () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 4);
    modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addNodalLoad3D(b, 0, 0, -300, 0, 0, 0);
    const combo = modelStore.addCombination('1.0 D', [{ caseId: 1, factor: 1 }]);
    const r = await runDirectAnalysis(data() as never, modelStore.model.loadCases, modelStore.model.combinations, { includeSelfWeight: false });
    if (typeof r === 'string') throw new Error(r);
    expect(r.info.get(combo)!.stable).toBe(false);
    expect(r.perCombo.has(combo)).toBe(false);
  });
});

describe('the direct analysis of a cantilever column', () => {
  // 60 kN, under the weak-axis critical load of the default section's column (about 111 kN at 0.8·E).
  const L = 4, P = 60;
  function column(lateral = 0) {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, L);
    modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addNodalLoad3D(b, lateral, 0, -P, 0, 0, 0);
    const combo = modelStore.addCombination('1.0 D', [{ caseId: 1, factor: 1 }]);
    return { a, b, combo };
  }

  it('gravity only: the notional load at the head, amplified on 0.8·EI as the exact P-Δ solution', async () => {
    const { combo } = column();
    const r = await runDirectAnalysis(data() as never, modelStore.model.loadCases, modelStore.model.combinations, { includeSelfWeight: false });
    if (typeof r === 'string') throw new Error(r);
    const info = r.info.get(combo)!;
    expect(info.notional === '+X' || info.notional === '-X' || info.notional === '+Y' || info.notional === '-Y').toBe(true);
    // The column is doubly symmetric and square to X and Y only if its section is; the governing
    // direction bends it about its weaker axis, the larger sway.
    const sec = [...modelStore.sections.values()][0]!;
    const E = [...modelStore.materials.values()][0]!.e * 1000 * 0.8;
    const weakI = Math.min(sec.iy ?? sec.iz, sec.iz);
    const k = Math.sqrt(P / (E * weakI));
    const H = 0.002 * P;
    const exact = (H * Math.tan(k * L)) / k;
    const f = r.perCombo.get(combo)!.elementForces.find((x) => x.elementId === [...modelStore.elements.keys()][0])!;
    const base = Math.max(Math.abs(f.myStart), Math.abs(f.mzStart));
    expect(Math.abs(base - exact) / exact).toBeLessThan(0.01);
    // Every material at 80 %: the linear moment is H·L, and the second-order one is above it.
    expect(base).toBeGreaterThan(H * L);
  });

  it('with a lateral load and a small drift ratio, no notional load is added', async () => {
    const { combo } = column(5);
    const r = await runDirectAnalysis(data() as never, modelStore.model.loadCases, modelStore.model.combinations, { includeSelfWeight: false });
    if (typeof r === 'string') throw new Error(r);
    const info = r.info.get(combo)!;
    expect(info.b2).toBeLessThan(1.7);
    expect(info.notional).toBe('none');
  });

  it('τb = 1 with the extra 0.001·Yi puts a notional load in every combination', async () => {
    const { combo } = column(5);
    const r = await runDirectAnalysis(data() as never, modelStore.model.loadCases, modelStore.model.combinations, { includeSelfWeight: false, settings: { notional: 0.002, tauB: 'unity' } });
    if (typeof r === 'string') throw new Error(r);
    expect(r.info.get(combo)!.notional).toBe('lateral');
  });

  it('does not hide a nonconvergent notional direction behind another direction', async () => {
    const { combo } = column();
    const r = await runDirectAnalysis(data(), modelStore.model.loadCases,
      modelStore.model.combinations.filter(c => c.id === combo), {
        includeSelfWeight: false,
        run: async (...args) => {
          const answer = await mainThreadPDelta(...args);
          const failed = args[0].loads.some(l => l.type === 'nodal' && l.data.fy > 0);
          if (!failed) return answer;
          return { ...answer, converged: false, results: { ...answer.results,
            displacements: answer.results.displacements.map(d => ({ ...d, ux: d.ux * .01, uy: d.uy * .01 })),
          } };
        },
      });
    if (typeof r === 'string') throw Error(r);
    expect(r.info.get(combo)).toMatchObject({ notional: '+Y', converged: false });
    expect(r.perCombo.has(combo)).toBe(false);
  });

  it('requires the outer stiffness iteration to converge as well as each P-Delta solve', async () => {
    const { combo } = column(5);
    let calls = 0;
    const r = await runDirectAnalysis(data(), modelStore.model.loadCases,
      modelStore.model.combinations.filter(c => c.id === combo), {
        includeSelfWeight: false,
        run: async (...args) => {
          const answer = await mainThreadPDelta(...args);
          const ratio = ++calls % 2 ? .6 : .8;
          return { ...answer, results: { ...answer.results, elementForces: answer.results.elementForces.map(f => {
            const el = modelStore.elements.get(f.elementId)!;
            const pns = modelStore.materials.get(el.materialId)!.fy! * 1000 * modelStore.sections.get(el.sectionId)!.a;
            return { ...f, nStart: -ratio * pns, nEnd: -ratio * pns };
          }) } };
        },
      });
    if (typeof r === 'string') throw Error(r);
    expect(calls).toBe(6);
    expect(r.info.get(combo)?.converged).toBe(false);
    expect(r.perCombo.has(combo)).toBe(false);
  });

});

import { memberContexts } from '../design/other-codes/run';

describe('the design reads the direct analysis with K = 1', () => {
  it('a member carrying K = 2 is checked at K = 1 on direct-analysis forces, and keeps its K otherwise', async () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 4);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.updateElement(e, { kStrong: 2, kWeak: 2 } as never);
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addNodalLoad3D(b, 0, 0, -60, 0, 0, 0);
    const combo = modelStore.addCombination('1.0 D', [{ caseId: 1, factor: 1 }]);
    const r = await runDirectAnalysis(data() as never, modelStore.model.loadCases, modelStore.model.combinations, { includeSelfWeight: false });
    if (typeof r === 'string') throw new Error(r);
    const combos = modelStore.model.combinations.filter((c) => c.id === combo);
    const direct = memberContexts(modelStore.model as never, r.perCombo, combos, undefined, { unitK: true });
    const linear = memberContexts(modelStore.model as never, r.perCombo, combos);
    expect(direct[0]).toMatchObject({ kStrong: 1, kWeak: 1 });
    expect(linear[0]).toMatchObject({ kStrong: 2, kWeak: 2 });
  });
});

describe('τb and the material', () => {
  it('a concrete column is not given τb, however loaded: its fy is f\'c', async () => {
    // A 0.4 × 0.4 concrete column, 3 m, under 1.5·f'c·Ag: past it τb would be zero, and its
    // flexural stiffness with it.
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
    const e = modelStore.addElement(a, b, 'frame');
    const mat = modelStore.addMaterial({ name: 'H-25', e: 25000, nu: 0.2, rho: 24, fy: 25 } as never);
    const sec = modelStore.addSection({ name: 'C40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.0036 } as never);
    modelStore.updateElementMaterial(e, mat);
    modelStore.updateElementSection(e, sec);
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addNodalLoad3D(b, 1, 0, -1.5 * 25_000 * 0.16, 0, 0, 0);
    const combo = modelStore.addCombination('1.0 D', [{ caseId: 1, factor: 1 }]);
    const r = await runDirectAnalysis(data() as never, modelStore.model.loadCases, modelStore.model.combinations, { includeSelfWeight: false, settings: { notional: 0.002, tauB: 'iterate' } });
    if (typeof r === 'string') throw new Error(r);
    expect(r.info.get(combo)!.stable).toBe(true);
    expect(r.perCombo.get(combo)!.elementForces.find((f) => f.elementId === e)).toBeDefined();
  });
});

/*
 * The loads of the PRO — 21 kinds: a moment inside a span cuts the member, and a load case's
 * imposed displacement goes with the case's factor. The direct analysis solves the structure the
 * linear solve does, and reads back one member.
 */
describe('the direct analysis takes the loads the linear solve takes', () => {
  const dam = async () => {
    const r = await runDirectAnalysis({ ...data(), analysis: modelStore.model.analysis } as never, modelStore.model.loadCases, modelStore.model.combinations, { includeSelfWeight: false });
    if (typeof r === 'string') throw new Error(r);
    return r;
  };

  it('a moment at a third of a simply supported span: the member cut there, one member read back, the jump M', async () => {
    const L = 6, M = 12, x0 = L / 3;
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'pinned3d'); modelStore.addSupport(b, 'pinned3d');
    modelStore.updateSupport([...modelStore.supports.values()][1]!.id, { dofRestraints: { tx: false, ty: true, tz: true, rx: true, ry: false, rz: false } });
    modelStore.addLoadEntry({ type: 'pointOnElement3d', data: { id: 0, elementId: e, a: x0, py: 0, pz: 0, my: M } });
    const combo = modelStore.addCombination('1.0 D', [{ caseId: 1, factor: 1 }]);
    const r = await dam();
    const res = r.perCombo.get(combo)!;
    // No piece and no node of the cut in what the design reads.
    expect(res.elementForces.map((f) => f.elementId)).toEqual([e]);
    expect(res.displacements.map((d) => d.nodeId).sort()).toEqual([a, b]);
    const f = res.elementForces[0]!;
    expect(f.length).toBeCloseTo(L, 9);
    // Statically determinate and with no axial force: the second-order moment is the first-order one.
    const jump = evaluateDiagramAt(f, 'momentY', (x0 + 1e-6) / L) - evaluateDiagramAt(f, 'momentY', (x0 - 1e-6) / L);
    expect(Math.abs(jump)).toBeCloseTo(M, 4);
    const fz = (id: number) => res.reactions.find((x) => x.nodeId === id)!.fz;
    expect(Math.abs(fz(a))).toBeCloseTo(M / L, 6);
  });

  it("a case's imposed displacement goes in times the case's factor, on 0.8·EI", async () => {
    const L = 5, DZ = -0.01;
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(b, 'fixed3d');
    const [c1, c2] = modelStore.model.loadCases;
    modelStore.addLoadEntry({ type: 'displacement3d', data: { id: 0, nodeId: b, dz: DZ, caseId: c1!.id } });
    modelStore.addDistributedLoad3D(e, 0, 0, -10, -10, undefined, undefined, c2!.id);
    const combo = modelStore.addCombination('1.5 A + B', [{ caseId: c1!.id, factor: 1.5 }, { caseId: c2!.id, factor: 1 }]);
    const lin = modelStore.solveCombinations3D(false, false, true);
    if (!lin || typeof lin === 'string') throw new Error(String(lin));
    const r = await dam();
    const res = r.perCombo.get(combo)!;
    expect(res.displacements.find((d) => d.nodeId === b)!.uz).toBeCloseTo(1.5 * DZ, 9);
    // No axial force: the settlement's moment, a stiffness one, at 0.8 of the linear; the load's, a
    // statics one, unchanged.
    const m0 = (x: typeof res) => evaluateDiagramAt(x.elementForces.find((f) => f.elementId === e)!, 'momentY', 0);
    expect(m0(res)).toBeCloseTo(0.8 * 1.5 * m0(lin.perCase.get(c1!.id)!) + m0(lin.perCase.get(c2!.id)!), 3);
  });

  it('refuses, as the linear solve does, an imposed displacement nothing restrains and a moment on a truss member', async () => {
    const L = 5;
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
    modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addNodalLoad3D(b, 0, 0, -1, 0, 0, 0);
    modelStore.addLoadEntry({ type: 'displacement3d', data: { id: 0, nodeId: b, dz: -0.01 } });
    modelStore.addCombination('1.0 D', [{ caseId: 1, factor: 1 }]);
    const lin = modelStore.solveCombinations3D(false, false, true);
    const r = await runDirectAnalysis(data() as never, modelStore.model.loadCases, modelStore.model.combinations, { includeSelfWeight: false });
    expect(typeof lin).toBe('string');
    expect(r).toBe(lin);

    modelStore.clear();
    const p = modelStore.addNode(0, 0, 0), q = modelStore.addNode(L, 0, 0), s = modelStore.addNode(L / 2, 0, 2);
    const t = modelStore.addElement(p, q, 'truss');
    modelStore.addElement(p, s, 'truss'); modelStore.addElement(s, q, 'truss');
    modelStore.addSupport(p, 'pinned3d'); modelStore.addSupport(q, 'pinned3d'); modelStore.addSupport(s, 'pinned3d');
    modelStore.addLoadEntry({ type: 'pointOnElement3d', data: { id: 0, elementId: t, a: 1, py: 0, pz: 0, my: 5 } });
    modelStore.addCombination('1.0 D', [{ caseId: 1, factor: 1 }]);
    const lin2 = modelStore.solveCombinations3D(false, false, true);
    const r2 = await runDirectAnalysis(data() as never, modelStore.model.loadCases, modelStore.model.combinations, { includeSelfWeight: false });
    expect(typeof lin2).toBe('string');
    expect(r2).toBe(lin2);
  });
});
