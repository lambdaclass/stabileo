/**
 * The seven-storey example's rows, plans and schedule-facing texts under CIRSOC and ACI 318: the
 * Stabileo criteria are cited by their token, which every view translates, and nothing the sheets
 * show names the course they come from.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore, resultsStore } from '..';
import { ensurePhysicalModel } from '../plates-from-shells';
import { preparePlatesForAnalysis } from '../physical-plates';
import { meshBeforeAnalysis } from '../mesh-policy.svelte';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows, setRcOption, setSheetCode } from '../rc-sheets.svelte';
import { galleryExample } from '../../data/__tests__/gallery-examples';
import { CRITERION, localizeCriterion } from '../../rc-sheets/criteria';
import { optionRule } from '../../rc-sheets/design-options';
import { rulesFor } from '../../rc-sheets/codes';
import { sheetCheckRow } from '../../rc-sheets-readers/memoria';
import { t } from '../../i18n';

beforeAll(async () => { await wasmSolver.initSolver(); });

describe('the seven-storey example', () => {
  it('cites the Stabileo criteria, never the course', async () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    await galleryExample('pro-edificio-7p').load();
    ensurePhysicalModel();
    meshBeforeAnalysis.value = true;
    preparePlatesForAnalysis();
    syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
    resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
    publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
    setRcOption('slabBentBars', true);
    for (const code of ['cirsoc201-2025', 'aci318-19'] as const) {
      setSheetCode(code);
      const rows = buildSheetRows();
      const text = JSON.stringify(rows);
      expect(text, code).not.toMatch(/FIUBA/);
      for (const k of ['bentBars', 'slabBentBars', 'alternatives'] as const) expect(optionRule(k, code).clause, code).not.toMatch(/FIUBA/);
      expect(rulesFor(code).bends.clause, code).not.toMatch(/FIUBA/);
      const checks = [...rows.beam, ...rows.line, ...rows.column, ...rows.slab, ...rows.footing].flatMap((r) => r.verifications);
      if (code === 'cirsoc201-2025') {
        expect(text).toContain(CRITERION);
        expect(rows.slabPlan.some((p) => p.rules.clause.bendAt === CRITERION)).toBe(true);
      }
      for (const l of checks) expect(sheetCheckRow(l, code, t).clause ?? '', code).not.toContain(CRITERION);
      for (const s of [...rows.beam, ...rows.line, ...rows.column, ...rows.slab].flatMap((r) => r.steps.flatMap((g) => g.steps))) {
        expect(localizeCriterion(s.formula, t)).not.toContain(CRITERION);
        expect(localizeCriterion(s.value, t)).not.toContain(CRITERION);
      }
    }
  }, 600_000);
});
