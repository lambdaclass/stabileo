import { describe, it, expect, beforeEach, vi } from 'vitest';
import { modelStore, resultsStore, uiStore } from '../../store';
import { runGlobalSolve } from '../../engine/live-calc';
import { resultSetName } from '../../export/figure';
import { defaultReportSetKey, resultSet } from '../export-results';
import { buildProReportData } from '../../engine/pro-report-inputs';
import type { ReportConfig } from '../../engine/pro-report';
import { t } from '../../i18n';

/** A portal with a dead and a wind case and two combinations, solved as PRO solves them. */
async function solvedPortal() {
  modelStore.clear();
  uiStore.analysisMode = 'pro';
  for (const c of [...modelStore.model.combinations]) modelStore.removeCombination(c.id);
  for (const c of [...modelStore.model.loadCases].filter((c) => c.id > 1)) modelStore.removeLoadCase(c.id);
  const w = modelStore.addLoadCase('W', 'W');
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3), c = modelStore.addNode(5, 0, 3), d = modelStore.addNode(5, 0, 0);
  modelStore.addElement(a, b); modelStore.addElement(b, c); modelStore.addElement(c, d);
  modelStore.addSupport(a, 'fixed3d' as never); modelStore.addSupport(d, 'fixed3d' as never);
  modelStore.addNodalLoad3D(b, 0, 0, -20, 0, 0, 0, 1);
  modelStore.addNodalLoad3D(b, 10, 0, 0, 0, 0, 0, w);
  modelStore.addCombination('1.4 D', [{ caseId: 1, factor: 1.4 }]);
  modelStore.addCombination('1.2 D + 1.6 W', [{ caseId: 1, factor: 1.2 }, { caseId: w, factor: 1.6 }]);
  const outcome = await runGlobalSolve();
  if (!outcome.ok) throw new Error(JSON.stringify(outcome));
}

const config = (resultSetKey?: string): ReportConfig => ({
  companyName: '', companyLogo: null,
  sections: { modelData: false, results: true, advancedAnalysis: false, storyDrift: false, diagnostics: false, quantities: false, loads: false },
  ...(resultSetKey ? { resultSetKey } : {}),
});
const reactionX = (rs: { reactions: Array<{ nodeId: number; fx: number }> }) => rs.reactions.reduce((s, x) => s + x.fx, 0);

describe('what the report is of', () => {
  beforeEach(solvedPortal);

  it.skip('known wrong result: #2491 — names the sum of every case at factor 1 for what it is', () => {
    resultsStore.activeCaseId = null;
    resultsStore.activeView = 'single';
    expect(resultSetName()).toBe(t('tables.shownSum'));
    expect(reactionX(resultsStore.results3D!)).toBeCloseTo(-10, 6);
    resultsStore.activeCaseId = 1;
    expect(resultSetName()).toBe(modelStore.loadCases[0]!.name);
    expect(reactionX(resultsStore.results3D!)).toBeCloseTo(0, 6);
    resultsStore.activeCaseId = 9999;
    expect(resultsStore.activeCaseId).toBeNull();
    expect(resultSetName()).toBe(t('tables.shownSum'));
    expect(reactionX(resultsStore.results3D!)).toBeCloseTo(-10, 6);
    expect(buildProReportData({ config: config('case:9999'), t })).toBeNull();
    resultsStore.activeCaseId = null;
    expect(resultSetName()).toBe(t('tables.shownSum'));
    expect(reactionX(resultsStore.results3D!)).toBeCloseTo(-10, 6);
  });

  it('defaults to the envelope when there are combinations', () => {
    expect(defaultReportSetKey()).toBe('envelope');
  });

  it('prints the chosen combination, by name, in place of the screen', () => {
    const combo = modelStore.combinations.find((c) => c.name === '1.2 D + 1.6 W')!;
    const data = buildProReportData({ config: config(`combo:${combo.id}`), t })!;
    expect(data.resultSetName).toBe('1.2 D + 1.6 W');
    expect(reactionX(data.results)).toBeCloseTo(reactionX(resultSet(`combo:${combo.id}`).results!), 9);
    expect(reactionX(data.results)).toBeCloseTo(-16, 6);
  });

  it('prints the screen, named honestly, when nothing is chosen', () => {
    resultsStore.activeCaseId = null;
    resultsStore.activeView = 'single';
    expect(buildProReportData({ config: config(), t })!.resultSetName).toBe(t('tables.shownSum'));
  });
});

describe('a chosen result set that is not there', () => {
  beforeEach(solvedPortal);

  it('is refused, never replaced by what is on screen', () => {
    expect(buildProReportData({ config: config('combo:9999'), t })).toBeNull();
    expect(buildProReportData({ config: config('case:9999'), t })).toBeNull();
  });
});

it('obtains the simple-load state independently when a contributing wind case refuses', async () => {
  await solvedPortal();
  const bundle = modelStore.solveCombinations3D(false, false, true);
  if (!bundle || typeof bundle === 'string') throw Error(String(bundle));
  const wind = modelStore.loadCases.find(c => c.name === 'W')!;
  const refused = { ...bundle.perCase.get(wind.id)!, structuredDiagnostics: [
    { code: 'known_issue', severity: 'error', phase: 'BU-BOUND', value: 741, message: 'ENGINE' },
  ] };
  const cases = new Map(bundle.perCase);
  cases.set(wind.id, refused as never);
  const batch = vi.spyOn(modelStore, 'solveCombinations3DParallel').mockResolvedValue({ ...bundle, perCase: cases });
  const single = vi.spyOn(modelStore, 'solve3DAsync');
  try {
    expect((await runGlobalSolve()).ok).toBe(true);
    expect(batch).toHaveBeenCalled();
    expect(single).toHaveBeenCalled();
    expect(reactionX(resultsStore.singleResults3D!)).toBeCloseTo(-10, 6);
  } finally {
    batch.mockRestore();
    single.mockRestore();
  }
});
