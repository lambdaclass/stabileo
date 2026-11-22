/**
 * The seven-storey example's balconies, 15 cm over 1.85 m and meshed as the app meshes them: their
 * deflection reads Ie with the strip's moment at the root, not an element's peak by a column, and
 * every one is proposed with steel that verifies ℓ/240 and stays tension-controlled; and, the
 * deflection having asked for that steel, it is told the thickness its strength steel meets it at.
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
import { buildSheetRows, redesignerOf, setSheetCode } from '../rc-sheets.svelte';
import { resizeHints } from '../rc-sheets-resize';
import { PRO_EXAMPLES } from '../../data/pro-examples';
import type { Serviceable } from '../../rc-sheets/deflection';

beforeAll(async () => { await wasmSolver.initSolver(); });

describe('the seven-storey balconies', () => {
  it('verify their deflection with the root strip\'s moment, tension-controlled, in CIRSOC, ACI and TS 500', async () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    await PRO_EXAMPLES.find((e) => e.id === 'pro-edificio-7p')!.load();
    ensurePhysicalModel();
    meshBeforeAnalysis.value = true;
    preparePlatesForAnalysis();
    syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
    resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
    publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
    for (const code of ['cirsoc201-2025', 'aci318-19', 'ts500-2000'] as const) {
      setSheetCode(code);
      const balconies = buildSheetRows().slab.filter((r) => (r.demand as Serviceable).service?.strip?.reference === 'root');
      expect(balconies.map((r) => r.name), code).toEqual(['L4', 'L11', 'L18', 'L25', 'L32', 'L39', 'L46']);
      for (const r of balconies) {
        const at = `${code} ${r.name}`;
        expect(r.status, at).not.toBe('fail');
        expect(r.verifications.filter((v) => !v.ok).map((v) => v.label), at).toEqual([]);
        const sv = (r.demand as Serviceable).service!;
        expect(sv.dead.m, at).toBeLessThan(0.6 * r.demand.m.topX.value);
        const defl = r.verifications.find((v) => v.label.endsWith('.deflection'))!;
        expect(defl.ratio!, at).toBeLessThanOrEqual(1 + 1e-9);
        expect(r.byDeflection, at).toBe(true);
        const [hint] = resizeHints(r);
        expect(hint, at).toMatchObject({ what: 'slabH', direction: 'stiffen', from: [0.15] });
        const thicker = redesignerOf(r.key)!({ ...r.demand, h: hint!.to![0]! } as never) as typeof r;
        expect(thicker.status, at).not.toBe('fail');
        expect(thicker.byDeflection, at).toBeUndefined();
        const thinner = redesignerOf(r.key)!({ ...r.demand, h: hint!.to![0]! - 0.01 } as never) as typeof r;
        expect(thinner.status === 'fail' || thinner.byDeflection === true, at).toBe(true);
      }
    }
  }, 600_000);
});
