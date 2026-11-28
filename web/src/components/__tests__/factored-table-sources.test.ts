import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ProResultTableModes from '../pro/ProResultTableModes.svelte';
import SteelResultsTable from '../pro/steel/SteelResultsTable.svelte';
import TensionRuptureTable from '../pro/steel/TensionRuptureTable.svelte';
import { historyStore, modelStore, resultsStore, uiStore } from '../../lib/store';
import { initSolver } from '../../lib/engine/wasm-solver';
import { publishCombinations3D } from '../../lib/store/active-results';
import { t } from '../../lib/i18n';
import { referenceContext } from '../../lib/engine/__tests__/helpers/issue-2096-reference';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear();
  resultsStore.clear();
  historyStore.clear();
  modelStore.setResultScopes(null);
  uiStore.analysisMode = 'pro';
});
afterEach(() => { uiStore.analysisMode = '3d'; });

function fixture(method: 'linear' | 'pdelta') {
  const ctx = referenceContext('steel');
  const { id: _material, ...material } = ctx.material;
  const { id: _section, ...section } = ctx.section;
  const mat = modelStore.addMaterial(material);
  const sec = modelStore.addSection(section);
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
  const member = modelStore.addElement(a, b, 'frame');
  modelStore.updateElementMaterial(member, mat);
  modelStore.updateElementSection(member, sec);
  modelStore.addSupport(a, 'fixed3d');
  for (const combo of [...modelStore.combinations]) modelStore.removeCombination(combo.id);
  const load = modelStore.model.loadCases[0]!.id;
  modelStore.addNodalLoad3D(b, 10, 0, -10, 0, 0, 0, load);
  const combo = modelStore.addCombination('Factored test load', [{ caseId: load, factor: 2 }]);
  modelStore.setAnalysis({ perCombination: method });
  return { member, combo };
}

function solveSingle() {
  const single = modelStore.solve3D(false, false, true);
  if (!single || typeof single === 'string') throw new Error(String(single));
  resultsStore.setResults3D(single);
}

function publish() {
  const bundle = modelStore.solveCombinations3D(false, false, true);
  if (!bundle || typeof bundle === 'string') throw new Error(String(bundle));
  publishCombinations3D(bundle);
  return bundle;
}

function maxima() {
  return render(ProResultTableModes, { props: { kind: 'forces', mode: 'maxType' } }).body;
}

function expectWithheld(member: number, reason: string) {
  const table = maxima();
  expect(table).not.toContain('data-testid="tm-maxtype"');
  expect(table).toContain(t(reason));
  expect(table).not.toContain('data-testid="tm-csv"');
  expect(table).not.toContain('data-testid="tm-xlsx"');
  const props = { steelIds: new Set([member]) };
  for (const [html, prefix] of [[render(SteelResultsTable, { props }).body, 'steel'], [render(TensionRuptureTable, { props }).body, 'tc']]) {
    expect(html).toContain(t(reason));
    expect(html).not.toContain('data-testid="' + prefix + '-result-' + member + '"');
  }
}

describe.each(['linear', 'pdelta'] as const)('known wrong result: #1928 %s maximum-by-type combination scope', method => {
  it('withholds the unfactored solve when no combination is active and the combinations have not been solved', () => {
    const { member } = fixture(method);
    modelStore.setResultScopes({ active: [] });
    solveSingle();
    expectWithheld(member, 'design.error.combinationsUnsolved');
  });

  it('withholds the table after clearing the active list over solved results', () => {
    const { member } = fixture(method);
    solveSingle();
    publish();
    const solved = resultsStore.perCombo3D;
    const single = resultsStore.singleResults3D!;
    const cases = resultsStore.perCase3D;
    const envelope = resultsStore.envelope3D!;
    modelStore.setResultScopes({ active: [] });
    resultsStore.setResults3D(single);
    publishCombinations3D({ perCombo: solved, perCase: cases, envelope });
    expectWithheld(member, 'scopes.noneActive');
  });

  it.each(['srss', 'abs'] as const)('withholds an active %s magnitude when the project defines a signed combination', magnitude => {
    const { member } = fixture(method);
    const load = modelStore.model.loadCases[0]!.id;
    const combo = modelStore.addCombination('Magnitude test load', [{ caseId: load, factor: 2 }]);
    modelStore.updateCombination(combo, { method: magnitude });
    modelStore.setResultScopes({ active: [combo] });
    solveSingle();
    publish();
    resultsStore.activeComboId = combo;
    resultsStore.activeView = 'combo';
    expect(resultsStore.results3D?.magnitude?.method).toBe(magnitude);
    expectWithheld(member, 'design.error.noLinearCombination');
  });

  it('withholds a partial set that omits one active combination', () => {
    const { member } = fixture(method);
    const load = modelStore.model.loadCases[0]!.id;
    const missing = modelStore.addCombination('Missing combination', [{ caseId: load, factor: 3 }]);
    solveSingle();
    const bundle = publish();
    expect(bundle.perCombo.delete(missing)).toBe(true);
    publishCombinations3D(bundle);
    expectWithheld(member, 'otherCodes.skip.incompleteDemand');
  });

  it('reports the active combination and permits the signed single solve with no project combinations', () => {
    const { member, combo } = fixture(method);
    solveSingle();
    publish();
    expect(maxima()).toMatch(/<td class="tm-src[^\"]*">Factored test load<\/td>/);
    const props = { steelIds: new Set([member]) };
    expect(render(SteelResultsTable, { props }).body).toContain('data-testid="steel-result-' + member + '"');
    expect(render(TensionRuptureTable, { props }).body).toContain('data-testid="tc-result-' + member + '"');
    modelStore.removeCombination(combo);
    resultsStore.clear3D();
    solveSingle();
    const html = maxima();
    expect(html).toContain('>' + t('tables.shown') + '</td>');
    expect(html).toContain('data-testid="tm-csv"');
    expect(html).toContain('data-testid="tm-xlsx"');
  });
});
