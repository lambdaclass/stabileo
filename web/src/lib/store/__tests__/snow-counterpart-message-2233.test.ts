import { expect, it } from 'vitest';
import { modelStore, uiStore } from '../index';
import { applyLoadPlan } from '../apply-load-plan';
import { buildLoadPlan, type LoadPlan } from '../../engine/loads/load-plan';
import { describePlanDelta } from '../../engine/loads/load-plan-delta';
import { completeSnowPair } from '../../engine/loads/__tests__/snow-pair-coverage-2233-fixture';
import { mesh } from '../../engine/loads/__tests__/snow-surface-round2-fixture';
import { regulations } from '../../engine/loads/__tests__/snow-roof-plane-fixture';
import { engineGuarded, errorText, runEngineAction, runEngineActionAsync } from '../engine-action';
import { setLocale, t } from '../../i18n';

const empty = { distributed: 0, nodal: 0, combinations: 0, caseTypes: [] };

for (const mode of ['2d', '3d', 'pro'] as const) for (const analysis of ['linear', 'pdelta'] as const) {
  for (const entry of ['preview', 'apply'] as const) for (const basis of [undefined, 'flatRoof'] as const) {
    it(`known wrong result: #2233 ${entry} identifies missing ${basis ?? 'physical'} snow in ${mode} ${analysis}`, async () => {
      modelStore.clear();
      uiStore.analysisMode = mode;
      modelStore.setAnalysis({ perCombination: analysis });
      const base = buildLoadPlan({ model: mesh([[[0, 0, 3], [10, 0, 3]]]), regulations: regulations(), dead: [],
        occupancyKey: 'vivienda', tributaryWidth: 1, reductionElementKind: 'interiorBeam', floorsSupported: 1,
        applyLiveReduction: false, generateCombinations: false });
      expect(base.outcome).toBe('READY');
      const cases = completeSnowPair.filter(c => !(c.alternatives === 'B' && c.snowBasis === basis));
      const plan: LoadPlan = { ...base, distributed: [], nodal: [], surface: [], thermal: [],
        cases: cases.map(({ id, name, ...c }) => ({ ...c, existingId: null, nameKey: name })),
        combinations: [{ id: 'S', label: 'S', refs: [], notes: [], terms: [{ symbol: 'S', factor: 1, snowBasis: basis }] }] };
      const action = () => entry === 'preview'
        ? describePlanDelta(plan, empty, { replaceExisting: true })
        : applyLoadPlan(plan, { clearExisting: true, bothSenses: false, nameOf: key => key });
      const key = basis === 'flatRoof' ? 'snow.refused.flatRoofCase' : 'snow.refused.physicalCase';
      expect(action).toThrow(key);
      try {
        for (const locale of ['en', 'es', 'pt'] as const) {
          setLocale(locale);
          const message = t(key);
          expect(message).not.toBe(key);
          expect(message).not.toBe(t(basis === 'flatRoof' ? 'snow.refused.physicalCase' : 'snow.refused.flatRoofCase'));
          let refusal: unknown;
          try { action(); } catch (error) { refusal = error; }
          expect(errorText(refusal)).toBe(message);
          expect(engineGuarded(action)).toEqual({ value: null, error: message });
          expect(runEngineAction(action)).toBeUndefined();
          expect(uiStore.toasts.at(-1)).toMatchObject({ type: 'error', message });
          await expect(runEngineActionAsync(async () => action())).resolves.toBeUndefined();
          expect(uiStore.toasts.at(-1)).toMatchObject({ type: 'error', message });
        }
      } finally { setLocale('en'); }
    });
  }
}

it('#2233 Apply reports the snow refusal before the unverified seismic refusal', () => {
  modelStore.clear();
  uiStore.analysisMode = '2d';
  modelStore.setAnalysis({ perCombination: 'linear' });
  const base = buildLoadPlan({ model: mesh([[[0, 0, 3], [10, 0, 3]]]), regulations: regulations(), dead: [],
    occupancyKey: 'vivienda', tributaryWidth: 1, reductionElementKind: 'interiorBeam', floorsSupported: 1,
    applyLiveReduction: false, generateCombinations: false });
  expect(base.outcome).toBe('READY');
  const complete: LoadPlan = { ...base, distributed: [], nodal: [], surface: [], thermal: [],
    cases: completeSnowPair.map(({ id, name, ...c }) => ({ ...c, existingId: null, nameKey: name })),
    combinations: [{ id: 'S', label: 'S', refs: [], notes: [], terms: [{ symbol: 'S', factor: 1 }] }] };
  const incomplete = { ...complete, cases: complete.cases.filter(c => c.nameKey !== 'physical B') };
  const apply = (p: LoadPlan) => applyLoadPlan(p, { clearExisting: true, bothSenses: false, nameOf: key => key });
  const before = JSON.stringify(modelStore.snapshot());

  expect.soft(() => apply(incomplete)).toThrow('snow.refused.physicalCase');
  expect(JSON.stringify(modelStore.snapshot())).toBe(before);
  expect(apply(complete)).toEqual({ key: 'loadPlan.blocked.modalUnavailable' });
  expect(JSON.stringify(modelStore.snapshot())).toBe(before);
});
