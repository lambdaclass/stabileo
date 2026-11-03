import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore, resultsStore, uiStore } from '../../store';
import { initSolver } from '../../engine/wasm-solver';
import { buildProReportData } from '../../engine/pro-report-inputs';
import { generateReportHtml, type ReportConfig } from '../../engine/pro-report';
import { comparePrintedReport, reproduceStatus } from '../reproduce';
import { printedTables } from '../../engine/report/printed-values';
import { i18n, setLocale, ensureLocale, t } from '../../i18n';

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

  it('finds a row label or a column header changed by hand', () => {
    const combo = modelStore.combinations.find((c) => c.name === '1.2 D + 1.6 W')!;
    const html = generateReportHtml(buildProReportData({ config: config(`combo:${combo.id}`), t })!);
    const at = html.indexOf('data-printed="reactions"');
    const reactions = printedTables(html).find((p) => p.key === 'reactions')!;
    const editAfter = (from: string, to: string) => {
      const i = html.indexOf(from, at);
      return html.slice(0, i) + to + html.slice(i + from.length);
    };
    const label = reactions.rows[0]!.label.split(' · ')[0]!;
    const relabelled = editAfter(`>${label}</td>`, '>N99</td>');
    expect(relabelled).not.toBe(html);
    const v = comparePrintedReport(relabelled)!;
    expect(v.differences.some((d) => d.table === 'reactions' && d.printed.startsWith('N99'))).toBe(true);
    const header = reactions.headers.at(-1)!;
    const reheaded = editAfter(`>${header}</th>`, '>Other</th>');
    expect(reheaded).not.toBe(html);
    expect(comparePrintedReport(reheaded)!.structural).toContain('reactions');
  });

  it('finds a printed table removed from the document, and every table removed', () => {
    const combo = modelStore.combinations.find((c) => c.name === '1.2 D + 1.6 W')!;
    const html = generateReportHtml(buildProReportData({ config: config(`combo:${combo.id}`), t })!);
    const without = html.replace(/<table[^>]*data-printed="reactions"[\s\S]*?<\/table>/, '');
    expect(comparePrintedReport(without)!.structural).toContain('reactions');
    const none = html.replace(/<table[^>]*data-printed="[^"]+"[\s\S]*?<\/table>/g, '');
    const v = comparePrintedReport(none)!;
    expect(v.structural).toEqual(expect.arrayContaining(['reactions', 'forces', 'displacements']));
  });

  it('in another language compares the numbers only, and says the labels were not compared', async () => {
    const combo = modelStore.combinations.find((c) => c.name === '1.2 D + 1.6 W')!;
    const was = i18n.locale;
    const html = generateReportHtml(buildProReportData({ config: config(`combo:${combo.id}`), t })!);
    expect(comparePrintedReport(html)!.labels).toBe(true);
    await ensureLocale(was === 'es' ? 'en' : 'es');
    setLocale(was === 'es' ? 'en' : 'es');
    try {
      const v = comparePrintedReport(html)!;
      expect(v.labels).toBe(false);
      expect(v.compared).toBeGreaterThan(30);
      expect(v.differences).toEqual([]);
      expect(v.structural).toEqual([]);
    } finally {
      setLocale(was);
    }
  });

  it('says nothing about a file without marked tables', () => {
    expect(comparePrintedReport('<html><body><table><tr><td class="num">1.00</td></tr></table></body></html>')).toBeNull();
  });

  it('binds the reprint to the scope the fingerprint records, not to the key in the editable script', () => {
    const [a, b] = modelStore.combinations.map((c) => c.id);
    const otherSet = generateReportHtml(buildProReportData({ config: config(`combo:${b}`), t })!);
    const v = comparePrintedReport(otherSet, { kind: 'combo', id: a! });
    expect(v).not.toBeNull();
    expect(v!.structural).toContain('result-set');
    const own = comparePrintedReport(otherSet, { kind: 'combo', id: b! })!;
    expect(own.structural).toEqual([]);
    expect(own.differences).toEqual([]);
  });

  it('a report printed from the screen sum is bound to the single scope', () => {
    resultsStore.activeView = 'single';
    resultsStore.activeCaseId = null;
    const screen = generateReportHtml(buildProReportData({ config: config('screen'), t })!);
    expect(comparePrintedReport(screen, { kind: 'combo', id: modelStore.combinations[0]!.id })!.structural).toContain('result-set');
  });

  it('refuses to compare tables against a fingerprint with no recorded scope', () => {
    const combo = modelStore.combinations[0]!;
    const html = generateReportHtml(buildProReportData({ config: config(`combo:${combo.id}`), t })!);
    expect(comparePrintedReport(html, undefined)).toBeNull();
  });
});

describe('the verdict of a check', () => {
  const verdict = (reproduced: boolean) => ({ status: reproduced ? 'reproduced' : 'mismatch', reproduced, hashes: [], model: 'same', sameBuild: true, buildDifferences: [] }) as never;
  const clean = { compared: 10, differences: [], structural: [], labels: true };

  it('an HTML report whose embedded choices were removed is incomplete, never reproduced', () => {
    expect(reproduceStatus({ ok: true, verdict: verdict(true), fresh: {} as never, printed: null })).toEqual({ status: 'incomplete', reproduced: false });
  });

  it('a fingerprint pasted on its own is judged by its hashes', () => {
    expect(reproduceStatus({ ok: true, verdict: verdict(true), fresh: {} as never })).toEqual({ status: 'reproduced', reproduced: true });
  });

  it('printed tables that match keep the hash verdict; any difference fails it', () => {
    expect(reproduceStatus({ ok: true, verdict: verdict(true), fresh: {} as never, printed: clean })).toEqual({ status: 'reproduced', reproduced: true });
    expect(reproduceStatus({ ok: true, verdict: verdict(true), fresh: {} as never, printed: { ...clean, structural: ['result-set'] } })).toEqual({ status: 'printed-differs', reproduced: false });
    expect(reproduceStatus({ ok: true, verdict: verdict(true), fresh: {} as never, printed: { ...clean, labels: false } })).toEqual({ status: 'incomplete', reproduced: false });
  });
});

