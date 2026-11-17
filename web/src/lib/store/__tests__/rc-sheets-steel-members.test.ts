/**
 * The sheets design concrete only: a member of steel, its yield strength no f'c, never becomes a
 * row, the steel frame of a concrete-walled storehouse or a steel moment frame among them.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore, resultsStore } from '..';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows } from '../rc-sheets.svelte';

beforeAll(async () => { await wasmSolver.initSolver(); });

async function rowsWith(steel: boolean) {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
  await modelStore.loadExample('rc-beam-flexure');
  if (steel) for (const m of [...modelStore.materials.values()]) modelStore.updateMaterial(m.id, { name: 'Acero F-24', e: 200000, fy: 240, fu: 370 } as never);
  recognizePhysicalElements(); syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
  resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
  publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
  return buildSheetRows();
}

describe('a member of steel in the reinforcement sheets', () => {
  it('is left out, where the same member in concrete is designed', async () => {
    const concrete = await rowsWith(false);
    expect(concrete.line).toHaveLength(1);
    expect(concrete.beam.length).toBeGreaterThan(0);
    const steel = await rowsWith(true);
    expect(steel.line).toHaveLength(0);
    expect(steel.beam).toHaveLength(0);
  }, 300000);
});
