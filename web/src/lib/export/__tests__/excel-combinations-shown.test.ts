/**
 * The workbook's Combinations sheet is there when the combinations are: Basic with its load cases
 * switched off keeps the combinations it solved before, and shows none of them.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

const appended: string[] = [];
vi.mock('xlsx', async (importOriginal) => {
  const real = await importOriginal<typeof import('xlsx')>();
  return {
    ...real,
    utils: { ...real.utils, book_append_sheet: vi.fn((wb: unknown, ws: unknown, name: string) => { appended.push(name); return real.utils.book_append_sheet(wb as never, ws as never, name); }) },
  };
});

vi.mock('../save-file', () => ({ saveFile: vi.fn() }));

import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import { resultsStore } from '../../store/results.svelte';
import '../../store/index';
import { initSolver } from '../../engine/wasm-solver';
import { exportToExcel } from '../excel';
import { setLoadCasesEnabled } from '../../actions/load-cases';
import { t } from '../../i18n';

describe('the Combinations sheet follows what Basic shows', () => {
  beforeAll(async () => { await initSolver(); });
  beforeEach(() => {
    appended.length = 0;
    uiStore.analysisMode = '2d';
    modelStore.clear();
    for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'pinned');
    modelStore.addSupport(b, 'rollerX');
    const d = modelStore.addLoadCase('Dead', 'D'), l = modelStore.addLoadCase('Live', 'L');
    modelStore.addDistributedLoad(e, -10, -10, undefined, undefined, d);
    modelStore.addDistributedLoad(e, -10, -10, undefined, undefined, l);
    modelStore.addCombination('1.4D', [{ caseId: d, factor: 1.4 }]);
    modelStore.addCombination('1.2D+1.6L', [{ caseId: d, factor: 1.2 }, { caseId: l, factor: 1.6 }]);
    const r = modelStore.solveCombinations(false);
    if (!r || typeof r === 'string') throw new Error(String(r));
    resultsStore.setCombinationResults(r.perCase, r.perCombo, r.envelope);
    uiStore.loadCasesEnabled = true;
  });
  afterEach(() => { uiStore.loadCasesEnabled = false; });

  it('with load cases on, the workbook lists the combinations', async () => {
    await exportToExcel();
    expect(appended).toContain(t('excel.sheetCombinations'));
  });

  it('with load cases switched off after the solve, it does not', async () => {
    setLoadCasesEnabled(false);
    expect(resultsStore.hasCombinations).toBe(true); // still solved: the case this is about
    await exportToExcel();
    expect(appended.length).toBeGreaterThan(0);
    expect(appended).not.toContain(t('excel.sheetCombinations'));
  });
});
