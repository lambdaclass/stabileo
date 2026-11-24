import { afterEach, beforeEach, expect, it } from 'vitest';
import { historyStore, modelStore, uiStore } from '../index';
import { applyLoadPlan, previewLoadPlan, replaceScope } from '../apply-load-plan';
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
import { assessProject } from '../../provenance/applicability';
import { runDirectAnalysis, workerPDelta } from '../../engine/direct-analysis';
import { pdelta3DInWorker, setWorkerFactoryForTests, type WorkerLike } from '../../engine/solver-pool';
import * as wasm from '../../wasm/dedaliano_engine.js';
import { solvePDelta3DWire } from '../../engine/wasm-solver';
import { finishSolve3D } from '../../engine/solve-finish';
import { nonlinearWorkerReply, nonlinearWorkerSession } from '../../engine/nonlinear-worker-session';
import { solveCombinations2D, solveCombinations3D, solveCombinations3DParallel, type ModelData } from '../../engine/solver-service';
import { setLocale, tp } from '../../i18n';

const knownWrong = process.env.RUN_KNOWN_WRONG === '2535' ? it : it.skip;

const floor = { id: 1, type: 'L', name: 'Floor live' };
const roof = { id: 2, type: 'L', name: 'Roof live', group: 'roof' };
const roofTerm = { symbol: 'L', group: 'roof', factor: 2 } as const;
const floorTerm = { symbol: 'L', factor: 1 } as const;
const namedFloorTerm = { ...floorTerm, group: 'floor' } as const;
const alternatives = 'live-position';
const alternativeCases = [{ ...floor, group: namedFloorTerm.group, alternatives }, { ...roof, alternatives }];
const alternativeFactors = [
  [{ caseId: floor.id, factor: floorTerm.factor }],
  [{ caseId: roof.id, factor: roofTerm.factor }],
];
const floorForce = 3;
const roofForce = 5;
const empty = { distributed: 0, nodal: 0, combinations: 0, caseTypes: [] };
const applyOptions = { clearExisting: true, bothSenses: false, nameOf: (key: string) => key };

function spec(...terms: CombinationTerm[]): LoadCombinationSpec {
  return { id: 'grouped', label: 'Grouped live', refs: [], notes: [], terms };
}

function plan(...terms: CombinationTerm[]): LoadPlan {
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

function restoreGroupedProject(...terms: CombinationTerm[]) {
  const rule: CombinationRule = { id: 'grouped', purpose: 'strength', terms };
  modelStore.restore({ ...modelStore.snapshot(), loadCases: [floor, roof], combinationRules: [rule], combinations: [] });
  return rule;
}

beforeEach(() => {
  uiStore.analysisMode = 'pro';
  modelStore.clear();
  historyStore.clear();
});

it('#2535 generated preview and Apply give each live case its own factor', () => {
  const input = plan(floorTerm, roofTerm);
  expect.soft(expandPlannedCombinations(input, {})[0]?.factors).toEqual([
    { caseId: 1, factor: floorTerm.factor }, { caseId: 2, factor: roofTerm.factor },
  ]);
  expect.soft(describePlanDelta(input, empty, { replaceExisting: true }).after.combinations).toBe(1);
  expect(previewLoadPlan(input, applyOptions.nameOf, { replaceExisting: true }).after.combinations).toBe(1);
  expect(applyLoadPlan(input, applyOptions)).toBeUndefined();
  const byName = new Map(modelStore.loadCases.map(c => [c.name, c]));
  expect.soft(byName.get(roof.name)).toMatchObject({ group: 'roof' });
  expect(modelStore.combinations[0]?.factors).toEqual([
    { caseId: byName.get(floor.name)?.id, factor: floorTerm.factor },
    { caseId: byName.get(roof.name)?.id, factor: roofTerm.factor },
  ]);
});

it('#2535 one pick per alternative set across grouped terms in Loads, Preview and Apply', () => {
  restoreGroupedProject(namedFloorTerm, roofTerm);
  modelStore.restore({ ...modelStore.snapshot(), loadCases: alternativeCases });
  const planned = plan(namedFloorTerm, roofTerm);
  const input = { ...planned, cases: planned.cases.map((c, i) => ({
    ...c, existingId: alternativeCases[i]!.id, group: alternativeCases[i]!.group, alternatives,
  })) };

  const fromLoads = projectCombinations();
  expect.soft(fromLoads.map(c => c.factors)).toEqual(alternativeFactors);
  expect.soft(fromLoads.map(c => c.name)).toEqual([
    '1.0 L(floor) + 2.0 L(roof) (Floor live)', '1.0 L(floor) + 2.0 L(roof) (Roof live)',
  ]);
  addCompositeCases(fromLoads);
  expect.soft(modelStore.loadCases.filter(c => c.includes?.length).map(c => c.includes)).toEqual(alternativeFactors);
  expect.soft(expandPlannedCombinations(input, {}).map(c => c.factors)).toEqual(alternativeFactors);
  expect.soft(describePlanDelta(input, empty, { replaceExisting: true }).after.combinations).toBe(2);
  expect.soft(previewLoadPlan(input, applyOptions.nameOf, { replaceExisting: true }).after.combinations).toBe(2);
  expect(applyLoadPlan(input, applyOptions)).toBeUndefined();
  expect(modelStore.combinations.map(c => c.factors)).toEqual(alternativeFactors);
});

knownWrong('known wrong result: #2535 one alternative set stays exclusive across live and roof-live symbols', () => {
  const roofLiveTerm = { ...roofTerm, symbol: 'Lr' } as const;
  const cases = [{ ...alternativeCases[0]!, type: 'L' }, { ...alternativeCases[1]!, type: 'Lr' }] as const;
  restoreGroupedProject(namedFloorTerm, roofLiveTerm);
  modelStore.restore({ ...modelStore.snapshot(), loadCases: cases });
  const planned = plan(namedFloorTerm, roofLiveTerm);
  const input = { ...planned, cases: planned.cases.map((c, i) => ({
    ...c, type: cases[i]!.type, existingId: cases[i]!.id, group: cases[i]!.group, alternatives,
  })) };

  const expanded = projectCombinations();
  expect.soft(expanded.map(c => c.factors)).toEqual(alternativeFactors);
  addCompositeCases(expanded);
  expect.soft(modelStore.loadCases.filter(c => c.includes?.length).map(c => c.includes)).toEqual(alternativeFactors);
  expect.soft(expandPlannedCombinations(input, {}).map(c => c.factors)).toEqual(alternativeFactors);
  expect.soft(describePlanDelta(input, empty, { replaceExisting: true }).after.combinations).toBe(2);
  expect.soft(previewLoadPlan(input, applyOptions.nameOf, { replaceExisting: true }).after.combinations).toBe(2);
  expect(applyLoadPlan(input, applyOptions)).toBeUndefined();
  expect(modelStore.combinations.map(c => c.factors)).toEqual(alternativeFactors);
});

knownWrong('known wrong result: #2535 shared sets also exclude directional alternatives and retain eligible wind senses', () => {
  const wind = { ...alternativeCases[1]!, type: 'W' };
  const otherWind = { id: 3, name: 'Other wind', type: 'W' };
  const terms = [namedFloorTerm, { ...floorTerm, symbol: 'W' }] as const;
  const results = expandCombinations([spec(...terms)], [alternativeCases[0]!, wind, otherWind], {
    bothSenses: { W: true }, reversible: id => id === wind.id,
  });
  expect(results.map(c => c.factors).sort((a, b) => a[0]!.caseId - b[0]!.caseId)).toEqual([
    [...alternativeFactors[0]!, { caseId: otherWind.id, factor: floorTerm.factor }],
    [{ caseId: wind.id, factor: floorTerm.factor }],
    [{ caseId: wind.id, factor: -floorTerm.factor }],
  ]);
});

it('#2535 cross-term patterns respect companion selection and independent cases still sum', () => {
  const companion = { id: 3, type: 'W', name: 'Wind' };
  const plain = { id: 4, type: 'L', name: 'Other roof live', group: roof.group };
  const separate = { id: 5, type: 'L', name: 'Separate roof live', group: roof.group, alternatives: 'separate' };
  const cases = [alternativeCases[0]!, { ...alternativeCases[1]!, pattern: true }, companion, plain, separate];
  const terms = [namedFloorTerm, roofTerm, { symbol: 'W', factor: 3 }] as const;
  const common = [{ caseId: plain.id, factor: roofTerm.factor }, { caseId: separate.id, factor: roofTerm.factor },
    { caseId: companion.id, factor: 3 }];
  expect.soft(expandCombinations([spec(...terms)], cases).map(c => c.factors))
    .toEqual([[...alternativeFactors[0]!, ...common]]);
  expect(expandCombinations([spec(...terms)], cases, { patternsInCompanions: true }).map(c => c.factors))
    .toEqual(alternativeFactors.map(factors => [...factors, ...common]));
});

it('#2535 directional picks retain the factor and the allowed senses of each case', () => {
  const cases = alternativeCases.map(c => ({ ...c, type: 'W' }));
  const terms = [namedFloorTerm, roofTerm].map(t => ({ ...t, symbol: 'W' as const }));
  const selections = expandCombinations([spec(...terms)], cases, {
    bothSenses: { W: true }, reversible: id => id === floor.id,
  });
  expect(selections.map(c => c.factors)).toEqual([
    alternativeFactors[0], [{ caseId: floor.id, factor: -floorTerm.factor }], alternativeFactors[1],
  ]);
});

it('#2535 two terms selecting the same case contribute both factors to one pick', () => {
  const second = { ...namedFloorTerm, factor: -namedFloorTerm.factor };
  const selections = expandCombinations([spec(namedFloorTerm, roofTerm, second)], alternativeCases);
  expect(selections.map(c => c.factors)).toEqual([
    [...alternativeFactors[0]!, { caseId: floor.id, factor: second.factor }], alternativeFactors[1],
  ]);
});

for (const group of [undefined, roof.group]) for (const match of ['name', 'explicit ID'] as const) {
  it(`#2535 ${group ?? 'ungrouped'} plan bypasses a composite matched by ${match}`, () => {
    const composite = { ...roof, group, includes: [{ caseId: floor.id, factor: 1 }] };
    const term = { ...roofTerm, group };
    restoreGroupedProject(term);
    modelStore.restore({ ...modelStore.snapshot(), loadCases: [{ ...floor, type: 'D' }, composite] });
    const tip = modelStore.addNode(0, 0, 0);
    const planned = plan(term);
    const input: LoadPlan = {
      ...planned,
      cases: [{ ...planned.cases[1]!, group, own: false, existingId: match === 'explicit ID' ? composite.id : null,
        nameKey: match === 'explicit ID' ? 'New roof live' : roof.name }],
      nodal: [{ nodeId: tip, fx: 0, fy: 0, fz: -roofForce, caseType: 'L' }],
    };
    expect.soft(replaceScope(input, [], modelStore.loadCases, [], applyOptions.nameOf).targets).toEqual([]);
    if (match === 'explicit ID') expect.soft(replaceScope(input, [], modelStore.loadCases, []).targets).toEqual([]);
    expect.soft(previewLoadPlan(input, applyOptions.nameOf, { replaceExisting: true }).after.combinations).toBe(1);
    expect(applyLoadPlan(input, applyOptions)).toBeUndefined();
    const target = modelStore.loadCases.find(c => c.type === 'L' && c.id !== composite.id);
    expect.soft(modelStore.loads.map(l => l.data.caseId)).toEqual([target?.id]);
    expect.soft(modelStore.combinations.map(c => c.factors)).toEqual([[{ caseId: target?.id, factor: roofTerm.factor }]]);
    expect(target).toBeDefined();
  });
}

it('#2535 retained grouped aliases resolve in Loads, Preview and Apply without a planned case of that type', () => {
  restoreGroupedProject(floorTerm, roofTerm);
  const retained = { ...roof, type: 'CR' };
  modelStore.restore({ ...modelStore.snapshot(), loadCases: [floor, retained] });
  const tip = modelStore.addNode(0, 0, 0);
  modelStore.addNodalLoad3D(tip, 0, 0, -roofForce, 0, 0, 0, retained.id);
  const planned = plan(floorTerm, roofTerm);
  const input = { ...planned, cases: [{ ...planned.cases[0]!, existingId: floor.id, own: false }] };
  const expected = [{ caseId: floor.id, factor: floorTerm.factor }, { caseId: retained.id, factor: roofTerm.factor }];
  expect(projectCombinations().map(c => c.factors)).toEqual([expected]);
  expect.soft(engineGuarded(() => previewLoadPlan(input, applyOptions.nameOf, { replaceExisting: true })).value?.after.combinations).toBe(1);
  expect(applyLoadPlan(input, applyOptions)).toBeUndefined();
  expect.soft(modelStore.combinations.map(c => c.factors)).toEqual([expected]);
  expect.soft(modelStore.loadCases.find(c => c.id === retained.id)).toMatchObject(retained);
  expect(modelStore.loads.map(l => l.data.caseId)).toEqual([retained.id]);
});

for (const group of [undefined, roof.group, 'different'] as const) {
  const test = group === undefined ? knownWrong : it;
  test(`${group === undefined ? 'known wrong result: ' : ''}#2535 explicit plan ID resolves a grouped target when group is ${String(group)}`, () => {
    const term = { ...roofTerm, group: group ?? roof.group };
    restoreGroupedProject(term);
    const tip = modelStore.addNode(0, 0, 0);
    modelStore.addNodalLoad3D(tip, 0, 0, -floorForce, 0, 0, 0, roof.id);
    const planned = plan(term);
    const input = {
      ...planned, cases: [{ ...planned.cases[1]!, existingId: roof.id, own: false, group, nameKey: 'Planned live' }],
      nodal: [{ nodeId: tip, fx: 0, fy: 0, fz: -roofForce, caseType: 'L' }],
    };
    const reusesRoof = group !== 'different';
    expect.soft(replaceScope(input, modelStore.loads, modelStore.loadCases, []).targets)
      .toEqual(reusesRoof ? [roof.id] : []);
    expect.soft(replaceScope(input, modelStore.loads, modelStore.loadCases, [], applyOptions.nameOf).targets)
      .toEqual(reusesRoof ? [roof.id] : []);
    expect.soft(previewLoadPlan(input, applyOptions.nameOf, { replaceExisting: true }).after.combinations).toBe(1);
    expect(applyLoadPlan(input, applyOptions)).toBeUndefined();
    const target = modelStore.loadCases.find(c => c.group === term.group);
    if (reusesRoof) expect.soft(target?.id).toBe(roof.id);
    else expect.soft(target?.id).not.toBe(roof.id);
    expect.soft(modelStore.loadCases.filter(c => c.type === 'L')).toHaveLength(reusesRoof ? 2 : 3);
    expect.soft(modelStore.loads.map(l => l.data.caseId)).toEqual([roof.id, target?.id]);
    expect(modelStore.combinations.map(c => c.factors)).toEqual([[{ caseId: target?.id, factor: term.factor }]]);
  });
}

knownWrong.each([false, true])('known wrong result: #2535 retained cases take their factors in the grouped remainder (replace %s)', clearExisting => {
  restoreGroupedProject(floorTerm, roofTerm);
  const retained = [{ ...floor, type: 'CR' }, { ...roof, type: 'TR' }, { id: 4, type: 'L', name: 'Mezzanine', group: 'mezzanine' }];
  modelStore.restore({ ...modelStore.snapshot(), loadCases: retained });
  const tip = modelStore.addNode(0, 0, 0);
  for (const c of retained) modelStore.addNodalLoad3D(tip, 0, 0, -roofForce, 0, 0, 0, c.id);
  const planned = plan(floorTerm, roofTerm);
  const input = { ...planned, cases: [] };
  const expected = projectCombinations().map(c => c.factors);
  expect(expected).toEqual([[{ caseId: floor.id, factor: floorTerm.factor }, { caseId: 4, factor: floorTerm.factor },
    { caseId: roof.id, factor: roofTerm.factor }]]);
  expect.soft(previewLoadPlan(input, applyOptions.nameOf, { replaceExisting: clearExisting }).after.combinations).toBe(1);
  expect(applyLoadPlan(input, { ...applyOptions, clearExisting })).toBeUndefined();
  expect.soft(modelStore.combinations.map(c => c.factors)).toEqual(expected);
  expect(modelStore.loads.map(l => l.data.caseId)).toEqual(retained.map(c => c.id));
});

it('#2535 an ungrouped rule alone keeps the ordinary Auto Loads case catalog', () => {
  restoreGroupedProject(floorTerm);
  const planned = plan(floorTerm);
  const input = { ...planned, cases: [] };
  expect(previewLoadPlan(input, applyOptions.nameOf, { replaceExisting: true }).after.combinations).toBe(0);
  expect(applyLoadPlan(input, applyOptions)).toBeUndefined();
  expect(modelStore.combinations).toEqual([]);
});

it('#2535 generated loads cannot reuse a same-named floor case for a grouped roof', () => {
  modelStore.addLoadCase(roof.name, 'L');
  const input = plan(roofTerm);
  expect(applyLoadPlan(input, applyOptions)).toBeUndefined();
  const roofCase = modelStore.loadCases.find(c => c.group === roof.group);
  expect(roofCase).toBeDefined();
  expect(modelStore.combinations[0]?.factors).toEqual([{ caseId: roofCase?.id, factor: roofTerm.factor }]);
  expect(applyLoadPlan(input, applyOptions)).toBeUndefined();
  expect(modelStore.loadCases.filter(c => c.group === roof.group)).toHaveLength(1);
});

for (const entry of ['snapshot', 'project file', 'model code', 'rule template'] as const) {
  it(`#2535 ${entry} restores a roof-only project rule for combination and composite output`, () => {
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

it('#2535 detached model fragments keep roof loads separate from a same-named floor case', () => {
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

it('#2535 an unresolved group is translated and Apply preserves the model', async () => {
  restoreGroupedProject({ ...roofTerm, group: 'missing' });
  const input = plan({ ...roofTerm, group: 'missing' });
  const before = JSON.stringify(modelStore.snapshot());
  const actions = [
    projectCombinations,
    () => describePlanDelta(input, empty, { replaceExisting: true }),
    () => previewLoadPlan(input, applyOptions.nameOf, { replaceExisting: true }),
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

it('#2535 a group on another symbol, composite or alternative set cannot satisfy the term', () => {
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

it('#2535 importing an invalid group never turns it into an ungrouped term', () => {
  const rule = restoreGroupedProject(roofTerm);
  for (const group of ['', null, 42]) {
    const text = JSON.stringify({ kind: 'stabileo.combinationRules', version: 1, rules: [
      { ...rule, terms: [{ ...roofTerm, group }] },
    ] });
    expect.soft(rulesFromTemplate(text)).toBeNull();
  }
});

it('#2535 explicit zero and empty remainder preserve grouped selection', () => {
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

knownWrong('known wrong result: #2535 result notices identify grouped terms and Auto Loads in a composite without combinations', () => {
  restoreGroupedProject(floorTerm);
  const changes = () => assessProject(modelStore.snapshot(), null, 'pro').changes.map(c => c.id);
  modelStore.restore({ ...modelStore.snapshot(), loadCases: [floor] });
  expect(changes()).not.toContain('combination-load-groups');
  modelStore.setCombinationRules([{ id: 'grouped', purpose: 'strength', terms: [roofTerm] }]);
  expect(changes()).toContain('combination-load-groups');
  modelStore.setCombinationRules([]);
  const composite = { ...roof, group: undefined, includes: [{ caseId: floor.id, factor: 1 }] };
  modelStore.restore({ ...modelStore.snapshot(), loadCases: [floor, composite] });
  const tip = modelStore.addNode(0, 0, 0);
  const load = modelStore.addNodalLoad3D(tip, 0, 0, -roofForce, 0, 0, 0, roof.id);
  modelStore.replaceLoads(modelStore.loads.map(l =>
    l.data.id === load ? { ...l, data: { ...l.data, generatedBy: 'generator' } } as typeof l : l));
  expect(changes()).toContain('combination-load-groups');
});

knownWrong('known wrong result: #2535 the result notice covers cross-symbol alternatives with an ungrouped rule', () => {
  restoreGroupedProject(floorTerm, { ...roofTerm, symbol: 'Lr', group: undefined });
  const cases = [{ ...floor, alternatives }, { ...roof, type: 'Lr', group: undefined, alternatives }];
  modelStore.restore({ ...modelStore.snapshot(), loadCases: cases });
  expect.soft(projectCombinations().map(c => c.factors)).toEqual(alternativeFactors);
  const notices = () => assessProject(modelStore.snapshot(), null, 'pro').changes.map(c => c.id);
  expect.soft(notices()).toContain('combination-load-groups');
  modelStore.restore({ ...modelStore.snapshot(), loadCases: [cases[0]!, { ...cases[1]!, alternatives: 'independent' }] });
  expect(notices()).not.toContain('combination-load-groups');
});

function cantilever(dim: '2d' | '3d', exclusive: boolean | 'cross-symbol' = false) {
  restoreGroupedProject(...(exclusive === 'cross-symbol' ? [namedFloorTerm, { ...roofTerm, symbol: 'Lr' }]
    : exclusive ? [namedFloorTerm, roofTerm] : [roofTerm]));
  if (exclusive) modelStore.restore({ ...modelStore.snapshot(), loadCases: exclusive === 'cross-symbol'
    ? [alternativeCases[0]!, { ...alternativeCases[1]!, type: 'Lr' }] : alternativeCases });
  const base = modelStore.addNode(0, 0, 0);
  const tip = dim === '2d' ? modelStore.addNode(4, 0) : modelStore.addNode(0, 0, 4);
  modelStore.addElement(base, tip, 'frame');
  modelStore.addSupport(base, dim === '2d' ? 'fixed' : 'fixed3d');
  for (const [caseId, force] of [[floor.id, floorForce], [roof.id, roofForce]] as const) {
    if (dim === '2d') modelStore.addNodalLoad(tip, 0, -force, 0, caseId);
    else modelStore.addNodalLoad3D(tip, 0, 0, -force, 0, 0, 0, caseId);
  }
  const ids = addGeneratedCombinations(projectCombinations());
  return { base, tip, ids, id: ids[0]!, model: modelStore.model as ModelData };
}

it('#2535 the 2D linear combination and envelope exclude the floor live load', () => {
  const { base, id, model } = cantilever('2d');
  const solved = solveCombinations2D(model, modelStore.loadCases, modelStore.combinations);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  expect.soft(solved.perCombo.get(id)?.reactions.find(r => r.nodeId === base)?.rz).toBeCloseTo(roofForce * roofTerm.factor, 8);
  expect(solved.envelope.maxAbsResults.reactions.find(r => r.nodeId === base)?.rz).toBeCloseTo(roofForce * roofTerm.factor, 8);
});

for (const selection of [true, 'cross-symbol'] as const) {
  const test = selection === true ? it : knownWrong;
  test(`${selection === true ? '' : 'known wrong result: '}#2535 2D linear reactions keep ${selection === true ? 'grouped' : selection} alternatives separate`, () => {
    const { base, ids, model } = cantilever('2d', selection);
    const solved = solveCombinations2D(model, modelStore.loadCases, modelStore.combinations);
    if (!solved || typeof solved === 'string') throw new Error(String(solved));
    expect.soft(ids).toHaveLength(2);
    expect.soft(solved.perCombo.get(ids[0]!)?.reactions.find(r => r.nodeId === base)?.rz).toBeCloseTo(floorForce * floorTerm.factor, 8);
    expect.soft(solved.perCombo.get(ids[1]!)?.reactions.find(r => r.nodeId === base)?.rz).toBeCloseTo(roofForce * roofTerm.factor, 8);
    expect(solved.envelope.maxAbsResults.reactions.find(r => r.nodeId === base)?.rz).toBeCloseTo(roofForce * roofTerm.factor, 8);
  });
}

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
          const { type, id, input, maxIter, tol } = message;
          if (type !== 'pdelta3d') jobs.push(type);
          try {
            if (type === 'solve3d') {
              send({ type: 'result', id, result: finishSolve3D(wasm.solve_3d(input), input) });
            } else if (type === 'pdelta3d') {
              const result = solvePDelta3DWire(input, maxIter, tol, wasm.solve_pdelta_3d);
              jobs.push(type);
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
  async function solveFixture(exclusive: boolean | 'cross-symbol') {
    const { tip, ids, model } = cantilever('3d', exclusive);
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
    return { solved, ids, jobs };
  }

  const vertical = (r: { fz: number }[]) => r.reduce((sum, row) => sum + row.fz, 0);
  it(`#2535 the 3D ${entry} ${method} combination and envelope exclude the floor live load`, async () => {
    const { solved, ids, jobs } = await solveFixture(false);
    if (entry === 'async' && method === 'linear') expect(jobs).toContain('solve3d');
    if (entry === 'async' && method === 'pdelta') expect(jobs).toContain('pdelta3d');
    if (entry === 'async' && method === 'uplift') expect(jobs).toContain('nonlinear-step');
    expect.soft(vertical(solved.perCombo.get(ids[0]!)!.reactions)).toBeCloseTo(roofForce * roofTerm.factor, 8);
    expect(vertical(solved.envelope.maxAbsResults3D.reactions)).toBeCloseTo(roofForce * roofTerm.factor, 8);
  });

  for (const selection of [true, 'cross-symbol'] as const) {
    const test = selection === true ? it : knownWrong;
    test(`${selection === true ? '' : 'known wrong result: '}#2535 3D ${entry} ${method} reactions keep ${selection === true ? 'grouped' : selection} alternatives separate`, async () => {
      const { solved, ids } = await solveFixture(selection);
      expect.soft(ids).toHaveLength(2);
      expect.soft(vertical(solved.perCombo.get(ids[0]!)!.reactions)).toBeCloseTo(floorForce * floorTerm.factor, 8);
      expect.soft(vertical(solved.perCombo.get(ids[1]!)?.reactions ?? [])).toBeCloseTo(roofForce * roofTerm.factor, 8);
      expect(vertical(solved.envelope.maxAbsResults3D.reactions)).toBeCloseTo(roofForce * roofTerm.factor, 8);
    });
  }

  if (entry === 'async' && method === 'pdelta') {
    it('#2535 async P-Delta combinations complete a worker solve and report second order', async () => {
      const { solved, ids, jobs } = await solveFixture(false);
      expect.soft(jobs).toContain('pdelta3d');
      expect(solved.perCombo.get(ids[0]!)?.secondOrder).toMatchObject({ stable: true, converged: true });
    });
  }
}

for (const entry of ['main thread', 'worker adapter'] as const) {
  it(`#2535 3D direct analysis via the ${entry} excludes the floor live load`, async () => {
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

for (const entry of ['main thread', 'worker adapter'] as const) for (const selection of [true, 'cross-symbol'] as const) {
  const test = selection === true ? it : knownWrong;
  test(`${selection === true ? '' : 'known wrong result: '}#2535 direct analysis via the ${entry} keeps ${selection === true ? 'grouped' : selection} alternatives separate`, async () => {
    const { base, ids, model } = cantilever('3d', selection);
    const jobs = entry === 'worker adapter' ? recordWorkerJobs() : [];
    const solved = await runDirectAnalysis(model, modelStore.loadCases, modelStore.combinations, {
      includeSelfWeight: false, settings: { notional: 0, tauB: 'unity' },
      ...(entry === 'worker adapter' ? { run: workerPDelta(pdelta3DInWorker) } : {}),
    });
    if (typeof solved === 'string') throw new Error(solved);
    if (entry === 'worker adapter') expect(jobs).toContain('pdelta3d');
    expect.soft(ids).toHaveLength(2);
    for (const [i, force] of [floorForce * floorTerm.factor, roofForce * roofTerm.factor].entries()) {
      expect.soft(solved.info.get(ids[i]!)).toMatchObject({ stable: true, converged: true });
      expect.soft(solved.perCombo.get(ids[i]!)?.reactions.find(r => r.nodeId === base)?.fz).toBeCloseTo(force, 8);
    }
  });
}
