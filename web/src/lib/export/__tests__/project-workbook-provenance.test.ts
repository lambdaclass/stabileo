import { beforeAll, beforeEach, expect, it } from 'vitest';
import { initSolver } from '../../engine/wasm-solver';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import { resultsStore } from '../../store/results.svelte';
import '../../store/index';
import { runSolve3D } from '../../actions/solve';
import { currentWorkbookSheets } from '../../store/project-workbook';
import { publishCombinations3D, unstableCombinations } from '../../store/active-results';
import { parseWorkbook } from '../../excel-import/parse';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  uiStore.analysisMode = 'pro';
  uiStore.includeSelfWeight = false;
  modelStore.clear();
  resultsStore.clear();
});

function beam() {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
  const e = modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed3d');
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  return { a, b, e };
}

function rows(name: string, sheets = currentWorkbookSheets(5)): Record<string, string | number>[] {
  const sheet = sheets.find((s) => s.name === name)!;
  return sheet.rows.slice(1).map((r) => Object.fromEntries(sheet.rows[0]!.map((h, i) => [String(h), r[i]])));
}

it('labels an all-loads solve consistently without attributing it to the first case', async () => {
  const { b } = beam();
  const [dead, live] = modelStore.model.loadCases;
  modelStore.addNodalLoad3D(b, 0, 0, -10, 0, 0, 0, dead!.id);
  modelStore.addNodalLoad3D(b, 0, 0, -20, 0, 0, 0, live!.id);
  await runSolve3D();
  expect(resultsStore.results3D).not.toBeNull();
  expect(resultsStore.perCase3D.size).toBe(0);
  const sheets = currentWorkbookSheets(5);
  expect(rows('Reactions', sheets)[0]!['Fz [kN]']).toBeCloseTo(30, 9);
  for (const name of ['Reactions', 'Displacements', 'EndForces', 'Stations', 'Deflections', 'Maxima', 'Statics']) {
    const data = rows(name, sheets);
    expect(data.length, name).toBeGreaterThan(0);
    for (const r of data) {
      expect(r.source, name).toBe('single');
      expect(r.sourceId, name).toBe(0);
    }
  }
  for (const r of rows('Envelope', sheets)) {
    expect(r.maxSourceId).toBe(0);
    expect(r.minSourceId).toBe(0);
  }
});

it.each([
  ['clear all results', () => resultsStore.clear()],
  ['clear 3D results', () => resultsStore.clear3D()],
  ['new model', () => modelStore.clear()],
  ['model edit', () => modelStore.addNode(10, 0, 0)],
])('drops excluded-combination metadata on %s', (_name, clear) => {
  const { b } = beam();
  const caseId = modelStore.model.loadCases[0]!.id;
  modelStore.addNodalLoad3D(b, 0, 0, -10, 0, 0, 0, caseId);
  modelStore.addCombination('D', [{ caseId, factor: 1 }]);
  const bundle = modelStore.solveCombinations3D(false, false, true);
  if (!bundle || typeof bundle === 'string') throw new Error(String(bundle));
  // Exercise metadata lifecycle independently of the nonlinear solver's buckling threshold.
  publishCombinations3D({ ...bundle, unstable: [123] });
  expect(unstableCombinations()).toEqual([123]);
  expect(rows('SecondOrder')[0]!.equilibrium).toBe('none');
  clear();
  expect(unstableCombinations()).toEqual([]);
  expect(currentWorkbookSheets(5).some((s) => s.name === 'SecondOrder')).toBe(false);
});

it('replaces excluded-combination metadata on a new single or combination solve', () => {
  const { b } = beam();
  const caseId = modelStore.model.loadCases[0]!.id;
  modelStore.addNodalLoad3D(b, 0, 0, -10, 0, 0, 0, caseId);
  modelStore.addCombination('D', [{ caseId, factor: 1 }]);
  const bundle = modelStore.solveCombinations3D(false, false, true);
  if (!bundle || typeof bundle === 'string') throw new Error(String(bundle));
  const excluded = [123];
  publishCombinations3D({ ...bundle, unstable: excluded });
  excluded.push(456);
  expect(unstableCombinations()).toEqual([123]);
  resultsStore.setResults3D(bundle.perCase.get(caseId)!);
  expect(unstableCombinations()).toEqual([]);
  publishCombinations3D({ ...bundle, unstable: [123] });
  resultsStore.setCombinationResults3D(bundle.perCase, bundle.perCombo, bundle.envelope);
  expect(unstableCombinations()).toEqual([]);
  publishCombinations3D({ ...bundle, unstable: [123] });
  publishCombinations3D(bundle);
  expect(unstableCombinations()).toEqual([]);
});

it.each([[90, 0], [90, 15], [-30, 10]])('retains section rotation %s plus member roll %s on import', (rotation, rollAngle) => {
  const { e } = beam();
  const secId = modelStore.elements.get(e)!.sectionId;
  modelStore.updateSection(secId, { rotation });
  modelStore.updateElement(e, { rollAngle });
  const sheets = currentWorkbookSheets(5, { results: false });
  const back = parseWorkbook(Object.fromEntries(sheets.map((s) => [s.name, s.rows])));
  expect(back.model.elements.find((x) => x.id === e)!.rollAngle).toBe(rotation + rollAngle);
  expect(modelStore.elements.get(e)!.rollAngle).toBe(rollAngle);
  expect(modelStore.sections.get(secId)!.rotation).toBe(rotation);
});

it('records explicit self-weight case, direction, factor and scope even with the legacy toggle off', () => {
  const { e } = beam();
  const [dead, live] = modelStore.model.loadCases;
  const groupId = modelStore.addGroup('Gravity members', 'custom', { elements: [e] });
  modelStore.setAnalysis({ selfWeight: [
    { caseId: dead!.id, direction: 'Z', factor: -1.173 },
    { caseId: live!.id, direction: 'X', factor: 0.3, elements: [e] },
    { caseId: live!.id, direction: 'Y', factor: -0.5, groupId },
    { caseId: dead!.id, direction: 'Z', factor: 0, elements: [] },
  ] });
  expect(rows('SelfWeight', currentWorkbookSheets(5, { results: false }))).toEqual([
    { source: 'case', case: dead!.id, direction: 'Z', factor: -1.173, scope: 'all', members: '', group: '' },
    { source: 'case', case: live!.id, direction: 'X', factor: 0.3, scope: 'members', members: String(e), group: '' },
    { source: 'case', case: live!.id, direction: 'Y', factor: -0.5, scope: 'group', members: '', group: groupId },
    { source: 'case', case: dead!.id, direction: 'Z', factor: 0, scope: 'members', members: '', group: '' },
  ]);
});

it('records the legacy weight for each dead case and the standalone solve, but respects an explicit empty list', () => {
  beam();
  modelStore.setAnalysis({ selfWeight: undefined });
  modelStore.addLoadCase('Additional dead', 'D');
  uiStore.includeSelfWeight = true;
  const weights = rows('SelfWeight');
  expect(weights.filter((r) => r.source === 'case').map((r) => r.case)).toEqual(
    modelStore.model.loadCases.filter((c) => c.type === 'D').map((c) => c.id),
  );
  expect(weights.filter((r) => r.source === 'single')).toEqual([
    { source: 'single', case: '', direction: 'Z', factor: -1, scope: 'all', members: '', group: '' },
  ]);
  modelStore.setAnalysis({ selfWeight: [] });
  expect(rows('SelfWeight')).toEqual([]);
  modelStore.setAnalysis({ selfWeight: undefined });
  uiStore.includeSelfWeight = false;
  expect(rows('SelfWeight')).toEqual([]);
});
