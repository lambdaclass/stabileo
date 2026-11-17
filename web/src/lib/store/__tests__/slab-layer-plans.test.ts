/**
 * A level's slab comes out in four sheets, one per layer, with its breakdown; each mark's bar
 * count is the count the detailing lays, so the plan, the schedule and the 3-D view agree. Bands
 * at an angle, over a free outline and grouped as a package go through the same path.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { designRunStore } from '../design-run.svelte';
import { verificationStore } from '../verification.svelte';
import { detailingStore } from '../detailing.svelte';
import { storedDecisions } from '../design-decisions';
import { placeFrame, placeSlabs } from '../../model/building/build-on-grid';
import { levelSlabPanels, planContext, workDrawings } from '../work-drawings';
import { slabMarks } from '../../sheets/plans/slab-plan';
import type { SlabPanelReinforcement } from '../../design-contract/reinforcement';
import type { StructuralGrid } from '../../model/grid';
import * as wasmSolver from '../../engine/wasm-solver';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const grid: StructuralGrid = {
  axes: [
    { id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x1', name: '2', axis: 'x', at: 5 },
    { id: 'y0', name: 'A', axis: 'y', at: 0 }, { id: 'y1', name: 'B', axis: 'y', at: 4 },
  ],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }],
};

function slabDesigned(): string {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
  const mat = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
  const col = modelStore.addSection({ name: '30×30', a: 0.09, iy: 0.000675, iz: 0.000675, j: 0.00114, b: 0.3, h: 0.3, shape: 'rect' } as never);
  const bm = modelStore.addSection({ name: '20×50', a: 0.1, iy: 0.00208, iz: 0.000333, j: 0.00093, b: 0.2, h: 0.5, shape: 'rect' } as never);
  placeFrame(grid, { x: ['x0', 'x1'], y: ['y0', 'y1'], levels: ['N0', 'N1'], columns: { sectionId: col, materialId: mat }, beamsX: { sectionId: bm, materialId: mat }, beamsY: { sectionId: bm, materialId: mat } }, { fixBase: true });
  placeSlabs(grid, { levels: ['N1'], thickness: 0.12, materialId: mat, meshSize: 0.5 });
  for (const q of modelStore.quads.values()) modelStore.addSurfaceLoad3D(q.id, 8, 1);
  const combo = modelStore.solveCombinations3D(false, false, true);
  if (!combo || typeof combo === 'string') throw new Error(String(combo));
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  expect(designRunStore.computeDemands().ok).toBe(true);
  const run = detailingStore.generateFloors({ families: ['slab'] })!;
  return run.slabs.find((s) => s.panel)!.panelId;
}

const mine: SlabPanelReinforcement = {
  base: { bottomX: { diameter: 8, spacing: 0.2 }, bottomY: { diameter: 8, spacing: 0.2 }, topX: { diameter: 8, spacing: 0.25 }, topY: { diameter: 8, spacing: 0.25 } },
  bands: [
    // Two equal top bands over the supports along x, one package.
    { id: 'tA', face: 'top', dir: 'x', x0: 0, x1: 1.2, y0: 0, y1: 4, diameter: 10, spacing: 0.2, hookStart: true, group: 'g1' },
    { id: 'tB', face: 'top', dir: 'x', x0: 3.8, x1: 5, y0: 0, y1: 4, diameter: 10, spacing: 0.2, hookStart: true, group: 'g1' },
    // A top band along y.
    { id: 'tC', face: 'top', dir: 'y', x0: 0, x1: 5, y0: 3, y1: 4, diameter: 10, spacing: 0.2 },
    // A bottom band at 30° over a free outline.
    { id: 'bD', face: 'bottom', dir: 'x', x0: 1, x1: 4, y0: 1, y1: 3, diameter: 10, spacing: 0.25, angle: 30, outline: [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 3 }, { x: 2, y: 3 }] },
    // A bottom band along y.
    { id: 'bE', face: 'bottom', dir: 'y', x0: 2, x1: 3, y0: 0, y1: 4, diameter: 12, spacing: 0.15 },
  ],
};

describe('a level\'s slab in four sheets', () => {
  it('one sheet per layer and the breakdown; each mark counts the bars the detailing lays', () => {
    const id = slabDesigned();
    const d = storedDecisions();
    modelStore.reinforcementTransaction((api) => api.setDecisions({ ...d, slabs: { [id]: mine } }));
    const run = detailingStore.generateFloors({ families: ['slab'] })!;
    const sheets = workDrawings(null, new Set(['slabs']), planContext('es', 'A1' as never)).get('slabs')!;
    // The model declares no grid, so the level is named from the elevations (N1 at 3 m).
    expect(sheets.map((s) => s.key)).toEqual(['slab-N1-bottomX', 'slab-N1-bottomY', 'slab-N1-topX', 'slab-N1-topY', 'slab-N1-breakdown']);
    // Each layer states its base mat.
    const texts = (k: string) => sheets.find((s) => s.key === k)!.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text).join(' | ');
    expect(texts('slab-N1-topX')).toMatch(/Malla base: Ø8 c\/25/);
    // The package is one mark; the 30° band is in the x layer.
    const marks = slabMarks(levelSlabPanels());
    expect(marks.map((m) => [m.mark, m.bands.map((b) => b.id).join('+')])).toEqual([['IX1', 'bD'], ['IY1', 'bE'], ['SX1', 'tA+tB'], ['SY1', 'tC']]);
    // The count each mark states is the count of bars the detailing laid for its bands.
    const laid = run.assemblies.flatMap((a) => a.bars);
    for (const m of marks) {
      const n = m.bands.reduce((s, b) => s + laid.filter((x) => x.id.includes(`${b.id}-`)).length, 0);
      expect([m.mark, m.count]).toEqual([m.mark, n]);
    }
    expect(texts('slab-N1-topX')).toMatch(/SX1 \d+Ø10 c\/20 L=.* \(2×\)/);
  });
});
