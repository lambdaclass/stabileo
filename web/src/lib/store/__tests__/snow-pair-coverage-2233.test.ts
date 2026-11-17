import { expect, it } from 'vitest';
import { modelStore, uiStore } from '../index';
import { applyLoadPlan } from '../apply-load-plan';
import { buildLoadPlan, type LoadPlan } from '../../engine/loads/load-plan';
import { describePlanDelta } from '../../engine/loads/load-plan-delta';
import { expandCombinations } from '../../engine/loads/combination-cases';
import { mesh } from '../../engine/loads/__tests__/snow-surface-round2-fixture';
import { regulations } from '../../engine/loads/__tests__/snow-roof-plane-fixture';
import { completeSnowPair, pairedSpecs, partialSnowPair } from '../../engine/loads/__tests__/snow-pair-coverage-2233-fixture';

const empty = { distributed: 0, nodal: 0, combinations: 0, caseTypes: [] };
const planFor = (complete: boolean): LoadPlan => {
  const base = buildLoadPlan({ model: mesh([[[0, 0, 3], [10, 0, 3]]]), regulations: regulations(), dead: [],
    occupancyKey: 'vivienda', tributaryWidth: 1, reductionElementKind: 'interiorBeam', floorsSupported: 1,
    applyLiveReduction: false, generateCombinations: false });
  expect(base.outcome).toBe('READY');
  return { ...base, distributed: [], nodal: [], surface: [], thermal: [],
    cases: (complete ? completeSnowPair : partialSnowPair).map(({ id, name, ...c }) => ({ ...c, existingId: null, nameKey: name })),
    combinations: pairedSpecs() };
};

for (const mode of ['2d', '3d', 'pro'] as const) for (const analysis of ['linear', 'pdelta'] as const) for (const entry of ['preview', 'apply'] as const) {
  it(`known wrong result: #2233 partial snow pair refuses ${mode} ${analysis} ${entry}`, () => {
    for (const both of [false, true]) for (const patterns of [false, true]) {
      modelStore.clear();
      uiStore.analysisMode = mode;
      modelStore.setAnalysis({ perCombination: analysis });
      const plan = JSON.parse(JSON.stringify(planFor(false)));
      const action = () => entry === 'preview'
        ? describePlanDelta(plan, empty, { replaceExisting: true, bothSenses: { E: both }, patternsInCompanions: patterns })
        : applyLoadPlan(plan, { clearExisting: true, bothSenses: both, patternsInCompanions: patterns, nameOf: key => key });
      expect(action).toThrow('snow.refused.physicalCase');
    }
  });

  it(`#2233 complete snow pair retains both groups ${mode} ${analysis} ${entry}`, () => {
    for (const both of [false, true]) {
      modelStore.clear();
      uiStore.analysisMode = mode;
      modelStore.setAnalysis({ perCombination: analysis });
      const plan = planFor(true);
      const expected = expandCombinations(pairedSpecs(), completeSnowPair, { bothSenses: { E: both } });
      if (entry === 'preview') {
        expect(describePlanDelta(plan, empty, { replaceExisting: true, bothSenses: { E: both } }).after.combinations).toBe(expected.length);
        continue;
      }
      applyLoadPlan(plan, { clearExisting: true, bothSenses: both, nameOf: key => key });
      modelStore.restore(JSON.parse(JSON.stringify(modelStore.snapshot())));
      const actual = modelStore.combinations.filter(c => expected.some(e => e.name === c.name));
      expect(actual).toHaveLength(expected.length);
      for (const combo of expected) {
        const factors = combo.factors.map(f => {
          const source = completeSnowPair.find(c => c.id === f.caseId)!;
          const restored = modelStore.model.loadCases.find(c => c.name === source.name)!;
          expect(restored).toBeDefined();
          return { caseId: restored.id, factor: f.factor };
        });
        expect(actual.find(c => c.name === combo.name)!.factors).toEqual(factors);
      }
    }
  });
}
