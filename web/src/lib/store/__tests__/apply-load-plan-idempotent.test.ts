import { beforeEach, expect, it } from 'vitest';
import { applyCode } from '../../model/code/apply';
import { modelToCode } from '../../model/code/format';
import { buildLoadPlan, type LoadPlan } from '../../engine/loads/load-plan';
import { mesh } from '../../engine/loads/__tests__/snow-surface-round2-fixture';
import { regulations } from '../../engine/loads/__tests__/snow-roof-plane-fixture';
import { applyLoadPlan, previewLoadPlan } from '../apply-load-plan';
import { deserializeProject, serializeProject } from '../file';
import { modelStore, uiStore } from '../index';

const replace = { nameOf: (key: string) => key, clearExisting: true, bothSenses: false };

beforeEach(() => {
  uiStore.analysisMode = 'pro';
  modelStore.clear();
});

function windPlans(group?: string, useDefaultWind = false) {
  const base = buildLoadPlan({
    model: mesh([[[0, 0, 3], [10, 0, 3]]]), regulations: regulations(), dead: [],
    occupancyKey: 'vivienda', tributaryWidth: 1, reductionElementKind: 'interiorBeam',
    floorsSupported: 1, applyLiveReduction: false, generateCombinations: true,
    projectCombinations: [{
      id: 'dead-with-wind', label: 'D + W', refs: [], notes: [],
      terms: [{ symbol: 'D', factor: 1 }, { symbol: 'W', factor: 1, group }],
    }],
  });
  expect(base.outcome).toBe('READY');
  const node = modelStore.addNode(0, 0, 0);
  const dead = modelStore.addLoadCase('Gravity', 'D');
  const wind = modelStore.addLoadCase('Wind +X', 'W', { group });
  const oldWind = useDefaultWind
    ? modelStore.loadCases.find(c => c.type === 'W' && c.id !== wind)!.id
    : modelStore.addLoadCase('Wind -X', 'W', { group });
  const current: LoadPlan = {
    ...base,
    cases: [
      { existingId: dead, type: 'D', nameKey: 'Gravity' },
      { existingId: wind, type: 'W', nameKey: 'Wind +X', own: true, group },
    ],
    distributed: [], surface: [], thermal: [],
    nodal: [
      { nodeId: node, caseType: 'D', fx: 0, fy: 0, fz: -3 },
      { nodeId: node, caseType: 'W', fx: 5, fy: 0, fz: 0 },
    ],
  };
  const previous: LoadPlan = {
    ...current,
    cases: [...current.cases, { existingId: oldWind, type: 'W', nameKey: 'Wind -X', own: true, group }],
    nodal: [...current.nodal, { nodeId: node, caseType: 'W', caseIndex: 2, fx: -5, fy: 0, fz: 0 }],
  };
  return { current, previous, node, dead, wind, oldWind };
}

function loadCatalog() {
  const { loadCases, combinations, resultScopes } = modelStore.snapshot();
  return { loadCases: loadCases!, combinations: combinations!, resultScopes };
}

for (const { source, alsoUnmarked, group, useDefaultWind, reload } of [
  { source: 'open project', alsoUnmarked: false, reload: () => {} },
  { source: 'reopened project', alsoUnmarked: false, reload: () => expect(deserializeProject(serializeProject())).toBe(true) },
  { source: 'reopened project with a named wind group', alsoUnmarked: true, group: 'wind',
    reload: () => expect(deserializeProject(serializeProject())).toBe(true) },
  { source: 'project with a formerly default wind case', alsoUnmarked: false, useDefaultWind: true, reload: () => {} },
  { source: 'model imported from code', alsoUnmarked: false,
    reload: () => expect(applyCode(modelToCode(modelStore.snapshot())).applied).toBe(true) },
]) {
  it(`#2566 — replacing the same wind plan twice in a ${source} preserves the exact catalog`, () => {
    const { current, previous, dead, wind, oldWind } = windPlans(group, useDefaultWind);
    expect(applyLoadPlan(previous, replace)).toBeUndefined();
    expect(modelStore.loads.some(l => l.data.caseId === oldWind)).toBe(true);
    const noWind = modelStore.addLoadCase('No wind', 'W', { group });
    const expected = [[dead, wind], [dead, noWind]].map(ids => ids.map(caseId => ({ caseId, factor: 1 })));
    let once: ReturnType<typeof loadCatalog> | undefined;
    for (const apply of [1, 2]) {
      if (apply === 2) reload();
      expect.soft(previewLoadPlan(current, replace.nameOf, { replaceExisting: true, alsoUnmarked }).after.combinations)
        .toBe(expected.length);
      expect(applyLoadPlan(current, { ...replace, alsoUnmarked })).toBeUndefined();
      expect.soft(modelStore.combinations.map(c => c.factors)).toStrictEqual(expected);
      expect(modelStore.loads.map(l => l.data.caseId)).toStrictEqual([dead, wind]);
      if (once) expect.soft(loadCatalog()).toStrictEqual(once);
      else once = loadCatalog();
    }
  });
}

it('#2566 — repeat Apply retains full strength and service identities with the surviving manual load', () => {
  const { current, previous, node, dead, wind, oldWind } = windPlans();
  expect(applyLoadPlan(previous, replace)).toBeUndefined();
  const manualLoad = modelStore.addNodalLoad3D(node, -2, 0, 0, 0, 0, 0, oldWind);
  const [strength] = current.combinations;
  const plan = {
    ...current,
    combinations: [strength!, {
      ...strength!, id: 'service-wind', label: 'Service wind', purpose: 'service' as const,
      origin: { ...strength!.origin!, rule: 'service-wind', purpose: 'service' as const },
    }],
  };
  expect(applyLoadPlan(plan, replace)).toBeUndefined();
  const once = loadCatalog();
  expect(once.combinations.map(c => c.factors.map(f => f.caseId))).toStrictEqual([
    [dead, wind], [dead, oldWind], [dead, wind], [dead, oldWind],
  ]);
  expect(once.resultScopes?.active).toStrictEqual(once.combinations.slice(0, 2).map(c => c.id));
  expect(once.resultScopes?.envelopes?.[0]?.comboIds).toStrictEqual(once.combinations.slice(2).map(c => c.id));
  expect(applyLoadPlan(plan, replace)).toBeUndefined();
  expect(loadCatalog()).toStrictEqual(once);
  expect(modelStore.loads.find(l => l.data.id === manualLoad)?.data.caseId).toBe(oldWind);
});

it('retains a buffered manual force when a nested command applies a load plan', () => {
  const { current, node, wind } = windPlans();
  let manual = 0;
  modelStore.bulkMutate(() => {
    manual = modelStore.addNodalLoad3D(node, -2, 0, 0, 0, 0, 0, wind);
    expect(applyLoadPlan(current, { ...replace, clearExisting: false })).toBeUndefined();
  });
  expect(modelStore.loads).toHaveLength(1 + current.nodal.length);
  const retained = modelStore.loads.find(l => l.data.id === manual);
  expect(retained?.data).toMatchObject({ nodeId: node, fx: -2, caseId: wind });
  expect(retained?.data).not.toHaveProperty('generatedBy');
  for (const load of modelStore.loads.filter(l => l !== retained)) expect(load.data).toHaveProperty('generatedBy', expect.any(String));
});
