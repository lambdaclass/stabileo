import { describe, it, beforeAll, afterEach } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore, resultsStore } from '..';
import { ensurePhysicalModel } from '../plates-from-shells';
import { preparePlatesForAnalysis } from '../physical-plates';
import { meshBeforeAnalysis } from '../mesh-policy.svelte';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows, setSheetCode } from '../rc-sheets.svelte';
import { patchDesignData, designData } from '../design-data';
import { PRO_EXAMPLES } from '../../data/pro-examples';

const OUT = process.env.HARNESS_OUT ?? '/tmp/harness';
const IDS = (process.env.HARNESS_IDS ?? 'pro-edificio-7p').split(',');
const CODES = (process.env.HARNESS_CODES ?? 'cirsoc').split(',');
const SEISMIC = process.env.HARNESS_SEISMIC === '1';

beforeAll(async () => { await wasmSolver.initSolver(); mkdirSync(OUT, { recursive: true }); });
afterEach(() => { uiStore.analysisMode = '3d'; });

describe('harness', () => {
  for (const id of IDS) it(id, async () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    await PRO_EXAMPLES.find((e) => e.id === id)!.load();
    ensurePhysicalModel();
    meshBeforeAnalysis.value = true;
    const prep = preparePlatesForAnalysis();
    syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
    resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
    try { publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never); } catch (e) { /* none */ }
    const report: Record<string, unknown> = { id, prep: (prep as { ok: boolean }).ok };
    for (const code of CODES) {
      setSheetCode(code as never);
      if (SEISMIC) patchDesignData({ designOptions: { ...(designData().designOptions ?? {}), seismic: true } } as never);
      const t0 = Date.now();
      const rows = buildSheetRows();
      const fam: Record<string, unknown> = { ms: Date.now() - t0, basis: rows.basis, code: rows.code, sample: rows.beam[0]?.verifications?.slice(0, 3).map((v) => v.clause ?? v.label) };
      for (const f of ['beam', 'line', 'column', 'slab', 'wall', 'punching', 'footing'] as const) {
        const list = rows[f] as Array<{ name?: string; key?: string; level?: string; status: string; verifications?: Array<{ label: string; ok: boolean; demand?: string; capacity?: string; ratio?: number }> }>;
        const fails = list.filter((r) => r.status === 'fail').map((r) => ({
          name: r.name ?? r.key, level: r.level,
          bad: (r.verifications ?? []).filter((v) => !v.ok).map((v) => `${v.label}${v.demand ? ` d=${v.demand}` : ''}${v.capacity ? ` c=${v.capacity}` : ''}${v.ratio !== undefined ? ` r=${v.ratio.toFixed(2)}` : ''}`),
        }));
        fam[f] = { total: list.length, fail: fails.length, fails };
      }
      report[code] = fam;
    }
    writeFileSync(`${OUT}/${id}${SEISMIC ? '-seismic' : ''}.json`, JSON.stringify(report, null, 1));
  }, 1_800_000);
});
