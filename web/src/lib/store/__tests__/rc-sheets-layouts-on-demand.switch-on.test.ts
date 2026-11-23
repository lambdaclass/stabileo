import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore, resultsStore } from '..';
import { ensurePhysicalModel } from '../plates-from-shells';
import { preparePlatesForAnalysis } from '../physical-plates';
import { meshBeforeAnalysis } from '../mesh-policy.svelte';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { sheetRowsSteps, setSheetCode, type SheetProgress } from '../rc-sheets.svelte';
import { setFoundationSystem } from '../rc-sheets-footings';
import { footingPreview } from '../rc-sheets-footing-preview.svelte';
import { makeFmt } from '../../rc-sheets/format';
import { PRO_EXAMPLES } from '../../data/pro-examples';

function design() {
  const seen: SheetProgress[] = [];
  const it = sheetRowsSteps(makeFmt(','));
  for (;;) { const r = it.next(); if (r.done) return { rows: r.value, seen }; seen.push(r.value); }
}
const layoutsDesigned = (seen: SheetProgress[]) => new Set(seen.filter((p) => p.phase === 'foundations').map((p) => p.layout!.system));

describe('the foundation layouts of a building with footings', () => {
  beforeAll(async () => {
    await wasmSolver.initSolver();
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    await PRO_EXAMPLES.find((e) => e.id === 'rc-qa-diagnostic')!.load();
    ensurePhysicalModel();
    meshBeforeAnalysis.value = true;
    preparePlatesForAnalysis();
    syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
    resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
    publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
    setSheetCode('cirsoc201-2025');
    setFoundationSystem(null);
    footingPreview.system = 'auto'; footingPreview.compare = false;
  }, 600_000);

  it('are designed one at a time, the one shown, and each only once while nothing changes', () => {
    const first = design();
    expect([...layoutsDesigned(first.seen)]).toEqual(['auto']);
    expect(first.rows.footingLayouts!.map((l) => l.system)).toEqual(['auto']);
    footingPreview.system = 'mat';
    const second = design();
    expect([...layoutsDesigned(second.seen)]).toEqual(['mat']);
    expect(second.rows.footingLayouts!.map((l) => l.system).sort()).toEqual(['auto', 'mat']);
    footingPreview.system = 'auto';
    expect(layoutsDesigned(design().seen).size).toBe(0);
  }, 600_000);

  it('are all designed when the reader asks to compare them', () => {
    footingPreview.compare = true;
    expect(design().rows.footingLayouts).toHaveLength(5);
    footingPreview.compare = false;
  }, 600_000);
});
