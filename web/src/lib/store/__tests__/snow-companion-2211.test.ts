import { t } from '../../i18n';
import { expect, it } from 'vitest';
import { modelStore } from '../model.svelte';
import '../index';
import { applyLoadPlan } from '../apply-load-plan';
import { buildLoadPlan } from '../../engine/loads/load-plan';
import { mesh } from '../../engine/loads/__tests__/snow-surface-round2-fixture';
import { regulations, snow } from '../../engine/loads/__tests__/snow-roof-plane-fixture';
import { generateCombinations } from '../../codes/cirsoc101/combinations';
import { describePlanDelta } from '../../engine/loads/load-plan-delta';
import { expandCombinations } from '../../engine/loads/combination-cases';

it('#2211 applying and saving generated snow preserves the physical basis and companion member load', () => {
  modelStore.clear();
  const model = mesh([[[0, 0, 3], [10, 0, 3 + 10 * Math.tan(20 * Math.PI / 180)]]]);
  for (const n of model.nodes.values()) modelStore.addNode(n.x, n.y, n.z);
  modelStore.addElement(1, 2, 'frame');
  const plan = buildLoadPlan({ model, regulations: regulations(), dead: [], occupancyKey: 'vivienda', tributaryWidth: 1,
    reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true,
    snow: { ...snow, enabled: true, source: 'site', roofKind: 'mono' } });
  expect(plan.outcome).toBe('READY');
  expect(describePlanDelta(plan, { distributed: 0, nodal: 0, combinations: 0, caseTypes: [] }, { replaceExisting: true }).after.combinations).toBeGreaterThan(0);
  const apply = () => applyLoadPlan(plan, { clearExisting: true, bothSenses: false, nameOf: key => key });
  apply();
  const initialIds = modelStore.model.loadCases.map(c => c.id);
  apply();
  expect(modelStore.model.loadCases.map(c => c.id)).toEqual(initialIds);
  const snapshot = modelStore.snapshot();
  modelStore.restore(JSON.parse(JSON.stringify(snapshot)));
  const flat = modelStore.model.loadCases.filter(c => c.snowBasis === 'flatRoof');
  expect(flat).toHaveLength(1);
  expect(flat[0]!.solve).toBe(false);
  const id = flat[0]!.id;
  const loads = modelStore.loads.filter(l => l.data.caseId === id);
  expect(loads.length).toBeGreaterThan(0);
  expect(loads.every(l => l.type === 'distributed3d')).toBe(true);
  for (const l of loads) {
    if (l.type !== 'distributed3d') throw new Error('Expected member loading');
    expect(l.data.qZI).toBeCloseTo(-0.7, 11);
    expect(l.data.qZJ).toBeCloseTo(-0.7, 11);
    expect(l.data.frame).toBe('projected');
  }
  const specs = generateCombinations({ present: { L: true, Lr: false, S: true, R: false, W: false, E: false, F: false, H: false }, notActing: false });
  const combos = expandCombinations(specs, modelStore.model.loadCases);
  expect(combos.find(c => c.specId === '2-S')!.factors.some(f => f.caseId === id && f.factor === 0.5)).toBe(true);
  expect(combos.filter(c => c.specId.startsWith('3-')).every(c => c.factors.every(f => f.caseId !== id))).toBe(true);
});

it('#2211 preview and apply refuse legacy seismic and unavailable flat-roof loading through the shared expander', () => {
  const model = mesh([[[0, 0, 3], [10, 0, 3 + 10 * Math.tan(20 * Math.PI / 180)]]]);
  const base = buildLoadPlan({ model, regulations: regulations(), dead: [], occupancyKey: 'vivienda', tributaryWidth: 1,
    reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true,
    snow: { ...snow, enabled: true, source: 'site', roofKind: 'mono' } });
  const flat = base.combinations.find(c => c.id === '2-S')!;
  const legacy = { ...flat, id: '5', terms: [{ symbol: 'E' as const, factor: 1 }, { symbol: 'S' as const, factor: 0.7 }] };
  for (const both of [false, true]) for (const kind of ['legacy', 'no-S', 'physical-only'] as const) {
    modelStore.clear();
    const plan = { ...base, distributed: [], nodal: [], surface: [], thermal: [],
      cases: base.cases.filter(c => kind === 'legacy' || (kind === 'physical-only' && !c.snowBasis) || c.type !== 'S'),
      combinations: [kind === 'legacy' ? legacy : flat] };
    const message = t(kind === 'legacy' ? 'snow.refused.legacyCombination' : 'snow.refused.flatRoofCase');
    expect.soft(() => describePlanDelta(plan, { distributed: 0, nodal: 0, combinations: 0, caseTypes: [] },
      { replaceExisting: true, bothSenses: { E: both } })).toThrow(message);
    expect.soft(() => applyLoadPlan(plan, { clearExisting: true, bothSenses: both, nameOf: key => key })).toThrow(message);
  }
});
