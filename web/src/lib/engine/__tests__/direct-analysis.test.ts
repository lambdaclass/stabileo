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
import { runDirectAnalysis, tauBOf, nodeGravity, notionalLoads } from '../direct-analysis';
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
