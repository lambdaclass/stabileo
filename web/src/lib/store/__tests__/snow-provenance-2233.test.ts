import { expect, it } from 'vitest';
import { modelStore, uiStore } from '../index';
import { applyLoadPlan } from '../apply-load-plan';
import { buildLoadPlan, type LoadPlan } from '../../engine/loads/load-plan';
import { describePlanDelta } from '../../engine/loads/load-plan-delta';
import { expandCombinations } from '../../engine/loads/combination-cases';
import { mesh } from '../../engine/loads/__tests__/snow-surface-round2-fixture';
import { regulations } from '../../engine/loads/__tests__/snow-roof-plane-fixture';
import { flatSpec, legacyOmittedE, snowCases } from '../../engine/loads/__tests__/snow-provenance-2233-fixture';

const empty = { distributed: 0, nodal: 0, combinations: 0, caseTypes: [] };
const planFor = (legacy: boolean): LoadPlan => {
  const base = buildLoadPlan({ model: mesh([[[0, 0, 3], [10, 0, 3]]]), regulations: regulations(), dead: [],
    occupancyKey: 'vivienda', tributaryWidth: 1, reductionElementKind: 'interiorBeam', floorsSupported: 1,
    applyLiveReduction: false, generateCombinations: false });
  expect(base.outcome).toBe('READY');
  return { ...base, distributed: [], nodal: [], surface: [], thermal: [],
    cases: snowCases.map(c => ({ existingId: null, type: c.type, nameKey: c.name, ...('snowBasis' in c ? { snowBasis: c.snowBasis } : {}),
      ...(legacy && c.type === 'S' ? { alternatives: 'roof' } : {}) })),
    combinations: [legacy ? legacyOmittedE() : flatSpec()] };
};

for (const mode of ['2d', '3d', 'pro'] as const) for (const analysis of ['linear', 'pdelta'] as const) for (const entry of ['preview', 'apply'] as const) {
  it(`known wrong result: #2233 preview and apply refuse omitted-E legacy snow ${mode} ${analysis} ${entry}`, () => {
    for (const both of [false, true]) {
      modelStore.clear();
      uiStore.analysisMode = mode;
      modelStore.setAnalysis({ perCombination: analysis });
      const plan = JSON.parse(JSON.stringify(planFor(true)));
      const action = () => entry === 'preview'
        ? describePlanDelta(plan, empty, { replaceExisting: true, bothSenses: { E: both } })
        : applyLoadPlan(plan, { clearExisting: true, bothSenses: both, nameOf: key => key });
      expect(action).toThrow('snow.refused.legacyCombination');
    }
  });

  it(`known wrong result: #2233 preview apply and reopen accept one ungrouped snow pair ${mode} ${analysis} ${entry}`, () => {
    for (const both of [false, true]) {
      modelStore.clear();
      uiStore.analysisMode = mode;
      modelStore.setAnalysis({ perCombination: analysis });
      const plan = planFor(false);
      if (entry === 'preview') {
        expect(describePlanDelta(plan, empty, { replaceExisting: true, bothSenses: { E: both } }).after.combinations).toBe(1);
        continue;
      }
      applyLoadPlan(plan, { clearExisting: true, bothSenses: both, nameOf: key => key });
      const snapshot = JSON.parse(JSON.stringify(modelStore.snapshot()));
      modelStore.restore(snapshot);
      const flat = modelStore.model.loadCases.find(c => c.snowBasis === 'flatRoof')!;
      const physical = modelStore.model.loadCases.find(c => c.name === 'physical S')!;
      expect(flat).toBeDefined();
      expect(physical).toBeDefined();
      expect(flat.alternatives).toBeUndefined();
      expect(physical.alternatives).toBeUndefined();
      const combos = modelStore.combinations.filter(c => c.name === flatSpec().label);
      expect(combos).toHaveLength(1);
      expect(combos[0]!.factors.filter(f => f.caseId === flat.id || f.caseId === physical.id)).toEqual([{ caseId: flat.id, factor: 0.5 }]);
      expect(expandCombinations([flatSpec()], modelStore.model.loadCases)[0]!.factors).toEqual(combos[0]!.factors);
    }
  });
}
