/**
 * The seven-storey building's slab panels the level plans read as cantilevers are designed as such
 * by their own rows: the cantilever step, one-way, and one-way shear only across the support.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore, resultsStore } from '..';
import { ensurePhysicalModel } from '../plates-from-shells';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows } from '../rc-sheets.svelte';

beforeAll(async () => { await wasmSolver.initSolver(); });

describe('cantilever slabs of a building', () => {
  it('take their span from the level plan', async () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    await modelStore.loadExample('pro-edificio-7p');
    ensurePhysicalModel();
    syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
    resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
    publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
    const rows = buildSheetRows();
    const spans = rows.slabPlan.flatMap((p) => p.cantilevers.map((c) => ({ ...c, level: p.level })));
    expect(spans.length).toBeGreaterThan(0);
    for (const k of spans) {
      const r = rows.slab.find((x) => x.name === k.panel && (x.level ?? '') === k.level)!;
      expect(r.oneWay).toBe(true);
      expect(r.steps.flatMap((g) => g.steps).some((x) => x.label === 'rcSheets.s.cantilever')).toBe(true);
      expect(r.verifications.some((v) => v.label === (k.dir === 'x' ? 'rcSheets.v.slabShearY' : 'rcSheets.v.slabShearX'))).toBe(false);
    }
  }, 300000);
});
