import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore, resultsStore, uiStore } from '../../store';
import { resultSetName } from '../../export/figure';
import { defaultReportSetKey, resultSet } from '../export-results';
import { buildProReportData } from '../../engine/pro-report-inputs';
import type { ReportConfig } from '../../engine/pro-report';
import { t } from '../../i18n';

/** A portal with a dead and a wind case and two combinations, solved as PRO solves them. */
function solvedPortal(): void {
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
  const r = modelStore.solveCombinations3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  resultsStore.setCombinationResults3D(r.perCase, r.perCombo, r.envelope);
}

const config = (resultSetKey?: string): ReportConfig => ({
  companyName: '', companyLogo: null,
  sections: { modelData: false, results: true, advancedAnalysis: false, storyDrift: false, diagnostics: false, quantities: false, loads: false },
  ...(resultSetKey ? { resultSetKey } : {}),
});
const reactionX = (rs: { reactions: Array<{ nodeId: number; fx: number }> }) => rs.reactions.reduce((s, x) => s + x.fx, 0);

describe('what the report is of', () => {
  beforeEach(solvedPortal);

  it('names the sum of every case at factor 1 for what it is', () => {
    resultsStore.activeView = 'single';
    expect(resultSetName()).toBe(t('tables.shownSum'));
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
    resultsStore.activeView = 'single';
    expect(buildProReportData({ config: config(), t })!.resultSetName).toBe(t('tables.shownSum'));
  });
});
