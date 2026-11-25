import { afterEach, expect, it } from 'vitest';
import { modelStore, uiStore } from '../../store';
import { tp } from '../../i18n';
import { GRAVITY_SELF_WEIGHT } from '../../engine/analysis-settings';
import { solveCombinations3D, solveCombinations3DParallel } from '../../engine/solver-service';
import type { AnalysisResults3D } from '../../engine/types-3d';
import { assessProject } from '../applicability';
import type { FeatureSnapshot } from '../model-features';
import { stampSolve } from '../solve-stamp';

const notice = 'negative-static-shell-density';
const thickness = 1 / 8;
const gravity = { caseId: 1, ...GRAVITY_SELF_WEIGHT };
const cases = [{ id: gravity.caseId, name: 'Gravity', type: 'D' as const }];
const combinations = [{ id: 1, name: 'Gravity', factors: [{ caseId: gravity.caseId, factor: 1 }] }];

afterEach(() => {
  modelStore.clear();
  uiStore.analysisMode = '2d';
});

function shell(kind: 'plate' | 'quad', rho: number) {
  uiStore.analysisMode = 'pro';
  uiStore.useNative3DPresentation();
  modelStore.clear();
  const a = modelStore.addNode(0, 0, 0);
  const b = modelStore.addNode(1, 0, 0);
  const c = modelStore.addNode(0, 1, 0);
  const material = modelStore.model.materials.values().next().value!;
  material.rho = rho;
  modelStore.addSupport(a, 'fixed3d');
  modelStore.addSupport(c, 'fixed3d');
  const id = kind === 'plate'
    ? modelStore.addPlate([a, b, c], material.id, thickness)
    : modelStore.addQuad([a, b, modelStore.addNode(1, 1, 0), c], material.id, thickness);
  modelStore.model.loadCases = cases;
  return { id, area: kind === 'plate' ? 1 / 2 : 1, material, model: modelStore.model };
}

function oldStamp(kind: 'linear' | 'pdelta') {
  return {
    ...stampSolve(kind, null),
    resultsVersion: 120,
    commit: '828b0a2a4a26c136f0e913017020fb76d0c195d1',
  };
}

it.each(['plate', 'quad'] as const)('#2472 applies the static density notice to a pre-change %s result', kind => {
  const { id } = shell(kind, -1);
  const saved = { ...modelStore.snapshot(), analysisMode: 'pro', includeSelfWeight: true };
  const group = { members: kind === 'plate' ? { plates: [id] } : { quads: [id] } };
  for (const analysis of ['linear', 'pdelta'] as const) {
    const stamp = oldStamp(analysis);
    const notices = (snapshot: Parameters<typeof assessProject>[0]) => assessProject(snapshot, stamp).changes.map(change => change.id);
    expect.soft(notices(saved), analysis).toContain(notice);
    expect.soft(notices({ ...saved, includeSelfWeight: false, analysis: { selfWeight: [gravity] } }), analysis).toContain(notice);
    expect.soft(notices({
      ...saved, includeSelfWeight: false, analysis: { selfWeight: [{ ...gravity, groupId: 1 }] }, groups: [[1, group]],
    }), analysis).toContain(notice);
    expect.soft(notices({
      ...saved, analysis: { standaloneSelfWeight: 'gravity', selfWeight: [] },
    }), analysis).toContain(notice);
    expect.soft(notices({
      ...saved, includeSelfWeight: false, analysis: { standaloneSelfWeight: 'gravity', selfWeight: [gravity] },
    }), analysis).toContain(notice);
    expect.soft(notices({ ...saved, analysis: { selfWeight: [{ ...gravity, factor: 0 }] } }), analysis).toContain(notice);
    const unaffected: Partial<FeatureSnapshot>[] = [
      { analysisMode: '2d' }, { includeSelfWeight: false }, { analysis: { selfWeight: [] } },
      { analysis: { selfWeight: [{ ...gravity, elements: [id] }] } },
      { analysis: { selfWeight: [{ ...gravity, groupId: 1 }] }, groups: [[1, { members: {} }]] },
      { materials: saved.materials.map(([key, value]) => [key, { ...value, rho: 0 }] as const) },
      { materials: saved.materials.map(([key, value]) => [key, { ...value, rho: 1 }] as const) },
    ];
    for (const override of unaffected) {
      expect.soft(notices({ ...saved, ...override }), JSON.stringify(override)).not.toContain(notice);
    }
    expect.soft(assessProject(saved, stampSolve(analysis, null)).changes.map(change => change.id)).not.toContain(notice);
  }
});

it.each(['plate', 'quad'] as const)('#2472 refuses negative %s self-weight on the saved solve paths', async kind => {
  const { area, material, model } = shell(kind, -1);
  const paths = {
    single: () => modelStore.solve3D(true, false, true),
    asyncSingle: () => modelStore.solve3DAsync(true, false, true),
    linearCombination: () => solveCombinations3D(model, cases, combinations, true),
    asyncLinearCombination: () => solveCombinations3DParallel(model, cases, combinations, true),
    pdeltaCombination: () => solveCombinations3D({ ...model, analysis: { perCombination: 'pdelta' } }, cases, combinations, true),
    asyncPdeltaCombination: () => solveCombinations3DParallel({ ...model, analysis: { perCombination: 'pdelta' } }, cases, combinations, true),
  };
  for (const rho of [-1, -Number.MIN_VALUE, 0, 1]) {
    material.rho = rho;
    for (const [path, solve] of Object.entries(paths)) {
      const answer = await solve();
      const label = `${kind}/${path}/${rho}`;
      if (rho < 0) {
        const result = answer && typeof answer !== 'string' ? ('perCombo' in answer ? answer.perCombo.get(1) : answer) : undefined;
        const reactions = result?.reactions.reduce((total, reaction) => total + reaction.fz, 0);
        expect.soft(typeof answer === 'string' ? answer : `returned sum of Z reactions ${reactions}`, label)
          .toBe(tp('svc.engine.invalidDensity', { id: String(material.id), value: String(rho) }));
      } else {
        if (!answer || typeof answer === 'string') throw new Error(`${label}: ${answer}`);
        const result: AnalysisResults3D | undefined = 'perCombo' in answer ? answer.perCombo.get(1) : answer;
        expect.soft(result?.reactions.reduce((total, reaction) => total + reaction.fz, 0), label).toBeCloseTo(rho * thickness * area, 10);
      }
    }
  }
});
