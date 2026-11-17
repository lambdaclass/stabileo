/**
 * The sheets on the seven-storey example as its card opens it, and a wall that runs past a floor
 * read storey by storey.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore, resultsStore } from '..';
import { ensurePhysicalModel, platesFromShells } from '../plates-from-shells';
import { physicalPlates, preparePlatesForAnalysis } from '../physical-plates';
import { meshBeforeAnalysis } from '../mesh-policy.svelte';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows } from '../rc-sheets.svelte';
import { PRO_EXAMPLES } from '../../data/pro-examples';
import { slabSpanKind } from '../../rc-sheets/slab-plan';

beforeAll(async () => { await wasmSolver.initSolver(); });
afterEach(() => { uiStore.analysisMode = '3d'; });

function solve(combos: boolean) {
  syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
  resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
  if (combos) publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
}

describe('the seven-storey example in the sheets', () => {
  it('stands its core on its whole base, one wall a storey, and a balcony says it is one in its steps', async () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    await PRO_EXAMPLES.find((e) => e.id === 'pro-edificio-7p')!.load();
    ensurePhysicalModel();
    meshBeforeAnalysis.value = true;
    expect(preparePlatesForAnalysis()).toMatchObject({ ok: true });
    const held = new Set([...modelStore.supports.values()].map((x) => x.nodeId));
    const baseZ = Math.min(...[...modelStore.nodes.values()].map((n) => n.z ?? 0));
    const wallBase = physicalPlates().filter((p) => p.physical.kind === 'wall')
      .flatMap((p) => (p.group.members.quads ?? []).flatMap((q) => modelStore.quads.get(q)!.nodes))
      .filter((n) => Math.abs((modelStore.nodes.get(n)!.z ?? 0) - baseZ) < 1e-6);
    expect(wallBase.length).toBeGreaterThan(12);
    expect(wallBase.filter((n) => !held.has(n))).toEqual([]);
    solve(true);
    const rows = buildSheetRows();
    expect(rows.wall).toHaveLength(21);
    for (const w of rows.wall) {
      expect(w.demand.base?.unheld ?? [], w.name).toEqual([]);
      expect(w.demand.height, w.name).toBeLessThanOrEqual(3.5 + 1e-9);
    }
    expect(rows.wall.filter((w) => w.level === 'N0').every((w) => Math.max(...w.demand.combos.map((k) => k.pu)) > 0)).toBe(true);
    const balcony = rows.slab.find((r) => r.name === 'L4')!;
    expect(slabSpanKind(balcony, rows.slabPlan)).toBe('cantilever');
    const labels = balcony.steps.flatMap((g) => g.steps.map((x) => x.label));
    expect(labels).toContain('rcSheets.s.cantilever');
    expect(labels).not.toContain('rcSheets.s.oneWay');
    const inner = rows.slab.find((r) => r.name === 'L1')!;
    expect(inner.steps.flatMap((g) => g.steps.map((x) => x.label))).toContain('rcSheets.s.twoWay');
  }, 600_000);
});

describe('a wall plate taller than a storey, with no grid', () => {
  it('is read a storey at a time, at the elevations the members span', () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 } as never);
    const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
    const at = (x: number, z: number) => modelStore.addNode(x, 0, z);
    const [a, b, c, d, e, f] = [at(0, 0), at(2, 0), at(2, 3), at(0, 3), at(2, 6), at(0, 6)] as [number, number, number, number, number, number];
    const keys = [`q${modelStore.addQuad([a, b, c, d], conc, 0.2)}`, `q${modelStore.addQuad([d, c, e, f], conc, 0.2)}`];
    for (const n of [a, b]) modelStore.addSupport(n, 'fixed3d');
    const foot = at(-4, 0), head = at(-4, 3);
    modelStore.addSupport(foot, 'fixed3d');
    for (const [i, j] of [[foot, head], [head, d]] as const) {
      const id = modelStore.addElement(i, j, 'frame');
      modelStore.updateElementSection(id, col); modelStore.updateElementMaterial(id, conc);
    }
    const dead = modelStore.model.loadCases.find((k) => k.type === 'D')!.id;
    modelStore.addNodalLoad3D(f, 10, 0, -100, 0, 0, 0, dead);
    for (const k of [...modelStore.combinations]) modelStore.removeCombination(k.id);
    modelStore.addCombination('1.4D', [{ caseId: dead, factor: 1.4 }]);
    platesFromShells(keys);
    solve(true);
    const walls = buildSheetRows().wall;
    expect(walls.map((w) => w.demand.height)).toEqual([3, 3]);
  });
});
