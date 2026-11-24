import { beforeEach, expect, it } from 'vitest';
import { t } from '../../i18n';
import { modelFeatures } from '../../provenance/model-features';
import { modelStore, uiStore } from '../../store';
import { runDirectAnalysis } from '../direct-analysis';
import type { AnalysisResults } from '../types';
import type { AnalysisResults3D } from '../types-3d';
import { hasNonlinearBehaviour } from '../member-behaviour';
import {
  buildSolverInput2D, buildSolverInput3D, buildSolverLoads3D, prepareSolverInput3D,
  solveCombinations3D, solveCombinations3DParallel, validateAndSolve2D,
  validateAndSolve3D, validateAndSolve3DAsync,
} from '../solver-service';
import { solvePDelta, solvePDelta3D } from '../wasm-solver';

const loadCase = { id: 1, name: 'Applied couple', type: 'D' as const };
const combination = { id: 1, name: 'Applied couple only', factors: [{ caseId: loadCase.id, factor: 1 }] };
const couple = 5;
const length = 2;
const projectionLimit = 1e-10;

beforeEach(() => {
  uiStore.analysisMode = '3d';
  uiStore.useNative3DPresentation();
  uiStore.includeSelfWeight = false;
  modelStore.clear();
});

function cantilever(x: number, y: number, z: number, nonlinear = false) {
  const root = modelStore.addNode(0, 0, 0);
  const tip = modelStore.addNode(x, y, z);
  const member = modelStore.addElement(root, tip);
  modelStore.addSupportEntry({
    nodeId: root, type: uiStore.analysisMode === '2d' ? 'fixed' : 'fixed3d',
    ...(nonlinear ? { uplift: true } : {}),
  });
  return { root, member };
}

function legacyPoint(member: number, data: { a: number; p: number; px?: number; my?: number; mz?: number }) {
  modelStore.model.loads = [{
    type: 'pointOnElement', data: { id: 1, elementId: member, caseId: loadCase.id, ...data },
  }];
}

function refusal(member: number) {
  return t('svc.planarPointLoadNoProjection').replace('{load}', '1').replace('{n}', String(member));
}

for (const nonlinear of [false, true]) {
  it(`#2411 refuses a legacy planar couple on a global-Z member (nonlinear=${nonlinear})`, async () => {
    if (nonlinear) uiStore.analysisMode = 'pro';
    const { member } = cantilever(0, 0, length, nonlinear);
    legacyPoint(member, { a: 1, p: 0, mz: couple });
    const model = modelStore.model;
    const reason = refusal(member);
    expect(hasNonlinearBehaviour(model)).toBe(nonlinear);
    expect(modelFeatures(modelStore.snapshot()).has('unplaceablePlanarPointLoads')).toBe(true);
    expect.soft(validateAndSolve3D(model)).toBe(reason);
    expect.soft(await validateAndSolve3DAsync(model)).toBe(reason);
    expect.soft(solveCombinations3D(model, [loadCase], [combination])).toBe(reason);
    expect.soft(await solveCombinations3DParallel(model, [loadCase], [combination])).toBe(reason);
    expect.soft(await runDirectAnalysis(model, [loadCase], [combination], { includeSelfWeight: false })).toBe(reason);
    expect.soft(() => buildSolverInput3D(model)).toThrow(reason);
    expect.soft(() => prepareSolverInput3D(model, false).build(model.loads)).toThrow(reason);
    expect.soft(() => buildSolverLoads3D(model, model.loads, false, false)).toThrow(reason);
  });
}

it('#2411 refuses the dropped couple before P-Delta can solve', async () => {
  const { root, member } = cantilever(0, 0, length);
  legacyPoint(member, { a: 1, p: 0, mz: couple });
  modelStore.addNodalLoad3D(root, 1, 0, 0, 0, 0, 0, loadCase.id);
  const model = { ...modelStore.model, analysis: { ...modelStore.model.analysis, perCombination: 'pdelta' as const } };
  for (const solved of [
    solveCombinations3D(model, [loadCase], [combination]),
    await solveCombinations3DParallel(model, [loadCase], [combination]),
  ]) {
    const observed = solved && typeof solved !== 'string'
      ? solved.perCombo.get(combination.id)?.reactions.find(r => r.nodeId === root)
      : solved;
    expect.soft(observed).toBe(refusal(member));
  }
});

it('#2411 returns the load refusal when preparing a notional case', async () => {
  const { root, member } = cantilever(0, 0, length);
  legacyPoint(member, { a: 1, p: 0, mz: couple });
  modelStore.addNodalLoad3D(root, 0, 0, -1, 0, 0, 0, loadCase.id);
  const notional = { id: 2, name: 'Notional load', type: 'N' as const,
    notional: { sourceCaseId: loadCase.id, ratio: 0.002, dir: '+X' as const } };
  const cases = [loadCase, notional];
  const combinations = [{ ...combination, factors: [...combination.factors, { caseId: notional.id, factor: 1 }] }];
  const model = modelStore.model;
  expect.soft(solveCombinations3D(model, cases, combinations)).toBe(refusal(member));
  expect.soft(await solveCombinations3DParallel(model, cases, combinations)).toBe(refusal(member));
  expect.soft(await runDirectAnalysis(model, cases, combinations, { includeSelfWeight: false })).toBe(refusal(member));
});

for (const data of [{ p: 0, my: couple }, { p: 0, px: 1 }, { p: 1 }]) {
  it(`#2411 refuses an active planar point action below the projection limit ${JSON.stringify(data)}`, () => {
    const { member } = cantilever(projectionLimit / 2, 0, length);
    legacyPoint(member, { a: data.my ? 1 : 0, ...data });
    expect(validateAndSolve3D(modelStore.model)).toBe(refusal(member));
  });
}

for (const x of [projectionLimit, 2 * projectionLimit]) {
  it(`#2411 applies a planar end couple when the member projection is ${x}`, () => {
    const { root, member } = cantilever(x, 0, length);
    legacyPoint(member, { a: 0, p: 0, mz: couple });
    expect(modelFeatures(modelStore.snapshot()).has('unplaceablePlanarPointLoads')).toBe(false);
    const result = validateAndSolve3D(modelStore.model);
    if (!result || typeof result === 'string') throw new Error(String(result));
    expect(result.reactions.find(r => r.nodeId === root)?.mz).toBeCloseTo(-couple, 12);
  });
}

it('#2411 allows an empty planar point record on a global-Z member', () => {
  const { root, member } = cantilever(0, 0, length);
  legacyPoint(member, { a: 1, p: 0, my: 0, mz: 0, px: 0 });
  expect(modelFeatures(modelStore.snapshot()).has('unplaceablePlanarPointLoads')).toBe(false);
  const result = validateAndSolve3D(modelStore.model);
  if (!result || typeof result === 'string') throw new Error(String(result));
  expect(result.reactions.find(r => r.nodeId === root)).toMatchObject({ mx: 0, my: 0, mz: 0 });
});

it('#2411 applies a native global couple on the same global-Z member in linear and P-Delta solves', () => {
  const { root, member } = cantilever(0, 0, length);
  modelStore.model.loads = [{
    type: 'pointOnElement3d',
    data: { id: 1, elementId: member, a: 1, py: 0, pz: 0, frame: 'global', mz: couple },
  }];
  const model = modelStore.model;
  const input = buildSolverInput3D(model);
  const linear = validateAndSolve3D(model);
  if (!input || !linear || typeof linear === 'string') throw new Error(String(linear));
  const secondOrder = solvePDelta3D(input);
  expect(secondOrder.isStable).toBe(true);
  const results: AnalysisResults3D[] = [linear, secondOrder.results];
  for (const result of results) {
    expect(result.reactions.find(r => r.nodeId === root)?.mz).toBeCloseTo(-couple, 12);
  }
});

it('#2411 applies a legacy planar couple in Basic 2D and when embedded upright', () => {
  uiStore.analysisMode = '2d';
  const { root, member } = cantilever(0, length, 0);
  legacyPoint(member, { a: 1, p: 0, mz: couple });
  const model = modelStore.model;
  const plane = validateAndSolve2D(model);
  const input = buildSolverInput2D(model);
  const spatial = validateAndSolve3D(model);
  if (!plane || typeof plane === 'string' || !input || !spatial || typeof spatial === 'string') {
    throw new Error(JSON.stringify({ plane, spatial }));
  }
  const secondOrder = solvePDelta(input);
  expect(secondOrder.isStable).toBe(true);
  const results: AnalysisResults[] = [plane, secondOrder.results];
  for (const result of results) {
    expect(result.reactions.find(r => r.nodeId === root)?.my).toBeCloseTo(-couple, 12);
  }
  expect(spatial.reactions.find(r => r.nodeId === root)?.my).toBeCloseTo(couple, 12);
});
