import { beforeEach, expect, it } from 'vitest';
import { t, tp } from '../../i18n';
import { modelFeatures } from '../../provenance/model-features';
import { modelStore, uiStore } from '../../store';
import { pointOnElementText } from '../calc-report-loads';
import { computeDiagramValueAt } from '../diagrams';
import { evaluateDiagramAt } from '../diagrams-3d';
import { runDirectAnalysis } from '../direct-analysis';
import {
  buildSolverInput2D, buildSolverLoads3D, prepareSolverInput3D,
  solveCombinations2D, solveCombinations3D, solveCombinations3DParallel,
  validateAndSolve2D, validateAndSolve2DAsync, validateAndSolve3D, validateAndSolve3DAsync,
} from '../solver-service';
import type { AnalysisResults } from '../types';
import type { AnalysisResults3D } from '../types-3d';
import { solvePDelta } from '../wasm-solver';

const couple = 5;
const loadCase = { id: 1, name: 'Couple', type: 'D' as const };
const combination = { id: 1, name: 'Couple', factors: [{ caseId: loadCase.id, factor: 1 }] };
const cases = [loadCase];
const combinations = [combination];
const before = (1 - 1e-6) / 2;
const after = (1 + 1e-6) / 2;

beforeEach(() => {
  uiStore.analysisMode = '3d';
  uiStore.useNative3DPresentation();
  uiStore.includeSelfWeight = false;
  modelStore.clear();
});

function cantilever(mode: 'plane' | 'embedded' | 'space' | 'nonlinear' | 'pdelta', my = 0, mz = couple, angle = 0) {
  if (mode === 'plane' || mode === 'embedded') uiStore.analysisMode = '2d';
  if (mode === 'nonlinear') uiStore.analysisMode = 'pro';
  const root = modelStore.addNode(0, 0, 0);
  const tip = modelStore.addNode(2, 0, 0);
  const member = modelStore.addElement(root, tip);
  modelStore.addSupportEntry({
    nodeId: root, type: mode === 'plane' || mode === 'embedded' ? 'fixed' : 'fixed3d',
    ...(mode === 'nonlinear' ? { uplift: true } : {}),
  });
  modelStore.model.loads = [{
    type: 'pointOnElement', data: { id: 1, elementId: member, caseId: 1, a: 1, p: 0, my, mz, angle },
  }];
  if (mode === 'pdelta') modelStore.model.analysis = { ...modelStore.model.analysis, perCombination: 'pdelta' };
  return member;
}

function planeJump(result: AnalysisResults | string | null | undefined, member: number) {
  if (!result || typeof result === 'string') return result;
  const f = result.elementForces.find(f => f.elementId === member)!;
  return computeDiagramValueAt('moment', after, f) - computeDiagramValueAt('moment', before, f);
}

function spaceJump(result: AnalysisResults3D | string | null | undefined, member: number, axis: 'momentY' | 'momentZ') {
  if (!result || typeof result === 'string') return result;
  const f = result.elementForces.find(f => f.elementId === member)!;
  return Math.abs(evaluateDiagramAt(f, axis, after) - evaluateDiagramAt(f, axis, before));
}

function comboResult<R>(result: { perCombo: Map<number, R> } | string | null) {
  return result && typeof result !== 'string' ? result.perCombo.get(combination.id) : result;
}

async function spaceSolves() {
  const model = modelStore.model;
  return {
    sync: validateAndSolve3D(model),
    async: await validateAndSolve3DAsync(model),
    combination: comboResult(solveCombinations3D(model, cases, combinations)),
    parallel: comboResult(await solveCombinations3DParallel(model, cases, combinations)),
    direct: comboResult(await runDirectAnalysis(model, cases, combinations, { includeSelfWeight: false })),
  };
}

for (const mode of ['space', 'embedded', 'nonlinear', 'pdelta'] as const) {
  it(`#2411 retains the usable-projection moment jump with my: 0 (${mode})`, async () => {
    const member = cantilever(mode);
    for (const [path, result] of Object.entries(await spaceSolves())) {
      expect.soft(spaceJump(result, member, mode === 'embedded' ? 'momentY' : 'momentZ'), path).toBeCloseTo(couple, 4);
    }
  });
}

for (const angle of [0, 30]) {
  it(`#2411 retains the planar moment jump with my: 0 (angle=${angle})`, async () => {
    const member = cantilever('plane', 0, couple, angle);
    const model = modelStore.model;
    const input = buildSolverInput2D(model)!;
    for (const [path, result] of Object.entries({
      sync: validateAndSolve2D(model),
      async: await validateAndSolve2DAsync(model),
      combination: comboResult(solveCombinations2D(model, cases, combinations)),
      pdelta: solvePDelta(input).results as AnalysisResults,
    })) {
      expect.soft(planeJump(result, member), path).toBeCloseTo(couple, 4);
    }
  });
}

function conflict(member: number) {
  return t('svc.planarPointLoadMomentAliases').replace('{load}', '1').replace('{n}', String(member));
}

for (const mode of ['space', 'nonlinear', 'pdelta'] as const) {
  it(`#2411 refuses conflicting nonzero aliases (${mode})`, async () => {
    const member = cantilever(mode, couple, -couple);
    const model = modelStore.model;
    const refusal = conflict(member);
    expect.soft(() => prepareSolverInput3D(model, false).build(model.loads)).toThrow(refusal);
    expect.soft(() => buildSolverLoads3D(model, model.loads, false, false)).toThrow(refusal);
    for (const [path, result] of Object.entries(await spaceSolves())) {
      expect.soft(typeof result === 'string' ? result : 'solve did not refuse', path).toBe(refusal);
    }
  });
}

it('#2411 refuses conflicting nonzero aliases in plane solves', async () => {
  const member = cantilever('plane', couple, -couple);
  const model = modelStore.model;
  const refusal = conflict(member);
  expect.soft(() => buildSolverInput2D(model)).toThrow(refusal);
  const sync = validateAndSolve2D(model);
  const async = await validateAndSolve2DAsync(model);
  const combo = solveCombinations2D(model, cases, combinations);
  expect.soft(typeof sync === 'string' ? sync : 'solve did not refuse', 'sync').toBe(refusal);
  expect.soft(typeof async === 'string' ? async : 'solve did not refuse', 'async').toBe(refusal);
  expect.soft(typeof combo === 'string' ? combo : 'solve did not refuse', 'combination').toBe(t('svc.errorInCase')
    .replace('{n}', loadCase.name).replace('{err}', refusal));
});

it('#2411 retains the moment jump for equal nonzero aliases and for a zero legacy alias', () => {
  const member = cantilever('space', couple, couple);
  expect(spaceJump(validateAndSolve3D(modelStore.model), member, 'momentZ')).toBeCloseTo(couple, 4);
  const load = modelStore.model.loads[0]!;
  if (load.type !== 'pointOnElement') throw new Error(load.type);
  load.data.mz = 0;
  expect(spaceJump(validateAndSolve3D(modelStore.model), member, 'momentZ')).toBeCloseTo(couple, 4);
});

it('#2411 preserves a single legacy moment through snapshot restore and legacy load creation', () => {
  const member = cantilever('space');
  const legacySnapshot = {
    ...modelStore.snapshot(),
    loads: [{ type: 'pointOnElement', data: { id: 1, elementId: member, caseId: 1, a: 1, p: 0, mz: couple } }],
  };
  expect.soft(modelFeatures(legacySnapshot).has('legacyPlanarPointCoupleAliases')).toBe(true);
  modelStore.restore(legacySnapshot);
  const snapshot = modelStore.snapshot();
  expect.soft(snapshot.loads[0]?.data).toHaveProperty('my', couple);
  expect.soft(snapshot.loads[0]?.data).not.toHaveProperty('mz');
  expect.soft(spaceJump(validateAndSolve3D(modelStore.model), member, 'momentZ'), 'restored').toBeCloseTo(couple, 4);
  modelStore.restore(snapshot);
  expect.soft(spaceJump(validateAndSolve3D(modelStore.model), member, 'momentZ'), 'round trip').toBeCloseTo(couple, 4);
  modelStore.model.loads = [];
  modelStore.addPointLoadOnElement(member, 1, 0, { my: 0, mz: couple });
  expect.soft(modelStore.snapshot().loads[0]?.data).not.toHaveProperty('mz');
  expect.soft(spaceJump(validateAndSolve3D(modelStore.model), member, 'momentZ'), 'created').toBeCloseTo(couple, 4);
});

it('#2411 resolves a masked pure couple at the authored start without a projection', () => {
  const member = cantilever('space');
  const element = modelStore.model.elements.get(member)!;
  const tip = modelStore.model.nodes.get(element.nodeJ)!;
  tip.x = 0;
  tip.z = 2;
  const load = modelStore.model.loads[0]!;
  if (load.type !== 'pointOnElement') throw new Error(load.type);
  load.data.a = 0;
  const result = validateAndSolve3D(modelStore.model);
  expect(typeof result === 'string' ? result : result?.reactions.find(r => r.nodeId === element.nodeI)?.mz).toBe(-couple);
});

it('#2411 refuses conflicting aliases before restoring a snapshot', () => {
  const member = cantilever('space', couple, -couple);
  const ambiguous = modelStore.snapshot();
  const result = validateAndSolve3D(modelStore.model);
  expect.soft(typeof result === 'string' ? result : 'solve did not refuse').toBe(conflict(member));

  modelStore.model.loads = [];
  modelStore.addPointLoadOnElement(member, 1, 0, { my: couple });
  const saved = modelStore.snapshot();
  const { loadEpoch, modelVersion } = modelStore;
  expect(() => modelStore.restore(ambiguous)).toThrow(tp('file.modelAliasConflict', { id: '1', field: 'my', alias: 'mz' }));
  expect.soft(modelStore.loadEpoch).toBe(loadEpoch);
  expect.soft(modelStore.modelVersion).toBe(modelVersion);
  expect.soft(modelStore.snapshot()).toEqual(saved);
  expect(spaceJump(validateAndSolve3D(modelStore.model), member, 'momentZ')).toBeCloseTo(couple, 4);
});

for (const plane of ['planar', 'xy', 'xz'] as const) {
  it(`#2411 the calculation report reads the same couple as assembly (${plane})`, () => {
    const format = (my: number, mz?: number) => pointOnElementText({ a: 1, p: 0, my, mz },
      { global: 'global' }, 'SI', [2, 0], plane);
    const canonical = format(couple);
    expect(canonical).toContain('5 kN·m');
    expect.soft(format(0, couple)).toBe(canonical);
    expect.soft(format(couple, -couple)).toBeNull();
  });
}
