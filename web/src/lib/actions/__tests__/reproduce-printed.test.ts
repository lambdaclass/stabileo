import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore, resultsStore, uiStore } from '../../store';
import { initSolver } from '../../engine/wasm-solver';
import { buildProReportData } from '../../engine/pro-report-inputs';
import { generateReportHtml, type ReportConfig } from '../../engine/pro-report';
import { comparePrintedReport } from '../reproduce';
import { printedTables } from '../../engine/report/printed-values';
import { t } from '../../i18n';

beforeAll(async () => { await initSolver(); });

function solvedPortal(): void {
  uiStore.analysisMode = 'pro';
  modelStore.clear(); resultsStore.clear();
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

const config = (resultSetKey: string): ReportConfig => ({
  companyName: '', companyLogo: null, resultSetKey,
  sections: { modelData: true, results: true, advancedAnalysis: false, storyDrift: false, diagnostics: false, quantities: false, loads: true, envelope: true, statics: true },
});

describe('checking a report value by value', () => {
  beforeEach(solvedPortal);

  it('marks its result tables and finds every printed value again', () => {
    const combo = modelStore.combinations.find((c) => c.name === '1.2 D + 1.6 W')!;
    const html = generateReportHtml(buildProReportData({ config: config(`combo:${combo.id}`), t })!);
    expect(printedTables(html).map((p) => p.key)).toEqual(expect.arrayContaining(['reactions', 'forces', 'displacements', 'statics']));
    const v = comparePrintedReport(html)!;
    expect(v.compared).toBeGreaterThan(30);
    expect(v.differences).toEqual([]);
    expect(v.structural).toEqual([]);
  });

  it('finds a number changed by hand, and says where', () => {
    const combo = modelStore.combinations.find((c) => c.name === '1.2 D + 1.6 W')!;
    const html = generateReportHtml(buildProReportData({ config: config(`combo:${combo.id}`), t })!);
    const reactions = printedTables(html).find((p) => p.key === 'reactions')!;
    const first = reactions.rows[0]!;
    const original = first.cells[2]!;
    const forged = html.replace(`<td class="num">${original}</td>`, '<td class="num">10.10</td>');
    expect(forged).not.toBe(html);
    const v = comparePrintedReport(forged)!;
    expect(v.differences).toHaveLength(1);
    expect(v.differences[0]).toMatchObject({ table: 'reactions', row: first.label, printed: '10.10', recomputed: original });
  });

  it('says nothing about a file without marked tables', () => {
    expect(comparePrintedReport('<html><body><table><tr><td class="num">1.00</td></tr></table></body></html>')).toBeNull();
  });
});
