import { afterEach, beforeEach, expect, it } from 'vitest';
import { historyStore, modelStore, uiStore } from '../index';
import { applyLoadPlan } from '../apply-load-plan';
import { addCompositeCases, addGeneratedCombinations, templateCombinationSpecs } from '../generated-combinations';
import { deserializeProject, serializeProject } from '../file';
import { engineGuarded, runEngineAction, runEngineActionAsync } from '../engine-action';
import { expandCombinations, presentSymbols } from '../../engine/loads/combination-cases';
import { describePlanDelta, expandPlannedCombinations } from '../../engine/loads/load-plan-delta';
import { buildLoadPlan, type LoadPlan } from '../../engine/loads/load-plan';
import { rulesFromTemplate, rulesToTemplate, type CombinationRule } from '../../engine/loads/combination-rules';
import { mesh } from '../../engine/loads/__tests__/snow-surface-round2-fixture';
import { regulations } from '../../engine/loads/__tests__/snow-roof-plane-fixture';
import type { CombinationTerm, LoadCombinationSpec } from '../../codes/cirsoc101/combinations';
import { modelToCode } from '../../model/code/format';
import { applyCode } from '../../model/code/apply';
import { fragmentOf, mapDefinitions } from '../../model/edit/fragment';
import { runDirectAnalysis, workerPDelta } from '../../engine/direct-analysis';
import { pdelta3DInWorker, setWorkerFactoryForTests, type WorkerLike } from '../../engine/solver-pool';
import * as wasm from '../../wasm/dedaliano_engine.js';
import { finiteWireJson } from '../../engine/wasm-solver';
import { finishPDelta3D, finishSolve3D } from '../../engine/solve-finish';
import { nonlinearWorkerReply, nonlinearWorkerSession } from '../../engine/nonlinear-worker-session';
import { solveCombinations2D, solveCombinations3D, solveCombinations3DParallel, type ModelData } from '../../engine/solver-service';
import { setLocale, tp } from '../../i18n';

const regression = process.env.RUN_KNOWN_WRONG === '2535' ? it : it.skip;
type GroupedTerm = CombinationTerm & { group?: string };
const floor = { id: 1, type: 'L', name: 'Floor live' };
const roof = { id: 2, type: 'L', name: 'Roof live', group: 'roof' };
const roofTerm = { symbol: 'L', group: 'roof', factor: 2 } as const;
const floorTerm = { symbol: 'L', factor: 1 } as const;
const floorForce = 3;
const roofForce = 5;
const empty = { distributed: 0, nodal: 0, combinations: 0, caseTypes: [] };
const applyOptions = { clearExisting: true, bothSenses: false, nameOf: (key: string) => key };

function spec(...terms: GroupedTerm[]): LoadCombinationSpec {
  return { id: 'grouped', label: 'Grouped live', refs: [], notes: [], terms };
}

function plan(...terms: GroupedTerm[]): LoadPlan {
  const base = buildLoadPlan({ model: mesh([[[0, 0, 3], [10, 0, 3]]]), regulations: regulations(), dead: [],
    occupancyKey: 'vivienda', tributaryWidth: 1, reductionElementKind: 'interiorBeam', floorsSupported: 1,
    applyLiveReduction: false, generateCombinations: true, projectCombinations: [spec(...terms)] });
  expect(base.outcome).toBe('READY');
  return { ...base, distributed: [], nodal: [], surface: [], thermal: [],
    cases: [floor, roof].map(({ name, ...c }) => ({ ...c, type: 'L', existingId: null, nameKey: name, own: true })),
  };
}

function projectCombinations() {
  const cases = modelStore.loadCases;
  return expandCombinations(templateCombinationSpecs('project', presentSymbols(cases), modelStore.combinationRules), cases);
}

function restoreGroupedProject(...terms: GroupedTerm[]) {
  const rule: CombinationRule = { id: 'grouped', purpose: 'strength', terms };
  modelStore.restore({ ...modelStore.snapshot(), loadCases: [floor, roof], combinationRules: [rule], combinations: [] });
  return rule;
}

beforeEach(() => {
  uiStore.analysisMode = 'pro';
  modelStore.clear();
  historyStore.clear();
});

regression('known wrong result: #2535 generated preview and Apply give each live case its own factor', () => {
  const input = plan(floorTerm, roofTerm);
  expect.soft(expandPlannedCombinations(input, {})[0]?.factors).toEqual([
    { caseId: 1, factor: floorTerm.factor }, { caseId: 2, factor: roofTerm.factor },
  ]);
  expect.soft(describePlanDelta(input, empty, { replaceExisting: true }).after.combinations).toBe(1);
  expect(applyLoadPlan(input, applyOptions)).toBeUndefined();
  const byName = new Map(modelStore.loadCases.map(c => [c.name, c]));
  expect.soft(byName.get(roof.name)).toMatchObject({ group: 'roof' });
  expect(modelStore.combinations[0]?.factors).toEqual([
    { caseId: byName.get(floor.name)?.id, factor: floorTerm.factor },
    { caseId: byName.get(roof.name)?.id, factor: roofTerm.factor },
  ]);
});

regression('known wrong result: #2535 generated loads cannot reuse a same-named floor case for a grouped roof', () => {
  modelStore.addLoadCase(roof.name, 'L');
  const input = plan(roofTerm);
  expect(applyLoadPlan(input, applyOptions)).toBeUndefined();
  const roofCase = modelStore.loadCases.find(c => 'group' in c && c.group === roof.group);
  expect(roofCase).toBeDefined();
  expect(modelStore.combinations[0]?.factors).toEqual([{ caseId: roofCase?.id, factor: roofTerm.factor }]);
  expect(applyLoadPlan(input, applyOptions)).toBeUndefined();
  expect(modelStore.loadCases.filter(c => 'group' in c && c.group === roof.group)).toHaveLength(1);
});

for (const entry of ['snapshot', 'project file', 'model code', 'rule template'] as const) {
  regression(`known wrong result: #2535 ${entry} restores a roof-only project rule for combination and composite output`, () => {
    const rule = restoreGroupedProject(roofTerm);
    if (entry === 'project file') expect(deserializeProject(serializeProject())).toBe(true);
    if (entry === 'model code') {
      expect(applyCode(modelToCode(modelStore.snapshot()))).toMatchObject({ applied: true });
    }
    if (entry === 'rule template') {
      const imported = rulesFromTemplate(rulesToTemplate([rule], 'Grouped'));
      expect(imported?.rules).toHaveLength(1);
      modelStore.setCombinationRules(imported!.rules);
    }
    const combos = projectCombinations();
    const expected = [{ caseId: roof.id, factor: roofTerm.factor }];
    expect.soft(combos[0]?.factors).toEqual(expected);
    addGeneratedCombinations(combos);
    expect.soft(modelStore.combinations[0]?.factors).toEqual(expected);
    addCompositeCases(combos);
    expect(modelStore.loadCases.find(c => c.includes?.length)?.includes).toEqual(expected);
  });
}

regression('known wrong result: #2535 detached model fragments keep roof loads separate from a same-named floor case', () => {
  restoreGroupedProject(roofTerm);
  const node = modelStore.addNode(0, 0, 0);
  modelStore.addNodalLoad3D(node, 0, 0, -roofForce, 0, 0, 0, roof.id);
  const fragment = { ...fragmentOf({ nodes: [node], elements: [] }, { withLoads: true }), local: false };
  const source = modelStore.snapshot();
  modelStore.restore({ ...source, loadCases: [{ ...floor, name: roof.name }], loads: [] });
  const imported = mapDefinitions(fragment).loadCase.get(roof.id);
  expect.soft(imported).not.toBe(floor.id);
  expect.soft(modelStore.loadCases.find(c => c.id === imported)).toMatchObject({ group: roof.group });
  expect(projectCombinations()[0]?.factors).toEqual([{ caseId: imported, factor: roofTerm.factor }]);
});

regression('known wrong result: #2535 an unresolved group is translated and Apply preserves the model', async () => {
  restoreGroupedProject({ ...roofTerm, group: 'missing' });
  const input = plan({ ...roofTerm, group: 'missing' });
  const before = JSON.stringify(modelStore.snapshot());
  const actions = [
    projectCombinations,
    () => describePlanDelta(input, empty, { replaceExisting: true }),
    () => applyLoadPlan(input, applyOptions),
  ];
  try {
    setLocale('es');
    const key = 'combos.refused.unresolvedGroup';
    const message = tp(key, { symbol: 'L', group: 'missing' });
    expect.soft(message).not.toBe(key);
    for (const action of actions) {
      expect.soft(engineGuarded<unknown>(action)).toEqual({ value: null, error: message });
    }
    expect.soft(runEngineAction(projectCombinations)).toBeUndefined();
    expect.soft(uiStore.toasts.at(-1)).toMatchObject({ type: 'error', message });
    await expect.soft(runEngineActionAsync(async () => projectCombinations())).resolves.toBeUndefined();
    expect.soft(uiStore.toasts.at(-1)).toMatchObject({ type: 'error', message });
    expect(JSON.stringify(modelStore.snapshot())).toBe(before);
  } finally {
    setLocale('en');
  }
});

regression('known wrong result: #2535 a group on another symbol, composite or alternative set cannot satisfy the term', () => {
  const otherCases = [
    { ...roof, type: 'D' },
    { ...roof, includes: [{ caseId: floor.id, factor: 1 }] },
    { ...floor, id: roof.id, alternatives: roof.group },
    { ...roof, group: 'Roof' },
  ];
  for (const other of otherCases) {
    expect.soft(() => expandCombinations([spec(roofTerm)], [floor, other])).toThrow('combos.refused.unresolvedGroup');
  }
  expect(() => expandCombinations([spec(roofTerm)], [])).toThrow('combos.refused.unresolvedGroup');
});

regression('known wrong result: #2535 importing an invalid group never turns it into an ungrouped term', () => {
  const rule = restoreGroupedProject(roofTerm);
  for (const group of ['', null, 42]) {
    const text = JSON.stringify({ kind: 'stabileo.combinationRules', version: 1, rules: [
      { ...rule, terms: [{ ...roofTerm, group }] },
    ] });
    expect.soft(rulesFromTemplate(text)).toBeNull();
  }
});

regression('known wrong result: #2535 explicit zero and empty remainder preserve grouped selection', () => {
  expect.soft(expandCombinations([spec(floorTerm, { ...roofTerm, factor: 0 })], [floor, roof])[0]?.factors)
    .toEqual([{ caseId: floor.id, factor: floorTerm.factor }]);
  restoreGroupedProject(floorTerm, { ...roofTerm, factor: 0 });
  expect.soft(projectCombinations()[0]?.factors).toEqual([{ caseId: floor.id, factor: floorTerm.factor }]);
  expect(expandCombinations([spec(floorTerm, roofTerm)], [roof])[0]?.factors)
    .toEqual([{ caseId: roof.id, factor: roofTerm.factor }]);
});

it('#2535 legacy rules without a group still sum both live cases', () => {
  restoreGroupedProject(floorTerm);
  expect(projectCombinations()[0]?.factors).toEqual([
    { caseId: floor.id, factor: floorTerm.factor }, { caseId: roof.id, factor: floorTerm.factor },
  ]);
  expect(expandCombinations([spec({ ...roofTerm, factor: 0 })], [floor])[0]?.factors).toEqual([]);
});

function cantilever(dim: '2d' | '3d') {
  restoreGroupedProject(roofTerm);
  const base = modelStore.addNode(0, 0, 0);
  const tip = dim === '2d' ? modelStore.addNode(4, 0) : modelStore.addNode(0, 0, 4);
  modelStore.addElement(base, tip, 'frame');
  modelStore.addSupport(base, dim === '2d' ? 'fixed' : 'fixed3d');
  for (const [caseId, force] of [[floor.id, floorForce], [roof.id, roofForce]] as const) {
    if (dim === '2d') modelStore.addNodalLoad(tip, 0, -force, 0, caseId);
    else modelStore.addNodalLoad3D(tip, 0, 0, -force, 0, 0, 0, caseId);
  }
  const [id] = addGeneratedCombinations(projectCombinations());
  return { base, tip, id: id!, model: modelStore.model as ModelData };
}

regression('known wrong result: #2535 the 2D linear combination and envelope exclude the floor live load', () => {
  const { base, id, model } = cantilever('2d');
  const solved = solveCombinations2D(model, modelStore.loadCases, modelStore.combinations);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  expect.soft(solved.perCombo.get(id)?.reactions.find(r => r.nodeId === base)?.rz).toBeCloseTo(roofForce * roofTerm.factor, 8);
  expect(solved.envelope.maxAbsResults.reactions.find(r => r.nodeId === base)?.rz).toBeCloseTo(roofForce * roofTerm.factor, 8);
});

function recordWorkerJobs() {
  const jobs: string[] = [];
  setWorkerFactoryForTests(() => {
    const sessions = new Map<number, ReturnType<typeof nonlinearWorkerSession>>();
    const worker: WorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage(raw) {
        const message = structuredClone(raw);
        const send = (data: unknown) => worker.onmessage?.({ data: structuredClone(data) } as MessageEvent);
        queueMicrotask(() => {
          if (message.type === 'init') {
            send({ type: 'ready' });
            return;
          }
          jobs.push(message.type);
          const { type, id, input, maxIter, tol } = message;
          try {
            if (type === 'solve3d') {
              send({ type: 'result', id, result: finishSolve3D(wasm.solve_3d(input), input) });
            } else if (type === 'pdelta3d') {
              const result = JSON.parse(wasm.solve_pdelta_3d(finiteWireJson(input, { maxIter, tolerance: tol }), maxIter, tol));
              finishPDelta3D(result, input);
              send({ type: 'result', id, result });
            } else {
              send({ type: 'result', id, ...nonlinearWorkerReply(sessions, wasm, message) });
            }
          } catch (error) {
            send({ type: 'result', id, error: String(error) });
          }
        });
      },
      terminate() {
        for (const session of sessions.values()) session.free();
        sessions.clear();
      },
    };
    return worker;
  });
  return jobs;
}

afterEach(() => { setWorkerFactoryForTests(null); });

for (const entry of ['sync', 'async'] as const) for (const method of ['linear', 'pdelta', 'uplift'] as const) {
  regression(`known wrong result: #2535 the 3D ${entry} ${method} combination and envelope exclude the floor live load`, async () => {
    const { tip, id, model } = cantilever('3d');
    const jobs = entry === 'async' ? recordWorkerJobs() : [];
    if (method === 'uplift') {
      const support = modelStore.addSupport(tip, 'custom3d', undefined, {
        dofRestraints: { tx: false, ty: false, tz: true, rx: false, ry: false, rz: false },
      });
      modelStore.updateSupport(support, { uplift: true });
    } else {
      modelStore.setAnalysis({ perCombination: method });
    }
    const solve = entry === 'sync' ? solveCombinations3D : solveCombinations3DParallel;
    const solved = await solve(model, modelStore.loadCases, modelStore.combinations);
    if (!solved || typeof solved === 'string') throw new Error(String(solved));
    if (entry === 'async' && method === 'linear') expect(jobs).toContain('solve3d');
    if (entry === 'async' && method === 'uplift') expect(jobs).toContain('nonlinear-step');
    const vertical = (r: { fz: number }[]) => r.reduce((sum, row) => sum + row.fz, 0);
    expect.soft(vertical(solved.perCombo.get(id)!.reactions)).toBeCloseTo(roofForce * roofTerm.factor, 8);
    expect(vertical(solved.envelope.maxAbsResults3D.reactions)).toBeCloseTo(roofForce * roofTerm.factor, 8);
  });
}

for (const entry of ['main thread', 'worker adapter'] as const) {
  regression(`known wrong result: #2535 3D direct analysis via the ${entry} excludes the floor live load`, async () => {
    const { base, id, model } = cantilever('3d');
    const jobs = entry === 'worker adapter' ? recordWorkerJobs() : [];
    const solved = await runDirectAnalysis(model, modelStore.loadCases, modelStore.combinations, {
      includeSelfWeight: false, settings: { notional: 0, tauB: 'unity' },
      ...(entry === 'worker adapter' ? { run: workerPDelta(pdelta3DInWorker) } : {}),
    });
    if (typeof solved === 'string') throw new Error(solved);
    if (entry === 'worker adapter') expect(jobs).toContain('pdelta3d');
    expect(solved.info.get(id)).toMatchObject({ stable: true, converged: true });
    expect(solved.perCombo.get(id)?.reactions.find(r => r.nodeId === base)?.fz).toBeCloseTo(roofForce * roofTerm.factor, 8);
  });
}
