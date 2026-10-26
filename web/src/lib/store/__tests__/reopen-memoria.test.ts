/**
 * Reopening a project gives back the memoria it had, without designing anything again.
 *
 * Measured on the acceptance run: after saving and reopening, the detailing was still there
 * (445 kg) and the memoria read «0 elements, 0 checks». The analysis results are not saved with
 * a project, by design; the reinforcement is. So: before solving, the memoria carries what does
 * not need the solve (the floor rows, kept with the fingerprint they hold for) and the report says
 * what to do; after solving and computing the demands, the frame rows are back, from the saved bars.
 */
import { describe, it, expect } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { designRunStore } from '../design-run.svelte';
import '../index';
import { serializeProject, deserializeProject } from '../file';
import { memoriaInput } from '../memoria-inputs';
import { needsRecheck } from '../recheck';
import { runProductionChain } from '../../export/__tests__/rc-cad-chain';
import { historyStore, uiStore } from '..';
import { verificationStore } from '../verification.svelte';
import { detailingStore } from '../detailing.svelte';
import { placeFrame, placeSlabs } from '../../model/building/build-on-grid';
import type { StructuralGrid } from '../../model/grid';

const grid: StructuralGrid = {
  axes: [
    { id: 'A', name: 'A', axis: 'x', at: 0 }, { id: 'B', name: 'B', axis: 'x', at: 6 },
    { id: '1', name: '1', axis: 'y', at: 0 }, { id: '2', name: '2', axis: 'y', at: 5 },
  ],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }],
};

/** One bay, one storey, a slab meshed at 1 m, solved: the floor design has slab rows to keep. */
function slabBuilding(): void {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); detailingStore.clear();
  uiStore.analysisMode = 'pro';
  const mat = modelStore.addMaterial({ name: 'H-30', e: 27500, nu: 0.2, rho: 25, fy: 30, fc: 30 } as never);
  const col = modelStore.addSection({ name: 'Rect 30x30 cm', a: 0.09, iy: 0.000675, iz: 0.000675, j: 0.00114, b: 0.3, h: 0.3, shape: 'rect' } as never);
  const bm = modelStore.addSection({ name: 'Rect 20x50 cm', a: 0.1, iy: 0.00208, iz: 0.000333, j: 0.00093, b: 0.2, h: 0.5, shape: 'rect' } as never);
  const S = (id: number) => ({ sectionId: id, materialId: mat });
  placeFrame(grid, { x: ['A', 'B'], y: ['1', '2'], levels: ['N0', 'N1'], columns: S(col), beamsX: S(bm), beamsY: S(bm) }, { fixBase: true });
  placeSlabs(grid, { levels: ['N1'], thickness: 0.15, materialId: mat, meshSize: 1, typology: 'solid' });
  for (const q of modelStore.quads.values()) { modelStore.addSurfaceLoad3D(q.id, 1.5, 1); modelStore.addSurfaceLoad3D(q.id, 2, 2); }
  const combo = modelStore.solveCombinations3D(true, false, true);
  if (!combo || typeof combo === 'string') throw new Error(String(combo));
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
}

const tr = (k: string) => k;
const families = () => {
  const out: Record<string, number> = {};
  for (const e of memoriaInput(tr, 'en').elements) out[e.family] = (out[e.family] ?? 0) + e.rows.length;
  return out;
};

describe('reopening a project', () => {
  it('the memoria comes back the same, and the saved bars are checked again, not redesigned', async () => {
    await runProductionChain();
    const before = families();
    expect(Object.keys(before).length).toBeGreaterThan(0);
    const bars = JSON.stringify([...modelStore.elements.values()].map((e) => e.reinforcement ?? null));

    const file = serializeProject();
    modelStore.clear(); resultsStore.clear();
    expect(deserializeProject(file)).toBe(true);
    expect(needsRecheck()).toBe(true);
    // Before solving: what does not need the solve is there already (slabs, walls, footings when present).
    const reopened = families();
    for (const f of ['slab', 'wall', 'footing']) expect(reopened[f] ?? 0, f).toBe(before[f] ?? 0);

    // Solve and compute the demands: the frame rows come back from the saved reinforcement.
    const solved = await modelStore.solveCombinations3DParallel(true, false, true);
    const r = solved as { perCase: never; perCombo: never; envelope: never };
    resultsStore.setCombinationResults3D(r.perCase, r.perCombo, r.envelope);
    expect(designRunStore.computeDemands().ok).toBe(true);
    expect(needsRecheck()).toBe(false);
    const after = families();
    expect(after).toEqual(before);
    expect(JSON.stringify([...modelStore.elements.values()].map((e) => e.reinforcement ?? null))).toBe(bars);
  });

  it('a floor designed before saving keeps its slab rows after reopening, before any solve', () => {
    slabBuilding();
    expect(designRunStore.computeDemands().ok).toBe(true);
    detailingStore.generateFloors({ verifierId: 'cirsoc201.provided.v2.2025' });
    const before = families();
    expect(before.slab ?? 0).toBeGreaterThan(0);
    const file = serializeProject();
    modelStore.clear(); resultsStore.clear();
    expect(deserializeProject(file)).toBe(true);
    expect(detailingStore.lastFloorRun).toBeNull();
    expect(families().slab ?? 0).toBe(before.slab);
  });
});
