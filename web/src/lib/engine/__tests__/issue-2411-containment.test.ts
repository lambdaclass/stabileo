import { beforeEach, expect, it } from 'vitest';
import { t } from '../../i18n';
import { modelFeatures } from '../../provenance/model-features';
import { modelStore, uiStore } from '../../store';
import type { LoadCase, LoadCombination } from '../../store/model.svelte';
import { runDirectAnalysis } from '../direct-analysis';
import {
  buildSolverInput3D, buildSolverLoads3D, prepareSolverInput3D,
  solveCombinations3D, solveCombinations3DParallel, validateAndSolve3D, validateAndSolve3DAsync,
} from '../solver-service';

const source: LoadCase = { id: 1, name: 'Source', type: 'D', reference: true };
const notional: LoadCase = {
  id: 2, name: 'Notional', type: 'N', solve: false,
  notional: { sourceCaseId: source.id, ratio: 0.002, dir: '+X' },
};
const lateral: LoadCase = { id: 3, name: 'Lateral', type: 'W' };
const composite: LoadCase = {
  id: 4, name: 'Composite', type: 'W', reference: true,
  includes: [{ caseId: notional.id, factor: 1 }],
};
const couple = 5;
const length = 2;

beforeEach(() => {
  uiStore.analysisMode = '3d';
  uiStore.useNative3DPresentation();
  uiStore.includeSelfWeight = false;
  modelStore.clear();
});

function verticalMember(
  a: number,
  moments: { my?: number; mz?: number },
  mode: 'linear' | 'nonlinear' | 'pdelta' = 'linear',
) {
  if (mode === 'nonlinear') uiStore.analysisMode = 'pro';
  if (mode === 'pdelta') modelStore.model.analysis = { ...modelStore.model.analysis, perCombination: 'pdelta' };
  const root = modelStore.addNode(0, 0, 0);
  const tip = modelStore.addNode(0, 0, length);
  const member = modelStore.addElement(root, tip);
  modelStore.addSupportEntry({ nodeId: root, type: 'fixed3d', ...(mode === 'nonlinear' ? { uplift: true } : {}) });
  modelStore.model.loads = [{
    type: 'pointOnElement', data: { id: 1, elementId: member, caseId: source.id, a, p: 0, ...moments },
  }];
  return { root, tip, member };
}

function combination(caseId: number): LoadCombination {
  return { id: 1, name: 'Selected case', factors: [{ caseId, factor: 1 }] };
}

async function solveAll(cases: LoadCase[], combos: LoadCombination[]) {
  const model = modelStore.model;
  return [
    solveCombinations3D(model, cases, combos),
    await solveCombinations3DParallel(model, cases, combos),
    await runDirectAnalysis(model, cases, combos, { includeSelfWeight: false }),
  ];
}

function refusal(member: number) {
  return t('svc.planarPointLoadNoProjection').replace('{load}', '1').replace('{n}', String(member));
}

const cases = [source, notional, lateral, composite];
const modes = ['linear', 'nonlinear', 'pdelta'] as const;
const aliases = [{ my: couple }, { mz: couple }, { my: 0, mz: couple }];

for (const mode of modes) {
  async function expectInteriorRefusal(moments: (typeof aliases)[number]) {
    const { root, member } = verticalMember(1, moments, mode);
    modelStore.addNodalLoad3D(root, 1, 0, 0, 0, 0, 0, source.id);
    const model = modelStore.model;
    const reason = refusal(member);

    expect.soft(modelFeatures(modelStore.snapshot()).has('unplaceablePlanarPointLoads')).toBe(true);
    expect.soft(() => buildSolverInput3D(model)).toThrow(reason);
    expect.soft(() => prepareSolverInput3D(model, false).build(model.loads)).toThrow(reason);
    expect.soft(() => buildSolverLoads3D(model, model.loads, false, false)).toThrow(reason);
    expect.soft(validateAndSolve3D(model)).toBe(reason);
    expect.soft(await validateAndSolve3DAsync(model)).toBe(reason);
    for (const result of await solveAll(cases, [combination(source.id)])) {
      expect.soft(result).toBe(reason);
    }
  }

  it(`#2411 refuses a my-only interior couple (${mode})`, () => expectInteriorRefusal(aliases[0]!));
  it(`#2411 refuses a mz-only interior couple (${mode})`, () => expectInteriorRefusal(aliases[1]!));
  it(`#2411 refuses an interior couple with both aliases (${mode})`,
    () => expectInteriorRefusal(aliases[2]!));

  it(`#2411 applies a start couple with zero member projection (${mode})`, async () => {
    const { root, member } = verticalMember(0, { mz: couple }, mode);
    modelStore.addNodalLoad3D(root, 1, 0, -1, 0, 0, 0, source.id);
    const model = modelStore.model;

    const features = modelFeatures(modelStore.snapshot());
    expect.soft(features.has('unplaceablePlanarPointLoads')).toBe(false);
    expect.soft(features.has('planarStartCoupleWithoutProjection')).toBe(true);
    expect.soft(() => buildSolverLoads3D(model, model.loads, false, false)).not.toThrow(refusal(member));
    for (const result of [validateAndSolve3D(model), await validateAndSolve3DAsync(model)]) {
      const observed = typeof result === 'string' ? result : result?.reactions.find(r => r.nodeId === root)?.mz;
      expect.soft(observed).toBe(-couple);
    }
    for (const result of await solveAll(cases, [combination(source.id)])) {
      const observed = typeof result === 'string' ? result : result?.perCombo.get(1)?.reactions.find(r => r.nodeId === root)?.mz;
      expect.soft(observed).toBe(-couple);
    }
  });

  it(`#2411 solves independently of an unused notional case and its source (${mode})`, async () => {
    const { root, tip } = verticalMember(1, { mz: couple }, mode);
    modelStore.addNodalLoad3D(tip, 1, 0, 0, 0, 0, 0, lateral.id);
    const combo = combination(lateral.id);
    combo.factors.push({ caseId: notional.id, factor: 1 }, { caseId: notional.id, factor: -1 });
    for (const result of await solveAll(cases, [combo])) {
      const observed = typeof result === 'string' ? result : result?.perCombo.get(1)?.reactions.find(r => r.nodeId === root)?.fx;
      expect.soft(observed).toBeCloseTo(-1, 12);
    }
  });
}

it('#2411 refuses a start couple masked by a zero my field', () => {
  const { member } = verticalMember(0, { my: 0, mz: couple });
  expect(validateAndSolve3D(modelStore.model)).toBe(refusal(member));
});

it('#2411 refuses a short-projection interior couple even when the solve cuts the member there', () => {
  const { member } = verticalMember(1, { mz: couple });
  modelStore.model.loads.push({
    type: 'pointOnElement3d',
    data: { id: 2, elementId: member, a: 1, py: 0, pz: 1, frame: 'global', caseId: source.id },
  });
  expect(() => buildSolverInput3D(modelStore.model)).toThrow(refusal(member));
});

it('#2411 refuses a projection-dependent load in the source of a required nested notional case', async () => {
  const { member } = verticalMember(1, { mz: couple });
  for (const result of await solveAll(cases, [combination(composite.id)])) {
    expect.soft(result).toBe(refusal(member));
  }
});

it('#2411 expands the source of a required nested notional case with a usable gravity load', async () => {
  const { root, tip } = verticalMember(1, { mz: 0 });
  modelStore.addNodalLoad3D(tip, 0, 0, -1, 0, 0, 0, source.id);
  for (const result of await solveAll(cases, [combination(composite.id)])) {
    const observed = typeof result === 'string' ? result : result?.perCombo.get(1)?.reactions.find(r => r.nodeId === root)?.fx;
    expect.soft(observed).toBeCloseTo(-notional.notional!.ratio, 12);
  }
});
