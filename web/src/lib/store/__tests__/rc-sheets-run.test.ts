/**
 * The sheets are designed on asking, once, for the panel and the workspace alike: step by step with
 * how far they have got, and out of date (not designed again) when what they were designed from
 * changes. A bar layout adopted in them is their own edit and makes them no older.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows, setAdopted, setSheetCode, sheetRowsSteps } from '../rc-sheets.svelte';
import { clearSheets, designSheets, sheetsRun, sheetsStale } from '../rc-sheets-view.svelte';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); clearSheets();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false;
});
afterEach(() => { uiStore.analysisMode = '3d'; });

/** A two-span 30×60 beam on three 40×40 columns, 3 m high, fixed at their feet, under 1,2 D + 1,6 L. */
function solvedFrame() {
  const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
  const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
  const bm = modelStore.addSection({ name: '30×60', a: 0.18, iy: 0.3 * 0.6 ** 3 / 12, iz: 0.6 * 0.3 ** 3 / 12, j: 0.0037, b: 0.3, h: 0.6, shape: 'rect' } as never);
  const base = [0, 5, 10].map((x) => modelStore.addNode(x, 0, 0));
  const top = [0, 5, 10].map((x) => modelStore.addNode(x, 0, 3));
  const cols = base.map((b, i) => modelStore.addElement(b, top[i]!, 'frame'));
  const beams = [modelStore.addElement(top[0]!, top[1]!, 'frame'), modelStore.addElement(top[1]!, top[2]!, 'frame')];
  for (const c of cols) { modelStore.updateElementSection(c, col); modelStore.updateElementMaterial(c, conc); }
  for (const b of beams) { modelStore.updateElementSection(b, bm); modelStore.updateElementMaterial(b, conc); }
  for (const b of base) modelStore.addSupport(b, 'fixed3d');
  const D = modelStore.model.loadCases.find((c) => c.type === 'D')!.id;
  const L = modelStore.model.loadCases.find((c) => c.type === 'L')!.id;
  for (const b of beams) { modelStore.addDistributedLoad3D(b, 0, 0, -30, -30, undefined, undefined, D); modelStore.addDistributedLoad3D(b, 0, 0, -10, -10, undefined, undefined, L); }
  modelStore.addCombination('1.2D + 1.6L', [{ caseId: D, factor: 1.2 }, { caseId: L, factor: 1.6 }]);
  recognizePhysicalElements();
  const all = modelStore.solve3D(false, false, true);
  if (!all || typeof all === 'string') throw new Error(String(all));
  resultsStore.setResults3D(all);
  const b = modelStore.solveCombinations3D(false, false, true);
  if (!b || typeof b === 'string') throw new Error(String(b));
  publishCombinations3D(b);
}

describe('designing the sheets on asking', () => {
  it('nothing is designed until asked; then the rows are those of buildSheetRows', async () => {
    solvedFrame();
    expect(sheetsRun.rows).toBeNull();
    expect(sheetsStale()).toBe(false);
    await designSheets();
    expect(sheetsRun.progress).toBeNull();
    const rows = sheetsRun.rows!;
    expect(rows.beam.length).toBeGreaterThan(0);
    expect(rows.column.length).toBeGreaterThan(0);
    expect(rows.beam.map((r) => r.key)).toEqual(buildSheetRows().beam.map((r) => r.key));
  });

  it('the steps count every member up to the total', () => {
    solvedFrame();
    const it = sheetRowsSteps();
    const steps = [];
    let r = it.next();
    for (; !r.done; r = it.next()) steps.push(r.value);
    const design = steps.filter((s) => s.phase === 'design');
    expect(design.length).toBeGreaterThan(0);
    expect(design.map((s) => s.done)).toEqual(design.map((_, k) => k + 1));
    expect(design[design.length - 1]!.done).toBe(design[0]!.total);
    expect(r.value.beam.length).toBeGreaterThan(0);
  });

  it('out of date, not designed again, when the design data change; an adopted layout is the sheets\' own edit', async () => {
    solvedFrame();
    await designSheets();
    const before = sheetsRun.rows;
    const row = before!.column[0]!;
    setAdopted(row.key, row.proposed as never);
    expect(sheetsStale()).toBe(false);
    setSheetCode('aci318-19');
    expect(sheetsStale()).toBe(true);
    expect(sheetsRun.rows).toBe(before);
    await designSheets();
    expect(sheetsStale()).toBe(false);
    expect(sheetsRun.rows!.code).not.toBe(before!.code);
  });

  it('out of date when the results change', async () => {
    solvedFrame();
    await designSheets();
    const b = modelStore.solveCombinations3D(false, false, true);
    if (!b || typeof b === 'string') throw new Error(String(b));
    publishCombinations3D(b);
    expect(sheetsStale()).toBe(true);
  });
});

it.each([
  ['SH-MITC4-DISTORTION', 798],
  ['SH-WARPED-MITC4', 1057],
  ['SH-WARPED-MITC9', 1057],
] as const)('known wrong result: #1929: slab and wall reinforcement views retain %s warnings and refusals', async (phase, issue) => {
  const { render } = await import('svelte/server');
  const { default: Workspace } = await import('../../../components/pro/rc-sheets/RcSheetsWorkspace.svelte');
  const { default: Panel } = await import('../../../components/pro/rc-sheets/ProRcSheetsTab.svelte');
  const { knownIssueMessage } = await import('../../engine/known-issue-message');
  solvedFrame();
  const result = resultsStore.results3D!;
  const cases = new Map(resultsStore.perCase3D), combinations = new Map(resultsStore.perCombo3D), envelope = resultsStore.envelope3D!;
  for (const source of ['single', 'case', 'combination'] as const) {
    for (const severity of ['warning', 'error'] as const) {
      const diagnostic = { code: 'known_issue', severity, phase, value: issue, message: 'ENGINE' };
      const payload = { ...result, structuredDiagnostics: [diagnostic] };
      resultsStore.setResults3D(source === 'single' ? payload : result);
      if (source !== 'single') resultsStore.setCombinationResults3D(
        source === 'case' ? new Map([[1, payload]]) : cases,
        source === 'combination' ? new Map([[1, payload]]) : combinations, envelope);
  
      const expected = knownIssueMessage(diagnostic).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      const panel = render(Panel).body;
      expect(panel).toContain('role="alert"');
      expect(panel).toContain(expected);
      if (severity === 'error') expect(panel).not.toContain('data-testid="rc-design"');
      for (const family of ['slab', 'wall'] as const) {
        const html = render(Workspace, { props: { family, onclose() {} } }).body;
        expect(html).toContain('role="alert"');
        expect(html).toContain(expected);
        if (severity === 'error') expect(html).not.toContain('data-testid="rc-row"');
      }
    }
  }
  resultsStore.setResults3D({ ...result, structuredDiagnostics: [] });
  resultsStore.setCombinationResults3D(
    new Map([...cases].map(([id, r]) => [id, { ...r, structuredDiagnostics: [] }])),
    new Map([...combinations].map(([id, r]) => [id, { ...r, structuredDiagnostics: [] }])),
    { ...envelope, maxAbsResults3D: { ...envelope.maxAbsResults3D, structuredDiagnostics: [] } });
  expect(buildSheetRows().beam.length).toBeGreaterThan(0);
  for (const family of ['slab', 'wall'] as const) {
    expect(render(Workspace, { props: { family, onclose() {} } }).body).not.toContain('data-testid="rc-result-warnings"');
  }
});
