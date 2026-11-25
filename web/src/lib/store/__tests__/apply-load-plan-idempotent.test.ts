import { beforeEach, expect, it } from 'vitest';
import { buildLoadPlan } from '../../engine/loads/load-plan';
import { mesh } from '../../engine/loads/__tests__/snow-surface-round2-fixture';
import { regulations } from '../../engine/loads/__tests__/snow-roof-plane-fixture';
import { applyLoadPlan, previewLoadPlan } from '../apply-load-plan';
import { deserializeProject, serializeProject } from '../file';
import { modelStore, uiStore } from '../index';

const repeatApply = process.env.RUN_KNOWN_WRONG === '2566' ? it : it.skip;
const replace = { nameOf: (key: string) => key, clearExisting: true, bothSenses: false };

beforeEach(() => {
  uiStore.analysisMode = 'pro';
  modelStore.clear();
});

function windPlans(group?: string) {
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
  const oldWind = modelStore.addLoadCase('Wind -X', 'W', { group });
  const current = {
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
  const previous = {
    ...current,
    cases: [...current.cases, { existingId: oldWind, type: 'W', nameKey: 'Wind -X', own: true, group }],
    nodal: [...current.nodal, { nodeId: node, caseType: 'W', caseIndex: 2, fx: -5, fy: 0, fz: 0 }],
  };
  return { current, previous, node, dead, wind, oldWind };
}

function loadCatalog() {
  const { loadCases, combinations, resultScopes } = modelStore.snapshot();
  return { loadCases, combinations, resultScopes };
}

for (const { source, alsoUnmarked, group } of [
  { source: 'open project', alsoUnmarked: false },
  { source: 'reopened project', alsoUnmarked: false },
  { source: 'reopened project with a named wind group', alsoUnmarked: true, group: 'wind' },
]) {
  repeatApply(`known wrong result: #2566 — replacing the same wind plan twice in a ${source} preserves the exact catalog`, () => {
    const { current, previous, dead, wind, oldWind } = windPlans(group);
    expect(applyLoadPlan(previous, replace)).toBeUndefined();
    expect(modelStore.loads.some(l => l.data.caseId === oldWind)).toBe(true);
    const noWind = modelStore.addLoadCase('No wind', 'W', { group });
    const expected = [[dead, wind], [dead, noWind]].map(ids => ids.map(caseId => ({ caseId, factor: 1 })));
    let once: ReturnType<typeof loadCatalog> | undefined;
    for (const apply of [1, 2]) {
      if (apply === 2 && source.startsWith('reopened')) expect(deserializeProject(serializeProject())).toBe(true);
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

repeatApply('known wrong result: #2566 — repeat Apply retains full strength and service identities with the surviving manual load', () => {
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
