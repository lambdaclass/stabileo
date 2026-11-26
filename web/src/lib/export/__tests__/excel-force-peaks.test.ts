import { afterEach, beforeAll, expect, it } from 'vitest';
import { utils } from 'xlsx';
import { modelStore, resultsStore, uiStore } from '../../store';
import { initSolver } from '../../engine/wasm-solver';
import { t } from '../../i18n';
import { buildExcelWorkbook, combinationPeakRows } from '../excel';

beforeAll(async () => { await initSolver(); });
afterEach(() => {
  resultsStore.clear3D();
  resultsStore.clear();
  uiStore.analysisMode = '2d';
});

function beam(spatial: boolean, length: number, simplySupported: boolean) {
  uiStore.analysisMode = spatial ? '3d' : '2d';
  modelStore.clear();
  for (const combo of [...modelStore.combinations]) modelStore.removeCombination(combo.id);
  const i = modelStore.addNode(0, 0, 0), j = modelStore.addNode(length, 0, 0);
  const member = modelStore.addElement(i, j, 'frame');
  if (spatial) {
    modelStore.addSupport(i, simplySupported ? 'pinned3d' : 'fixed3d');
    if (simplySupported) modelStore.addSupport(j, 'custom3d', undefined, { dofRestraints: { tx: false, ty: true, tz: true, rx: true, ry: false, rz: false } });
  } else {
    modelStore.addSupport(i, simplySupported ? 'pinned' : 'fixed');
    if (simplySupported) modelStore.addSupport(j, 'rollerX');
  }
  return member;
}

async function workbook() {
  const book = await buildExcelWorkbook({ provenance: false });
  if (!book) throw new Error('Workbook unavailable');
  return (sheet: string) => utils.sheet_to_json<Array<string | number>>(book.Sheets[sheet]!, { header: 1 });
}

it.skip('known wrong result: #2581 planar workbook summary and combination report PL/4', async () => {
  const span = 6, load = 20;
  const member = beam(false, span, true);
  const dead = modelStore.addLoadCase('Workbook dead', 'D');
  modelStore.addPointLoadOnElement(member, span / 2, -load, { caseId: dead });
  modelStore.addCombination('1.0D', [{ caseId: dead, factor: 1 }]);
  const solved = modelStore.solveCombinations(false);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  resultsStore.setCombinationResults(solved.perCase, solved.perCombo, solved.envelope);
  const sheets = await workbook();
  expect.soft(combinationPeakRows()[0]?.[2]).toBe(load * span / 4);
  expect.soft(Number(sheets(t('excel.sheetSummary')).find(row => row[0] === t('excel.maxMoment'))?.[1])).toBe(load * span / 4);
});

it.skip('known wrong result: #2581 planar workbook summary and Elements include the interior axial peak', async () => {
  const span = 4, intensity = 8;
  const member = beam(false, span, false);
  modelStore.addDistributedLoad(member, intensity, -intensity, 0, false);
  const solved = modelStore.solve(false);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  resultsStore.setResults(solved);
  const sheets = await workbook();
  const [columns, element] = sheets(t('excel.sheetElements'));
  expect.soft(Number(sheets(t('excel.sheetSummary')).find(row => row[0] === t('excel.maxAxial'))?.[1])).toBe(intensity * span / 4);
  expect.soft(element?.[columns!.indexOf('|N|max')]).toBe(intensity * span / 4);
});

it.skip('known wrong result: #2581 spatial workbook summary gives wL²/8', async () => {
  const span = 6, intensity = 10;
  const member = beam(true, span, true);
  modelStore.addDistributedLoad3D(member, 0, 0, -intensity, -intensity);
  const solved = modelStore.solve3D(false);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  resultsStore.setResults3D(solved);
  const sheets = await workbook();
  expect(Number(sheets(t('excel.sheetSummary')).find(row => row[0] === t('excel.maxMy'))?.[1])).toBe(intensity * span ** 2 / 8);
});
