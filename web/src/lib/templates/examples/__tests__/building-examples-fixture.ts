/**
 * A gallery building loaded as its card loads it, meshed as an analysis meshes it, solved with
 * every combination, its statics closed in force and its results held to
 * `baselines/generated/<id>.json` (`building-examples.switch-on.test.ts` says what is held). Split
 * over a few files, two buildings each, for the unit job runs files side by side.
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
import { meshBeforeAnalysis } from '../../../store/mesh-policy.svelte';
import { physicalPlates, preparePlatesForAnalysis } from '../../../store/physical-plates';
import { syncDefinedLoadsForAnalysis } from '../../../store/defined-loads';

const BASELINES = fileURLToPath(new URL('../baselines/generated/', import.meta.url));
export const BUILDINGS = PRO_EXAMPLES.filter((e) => e.loads === 'generator');



/** The buildings among `ids`, each solved and held to its baseline. */
export function describeBuildings(ids: readonly string[]): void {
  beforeAll(async () => { await initSolver(); setLocale('es'); });
  afterAll(() => setLocale('en'));
  beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); historyStore.clear(); });
  describe.each(BUILDINGS.filter((e) => ids.includes(e.id)).map((e) => [e.id, e] as const))('%s', (id, ex) => {
    it('solves every combination of its generated loads, closes its forces and matches its baseline', async () => {
      await ex.load();
      const used = new Set<number>();
      for (const e of modelStore.elements.values()) { used.add(e.nodeI); used.add(e.nodeJ); }
      for (const g of modelStore.model.groups.values()) for (const n of g.members.nodes ?? []) used.add(n);
      const loose = [...modelStore.supports.values()].filter((sp) => !used.has(sp.nodeId)).map((sp) => { const n = modelStore.nodes.get(sp.nodeId)!; return [n.x, n.y, n.z ?? 0]; });
      expect(loose, 'a support on a node nothing frames into').toEqual([]);
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
      expect(modelStore.quads.size, 'nothing meshed before the analysis').toBe(0);
      meshBeforeAnalysis.value = true;
      expect(preparePlatesForAnalysis().ok).toBe(true);
      syncDefinedLoadsForAnalysis();
      for (const p of physicalPlates()) {
        expect(p.surface.meshed?.quality.minAngle, `${p.name}: its cells are rectangles`).toBeCloseTo(90, 6);
        for (const q of p.group.members.quads ?? []) {
          const ns = modelStore.quads.get(q)!.nodes.map((n) => modelStore.nodes.get(n)!);
          const side = Math.min(...ns.map((a, i) => { const b = ns[(i + 1) % ns.length]!; return Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)); }));
          expect(side, `${p.name}: no cell narrower than a column's face from its axis`).toBeGreaterThanOrEqual(0.1 - 1e-6);
        }
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
}
