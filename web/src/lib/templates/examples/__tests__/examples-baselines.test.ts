/**
 * The PRO examples written as model code, solved as the gallery loads them, against baselines.
 *
 * Each is loaded through its catalogue card (so with the combinations the card builds), solved
 * with every combination, and its maxima and statics are held to `baselines/<id>.json`. The
 * statics must also close, each component within 1e-6 of what is applied (1 kN, 1 kN·m at
 * least): a larger residual is a load or a reaction the model lost. Forces close always. Moments
 * close in the undeformed geometry only for a linear result without shells: a second-order
 * equilibrium holds in the deformed one (P·Δ), and the shells' drilling stabilisation carries a
 * small share of the moment about their normals to ground (M14 in the engine's list).
 * `STABILEO_UPDATE_BASELINES=1` re-records after a deliberate change.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setLocale } from '../../../i18n';
import { fileURLToPath } from 'node:url';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import { uiStore } from '../../../store/ui.svelte';
import '../../../store';
import { initSolver } from '../../../engine/wasm-solver';
import { publishCombinations3D } from '../../../store/active-results';
import { currentWorkbookSheets } from '../../../store/project-workbook';
import { PRO_EXAMPLES } from '../../../data/pro-examples';
import { expectBaseline } from '../../__tests__/result-baseline';
import { CODE_EXAMPLES } from '../index';

const BASELINES = fileURLToPath(new URL('../baselines/', import.meta.url));

// The baselines carry the case and combination names in Spanish, the language the examples are
// written in; an example opens with its names in the app's language (`example-names.ts`).
beforeAll(async () => { await initSolver(); setLocale('es'); });
afterAll(() => setLocale('en'));
beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); historyStore.clear(); });

describe.each(Object.keys(CODE_EXAMPLES))('%s', (id) => {
  it('solves every combination, closes its statics and matches its baseline', async () => {
    await PRO_EXAMPLES.find((e) => e.id === id)!.load();
    const r = modelStore.solveCombinations3D(true, false, true);
    if (!r || typeof r === 'string') throw new Error(`${id}: ${String(r)}`);
    expect(r.perCombo.size, 'every combination solved').toBe(modelStore.combinations.length);
    publishCombinations3D(r);
    const statics = currentWorkbookSheets(5, { model: false }).find((s) => s.name === 'Statics')!.rows;
    const [head, ...rows] = statics;
    const at = (k: string) => head!.indexOf(k);
    const shells = modelStore.quads.size + modelStore.plates.size > 0;
    const secondOrder = modelStore.analysis?.perCombination === 'pdelta';
    for (const row of rows) {
      const moment = String(row[at('component')]).startsWith('m');
      if (moment && (shells || (secondOrder && row[at('source')] === 'combination'))) continue;
      const applied = Math.abs(row[at('applied')] as number), residual = Math.abs(row[at('residual')] as number);
      expect(residual, `${row[at('sourceName')]} ${row[at('component')]}`).toBeLessThanOrEqual(1e-6 * Math.max(1, applied));
    }
    expectBaseline(BASELINES, id);
  }, 600_000);
});
