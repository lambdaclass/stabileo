import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import ts from 'typescript';
import { afterEach, beforeEach, expect, it } from 'vitest';
import ProCombinationRules from '../../../components/pro/ProCombinationRules.svelte';
import { addCirsocCombinations } from '../../actions/load-states';
import { fixtureLoadCases } from '../../templates/load-fixture';
import { historyStore, modelStore, uiStore } from '../index';
import { applyLoadPlan, previewLoadPlan, replaceScope } from '../apply-load-plan';
import { addCompositeCases, addGeneratedCombinations, templateCombinationSpecs } from '../generated-combinations';
import { deserializeProject, serializeProject } from '../file';
import { engineGuarded, runEngineAction, runEngineActionAsync } from '../engine-action';
import { expandCombinations, presentSymbols } from '../../engine/loads/combination-cases';
import { describePlanDelta, expandPlannedCombinations } from '../../engine/loads/load-plan-delta';
import { buildLoadPlan, type LoadPlan } from '../../engine/loads/load-plan';
import { RULE_SYMBOLS, freshRuleIds, rulesFromTemplate, rulesToTemplate, type CombinationRule } from '../../engine/loads/combination-rules';
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
const windTerm = { symbol: 'W', factor: 2 } as const;
const companionPatternTerms = [floorTerm, windTerm] as const;
const companionPatternCases = [
  { ...floor, type: 'L' as const, name: 'Live pattern', alternatives, pattern: true },
  { id: roof.id, type: 'W' as const, name: 'Whole wind', alternatives },
];
const companionPatternFactors = [
  [{ caseId: floor.id, factor: floorTerm.factor }],
  [{ caseId: roof.id, factor: windTerm.factor }],
];
const floorForce = 3;
const livePatternForce = 13;
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

it('#2535 one alternative set stays exclusive across live and roof-live symbols', () => {
  const roofLiveTerm = { ...roofTerm, symbol: 'Lr' } as const;
  const cases = [{ ...alternativeCases[0]!, type: 'L' }, { ...alternativeCases[1]!, type: 'Lr' }] as const;
  restoreGroupedProject(namedFloorTerm, roofLiveTerm);
  modelStore.restore({ ...modelStore.snapshot(), loadCases: [...cases] });
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

it('#2535 shared sets also exclude directional alternatives and retain eligible wind senses', () => {
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

it('#2535 companion live patterns survive a whole wind case in Loads and Auto Loads', () => {
  restoreGroupedProject(...companionPatternTerms);
  modelStore.restore({ ...modelStore.snapshot(), loadCases: companionPatternCases });
  const input = {
    ...plan(...companionPatternTerms),
    combinations: [spec(...companionPatternTerms)],
    cases: companionPatternCases.map(({ id, name, ...c }) => ({ ...c, existingId: id, nameKey: name, own: true })),
  };

  const expanded = projectCombinations();
  expect.soft(expanded.map(c => c.factors)).toEqual(companionPatternFactors);
  addCompositeCases(expanded);
  expect.soft(modelStore.loadCases.filter(c => c.includes?.length).map(c => c.includes)).toEqual(companionPatternFactors);
  expect.soft(expandPlannedCombinations(input, {}).map(c => c.factors)).toEqual(companionPatternFactors);
  expect.soft(describePlanDelta(input, empty, { replaceExisting: true }).after.combinations).toBe(2);
  expect.soft(previewLoadPlan(input, applyOptions.nameOf, { replaceExisting: true }).after.combinations).toBe(2);
  expect(applyLoadPlan(input, applyOptions)).toBeUndefined();
  expect(modelStore.combinations.map(c => c.factors)).toEqual(companionPatternFactors);
});

it('#2535 a whole roof-live case cannot suppress a companion floor-live pattern', () => {
  const roofLive = { ...companionPatternCases[1]!, type: 'Lr' };
  const rule = spec(floorTerm, { ...windTerm, symbol: 'Lr' });
  expect(expandCombinations([rule], [companionPatternCases[0]!, roofLive]).map(c => c.factors))
    .toEqual(companionPatternFactors);
});

it('#2535 only a whole live case in the same set can replace a companion live pattern', () => {
  const whole = { id: 3, type: 'L', name: 'Whole live', alternatives };
  const rule = spec(...companionPatternTerms);
  const cases = [...companionPatternCases, whole];
  const wholeFactor = { caseId: whole.id, factor: floorTerm.factor };

  expect(expandCombinations([rule], cases).map(c => c.factors)).toEqual([
    [wholeFactor], companionPatternFactors[1],
  ]);
  expect(expandCombinations([rule], cases, { patternsInCompanions: true }).map(c => c.factors)).toEqual([
    companionPatternFactors[0], [wholeFactor], companionPatternFactors[1],
  ]);
  const separate = [companionPatternCases[0]!, { ...companionPatternCases[1]!, alternatives: 'wind' },
    { ...whole, alternatives: 'separate' }];
  expect(expandCombinations([rule], separate).map(c => c.factors)).toEqual([
    [...companionPatternFactors[0]!, wholeFactor, ...companionPatternFactors[1]!],
  ]);
});

it('#2535 Basic and rebuilt fixtures retain a companion roof-live pattern in a shared wind set', () => {
  const loadCases = [
    { ...companionPatternCases[0]!, type: 'Lr' },
    companionPatternCases[1]!,
    { id: 3, type: 'D', name: 'Dead' },
    { id: 4, type: 'L', name: 'Floor live' },
  ];
  modelStore.restore({ ...modelStore.snapshot(), loadCases, combinations: [] });

  const windRule = templateCombinationSpecs('lrfd', presentSymbols(loadCases), []).find(s => s.basic === 4)!;
  const roofFactor = windRule.terms.find(t => t.symbol === 'Lr')!.factor;
  expect(roofFactor).toBeLessThan(windRule.terms.find(t => t.symbol === 'L')!.factor);
  const expected = windRule.terms.filter(t => t.symbol !== 'W').map(t => ({
    caseId: loadCases.find(c => c.type === t.symbol)!.id,
    factor: t.factor,
  }));

  expect(addCirsocCombinations()).toBeGreaterThan(0);
  const fixture = fixtureLoadCases({ name: 'Shared wind set', loadCases, combinations: [],
    loads: [{ type: 'nodal', data: { caseId: loadCases[0]!.id } }] }, { loadCases: [], combinations: [] });
  expect(fixture.rebuilt).toBe(true);

  const sorted = (factors: typeof expected) => [...factors].sort((a, b) => a.caseId - b.caseId);
  expect.soft(modelStore.combinations.map(c => sorted(c.factors))).toContainEqual(sorted(expected));
  expect(fixture.combinations.map(c => sorted(c.factors))).toContainEqual(sorted(expected));
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
  it(`#2535 explicit plan ID resolves a grouped target when group is ${String(group)}`, () => {
    const term = { ...roofTerm, group: group ?? roof.group };
    restoreGroupedProject(term);
    const tip = modelStore.addNode(0, 0, 0);
    modelStore.addNodalLoad3D(tip, 0, 0, -floorForce, 0, 0, 0, roof.id);
    const planned = plan(term);
    const input: LoadPlan = {
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

it.each([false, true])('#2535 retained cases take their factors in the grouped remainder (replace %s)', clearExisting => {
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
  const preview = previewLoadPlan(input, applyOptions.nameOf, { replaceExisting: clearExisting });
  expect.soft(preview.after.combinations).toBe(1);
  expect.soft(preview.dispositions).toEqual(retained.map(c => c.type).sort().map(caseType =>
    expect.objectContaining({ caseType, action: 'retained', lossy: false })));
  expect.soft(preview.warnings.map(w => w.key)).not.toContain('loadPlan.warning.caseRetainedNotCombined');
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

it('#2535 result notices identify grouped terms and Auto Loads in a composite without combinations', () => {
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

it('#2535 the result notice covers cross-symbol alternatives with an ungrouped rule', () => {
  restoreGroupedProject(floorTerm, { ...roofTerm, symbol: 'Lr', group: undefined });
  const cases = [{ ...floor, alternatives }, { ...roof, type: 'Lr', group: undefined, alternatives }];
  modelStore.restore({ ...modelStore.snapshot(), loadCases: cases });
  expect.soft(projectCombinations().map(c => c.factors)).toEqual(alternativeFactors);
  const notices = () => assessProject(modelStore.snapshot(), null, 'pro').changes.map(c => c.id);
  expect.soft(notices()).toContain('combination-load-groups');
  addCompositeCases(projectCombinations());
  modelStore.setCombinationRules([]);
  expect.soft(notices()).toContain('combination-load-groups');
  modelStore.restore({ ...modelStore.snapshot(), loadCases: [cases[0]!, { ...cases[1]!, alternatives: 'independent' }] });
  expect(notices()).not.toContain('combination-load-groups');
});

const alternativeSelections = ['grouped', 'cross-symbol', 'companion pattern'] as const;
type AlternativeSelection = typeof alternativeSelections[number];

function cantilever(dim: '2d' | '3d', selection: AlternativeSelection | false = false) {
  if (selection === 'companion pattern') {
    restoreGroupedProject(...companionPatternTerms);
    modelStore.restore({ ...modelStore.snapshot(), loadCases: companionPatternCases });
  } else {
    restoreGroupedProject(...(selection === 'cross-symbol' ? [namedFloorTerm, { ...roofTerm, symbol: 'Lr' as const }]
      : selection === 'grouped' ? [namedFloorTerm, roofTerm] : [roofTerm]));
    if (selection) modelStore.restore({ ...modelStore.snapshot(), loadCases: selection === 'cross-symbol'
      ? [alternativeCases[0]!, { ...alternativeCases[1]!, type: 'Lr' }] : alternativeCases });
  }
  const liveForce = selection === 'companion pattern' ? livePatternForce : floorForce;
  const base = modelStore.addNode(0, 0, 0);
  const tip = dim === '2d' ? modelStore.addNode(4, 0) : modelStore.addNode(0, 0, 4);
  modelStore.addElement(base, tip, 'frame');
  modelStore.addSupport(base, dim === '2d' ? 'fixed' : 'fixed3d');
  for (const [caseId, force] of [[floor.id, liveForce], [roof.id, roofForce]] as const) {
    if (dim === '2d') modelStore.addNodalLoad(tip, 0, -force, 0, caseId);
    else modelStore.addNodalLoad3D(tip, 0, 0, -force, 0, 0, 0, caseId);
  }
  const ids = addGeneratedCombinations(projectCombinations());
  const reactions = [liveForce * floorTerm.factor, roofForce * (selection === 'companion pattern' ? windTerm.factor : roofTerm.factor)] as const;
  return { base, tip, ids, id: ids[0]!, model: modelStore.model as ModelData, reactions };
}

it('#2535 the 2D linear combination and envelope exclude the floor live load', () => {
  const { base, id, model } = cantilever('2d');
  const solved = solveCombinations2D(model, modelStore.loadCases, modelStore.combinations);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  expect.soft(solved.perCombo.get(id)?.reactions.find(r => r.nodeId === base)?.rz).toBeCloseTo(roofForce * roofTerm.factor, 8);
  expect(solved.envelope.maxAbsResults.reactions.find(r => r.nodeId === base)?.rz).toBeCloseTo(roofForce * roofTerm.factor, 8);
});

for (const selection of alternativeSelections) {
  it(`#2535 2D linear reactions keep ${selection} alternatives separate`, () => {
    const { base, ids, model, reactions } = cantilever('2d', selection);
    const solved = solveCombinations2D(model, modelStore.loadCases, modelStore.combinations);
    if (!solved || typeof solved === 'string') throw new Error(String(solved));
    expect.soft(ids).toHaveLength(2);
    expect.soft(solved.perCombo.get(ids[0]!)?.reactions.find(r => r.nodeId === base)?.rz).toBeCloseTo(reactions[0], 8);
    expect.soft(solved.perCombo.get(ids[1]!)?.reactions.find(r => r.nodeId === base)?.rz).toBeCloseTo(reactions[1], 8);
    expect(solved.envelope.maxAbsResults.reactions.find(r => r.nodeId === base)?.rz).toBeCloseTo(Math.max(...reactions), 8);
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
  async function solveFixture(selection: AlternativeSelection | false) {
    const { tip, ids, model, reactions } = cantilever('3d', selection);
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
    return { solved, ids, jobs, reactions };
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

  for (const selection of alternativeSelections) {
    it(`#2535 3D ${entry} ${method} reactions keep ${selection} alternatives separate`, async () => {
      const { solved, ids, jobs, reactions } = await solveFixture(selection);
      if (entry === 'async' && method === 'linear') expect(jobs).toContain('solve3d');
      if (entry === 'async' && method === 'pdelta') expect(jobs).toContain('pdelta3d');
      if (entry === 'async' && method === 'uplift') expect(jobs).toContain('nonlinear-step');
      expect.soft(ids).toHaveLength(2);
      expect.soft(vertical(solved.perCombo.get(ids[0]!)!.reactions)).toBeCloseTo(reactions[0], 8);
      expect.soft(vertical(solved.perCombo.get(ids[1]!)?.reactions ?? [])).toBeCloseTo(reactions[1], 8);
      expect(vertical(solved.envelope.maxAbsResults3D.reactions)).toBeCloseTo(Math.max(...reactions), 8);
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

for (const entry of ['main thread', 'worker adapter'] as const) for (const selection of alternativeSelections) {
  it(`#2535 direct analysis via the ${entry} keeps ${selection} alternatives separate`, async () => {
    const { base, ids, model, reactions } = cantilever('3d', selection);
    const jobs = entry === 'worker adapter' ? recordWorkerJobs() : [];
    const solved = await runDirectAnalysis(model, modelStore.loadCases, modelStore.combinations, {
      includeSelfWeight: false, settings: { notional: 0, tauB: 'unity' },
      ...(entry === 'worker adapter' ? { run: workerPDelta(pdelta3DInWorker) } : {}),
    });
    if (typeof solved === 'string') throw new Error(solved);
    if (entry === 'worker adapter') expect(jobs).toContain('pdelta3d');
    expect.soft(ids).toHaveLength(2);
    for (const [i, force] of reactions.entries()) {
      expect.soft(solved.info.get(ids[i]!)).toMatchObject({ stable: true, converged: true });
      expect.soft(solved.perCombo.get(ids[i]!)?.reactions.find(r => r.nodeId === base)?.fz).toBeCloseTo(force, 8);
    }
  });
}

const lateralTerms = [{ symbol: 'W', factor: 1 }, { symbol: 'E', factor: 1 }] as const;
const lateralCases = [
  { id: 1, type: 'W', name: 'Shared wind', alternatives: 'lateral' },
  { id: 2, type: 'E', name: 'Shared seismic', alternatives: 'lateral' },
  { id: 3, type: 'W', name: 'Standalone wind' },
  { id: 4, type: 'E', name: 'Standalone seismic' },
] as const;
const lateralForces = [2, 4, 8, 16] as const;
const lateralSelections = [[1, 4], [2, 3]];

function combinationIds(combinations: ReadonlyArray<{ factors: ReadonlyArray<{ caseId: number }> }>) {
  return combinations.map(c => c.factors.map(f => f.caseId).sort((a, b) => a - b)).sort((a, b) => a[0]! - b[0]!);
}

function projectPlan(terms: readonly CombinationTerm[], cases: ReadonlyArray<{
  id: number; type: LoadPlan['cases'][number]['type']; name: string; alternatives?: string;
}>): LoadPlan {
  return {
    ...plan(...terms),
    combinations: [spec(...terms)],
    cases: cases.map(({ id, name, ...c }) => ({ ...c, existingId: id, nameKey: name, own: true })),
    seismicGeneration: 'static',
  };
}

it('#2558 a directional combination cannot skip a shared alternative set', () => {
  restoreGroupedProject(...lateralTerms);
  modelStore.restore({ ...modelStore.snapshot(), loadCases: [...lateralCases] });
  const input = projectPlan(lateralTerms, lateralCases);
  const fromLoads = projectCombinations();
  expect.soft(combinationIds(fromLoads)).toEqual(lateralSelections);
  addCompositeCases(fromLoads);
  expect.soft(combinationIds(modelStore.loadCases.flatMap(c => c.includes ? [{ factors: c.includes }] : []))).toEqual(lateralSelections);
  expect.soft(combinationIds(expandPlannedCombinations(input, {}))).toEqual(lateralSelections);
  expect.soft(previewLoadPlan(input, applyOptions.nameOf, { replaceExisting: true }).after.combinations).toBe(2);
  expect(applyLoadPlan(input, applyOptions)).toBeUndefined();
  expect(combinationIds(modelStore.combinations)).toEqual(lateralSelections);
});

it('#2558 a directional pick can substitute for a standalone case of the same symbol', () => {
  const combinations = expandCombinations([spec(...lateralTerms)], lateralCases.slice(0, 3));
  expect(combinationIds(combinations)).toEqual([[1], [2, 3]]);
});

function lateralSets(count: number) {
  return Array.from({ length: count }, (_, i) => lateralCases.slice(0, 2).map((c, j) => ({
    ...c, id: i * 2 + j + 1, name: `${c.name} ${i + 1}`, alternatives: `set-${i + 1}`,
  }))).flat();
}

it('#2558 incompatible mandatory sets are refused before any update', () => {
  const cases = lateralSets(3);
  restoreGroupedProject(...lateralTerms);
  modelStore.restore({ ...modelStore.snapshot(), loadCases: cases });
  const input = projectPlan(lateralTerms, cases);
  const before = modelStore.snapshot();
  expect.soft(() => projectCombinations()).toThrow('combos.refused.alternativeSet');
  expect.soft(() => expandPlannedCombinations(input, {})).toThrow('combos.refused.alternativeSet');
  expect.soft(engineGuarded(() => previewLoadPlan(input, applyOptions.nameOf, { replaceExisting: true })).error)
    .toBe(tp('combos.refused.alternativeSet', { rule: 'Grouped live', set: 'set-1' }));
  expect.soft(engineGuarded(() => applyLoadPlan(input, applyOptions)).error)
    .toBe(tp('combos.refused.alternativeSet', { rule: 'Grouped live', set: 'set-1' }));
  expect(modelStore.snapshot()).toEqual(before);
});

it('#2558 two directional sets can each contribute every eligible choice', () => {
  const combinations = expandCombinations([spec(...lateralTerms)], lateralSets(2));
  expect(combinationIds(combinations)).toEqual([[1, 4], [2, 3]]);
});

it('#2558 a partially representable shared set is refused', () => {
  const cases = [...lateralSets(2), { id: 5, type: 'W', name: 'Third wind', alternatives: 'third' },
    { id: 6, type: 'Wa', name: 'Third service wind', alternatives: 'third' }];
  expect(() => expandCombinations([spec(...lateralTerms, { symbol: 'Wa', factor: 1 })], cases))
    .toThrow('combos.refused.alternativeSet');
});

function loadedCantilever(dim: '2d' | '3d', loads: readonly (readonly [number, number])[]) {
  const base = modelStore.addNode(0, 0, 0);
  const tip = dim === '2d' ? modelStore.addNode(4, 0) : modelStore.addNode(0, 0, 4);
  modelStore.addElement(base, tip, 'frame');
  modelStore.addSupport(base, dim === '2d' ? 'fixed' : 'fixed3d');
  for (const [id, force] of loads) {
    if (dim === '2d') modelStore.addNodalLoad(tip, 0, -force, 0, id);
    else modelStore.addNodalLoad3D(tip, 0, 0, -force, 0, 0, 0, id);
  }
  return { base, tip };
}

const roofLiveTerm = { symbol: 'Lr', factor: 2 } as const;
const plannedFloor = { id: 1, type: 'L', name: 'Planned floor', alternatives: 'floor-pattern' } as const;
const plannedRoof = { id: 2, type: 'Lr', name: 'Planned roof' } as const;
const manualRoof = { id: 3, type: 'Lr', name: 'Manual roof', alternatives: plannedFloor.alternatives } as const;

function roofLiveFixture(alternatives: string, own: boolean, generated = false, plannedAlternative?: string) {
  restoreGroupedProject(roofLiveTerm);
  const retained = { ...manualRoof, alternatives, ...(generated ? { generated } : {}) };
  const target = { ...plannedRoof, alternatives: plannedAlternative };
  modelStore.restore({ ...modelStore.snapshot(), loadCases: [plannedFloor, target, retained] });
  const { base, tip } = loadedCantilever('3d', [[manualRoof.id, roofForce]]);
  const input = projectPlan([roofLiveTerm], [plannedFloor, target]);
  input.cases[1]!.own = own;
  input.nodal = [{ nodeId: tip, fx: 0, fy: 0, fz: -floorForce, caseType: 'Lr' }];
  return { base, input };
}

it('#2558 Auto Loads includes retained manual roof live with a shared key', () => {
  for (const own of [true, false]) for (const clearExisting of [true, false]) {
    const { base, input } = roofLiveFixture(plannedFloor.alternatives, own);
    expect.soft(previewLoadPlan(input, applyOptions.nameOf, { replaceExisting: clearExisting }).after.combinations).toBe(1);
    expect(applyLoadPlan(input, { ...applyOptions, clearExisting })).toBeUndefined();
    expect.soft(modelStore.loads.map(l => l.data.caseId)).toEqual([manualRoof.id, plannedRoof.id]);
    expect.soft(combinationIds(modelStore.combinations)).toEqual([[plannedRoof.id, manualRoof.id]]);
    const solved = solveCombinations3D(modelStore.model as ModelData, modelStore.loadCases, modelStore.combinations);
    if (!solved || typeof solved === 'string') throw new Error(String(solved));
    const combo = modelStore.combinations[0]!;
    expect.soft(solved.perCombo.get(combo.id)?.reactions.find(r => r.nodeId === base)?.fz)
      .toBeCloseTo((floorForce + roofForce) * roofLiveTerm.factor, 8);
    modelStore.clear();
  }
});

it.each([true, false])('#2566 Preview and Apply include a marked case with a surviving manual load, replace=%s', clearExisting => {
  const { input } = roofLiveFixture('roof-pattern', false, true, 'roof-pattern');
  expect.soft(previewLoadPlan(input, applyOptions.nameOf, { replaceExisting: clearExisting, alsoUnmarked: true })
    .after.combinations).toBe(2);
  expect(applyLoadPlan(input, { ...applyOptions, clearExisting, alsoUnmarked: true })).toBeUndefined();
  expect.soft(modelStore.loads.map(l => l.data.caseId)).toEqual([manualRoof.id, plannedRoof.id]);
  expect(combinationIds(modelStore.combinations)).toEqual([[plannedRoof.id], [manualRoof.id]]);
});

it('#2566 a marked obsolete roof case with no surviving load is excluded after replacement', () => {
  const { input } = roofLiveFixture('roof-pattern', true, true, 'roof-pattern');
  modelStore.replaceLoads(modelStore.loads.map(l => l.type === 'nodal3d'
    ? { ...l, data: { ...l.data, generatedBy: 'load-plan' } } : l));
  expect(previewLoadPlan(input, applyOptions.nameOf, { replaceExisting: true }).after.combinations).toBe(1);
  expect(applyLoadPlan(input, applyOptions)).toBeUndefined();
  expect(modelStore.loads.map(l => l.data.caseId)).toEqual([plannedRoof.id]);
  expect(combinationIds(modelStore.combinations)).toEqual([[plannedRoof.id]]);
});

it('#2558 an independent manual roof case still contributes beside the plan', () => {
  const { input } = roofLiveFixture('independent', true);
  expect(applyLoadPlan(input, applyOptions)).toBeUndefined();
  expect(combinationIds(modelStore.combinations)).toEqual([[plannedRoof.id, manualRoof.id]]);
});

it('#2558 replacing an old pattern excludes it only if its loads are removed', () => {
  for (const clearExisting of [true, false]) for (const hasManualLoad of [true, false]) {
    const { input } = roofLiveFixture(plannedFloor.alternatives, true);
    modelStore.replaceLoads(modelStore.loads.map(l => l.type === 'nodal3d'
      ? { ...l, data: { ...l.data, generatedBy: 'load-plan' } } : l));
    if (hasManualLoad) {
      const nodeId = [...modelStore.nodes.keys()].pop()!;
      modelStore.addNodalLoad3D(nodeId, 0, 0, -roofForce, 0, 0, 0, manualRoof.id);
    }
    expect(applyLoadPlan(input, { ...applyOptions, clearExisting })).toBeUndefined();
    expect.soft(combinationIds(modelStore.combinations))
      .toEqual([clearExisting && !hasManualLoad ? [plannedRoof.id] : [plannedRoof.id, manualRoof.id]]);
    modelStore.clear();
  }
});

it('#2558 a computed spectrum remains eligible beside a named planned seismic case', () => {
  const named = { symbol: 'E', factor: 1, group: 'static' } as const;
  const ordinary = { symbol: 'E', factor: 1 } as const;
  const staticCase = { id: 1, type: 'E', name: 'Static', group: named.group } as const;
  const spectrum = {
    id: 2, type: 'E', name: 'Spectrum',
    spectral: { source: { kind: 'code' }, factors: { x: 1, y: 0, z: 0 }, rule: 'srss', xi: 0, scale: 1 },
  } as const;
  restoreGroupedProject(named, ordinary);
  modelStore.restore({ ...modelStore.snapshot(), loadCases: [staticCase, spectrum] });
  const input = projectPlan([named, ordinary], [staticCase]);
  expect(previewLoadPlan(input, applyOptions.nameOf, { replaceExisting: true }).after.combinations).toBe(2);
  expect(applyLoadPlan(input, applyOptions)).toBeUndefined();
  expect(combinationIds(modelStore.combinations)).toEqual([[staticCase.id], [spectrum.id]]);
});

const snowCases = [
  { id: 1, type: 'S', name: 'Physical snow' },
  { id: 2, type: 'S', name: 'Flat-roof snow', snowBasis: 'flatRoof' as const },
];
const flatRoofTerm = { symbol: 'S', factor: 1, snowBasis: 'flatRoof' } as const;
const physicalTerm = { symbol: 'S', factor: 1 } as const;

function combinationRuleEditor() {
  const svelte = readFileSync('src/components/pro/ProCombinationRules.svelte', 'utf8');
  const script = svelte.slice(svelte.indexOf('>') + 1, svelte.indexOf('</script>'));
  const ast = ts.createSourceFile('ProCombinationRules.ts', script, ts.ScriptTarget.ESNext, true);
  const names = ['matchesFactor', 'factorOf', 'write', 'setFactor', 'importTemplate'];
  const declarations = ast.statements.filter(statement =>
    ts.isFunctionDeclaration(statement) ? names.includes(statement.name?.text ?? '') :
      ts.isVariableStatement(statement) && statement.declarationList.declarations.some(d => names.includes(d.name.getText(ast))));
  const { outputText } = ts.transpileModule(declarations.map(d => d.getText(ast)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  const makeEditor = new Function('modelStore', 'RULE_SYMBOLS', 'rulesFromTemplate', 'freshRuleIds', 'uiStore', 'tp', 't',
    `const rules = modelStore.combinationRules; ${outputText} return { setFactor, importTemplate };`);
  return makeEditor(modelStore, RULE_SYMBOLS, rulesFromTemplate, freshRuleIds, uiStore, tp, (key: string) => key) as {
    setFactor: (id: string, symbol: CombinationTerm['symbol'], raw: string, snowBasis?: 'flatRoof') => void;
    importTemplate: (event: { currentTarget: { files: { text: () => Promise<string> }[]; value: string } }) => Promise<void>;
  };
}

async function importSnowRule() {
  const template = rulesToTemplate([{ id: 'snow', purpose: 'strength', terms: [flatRoofTerm] }], 'Snow');
  await combinationRuleEditor().importTemplate({ currentTarget: { files: [{ text: async () => template }], value: 'snow.json' } });
}

it('#2558 template import preserves an ungrouped flat-roof snow term', async () => {
  modelStore.setCombinationRules([]);
  await importSnowRule();
  expect(modelStore.combinationRules[0]?.terms).toEqual([flatRoofTerm]);
});

it('#2558 editing an ungrouped snow factor keeps its flat-roof basis', async () => {
  for (const imported of [false, true]) {
    modelStore.restore({ ...modelStore.snapshot(), loadCases: snowCases, combinationRules: [] });
    if (imported) await importSnowRule();
    else modelStore.setCombinationRules([{ id: 'snow', purpose: 'strength', terms: [flatRoofTerm] }]);
    const id = modelStore.combinationRules[0]!.id;
    expect(projectCombinations()[0]?.factors).toEqual([{ caseId: 2, factor: 1 }]);
    combinationRuleEditor().setFactor(id, 'S', '2', 'flatRoof');
    expect.soft(modelStore.combinationRules[0]?.terms).toEqual([{ ...flatRoofTerm, factor: 2 }]);
    expect.soft(projectCombinations()[0]?.factors).toEqual([{ caseId: 2, factor: 2 }]);
  }
});

it('#2558 the editor can update and clear either ungrouped snow basis independently', () => {
  const grouped = { ...flatRoofTerm, group: 'roof' };
  const rule = restoreGroupedProject(physicalTerm, flatRoofTerm, grouped);
  combinationRuleEditor().setFactor(rule.id, 'S', '2', 'flatRoof');
  expect.soft(modelStore.combinationRules[0]?.terms).toEqual([physicalTerm, { ...flatRoofTerm, factor: 2 }, grouped]);
  const html = render(ProCombinationRules).body;
  expect.soft(html.match(/<input[^>]+data-testid="combo-rule-grouped-S"[^>]*>/)?.[0]).toContain('value="1"');
  expect.soft(html.match(/<input[^>]+data-testid="combo-rule-grouped-S-flatRoof"[^>]*>/)?.[0]).toContain('value="2"');
  combinationRuleEditor().setFactor(rule.id, 'S', '', 'flatRoof');
  expect.soft(modelStore.combinationRules[0]?.terms).toEqual([physicalTerm, grouped]);
  combinationRuleEditor().setFactor(rule.id, 'S', '3', 'flatRoof');
  expect.soft(modelStore.combinationRules[0]?.terms).toEqual([physicalTerm, grouped, { ...flatRoofTerm, factor: 3 }]);
  combinationRuleEditor().setFactor(rule.id, 'S', '0');
  expect(modelStore.combinationRules[0]?.terms).toEqual([grouped, { ...flatRoofTerm, factor: 3 }]);
});

const deadTerm = { symbol: 'D', factor: 1 } as const;
const duplicateDeadTerm = { ...deadTerm, factor: 2 };

function displayedFactor(id: string, symbol: string) {
  return render(ProCombinationRules).body.match(new RegExp(`<input[^>]+data-testid="combo-rule-${id}-${symbol}"[^>]*>`))?.[0];
}

it.each(['saved', 'imported'])('#2566 the editor displays, replaces and clears the total factor of %s duplicate terms', async source => {
  const grouped = { ...deadTerm, group: 'permanent' };
  const terms = [deadTerm, physicalTerm, duplicateDeadTerm, grouped];
  if (source === 'imported') {
    modelStore.setCombinationRules([]);
    const template = rulesToTemplate([{ id: 'grouped', purpose: 'strength', terms }], 'Repeated dead');
    await combinationRuleEditor().importTemplate({ currentTarget: { files: [{ text: async () => template }], value: 'repeated.json' } });
  } else {
    restoreGroupedProject(...terms);
  }
  const { id } = modelStore.combinationRules[0]!;
  expect.soft(displayedFactor(id, 'D')).toContain('value="3"');
  combinationRuleEditor().setFactor(id, 'D', '3');
  expect.soft(modelStore.combinationRules[0]?.terms.filter(t => t.symbol === 'D')).toEqual([{ ...deadTerm, factor: 3 }, grouped]);
  modelStore.setCombinationRules([{ id, purpose: 'strength', terms }]);
  combinationRuleEditor().setFactor(id, 'D', '');
  expect(modelStore.combinationRules[0]?.terms).toEqual([physicalTerm, grouped]);
});

it('#2566 cancelling flat-roof terms display as empty and clear independently', () => {
  const grouped = { ...flatRoofTerm, group: 'roof' };
  const rule = restoreGroupedProject(physicalTerm, flatRoofTerm, { ...flatRoofTerm, factor: -1 }, grouped);
  expect.soft(displayedFactor(rule.id, 'S-flatRoof')).toContain('value=""');
  combinationRuleEditor().setFactor(rule.id, 'S', '0', 'flatRoof');
  expect(modelStore.combinationRules[0]?.terms).toEqual([physicalTerm, grouped]);
});

const combinationRoutes = [
  '2D linear', '3D sync linear', '3D async linear', '3D sync pdelta', '3D async pdelta',
  '3D sync uplift', '3D async uplift', '3D direct', '3D worker direct',
] as const;

async function solveCombinationReactions(route: typeof combinationRoutes[number], base: number, tip: number) {
  const dim = route === '2D linear' ? '2d' : '3d';
  const model = modelStore.model as ModelData;
  const { loadCases, combinations } = modelStore;
  const worker = route.includes('async') || route.includes('worker');
  const jobs = worker ? recordWorkerJobs() : [];
  let reactions: number[];
  if (dim === '2d') {
    const solved = solveCombinations2D(model, loadCases, combinations);
    if (!solved || typeof solved === 'string') throw new Error(String(solved));
    reactions = [...solved.perCombo.values()].map(result => result.reactions.find(r => r.nodeId === base)!.rz);
  } else if (route.endsWith('direct')) {
    const solved = await runDirectAnalysis(model, loadCases, combinations, {
      includeSelfWeight: false, settings: { notional: 0, tauB: 'unity' },
      ...(worker ? { run: workerPDelta(pdelta3DInWorker) } : {}),
    });
    if (typeof solved === 'string') throw new Error(solved);
    if (worker) expect(jobs).toContain('pdelta3d');
    reactions = [...solved.perCombo.values()].map(result => result.reactions.find(r => r.nodeId === base)!.fz);
  } else {
    if (route.endsWith('uplift')) {
      const support = modelStore.addSupport(tip, 'custom3d', undefined, {
        dofRestraints: { tx: false, ty: false, tz: true, rx: false, ry: false, rz: false },
      });
      modelStore.updateSupport(support, { uplift: true });
    } else {
      modelStore.setAnalysis({ perCombination: route.endsWith('pdelta') ? 'pdelta' : 'linear' });
    }
    const solve = worker ? solveCombinations3DParallel : solveCombinations3D;
    const solved = await solve(model, loadCases, combinations);
    if (!solved || typeof solved === 'string') throw new Error(String(solved));
    if (worker) expect(jobs).toContain(route.endsWith('uplift') ? 'nonlinear-step' : route.endsWith('pdelta') ? 'pdelta3d' : 'solve3d');
    if (route.endsWith('pdelta')) {
      for (const result of solved.perCombo.values()) expect.soft(result.secondOrder).toMatchObject({ stable: true, converged: true });
    }
    reactions = [...solved.perCombo.values()].map(result => result.reactions.reduce((sum, r) => sum + r.fz, 0));
  }
  return reactions;
}

const combinationRegressions = ['alternatives', 'snow', 'roof live', 'generated roof live', 'duplicate factors'] as const;

for (const route of combinationRoutes) for (const failure of combinationRegressions) {
  if (route === '2D linear' && (failure === 'roof live' || failure === 'generated roof live')) continue;
  const review = failure === 'generated roof live' || failure === 'duplicate factors';
  it(`${review ? '#2566' : '#2558'} ${route} solves the corrected ${failure} combinations`, async () => {
    const dim = route === '2D linear' ? '2d' : '3d';
    let expected: number[];
    let base: number;
    let tip: number;
    if (failure === 'roof live' || failure === 'generated roof live') {
      const fixture = roofLiveFixture(plannedFloor.alternatives, true, failure === 'generated roof live');
      if (failure === 'generated roof live') modelStore.addCombination('Manual reference', [{ caseId: manualRoof.id, factor: 1 }]);
      base = fixture.base;
      tip = [...modelStore.nodes.keys()].pop()!;
      expect(applyLoadPlan(fixture.input, applyOptions)).toBeUndefined();
      expected = [(roofForce + floorForce) * roofLiveTerm.factor];
      if (failure === 'generated roof live') expected.push(roofForce);
    } else if (failure === 'alternatives') {
      restoreGroupedProject(...lateralTerms);
      modelStore.restore({ ...modelStore.snapshot(), loadCases: [...lateralCases] });
      ({ base, tip } = loadedCantilever(dim, lateralCases.map((c, i) => [c.id, lateralForces[i]!])));
      addGeneratedCombinations(projectCombinations());
      expected = lateralSelections.map(ids => ids.reduce((sum, id) => sum + lateralForces[id - 1]!, 0));
    } else if (failure === 'duplicate factors') {
      const rule = restoreGroupedProject(deadTerm, duplicateDeadTerm);
      modelStore.restore({ ...modelStore.snapshot(), loadCases: [{ id: 1, type: 'D', name: 'Dead' }] });
      ({ base, tip } = loadedCantilever(dim, [[1, floorForce]]));
      combinationRuleEditor().setFactor(rule.id, 'D', '3');
      addGeneratedCombinations(projectCombinations());
      expected = [floorForce * 3];
    } else {
      const rule = restoreGroupedProject(flatRoofTerm);
      modelStore.restore({ ...modelStore.snapshot(), loadCases: snowCases });
      ({ base, tip } = loadedCantilever(dim, [[1, floorForce], [2, roofForce]]));
      combinationRuleEditor().setFactor(rule.id, 'S', '2', 'flatRoof');
      addGeneratedCombinations(projectCombinations());
      expected = [roofForce * 2];
    }

    const reactions = await solveCombinationReactions(route, base, tip);
    expect.soft(reactions).toHaveLength(expected.length);
    reactions.sort((a, b) => b - a);
    for (const [i, force] of expected.sort((a, b) => b - a).entries()) expect.soft(reactions[i]).toBeCloseTo(force, 8);
  });
}

it('#2558 the recheck notice follows the saved combination and load evidence', () => {
  const id = 'combination-alternative-coverage';
  const changes = (snapshot: Parameters<typeof assessProject>[0]) =>
    assessProject(snapshot, undefined, 'pro').changes.map(change => change.id);
  const rules = [{ id: 'lateral', terms: lateralTerms }];
  expect(changes({ loadCases: [...lateralCases], combinationRules: rules })).toContain(id);

  const roof = {
    loadCases: [plannedRoof, { ...manualRoof, alternatives: 'independent' }],
    combinationRules: [{ id: 'roof', terms: [roofLiveTerm] }],
    loads: [{ type: 'nodal3d', data: { caseId: plannedRoof.id, generatedBy: 'load-plan' } }],
  };
  expect(changes(roof)).toContain(id);
  expect(changes({ ...roof, loadCases: [plannedRoof] })).not.toContain(id);

  const combinations = [{ id: 1, factors: [{ caseId: 1, factor: 2 }] }];
  expect(changes({ loadCases: snowCases, combinations })).toContain(id);
  expect(changes({ loadCases: snowCases.slice(0, 1), combinations })).not.toContain(id);
});

it('#2566 recheck identifies occupied generated cases and repeated editable terms', () => {
  const notice = 'retained-case-and-rule-factors';
  const changes = () => assessProject(modelStore.snapshot(), null, 'pro').changes.map(change => change.id);
  const rule = restoreGroupedProject(deadTerm, duplicateDeadTerm);
  expect(changes()).toContain(notice);
  modelStore.setCombinationRules([{ ...rule, terms: [deadTerm, { ...duplicateDeadTerm, group: 'permanent' }] }]);
  expect(changes()).not.toContain(notice);
  roofLiveFixture('independent', false, true);
  expect(changes()).toContain(notice);
  modelStore.replaceLoads([]);
  expect(changes()).not.toContain(notice);
});

const rankingCases = [
  { id: 1, type: 'L', name: 'Whole floor', alternatives: 'floor' },
  { id: 2, type: 'L', name: 'First floor pattern', alternatives: 'floor', pattern: true },
  { id: 3, type: 'L', name: 'Second floor pattern', alternatives: 'floor', pattern: true },
  { id: 4, type: 'Lr', name: 'Whole roof', alternatives: 'roof' },
  { id: 5, type: 'Lr', name: 'Roof pattern', alternatives: 'roof', pattern: true },
] as const;
const rankingRoofTerm = { symbol: 'Lr', factor: 1.5 } as const;
const rankingForces = [floorForce, livePatternForce, 8, roofForce, 7] as const;
const rankingReactions = rankingForces.slice(0, 3).map(v => 2 * v + rankingRoofTerm.factor * rankingForces[3]);

function rankingProject(dim: '2d' | '3d', repeated: boolean) {
  const terms = repeated ? [floorTerm, floorTerm, rankingRoofTerm] : [{ ...floorTerm, factor: 2 }, rankingRoofTerm];
  const rule = restoreGroupedProject(...terms);
  const snapshot = modelStore.snapshot();
  modelStore.restore({ ...snapshot, loadCases: [...rankingCases], nextId: { ...snapshot.nextId!, loadCase: rankingCases.length + 1 } });
  const cantilever = loadedCantilever(dim, rankingCases.map(({ id }, i) => [id, rankingForces[i]!]));
  return { ...cantilever, rule };
}

function expectRankingReactions(reactions: number[]) {
  expect.soft(reactions).toHaveLength(rankingReactions.length);
  reactions.sort((a, b) => a - b);
  const expected = [...rankingReactions].sort((a, b) => a - b);
  for (const [i, force] of expected.entries()) expect.soft(reactions[i]).toBeCloseTo(force, 8);
}

for (const route of combinationRoutes) {
  it(`#2569 ${route} includes the governing floor pattern from a saved project rule`, async () => {
    const { base, tip } = rankingProject(route === '2D linear' ? '2d' : '3d', true);
    expect(deserializeProject(serializeProject())).toBe(true);
    addGeneratedCombinations(projectCombinations());
    expectRankingReactions(await solveCombinationReactions(route, base, tip));
  });
}

for (const writer of ['composite cases', 'Auto Loads'] as const) {
  it(`#2569 an imported template keeps the floor patterns when generating ${writer}`, async () => {
    const { base, tip, rule } = rankingProject('3d', true);
    expect(deserializeProject(serializeProject())).toBe(true);
    const template = rulesToTemplate([rule], 'Repeated floor live');
    modelStore.setCombinationRules([]);
    await combinationRuleEditor().importTemplate({ currentTarget: { files: [{ text: async () => template }], value: 'repeated.json' } });

    if (writer === 'composite cases') {
      addCompositeCases(projectCombinations());
      expect.soft(modelStore.loadCases.filter(c => c.generated && c.includes?.length)).toHaveLength(3);
    } else {
      const terms = modelStore.combinationRules[0]!.terms;
      const input = { ...plan(...terms), cases: rankingCases.map(({ id, name, ...c }) => ({ ...c, existingId: id, nameKey: name, own: true })) };
      expect.soft(describePlanDelta(input, empty, { replaceExisting: true }).after.combinations).toBe(3);
      expect.soft(previewLoadPlan(input, applyOptions.nameOf, { replaceExisting: true }).after.combinations).toBe(3);
      expect(applyLoadPlan(input, applyOptions)).toBeUndefined();
    }
    expectRankingReactions(await solveCombinationReactions('3D sync linear', base, tip));
  });
}

it('#2569 a canonical rule still includes the governing floor pattern', async () => {
  const { base, tip } = rankingProject('3d', false);
  addGeneratedCombinations(projectCombinations());
  expectRankingReactions(await solveCombinationReactions('3D sync linear', base, tip));
});

it('#2569 Preview and Apply refuse an overflowing rule before saving combinations', () => {
  rankingProject('3d', false);
  const large = { ...floorTerm, factor: Number.MAX_VALUE };
  const input = { ...plan(large, large, rankingRoofTerm), cases: rankingCases.map(({ id, name, ...c }) => ({ ...c, existingId: id, nameKey: name, own: true })) };
  const before = modelStore.snapshot();
  const message = tp('combos.refused.factorTotal', { rule: input.combinations[0]!.label });
  expect.soft(engineGuarded(() => previewLoadPlan(input, applyOptions.nameOf, { replaceExisting: true })).error).toBe(message);
  expect.soft(engineGuarded(() => applyLoadPlan(input, applyOptions)).error).toBe(message);
  expect(modelStore.snapshot()).toEqual(before);
});

it('#2569 recheck requests regeneration for repetitions within the same action', () => {
  const id = 'repeated-combination-pattern-ranking';
  const notices = (...terms: CombinationTerm[]) => {
    const combinationRules = [{ id: 'pattern', purpose: 'strength', terms }];
    return assessProject({ loadCases: [...rankingCases], combinationRules }, null, 'pro').changes;
  };
  const named = { ...floorTerm, group: 'floor' };
  expect.soft(notices(floorTerm, floorTerm)).toContainEqual(expect.objectContaining({ id, requiresLoadRegeneration: true }));
  expect.soft(notices(named, named)).toContainEqual(expect.objectContaining({ id, requiresLoadRegeneration: true }));
  expect.soft(notices(named, floorTerm).map(change => change.id)).not.toContain(id);
  expect.soft(notices(physicalTerm, flatRoofTerm).map(change => change.id)).not.toContain(id);
  expect(notices(floorTerm, { ...floorTerm, factor: 0 }).map(change => change.id)).not.toContain(id);
});
