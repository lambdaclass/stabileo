import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore, resultsStore, uiStore } from '../../store';
import { provenanceForScope, provenanceLabels } from '../../store/result-provenance';
import { initSolver } from '../../engine/wasm-solver';
import { buildProReportData } from '../../engine/pro-report-inputs';
import { generateReportHtml, type ReportConfig } from '../../engine/pro-report';
import { comparePrintedReport, reproduceStatus, reportTextOf } from '../reproduce';
import { printedTables } from '../../engine/report/printed-values';
import { parseProvenance, type ScopeRef } from '../../provenance/result-provenance';
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
  modelStore.addCombination('1.2 D + 1.6 W', [{ caseId: 1, factor: 1.2 }, { caseId: w, factor: 1.6 }]);
  const r = modelStore.solveCombinations3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  resultsStore.setCombinationResults3D(r.perCase, r.perCombo, r.envelope);
}

function exported(): { html: string; scope: ScopeRef } {
  const combo = modelStore.combinations[0]!;
  const scope: ScopeRef = { kind: 'combo', id: combo.id };
  const config: ReportConfig = {
    companyName: '', companyLogo: null, resultSetKey: `combo:${combo.id}`,
    sections: { modelData: true, results: true, advancedAnalysis: false, storyDrift: false, diagnostics: false, quantities: false, loads: true, envelope: true, statics: true },
  };
  const data = buildProReportData({ config, t })!;
  data.resultProvenance = { record: provenanceForScope(scope), labels: provenanceLabels() };
  return { html: generateReportHtml(data), scope };
}

function editEmbeddedConfig(html: string, edit: (c: Record<string, unknown>) => void): string {
  return html.replace(/(<script[^>]*id="stabileo-report-config"[^>]*>)([\s\S]*?)(<\/script>)/, (_, open: string, json: string, close: string) => {
    const c = JSON.parse(json) as Record<string, unknown>;
    edit(c);
    return open + JSON.stringify(c) + close;
  });
}

function editRecord(html: string, edit: (r: Record<string, unknown>) => void): string {
  return html.replace(/(<script[^>]*id="stabileo-provenance"[^>]*>)([\s\S]*?)(<\/script>)/, (_, open: string, json: string, close: string) => {
    const r = JSON.parse(json) as Record<string, unknown>;
    edit(r);
    return open + JSON.stringify(r) + close;
  });
}

const hashesReproduced = { status: 'reproduced', reproduced: true, hashes: [], model: 'match', sameBuild: true, buildDifferences: [] } as never;

function check(html: string, scope: ScopeRef) {
  const printed = comparePrintedReport(html, scope, parseProvenance(html) ?? undefined);
  return { printed, ...reproduceStatus({ ok: true, verdict: hashesReproduced, fresh: {} as never, printed }) };
}

describe('a report checked against the tables its fingerprint lists', () => {
  beforeEach(solvedPortal);

  it('an untouched report still reproduces', () => {
    const { html, scope } = exported();
    expect(printedTables(html).map((p) => p.key)).toEqual(expect.arrayContaining(['reactions', 'statics']));
    const v = check(html, scope);
    expect(v.printed!.differences).toEqual([]);
    expect(v.printed!.structural).toEqual([]);
    expect(v.printed!.compared).toBeGreaterThan(30);
    expect(v).toMatchObject({ status: 'reproduced', reproduced: true });
  });

  it('a section switched off in the embedded choices, its table unmarked and another table untouched, is not reproduced', () => {
    const { html, scope } = exported();
    const forged = editEmbeddedConfig(html, (c) => { (c.sections as Record<string, boolean>).statics = false; })
      .replace('data-printed="statics"', 'data-x="statics"');
    expect(forged).not.toBe(html);
    expect(printedTables(forged).map((p) => p.key)).not.toContain('statics');
    expect(printedTables(forged).map((p) => p.key)).toContain('reactions');
    const v = check(forged, scope);
    expect(v.reproduced).toBe(false);
    expect(v.status).toBe('printed-differs');
    expect(v.printed!.structural).toContain('statics');
  });

  it('the same edit with the table list also stripped from the fingerprint is never reproduced', () => {
    const { html, scope } = exported();
    const forged = editRecord(
      editEmbeddedConfig(html, (c) => { (c.sections as Record<string, boolean>).statics = false; }).replace('data-printed="statics"', 'data-x="statics"'),
      (r) => { delete r.report; delete r.reportHash; },
    );
    const v = check(forged, scope);
    expect(v.reproduced).toBe(false);
    expect(v.status).toBe('incomplete');
  });

  it('a table the fingerprint does not list is refused', () => {
    const { html, scope } = exported();
    const reactions = /<table[^>]*data-printed="reactions"[\s\S]*?<\/table>/.exec(html)![0];
    const extra = html.replace(reactions, reactions + reactions.replace('data-printed="reactions"', 'data-printed="drift"'));
    const v = check(extra, scope);
    expect(v.reproduced).toBe(false);
    expect(v.status).toBe('printed-differs');
    expect(v.printed!.structural).toContain('drift');
  });

  it('a table the fingerprint lists, removed with its section also removed from the fingerprint choices, is refused', () => {
    const { html, scope } = exported();
    const forged = editRecord(html.replace(/<table[^>]*data-printed="statics"[\s\S]*?<\/table>/, ''), (r) => {
      const report = r.report as { choices: { sections: Record<string, boolean> }; tables: Array<{ table: string }> };
      report.choices.sections.statics = false;
      report.tables = report.tables.filter((x) => x.table !== 'statics');
    });
    const v = check(forged, scope);
    expect(v.reproduced).toBe(false);
    expect(v.status).toBe('printed-differs');
  });

  it('a JSON fingerprint on its own is not taken for a report, an HTML one is', () => {
    const { html } = exported();
    const record = parseProvenance(html)!;
    expect(reportTextOf(JSON.stringify(record), record)).toBeUndefined();
    expect(reportTextOf(html, record)).toBe(html);
    const noTables = html.replace(/<html[^>]*>/gi, '').replace(/<table/gi, '<div').replace(/<\/table>/gi, '</div>');
    expect(reportTextOf(noTables, record)).toBe(noTables);
  });
});
