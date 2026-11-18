/**
 * The seven-storey example's core: three walls in a U with column C1 modelled at the corner of two
 * of them, meshed and solved as the app does. C1 is part of the core at every storey, the core is
 * checked as one section with C1's bars as its boundary, and it stands on one footing whose
 * actions are its base's reactions summed. The core's forces are read, as the walls' are, at the
 * centre of the first row of elements: against the reactions they differ by the self-weight of
 * half that row and by its shear over half its height.
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
import { writeFootingToModel } from '../rc-sheets-footings';
import { pierCombos } from '../../rc-sheets/pier-design';
import { PRO_EXAMPLES } from '../../data/pro-examples';
import type { AnalysisResults3D } from '../../engine/types-3d';

beforeAll(async () => { await wasmSolver.initSolver(); });

describe('the seven-storey core as one element', () => {
  it('integrates C1 into the walls, checks the core whole and stands it on one footing', async () => {
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

    expect(rows.footing.find((f) => f.key === 'footing:n1')).toBeUndefined();
    const core = rows.footing.filter((f) => f.demand.pier);
    expect(core).toHaveLength(1);
    const f = core[0]!;
    expect(f.demand.pier!.nodes).toContain(c1[0]!.demand.nodes!.bottom);
    expect(f.status, JSON.stringify(f.verifications.filter((v) => !v.ok))).not.toBe('fail');
    const perCombo = [...resultsStore.perCombo3D.values()] as AnalysisResults3D[];
    expect(perCombo.length).toBe(f.demand.combos.length);
    const c = f.demand.at;
    f.demand.combos.forEach((a, i) => {
      const rs = perCombo[i]!.reactions.filter((x) => f.demand.pier!.nodes.includes(x.nodeId));
      expect(rs).toHaveLength(f.demand.pier!.nodes.length);
      const node = (id: number) => modelStore.nodes.get(id)!;
      expect(a.N).toBeCloseTo(rs.reduce((s, x) => s + x.fz, 0), 6);
      expect(a.Vx).toBeCloseTo(-rs.reduce((s, x) => s + x.fx, 0), 6);
      expect(a.Mx).toBeCloseTo(-rs.reduce((s, x) => s + x.mx + (node(x.nodeId).y - c.y) * x.fz, 0), 6);
      expect(a.My).toBeCloseTo(-rs.reduce((s, x) => s + x.my - (node(x.nodeId).x - c.x) * x.fz, 0), 6);
      const k = combos.find((x) => x.combo === a.combo)!;
      expect(Math.abs(k.n - a.N) / a.N, a.combo).toBeLessThan(0.01);
      const near = (pier: number, reaction: number, slack: number) => expect(Math.abs(pier - reaction), a.combo).toBeLessThanOrEqual(slack);
      near(k.vx, -a.Vx, 0.1 * Math.abs(a.Vx) + 10);
      near(k.vy, -a.Vy, 0.1 * Math.abs(a.Vy) + 10);
      const lever = 0.6 * Math.hypot(a.Vx, a.Vy) + 10;
      near(k.mx, -a.Mx + (c.y - atBase.centroid.y) * a.N, lever + 0.02 * Math.abs(a.Mx));
      near(k.my, -a.My - (c.x - atBase.centroid.x) * a.N, lever + 0.02 * Math.abs(a.My));
    });

    writeFootingToModel(f);
    const written = [...modelStore.model.footings.values()];
    expect(written).toHaveLength(1);
    expect(new Set([written[0]!.nodeId, ...(written[0]!.supportedNodeIds ?? [])])).toEqual(new Set(f.demand.pier!.nodes));
    const again = buildSheetRows().footing.filter((x) => x.demand.pier);
    expect(again).toHaveLength(1);
    expect(again[0]!.demand.footing?.outOfScope).toBeUndefined();
    expect(again[0]!.demand.footing!.B).toBeCloseTo(f.B, 9);
    expect(again[0]!.demand.footing!.ex).toBeCloseTo(f.ex, 9);
    expect(again[0]!.demand.footing!.ey).toBeCloseTo(f.ey, 9);

    setSheetCode('ts500-2000');
    const apart = buildSheetRows();
    expect(apart.wall.every((r) => !r.pier)).toBe(true);
    expect(apart.column.filter((r) => r.name === 'C1').every((r) => !r.pier && r.verifications.some((v) => v.label === 'rcSheets.v.pierApart'))).toBe(true);
    expect(apart.footing.filter((x) => x.demand.pier)).toHaveLength(1);
  }, 600_000);
});
