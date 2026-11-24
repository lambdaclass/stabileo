/**
 * The gallery's buildings, loaded as their cards load them: their loads and combinations written
 * by the load generator from the settings they save, solved with every combination, their statics
 * closed in force and their results held to `baselines/<id>.json`. The wind reaches each member as
 * a few loads, not the thousands of slivers a power-law pressure took to match to the last digit.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import { setLocale } from '../../../i18n';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import { uiStore } from '../../../store/ui.svelte';
import '../../../store';
import { initSolver } from '../../../engine/wasm-solver';
import { publishCombinations3D } from '../../../store/active-results';
import { currentWorkbookSheets } from '../../../store/project-workbook';
import { PRO_EXAMPLES } from '../../../data/pro-examples';
import { expectBaseline } from '../../__tests__/result-baseline';

const BASELINES = fileURLToPath(new URL('../baselines/', import.meta.url));
const BUILDINGS = PRO_EXAMPLES.filter((e) => e.loads === 'generator');

beforeAll(async () => { await initSolver(); setLocale('es'); });
afterAll(() => setLocale('en'));
beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); historyStore.clear(); });

describe('the buildings of the gallery', () => {
  it('are the five concrete ones and the steel one with slabs', () => {
    expect(BUILDINGS.map((e) => e.id)).toEqual(['pro-rc-house', 'pro-rc-four-storey', 'pro-rc-steel-columns', 'pro-rc-lift-core', 'pro-rc-party-wall', 'pro-steel-building-slabs']);
  });
});

describe.each(BUILDINGS.map((e) => [e.id, e] as const))('%s', (id, ex) => {
  it('solves every combination of its generated loads, closes its forces and matches its baseline', async () => {
    await ex.load();
    const wind = modelStore.model.loadCases.filter((c) => c.type === 'W').map((c) => c.id);
    expect(wind.length).toBeGreaterThan(0);
    for (const caseId of wind) {
      const perMember = new Map<number, number>();
      for (const l of modelStore.loads) {
        const d = l.data as { caseId?: number; elementId?: number };
        if (d.caseId === caseId && d.elementId !== undefined) perMember.set(d.elementId, (perMember.get(d.elementId) ?? 0) + 1);
      }
      expect(Math.max(0, ...perMember.values()), `wind case ${caseId}: loads on one member`).toBeLessThanOrEqual(24);
    }
    const r = modelStore.solveCombinations3D(true, false, true);
    if (!r || typeof r === 'string') throw new Error(`${id}: ${String(r)}`);
    expect(r.perCombo.size, 'every combination solved').toBe(modelStore.combinations.length);
    publishCombinations3D(r);
    const [head, ...rows] = currentWorkbookSheets(5, { model: false }).find((s) => s.name === 'Statics')!.rows;
    const at = (k: string) => head!.indexOf(k);
    for (const row of rows) {
      if (String(row[at('component')]).startsWith('m')) continue;
      const applied = Math.abs(row[at('applied')] as number), residual = Math.abs(row[at('residual')] as number);
      expect(residual, `${row[at('sourceName')]} ${row[at('component')]}`).toBeLessThanOrEqual(1e-6 * Math.max(1, applied));
    }
    expectBaseline(BASELINES, id);
  }, 900_000);
});
