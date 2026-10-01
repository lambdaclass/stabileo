import { beforeAll, beforeEach, expect, it } from 'vitest';
import { modelStore, resultsStore, uiStore } from '../../store/index';
import { activeWorkbookSource } from '../../store/active-workbook-source';
import { currentWorkbookSheets } from '../../store/project-workbook';
import { shellCentreRows, type ShellModel } from '../../engine/shell-results';
import { initSolver, computeEnvelope3D } from '../../engine/wasm-solver';
import { SETTLEMENT_CASE_ID } from '../../engine/settlement-case';
import { resultSheets, shellCentreTable } from '../workbook-results';
import type { AnalysisResults3D } from '../../engine/types-3d';
import type { WorkbookSheet } from '../workbook-cells';
import { t } from '../../i18n';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); resultsStore.clear(); });

const model: ShellModel = {
  nodes: new Map([[1, { x: 0, y: 0, z: 0 }], [2, { x: 1, y: 0, z: 0 }], [3, { x: 1, y: 1, z: 0 }], [4, { x: 0, y: 1, z: 0 }]]),
  quads: new Map([[1, { id: 1, nodes: [1, 2, 3, 4], thickness: 0.2 }]]),
};
const result = (mx: number, sigmaXx = 0): AnalysisResults3D => ({
  displacements: [], reactions: [], elementForces: [],
  quadStresses: [{ elementId: 1, sigmaXx, sigmaYy: 0, tauXy: 0, mx, my: 0, mxy: 0, vonMises: Math.abs(sigmaXx) }],
}) as AnalysisResults3D;
const records = (sheet: WorkbookSheet) => sheet.rows.slice(1).map((r) => Object.fromEntries(sheet.rows[0]!.map((h, i) => [String(h), r[i]])));

it('leaves curved-shell faces and bending unavailable even when the panel carries bending', () => {
  const nodes = [modelStore.addNode(0, 0, 0), modelStore.addNode(2, 0, 0), modelStore.addNode(2, 1, 0), modelStore.addNode(0, 1, 0)] as [number, number, number, number];
  const quad = modelStore.addQuad(nodes, [...modelStore.materials.keys()][0]!, 0.2);
  modelStore.setQuadCurved(quad, true);
  modelStore.addSupport(nodes[0], 'fixed3d'); modelStore.addSupport(nodes[3], 'fixed3d');
  for (const id of [nodes[1], nodes[2]]) modelStore.addNodalLoad3D(id, 0, 0, -1, 0, 0, 0, 1);
  const solved = modelStore.solve3D(false, false, true);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  expect(solved.reactions.reduce((sum, r) => sum + r.my, 0)).toBeCloseTo(4, 8);
  resultsStore.setResults3D(solved);
  const sheets = currentWorkbookSheets(5);
  const centre = records(sheets.find((s) => s.name === 'ShellCentres')!)[0]!;
  for (const key of Object.keys(centre).filter((k) => /^(top|bottom)/.test(k))) expect(centre[key], key).toBe('');
  for (const key of ['mx [kN·m/m]', 'my [kN·m/m]', 'mxy [kN·m/m]']) expect(centre[key]).toBe('');
  expect(centre['membraneVonMises [kN/m²]']).toBeTypeOf('number');
  const extrema = records(sheets.find((s) => s.name === 'Maxima')!).filter((r) => r.table === 'shells');
  expect(extrema.map((r) => r.component)).toEqual(['membraneVonMises', 'membraneVonMises']);
});

it.each([0, -1, NaN, Infinity])('does not invent face stresses for thickness %s', (thickness) => {
  const invalid = { ...model, quads: new Map([[1, { ...model.quads!.get(1)!, thickness }]]) };
  const centre = shellCentreRows(result(2, 100), invalid)[0]!;
  expect(centre.top).toBeUndefined();
  expect(centre.bottom).toBeUndefined();
  expect(centre.membrane.vonMises).toBe(100);
});

it.each([-2, 2])('exports extrema of both principal stresses on both faces for moment %s', (mx) => {
  const solved = result(mx);
  const sheets = resultSheets({ sources: [{ kind: 'combination', id: 1, name: 'D', results: solved }], stations: 5, statics: null, shells: model });
  const extrema = records(sheets.find((s) => s.name === 'Maxima')!);
  const expected = mx < 0 ? { topS1: 0, topS2: -300, bottomS1: 300, bottomS2: 0 } : { topS1: 300, topS2: 0, bottomS1: 0, bottomS2: -300 };
  for (const [component, value] of Object.entries(expected)) {
    const found = extrema.filter((r) => r.component === component);
    expect(found.map((r) => r.extreme)).toEqual(['max', 'min']);
    for (const row of found) expect(row.value).toBeCloseTo(value, 9);
  }
});

it('exports the displayed result and its identity through case, combination and envelope changes', () => {
  const caseId = modelStore.loadCases[0]!.id;
  const caseName = modelStore.loadCases[0]!.name;
  const comboId = modelStore.addCombination('Factored gravity', [{ caseId, factor: 2 }]);
  const single = result(1), caseResult = result(2), combo = result(4), settlement = result(0.5);
  const envelope = computeEnvelope3D([combo])!;
  envelope.maxAbsResults3D = result(6);
  resultsStore.setResults3D(single);
  resultsStore.setCombinationResults3D(new Map([[caseId, caseResult], [SETTLEMENT_CASE_ID, settlement]]), new Map([[comboId, combo]]), envelope);
  const assertExport = (source: string, id: number, name: string, mx: number) => {
    const active = activeWorkbookSource()!;
    const row = records(shellCentreTable([active], model))[0]!;
    expect([row.source, row.sourceId, row.sourceName, row['mx [kN·m/m]']]).toEqual([source, id, name, mx]);
  };
  assertExport('single', 0, t('pro.statics.singleSolve'), 1);
  resultsStore.activeCaseId = caseId;
  assertExport('case', caseId, caseName, 2);
  resultsStore.activeCaseId = SETTLEMENT_CASE_ID;
  assertExport('case', SETTLEMENT_CASE_ID, t('svc.settlementCase'), 0.5);
  resultsStore.activeComboId = comboId;
  resultsStore.activeView = 'combo';
  assertExport('combination', comboId, 'Factored gravity', 4);
  resultsStore.activeView = 'envelope';
  assertExport('envelope', 0, t('pro.viewEnvelope'), 6);
  const named = { ...envelope, maxAbsResults3D: result(8) };
  resultsStore.viewEnvelope3D(named, 'Service envelope');
  assertExport('envelope', 0, 'Service envelope', 8);
  resultsStore.viewEnvelope3D(null);
  assertExport('envelope', 0, t('pro.viewEnvelope'), 6);
  resultsStore.clear();
  expect(activeWorkbookSource()).toBeNull();
});
