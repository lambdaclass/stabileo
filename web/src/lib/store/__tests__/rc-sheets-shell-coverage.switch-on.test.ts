import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore, resultsStore } from '..';
import { ensurePhysicalModel } from '../plates-from-shells';
import { preparePlatesForAnalysis } from '../physical-plates';
import { meshBeforeAnalysis } from '../mesh-policy.svelte';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows, setSheetCode } from '../rc-sheets.svelte';
import { PRO_EXAMPLES } from '../../data/pro-examples';
import type { AnalysisResults3D } from '../../engine/types-3d';

const missingCheck = (r: { verifications: Array<{ label: string; ok: boolean; demand?: string }> }) => r.verifications.find((v) => v.label === 'rcSheets.v.forcesMissing');

describe('slabs and walls whose shells one combination has no results for', () => {
  let named = '';

  beforeAll(async () => {
    await wasmSolver.initSolver();
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    await PRO_EXAMPLES.find((e) => e.id === 'pro-edificio-7p')!.load();
    ensurePhysicalModel();
    meshBeforeAnalysis.value = true;
    preparePlatesForAnalysis();
    syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
    resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
    const r = modelStore.solveCombinations3D(false, false, true) as { perCombo: Map<number, AnalysisResults3D> };
    const [id, last] = [...r.perCombo].at(-1)!;
    named = modelStore.model.combinations.find((c) => c.id === id)!.name;
    r.perCombo.set(id, { ...last, quadStresses: (last.quadStresses ?? []).filter((_, i) => i % 2 === 0), plateStresses: (last.plateStresses ?? []).filter((_, i) => i % 2 === 0) });
    publishCombinations3D(r as never);
    setSheetCode('cirsoc201-2025');
  }, 600_000);

  it('fail, naming that combination, instead of reading its forces as zero', () => {
    const rows = buildSheetRows();
    const read = [...rows.slab, ...rows.wall];
    expect(rows.slab.length).toBeGreaterThan(0);
    expect(rows.wall.length).toBeGreaterThan(0);
    for (const row of read) {
      const v = missingCheck(row)!;
      expect(v.ok).toBe(false);
      expect(v.demand).toContain(named);
      expect(row.status).toBe('fail');
    }
  });
});
