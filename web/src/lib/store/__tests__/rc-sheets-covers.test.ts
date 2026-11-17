/**
 * A project that stored covers under CIRSOC 201 Table 20.5.1.3.1 is told so once, by kind and
 * value; one action sets them to the table's as a single undo step and designs the sheets again.
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
import { setSheetCode } from '../rc-sheets.svelte';
import { clearSheets, designSheets, sheetsRun } from '../rc-sheets-view.svelte';
import { applyTableCovers, sheetCoversUnder } from '../rc-sheets-covers';
import { designData, patchDesignData } from '../design-data';
import { defaultDesignData } from '../../model/design-data';
import { withCirsocCovers } from '../../rc-sheets/cover-data';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); clearSheets();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false;
});
afterEach(() => { uiStore.analysisMode = '3d'; });

function frame() {
  const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
  const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
  const bm = modelStore.addSection({ name: '30×60', a: 0.18, iy: 0.3 * 0.6 ** 3 / 12, iz: 0.6 * 0.3 ** 3 / 12, j: 0.0037, b: 0.3, h: 0.6, shape: 'rect' } as never);
  const base = [0, 5].map((x) => modelStore.addNode(x, 0, 0)), top = [0, 5].map((x) => modelStore.addNode(x, 0, 3));
  const D = modelStore.model.loadCases.find((c) => c.type === 'D')!.id;
  base.forEach((b, i) => { const c = modelStore.addElement(b, top[i]!, 'frame'); modelStore.updateElementSection(c, col); modelStore.updateElementMaterial(c, conc); modelStore.addSupport(b, 'fixed3d'); });
  const e = modelStore.addElement(top[0]!, top[1]!, 'frame'); modelStore.updateElementSection(e, bm); modelStore.updateElementMaterial(e, conc);
  modelStore.addDistributedLoad3D(e, 0, 0, -30, -30, undefined, undefined, D);
  modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
  recognizePhysicalElements();
  resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
  publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
}

const coverFails = () => [...sheetsRun.rows!.beam, ...sheetsRun.rows!.column].filter((r) => r.verifications.some((v) => v.label === 'rcSheets.v.mainCover' && !v.ok)).length;

describe('stored covers under the table', () => {
  it('are said by kind and value, and one action sets them to the table, designs again, and undoes in one step', async () => {
    frame();
    setSheetCode('cirsoc201-2025');
    patchDesignData({ covers: { ...withCirsocCovers(defaultDesignData()).covers, beam: 0.025, column: 0.025 } });
    expect(sheetCoversUnder().map((u) => [u.kind, u.cover])).toEqual([['beam', 0.025], ['column', 0.025]]);
    await designSheets();
    expect(coverFails()).toBeGreaterThan(0);
    const steps = historyStore.undoCount;
    await applyTableCovers();
    expect(sheetCoversUnder()).toEqual([]);
    expect(designData().covers).toMatchObject({ beam: 0.03, column: 0.03, slab: 0.025 });
    expect(coverFails()).toBe(0);
    expect(historyStore.undoCount).toBe(steps + 1);
    historyStore.undo();
    expect(designData().covers).toMatchObject({ beam: 0.025, column: 0.025 });
  });

  it('are not said under a code that does not hold the sheets to the table', () => {
    frame();
    patchDesignData({ covers: { ...withCirsocCovers(defaultDesignData()).covers, beam: 0.02 } });
    setSheetCode('en1992-1-1');
    expect(sheetCoversUnder()).toEqual([]);
    setSheetCode('cirsoc201-2025');
    expect(sheetCoversUnder().map((u) => u.kind)).toEqual(['beam']);
  });
});
