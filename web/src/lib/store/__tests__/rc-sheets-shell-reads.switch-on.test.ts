/**
 * The sheets read each combination's shell results once, whatever the number of slabs and walls:
 * on the seven-storey building meshed at 0.5 m they used to be read once per plate and
 * combination, and opening the sheets held the page for seconds.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore, resultsStore } from '..';
import { ensurePhysicalModel } from '../plates-from-shells';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows } from '../rc-sheets.svelte';

const reads = vi.hoisted(() => ({ n: 0 }));
vi.mock('../../engine/shell-results', async (orig) => {
  const m = await orig<typeof import('../../engine/shell-results')>();
  return { ...m, shellCentreRows: (...a: Parameters<typeof m.shellCentreRows>) => { reads.n++; return m.shellCentreRows(...a); } };
});

beforeAll(async () => { await wasmSolver.initSolver(); });

describe('reinforcement sheets on a building', () => {
  it('read the shells of each combination once for all its slabs and walls', async () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    await modelStore.loadExample('pro-edificio-7p');
    ensurePhysicalModel();
    syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
    resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
    publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
    reads.n = 0;
    const rows = buildSheetRows();
    expect(rows.slab.length + rows.wall.length).toBeGreaterThan(40);
    expect(rows.combos).toBeGreaterThan(1);
    expect(reads.n).toBeGreaterThan(0);
    expect(reads.n).toBeLessThanOrEqual(rows.combos);
  }, 300000);
});
