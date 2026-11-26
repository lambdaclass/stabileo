import { afterEach, beforeAll, expect, it } from 'vitest';
import { utils } from 'xlsx';
import { modelStore, resultsStore, uiStore } from '../../store';
import { initSolver } from '../../engine/wasm-solver';
import { t } from '../../i18n';
import { DIAGRAM_EXTREMA_UNAVAILABLE } from '../../engine/member-diagram';
import { publishCombinations3D } from '../../store/active-results';
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

it('known wrong result: #2581 planar workbook summary and combination report PL/4', async () => {
  const span = 6, load = 20;
  const member = beam(false, span, true);
  const dead = modelStore.addLoadCase('Workbook dead', 'D');
  modelStore.addPointLoadOnElement(member, span / 2, -load, { caseId: dead });
  modelStore.addCombination('1.0D', [{ caseId: dead, factor: 1 }]);
  const solved = modelStore.solveCombinations(false);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  resultsStore.setCombinationResults(solved.perCase, solved.perCombo, solved.envelope);
  resultsStore.activeView = 'combo';
  const sheets = await workbook();
  expect.soft(combinationPeakRows()[0]?.[2]).toBe(load * span / 4);
  expect.soft(Number(sheets(t('excel.sheetSummary')).find(row => row[0] === t('excel.maxMoment'))?.[1])).toBe(load * span / 4);
  resultsStore.activeView = 'envelope';
  const envelopeSheets = await workbook();
  expect(Number(envelopeSheets(t('excel.sheetSummary')).find(row => row[0] === t('excel.maxMoment'))?.[1])).toBe(load * span / 4);
});

it('known wrong result: #2581 planar workbook summary and Elements include the interior axial peak', async () => {
  const span = 4, intensity = 8;
  const member = beam(false, span, false);
  modelStore.addDistributedLoad(member, intensity, -intensity, 90, false);
  const solved = modelStore.solve(false);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  resultsStore.setResults(solved);
  const sheets = await workbook();
  const [columns, element] = sheets(t('excel.sheetElements'));
  expect.soft(Number(sheets(t('excel.sheetSummary')).find(row => row[0] === t('excel.maxAxial'))?.[1])).toBe(intensity * span / 4);
  expect.soft(element?.[columns!.indexOf('|N|max')]).toBe(intensity * span / 4);
});

it('known wrong result: #2581 spatial workbook summary gives wL²/8', async () => {
  const span = 6, intensity = 10;
  const member = beam(true, span, true);
  const dead = modelStore.addLoadCase('Workbook spatial dead', 'D');
  modelStore.addDistributedLoad3D(member, 0, 0, -intensity, -intensity, undefined, undefined, dead);
  modelStore.addCombination('1.0D', [{ caseId: dead, factor: 1 }]);
  const solved = modelStore.solve3D(false);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  resultsStore.setResults3D(solved);
  const sheets = await workbook();
  const peak = intensity * span ** 2 / 8;
  expect(Number(sheets(t('excel.sheetSummary')).find(row => row[0] === t('excel.maxMy'))?.[1])).toBe(peak);
  const combinations = modelStore.solveCombinations3D(false);
  if (!combinations || typeof combinations === 'string') throw new Error(String(combinations));
  resultsStore.setCombinationResults3D(combinations.perCase, combinations.perCombo, combinations.envelope);
  expect(combinationPeakRows()[0]?.[2]).toBe(peak);
  resultsStore.activeView = 'envelope';
  const envelopeSheets = await workbook();
  expect(Number(envelopeSheets(t('excel.sheetSummary')).find(row => row[0] === t('excel.maxMy'))?.[1])).toBe(peak);
});


const magnitudeLabels = [
  'tooltip.diagAxial.title', 'calcReport.shearY', 'calcReport.shearZ',
  'calcReport.torsionMx', 'calcReport.momentY', 'calcReport.momentZ',
] as const;

it.skip.each([
  ['srss', false], ['abs', false], ['srss', true], ['abs', true],
] as const)('known wrong result: #2581 Excel Summary gives exact %s peaks (P-Delta: %s)', async (method, pdelta) => {
  const span = 6, intensity = 10;
  const member = beam(true, span, true);
  const cases = ['Dead', 'Live'].map(name => modelStore.addLoadCase('Workbook ' + name, 'D'));
  for (const id of cases) modelStore.addDistributedLoad3D(member, 0, 0, 0, -intensity, undefined, undefined, id);
  const signed = modelStore.addCombination('Signed', [{ caseId: cases[0]!, factor: 1 }]);
  const magnitude = modelStore.addCombination('Magnitude', cases.map(caseId => ({ caseId, factor: 1 })));
  modelStore.updateCombination(magnitude, { method });
  if (pdelta) modelStore.setAnalysis({ perCombination: 'pdelta' });
  const solved = modelStore.solveCombinations3D(false);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  publishCombinations3D(solved);
  resultsStore.activeView = 'combo';
  resultsStore.activeComboId = magnitude;
  expect(resultsStore.results3D?.magnitude).toEqual(pdelta ? { method, firstOrder: true } : { method });
  const read = async () => (await workbook())(t('excel.sheetSummary'));
  const summary = await read();
  const multiplier = method === 'srss' ? Math.sqrt(2) : 2;
  const expected = [0, 0, intensity * span / 3 * multiplier, 0, intensity * span ** 2 / (9 * Math.sqrt(3)) * multiplier, 0];
  for (const [i, label] of magnitudeLabels.entries()) {
    expect.soft(summary.find(row => row[0] === t(label)))
      .toEqual([t(label), expected[i]!.toFixed(2), i < 3 ? 'kN' : 'kN·m']);
  }
  expect.soft(summary.flat()).toContain(t('figures.magnitudes'));
  expect.soft(summary.flat()).not.toContain(t('excel.equilibriumCheck'));

  resultsStore.activeComboId = signed;
  const signedSummary = await read();
  expect(signedSummary.flat()).toContain(t('excel.equilibriumCheck'));
  if (!pdelta) {
    expect(signedSummary.find(row => row[0] === t('excel.maxMy'))?.[1])
      .toBe((intensity * span ** 2 / (9 * Math.sqrt(3))).toFixed(2));
  }
});

it.skip('known wrong result: #2581 Excel Summary marks bounded component peaks unavailable', async () => {
  const member = beam(true, 6, false);
  const tip = modelStore.elements.get(member)!.nodeJ;
  modelStore.addNodalLoad3D(tip, 5, 0, 0, 0, 0, 0);
  const solved = modelStore.solve3D(false);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  const leaf = solved.elementForces[0]!;
  const method = 'abs';
  const inner = { ...leaf, combined: { method, parts: [leaf, leaf] } };
  const outer = { ...leaf, combined: { method, parts: [inner, leaf] } };
  resultsStore.setResults3D({ ...solved, magnitude: { method }, elementForces: [outer] });
  const summary = (await workbook())(t('excel.sheetSummary'));
  for (const [i, label] of magnitudeLabels.entries()) {
    expect.soft(summary.find(row => row[0] === t(label)))
      .toEqual([t(label), t(DIAGRAM_EXTREMA_UNAVAILABLE), i < 3 ? 'kN' : 'kN·m']);
  }
});
