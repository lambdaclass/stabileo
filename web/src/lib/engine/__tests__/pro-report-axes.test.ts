import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore, resultsStore, uiStore } from '../../store';
import { initSolver } from '../wasm-solver';
import { buildProReportData } from '../pro-report-inputs';
import { generateReportHtml, type ReportConfig } from '../pro-report';
import { printedTables } from '../report/printed-values';
import { comparePrintedReport } from '../../actions/reproduce';
import { axesStore } from '../../axes/axes.svelte';
import { makeFrame, pseudoToUser, toUser, type AxesChoice } from '../../axes/frame';
import { withPresentation } from '../../pro/report-export';
import { t } from '../../i18n';

const YUP: AxesChoice = { up: '+Y', right: '-Z', hand: 'left' };

beforeAll(async () => { await initSolver(); });
afterEach(() => axesStore.reset());

function solvedPortal(): void {
  uiStore.analysisMode = 'pro';
  modelStore.clear(); resultsStore.clear();
  for (const c of [...modelStore.model.combinations]) modelStore.removeCombination(c.id);
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3), c = modelStore.addNode(5, 1, 3), d = modelStore.addNode(5, 1, 0);
  modelStore.addElement(a, b); modelStore.addElement(b, c); modelStore.addElement(c, d);
  modelStore.addSupport(a, 'fixed3d' as never); modelStore.addSupport(d, 'fixed3d' as never);
  modelStore.addNodalLoad3D(b, 4, 1, -20, 0.5, 0, 2, 1);
  modelStore.addCombination('1.4 D', [{ caseId: 1, factor: 1.4 }]);
  const r = modelStore.solveCombinations3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  resultsStore.setCombinationResults3D(r.perCase, r.perCombo, r.envelope);
}

const config = (): ReportConfig => ({
  companyName: '', companyLogo: null, resultSetKey: 'case:1',
  sections: { modelData: true, results: true, advancedAnalysis: false, storyDrift: false, diagnostics: false, quantities: false, loads: true, envelope: true, statics: true },
});

const fmt = (v: number) => (Math.abs(v) < 0.005 ? '0.00' : v.toFixed(2));

describe('the report in the user axes', () => {
  beforeEach(solvedPortal);

  it('prints exactly as before in the default axes, whatever the user has picked meanwhile', () => {
    const before = generateReportHtml(buildProReportData({ config: config(), t })!);
    axesStore.choice = YUP;
    const after = generateReportHtml(buildProReportData({ config: config(), t })!);
    expect(printedTables(after)).toEqual(printedTables(before));
  });

  it('prints reactions, coordinates, loads and statics in the axes it declares, and reproduces under any frame', () => {
    axesStore.choice = YUP;
    const f = makeFrame(YUP);
    const cfg = withPresentation(config());
    expect(cfg.axes).toEqual(YUP);
    const html = generateReportHtml(buildProReportData({ config: cfg, t })!);
    expect(html).toContain('up=+Y right=-Z hand=left');
    const solved = resultsStore.perCase3D.get(1)!;
    const r = solved.reactions.find((x) => x.nodeId === 1)!;
    const reactions = printedTables(html).find((p) => p.key === 'reactions')!;
    const row = reactions.rows.find((x) => x.label === '1')!;
    const want = [...toUser(f, [r.fx, r.fy, r.fz]), ...pseudoToUser(f, [r.mx, r.my, r.mz])].map(fmt);
    expect(row.cells.map((c) => c.replace(/\s/g, ''))).toEqual(want);
    const [lx, ly, lz] = toUser(f, [4, 1, -20]);
    expect(html).toContain(`Fx=${lx}, Fy=${ly}, Fz=${lz} kN`);
    axesStore.reset();
    const v = comparePrintedReport(html, { kind: 'case', id: 1 });
    expect(v?.differences ?? []).toEqual([]);
    expect(v?.structural ?? []).toEqual([]);
  });
});
