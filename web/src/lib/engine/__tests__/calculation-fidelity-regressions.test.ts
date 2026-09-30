import { afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { resultsStore, uiStore } from '../../store/index';
import { runGlobalSolve } from '../live-calc';
import { initSolver } from '../wasm-solver';
import { scaleSolverLoad, buildSolverInput3D } from '../solver-service';
import { convertThermalQuadLoad } from '../solver-shells';
import { G } from '../dynamics/requests';
import { withMassSource } from '../dynamics/mass-source-model';
import { evaluateDiagramAt } from '../diagrams-3d';
import { nodeGravity } from '../direct-analysis';
import { solveDetailed3D } from '../solver-detailed-3d';
import { SETTLEMENT_CASE_ID } from '../settlement-case';
import type { AnalysisResults3D } from '../types-3d';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); resultsStore.clear(); });
afterEach(() => { uiStore.analysisMode = '2d'; });
function result<T>(r: T | string | null): T {
  if (!r || typeof r === 'string') throw new Error(String(r));
  return r;
}
const sumZ = (r: AnalysisResults3D) => r.reactions.reduce((a, b) => a + b.fz, 0);
const endForces = (r: AnalysisResults3D, id: number) => r.elementForces.find(f => f.elementId === id)!;

it('does not add stated self-weight again in the settlement-only case', () => {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
  modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed3d');
  modelStore.addSupport(b, 'fixed3d', undefined, { dz: -.001 });
  modelStore.setAnalysis({ selfWeight: [{ caseId: 1, direction: 'Z', factor: -1 }] });
  const c = modelStore.addCombination('D', [{ caseId: 1, factor: 1 }]);
  const r = result(modelStore.solveCombinations3D(false, false, true));
  expect(sumZ(r.perCase.get(SETTLEMENT_CASE_ID)!)).toBeCloseTo(0, 8);
  expect(sumZ(r.perCombo.get(c)!)).toBeCloseTo(sumZ(r.perCase.get(1)!), 8);
});

it('recovers the axial end forces under a uniform axial member load', () => {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
  const e = modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed3d');
  modelStore.addDistributedLoad3D(e, 0, 0, 0, 0, undefined, undefined, 1, { qXI: -4, qXJ: -4 });
  const r = result(modelStore.solve3D(false, false, true));
  const f = endForces(r, e);
  expect(f.nStart).toBeCloseTo(-12, 8);
  expect(f.nEnd).toBeCloseTo(0, 8);
});

it('honours P-Delta in the async solve used by live calculation', async () => {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 4);
  modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed3d');
  modelStore.addNodalLoad3D(b, 0, .12, -60, 0, 0, 0, 1);
  const c = modelStore.addCombination('D', [{ caseId: 1, factor: 1 }]);
  modelStore.setAnalysis({ perCombination: 'pdelta' });
  const sync = result(modelStore.solveCombinations3D(false, false, true));
  const asyncResult = result(await modelStore.solveCombinations3DParallel(false, false, true));
  const uy = (r: AnalysisResults3D) => r.displacements.find(d => d.nodeId === b)!.uy;
  expect(uy(asyncResult.perCombo.get(c)!)).toBeCloseTo(uy(sync.perCombo.get(c)!), 9);
  expect(asyncResult.perCombo.get(c)!.secondOrder).toMatchObject({ converged: true, stable: true });
  expect(Math.abs(uy(asyncResult.perCombo.get(c)!))).toBeGreaterThan(Math.abs(uy(result(modelStore.solve3D(false, false, true)))) * 1.5);
});

it.each([2, -1])('factors a temperature once by %s, preserving the expansion coefficient', factor => {
  const thermal = convertThermalQuadLoad({ id: 1, quadId: 1, dtUniform: 20, dtGradient: 0 }, .000012)[0]!;
  const l = scaleSolverLoad(thermal, factor);
  expect(l.data).toMatchObject({ alpha: .000012, dtUniform: 20 * factor });
});

it('counts structural self-weight only once in a mass source', () => {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
  modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed3d');
  modelStore.addSupport(b, 'fixed3d');
  modelStore.setAnalysis({ selfWeight: [{ caseId: 1, direction: 'Z', factor: -1 }] });
  const m = modelStore.model;
  const mass = withMassSource(m, m.loadCases, { kind: 'custom', factors: [{ caseId: 1, factor: 1 }] }, buildSolverInput3D(m)!);
  expect(mass.report.addedT.get(1) ?? 0).toBeCloseTo(0, 10);
});

it('does not silently discard a loaded free node when all its one-way bars go slack', () => {
  const a = modelStore.addNode(0, 0, 0);
  const roots = [modelStore.addNode(-3, 0, 0), modelStore.addNode(0, -3, 0), modelStore.addNode(0, 0, -3)];
  for (const n of roots) {
    const e = modelStore.addElement(n, a, 'frame');
    modelStore.updateElement(e, { behaviour: 'tensionOnly' });
    modelStore.addSupport(n, 'fixed3d');
  }
  modelStore.addElement(roots[0]!, roots[1]!, 'frame');
  modelStore.addNodalLoad3D(a, -10, -10, -10, 0, 0, 0, 1);
  const r = modelStore.solve3D(false, false, true);
  expect(r).toEqual(expect.stringContaining(`loaded node ${a} is held only by slack members`));
});

it.each([true, false])('keeps selected-member self-weight after splitting (keep ID: %s)', (keepOriginalId) => {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
  const e = modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed3d');
  modelStore.addSupport(b, 'fixed3d');
  modelStore.setAnalysis({ selfWeight: [{ caseId: 1, direction: 'Z', factor: -1, elements: [e] }] });
  const before = sumZ(result(modelStore.solve3D(false, false, true)));
  modelStore.splitMember(e, [.5], { keepOriginalId });
  const after = sumZ(result(modelStore.solve3D(false, false, true)));
  expect(after).toBeCloseTo(before, 8);
});

it('retains a partial axial triangle in diagrams, combinations, gravity and detailed analysis', async () => {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 4);
  const e = modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed3d');
  modelStore.addDistributedLoad3D(e, 0, 0, 0, 0, 1, 3, 1, { qXI: 0, qXJ: -6 });
  const c = modelStore.addCombination('2D', [{ caseId: 1, factor: 2 }]);
  const bundle = result(await modelStore.solveCombinations3DParallel(false, false, true));
  const f = endForces(bundle.perCase.get(1)!, e);
  for (const [t, n] of [[0, -6], [.25, -6], [.5, -4.5], [.75, 0], [1, 0]]) {
    expect(evaluateDiagramAt(f, 'axial', t!)).toBeCloseTo(n!, 9);
    expect(evaluateDiagramAt(endForces(bundle.perCombo.get(c)!, e), 'axial', t!)).toBeCloseTo(2 * n!, 9);
  }
  const input = buildSolverInput3D(modelStore.model)!;
  const g = nodeGravity(input, input.loads).gravity;
  expect(g.get(a)).toBeCloseTo(2.5, 9);
  expect(g.get(b)).toBeCloseTo(3.5, 9);
  const detailed = solveDetailed3D(input);
  const df = detailed.elementForces.find(f => f.elementId === e)!.fLocalFinal;
  expect(-df[0]!).toBeCloseTo(-6, 9);
  expect(df[6]!).toBeCloseTo(0, 9);
  const mass = withMassSource(modelStore.model, modelStore.model.loadCases, { kind: 'custom', factors: [{ caseId: 1, factor: 1 }] }, input);
  expect(mass.report.addedT.get(1)).toBeCloseTo(6 / G, 8);
});

it('solves All loads jointly when opposite load cases activate different diagonals', async () => {
  const n1 = modelStore.addNode(0, 0, 0), n2 = modelStore.addNode(4, 0, 0);
  const n3 = modelStore.addNode(0, 0, 3), n4 = modelStore.addNode(4, 0, 3);
  for (const [a, b] of [[n1, n3], [n2, n4], [n3, n4]]) modelStore.addElement(a!, b!, 'frame');
  for (const [a, b] of [[n1, n4], [n2, n3]]) {
    const e = modelStore.addElement(a!, b!, 'frame');
    modelStore.updateElement(e, { behaviour: 'tensionOnly' });
  }
  for (const n of [n1, n2]) modelStore.addSupport(n, 'fixed3d');
  for (const n of [n3, n4]) modelStore.addSupport(n, 'custom3d', undefined, {
    dofRestraints: { tx: false, ty: true, tz: false, rx: true, ry: false, rz: true },
  });
  const live = modelStore.addLoadCase('reverse', 'L');
  modelStore.setAnalysis({ selfWeight: [] });
  modelStore.addNodalLoad3D(n3, 10, 0, 0, 0, 0, 0, 1);
  modelStore.addNodalLoad3D(n3, -10, 0, 0, 0, 0, 0, live);
  modelStore.addCombination('together', [{ caseId: 1, factor: 1 }, { caseId: live, factor: 1 }]);
  uiStore.analysisMode = 'pro';
  await runGlobalSolve();
  resultsStore.activeView = 'single';
  resultsStore.activeCaseId = null;
  const r = result(resultsStore.results3D);
  expect(r.nonlinear).toMatchObject({ converged: true, slack: [] });
  for (const f of r.elementForces) {
    expect(f.nStart).toBeCloseTo(0, 9);
    expect(f.nEnd).toBeCloseTo(0, 9);
  }
});
