/**
 * The seven-storey example's core: three walls in a U with column C1 modelled at the corner of two
 * of them, meshed and solved as the app does. C1 is part of the core at every storey and the core is
 * checked as one section with C1's bars as its boundary. The core's forces are read, as the walls'
 * are, from the first row of elements with their shear's moment carried down to the base: against
 * its base's reactions summed they differ by the self-weight of half that row and the stresses'
 * recovery.
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
import { buildSheetRows, setSheetCode } from '../rc-sheets.svelte';
import { storeyPiers } from '../rc-sheets-piers';
import { pierCombos } from '../../rc-sheets/pier-design';
import { PRO_EXAMPLES } from '../../data/pro-examples';
import type { AnalysisResults3D } from '../../engine/types-3d';

beforeAll(async () => { await wasmSolver.initSolver(); });

describe('the seven-storey core as one element', () => {
  it('integrates C1 into the walls and checks the core whole, its forces at the base its reactions', async () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    await PRO_EXAMPLES.find((e) => e.id === 'pro-edificio-7p')!.load();
    ensurePhysicalModel();
    meshBeforeAnalysis.value = true;
    preparePlatesForAnalysis();
    syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
    resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
    publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);

    setSheetCode('cirsoc201-2025');
    const rows = buildSheetRows();
    const c1 = rows.column.filter((r) => r.name === 'C1');
    expect(c1).toHaveLength(7);
    for (const r of c1) {
      expect(r.pier, r.key).toBeDefined();
      expect(r.verifications[0]!.label).toBe('rcSheets.v.columnInPier');
      expect(r.verifications.some((v) => v.label === 'rcSheets.v.pierPM' && v.ok)).toBe(true);
      expect(r.status, r.key).not.toBe('fail');
    }
    expect(rows.column.filter((r) => r.name !== 'C1').every((r) => !r.pier)).toBe(true);

    for (const r of rows.wall) {
      expect(r.pier, r.key).toBeDefined();
      expect(r.pier!.name).toContain('C1');
      expect(r.verifications.some((v) => v.label === 'rcSheets.v.wallPM')).toBe(false);
      expect(r.status, `${r.key} ${JSON.stringify(r.verifications.filter((v) => !v.ok))}`).not.toBe('fail');
    }
    const n0 = rows.wall.filter((r) => r.level === c1[0]!.level);
    const host = n0.find((r) => r.pier!.columns.some((c) => c.host))!;
    expect(host.pier!.columns[0]!.bars).toHaveLength(8);
    const atBase = storeyPiers(n0.map((r) => r.demand), [c1[0]!.demand]).find((p) => p.columns.length)!;
    const { combos, missing } = pierCombos(atBase, n0.map((r) => r.demand), [c1[0]!.demand]);
    expect(missing).toEqual([]);
    for (const k of combos) {
      const parts = n0.reduce((s, r) => s + r.demand.combos.find((x) => x.combo === k.combo)!.global!.n, 0) + c1[0]!.demand.cases.find((x) => x.combo === k.combo)!.base!.n;
      expect(k.n).toBeCloseTo(parts, 6);
    }

    const supported = new Set([...modelStore.supports.values()].map((x) => x.nodeId));
    const nodes = [...new Set([...n0.flatMap((r) => r.demand.baseNodes ?? []), c1[0]!.demand.nodes!.bottom])].filter((n) => supported.has(n));
    expect(nodes.length).toBeGreaterThan(2);
    const c = atBase.centroid, node = (id: number) => modelStore.nodes.get(id)!;
    const nameOf = new Map(modelStore.combinations.map((x) => [x.id, x.name]));
    for (const [id, result] of resultsStore.perCombo3D) {
      const k = combos.find((x) => x.combo === nameOf.get(id))!;
      const rs = (result as AnalysisResults3D).reactions.filter((x) => nodes.includes(x.nodeId));
      expect(rs).toHaveLength(nodes.length);
      const N = rs.reduce((t, x) => t + x.fz, 0), Vx = rs.reduce((t, x) => t + x.fx, 0), Vy = rs.reduce((t, x) => t + x.fy, 0);
      const Mx = rs.reduce((t, x) => t + x.mx + (node(x.nodeId).y - c.y) * x.fz, 0), My = rs.reduce((t, x) => t + x.my - (node(x.nodeId).x - c.x) * x.fz, 0);
      expect(Math.abs(k.n - N) / N, k.combo).toBeLessThan(0.01);
      const near = (pier: number, reaction: number, slack: number) => expect(Math.abs(pier - reaction), k.combo).toBeLessThanOrEqual(slack);
      near(k.vx, Vx, 0.1 * Math.abs(Vx) + 10);
      near(k.vy, Vy, 0.1 * Math.abs(Vy) + 10);
      const lever = 0.1 * Math.hypot(Vx, Vy) + 10;
      near(k.mx, Mx, lever + 0.02 * Math.abs(Mx));
      near(k.my, My, lever + 0.02 * Math.abs(My));
    }

    setSheetCode('ts500-2000');
    const apart = buildSheetRows();
    expect(apart.wall.every((r) => !r.pier)).toBe(true);
    expect(apart.column.filter((r) => r.name === 'C1').every((r) => !r.pier && r.verifications.some((v) => v.label === 'rcSheets.v.pierApart'))).toBe(true);
  }, 600_000);
});
