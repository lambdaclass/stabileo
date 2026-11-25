import { beforeEach, expect, it } from 'vitest';
import { buildLoadPlan, type LoadPlan } from '../../engine/loads/load-plan';
import { mesh } from '../../engine/loads/__tests__/snow-surface-round2-fixture';
import { regulations } from '../../engine/loads/__tests__/snow-roof-plane-fixture';
import { applyLoadPlan, previewLoadPlan } from '../apply-load-plan';
import { deserializeProject, serializeProject } from '../file';
import { modelStore, uiStore } from '../index';

const knownWrong = process.env.RUN_KNOWN_WRONG === '2566' ? it : it.skip;
const nameOf = (key: string) => key;

beforeEach(() => {
  uiStore.analysisMode = 'pro';
  modelStore.clear();
});

function windPlan() {
  const model = mesh([[[0, 0, 3], [10, 0, 3]]]);
  const base = buildLoadPlan({
    model, regulations: regulations(), dead: [], occupancyKey: 'vivienda', tributaryWidth: 1,
    reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true,
  });
  expect(base.outcome).toBe('READY');
  const node = modelStore.addNode(0, 0, 0);
  const dead = modelStore.addLoadCase('Gravity', 'D');
  const wind = modelStore.addLoadCase('Wind +X', 'W');
  const plan: LoadPlan = {
    ...base,
    cases: [
      { existingId: dead, type: 'D', nameKey: 'Gravity' },
      { existingId: wind, type: 'W', nameKey: 'Wind +X', own: true },
    ],
    combinations: [{
      id: 'dead-with-wind', label: 'D + W', refs: [], notes: [],
      terms: [{ symbol: 'D', factor: 1 }, { symbol: 'W', factor: 1 }],
    }],
    distributed: [], surface: [], thermal: [],
    nodal: [
      { nodeId: node, caseType: 'D', fx: 0, fy: 0, fz: -3 },
      { nodeId: node, caseType: 'W', fx: 5, fy: 0, fz: 0 },
    ],
  };
  return { plan, dead, wind, node };
}

function previewAndApply(
  plan: LoadPlan, expected: readonly (readonly number[])[], clearExisting: boolean, alsoUnmarked: boolean,
) {
  expect.soft(previewLoadPlan(plan, nameOf, { replaceExisting: clearExisting, alsoUnmarked }).after.combinations)
    .toBe(expected.length);
  expect(applyLoadPlan(plan, { nameOf, clearExisting, alsoUnmarked, bothSenses: false })).toBeUndefined();
  expect(modelStore.combinations.map(c => c.factors)).toEqual(expected.map(ids =>
    ids.map(caseId => ({ caseId, factor: 1 }))));
}

for (const mode of ['append', 'replace', 'replace including unmarked'] as const) {
  for (const source of ['new', 'saved'] as const) {
    knownWrong(`known wrong result: #2566 ${mode} keeps a ${source} empty manual wind alternative in Preview and Apply`, () => {
      const { plan, dead, wind } = windPlan();
      const noWind = modelStore.addLoadCase('No wind', 'W');
      if (source === 'saved') expect(deserializeProject(serializeProject())).toBe(true);
      previewAndApply(plan, [[dead, wind], [dead, noWind]], mode !== 'append', mode === 'replace including unmarked');
      expect(modelStore.loads.map(l => l.data.caseId)).toEqual([dead, wind]);
    });
  }
}

it('#2566 Preview and Apply exclude an empty obsolete generated wind case', () => {
  const { plan, dead, wind } = windPlan();
  modelStore.addLoadCase('Old wind', 'W', { generated: true });
  previewAndApply(plan, [[dead, wind]], true, false);
});

it('#2566 Preview and Apply keep a loaded manual wind choice', () => {
  const { plan, dead, wind, node } = windPlan();
  const manual = modelStore.addLoadCase('Manual wind', 'W');
  modelStore.addNodalLoad3D(node, 1, 0, 0, 0, 0, 0, manual);
  previewAndApply(plan, [[dead, wind], [dead, manual]], true, false);
});
