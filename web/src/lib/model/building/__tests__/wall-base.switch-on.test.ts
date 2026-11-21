import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../../engine/wasm-solver';
import { historyStore, modelStore, uiStore } from '../../../store';
import { placeFrame, placeWall } from '../build-on-grid';
import { physicalPlates, plateEntry, plateShellKeys, preparePlatesForAnalysis } from '../../../store/physical-plates';
import type { StructuralGrid } from '../../grid';

const grid: StructuralGrid = {
  axes: [
    { id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x1', name: '2', axis: 'x', at: 6 },
    { id: 'y0', name: 'A', axis: 'y', at: 0 }, { id: 'y1', name: 'B', axis: 'y', at: 5 },
  ],
  levels: [{ id: 'N0', name: 'N0', z: 0 }, { id: 'N1', name: 'N1', z: 3 }, { id: 'N2', name: 'N2', z: 6 }],
};
const S = { sectionId: 1, materialId: 1 };

function build(fixBase: boolean, meshAtSolve: boolean) {
  modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
  placeFrame(grid, { x: ['x0', 'x1'], y: ['y0', 'y1'], levels: ['N0', 'N2'], columns: S, beamsX: S, beamsY: S }, { fixBase });
  placeWall(grid, { axis: 'y0', from: 'x0', to: 'x1', levelFrom: 'N0', levelTo: 'N2', thickness: 0.2, materialId: 1, meshSize: 0.5, meshAtSolve });
  return physicalPlates().filter((p) => p.physical.kind === 'wall').sort((p, q) => (p.physical.levelFrom ?? '').localeCompare(q.physical.levelFrom ?? ''));
}

const baseNodes = (id: number) => [...new Set(plateShellKeys(id).flatMap((k) => (k[0] === 'q' ? modelStore.quads.get(Number(k.slice(1)))?.nodes : modelStore.plates.get(Number(k.slice(1)))?.nodes) ?? []))]
  .filter((n) => Math.abs(modelStore.nodes.get(n)!.z ?? 0) < 1e-6);

beforeAll(async () => { await wasmSolver.initSolver(); });

describe('a wall the building tool stands on the foundation', () => {
  for (const meshAtSolve of [false, true]) {
    it(`holds its whole base on the supports its ends stand on, meshed ${meshAtSolve ? 'at the solve' : 'at placement'}`, () => {
      const [low, high] = build(true, meshAtSolve);
      expect(plateEntry(low!.id)!.surface.edgeSupports).toEqual([expect.objectContaining({ type: 'fixed3d' })]);
      expect(plateEntry(high!.id)!.surface.edgeSupports ?? []).toEqual([]);
      expect(preparePlatesForAnalysis().ok).toBe(true);
      const base = baseNodes(low!.id), held = new Set([...modelStore.supports.values()].map((s) => s.nodeId));
      expect(base.length).toBeGreaterThan(2);
      expect(base.every((n) => held.has(n))).toBe(true);
    });
  }

  it('declares nothing where its ends stand on no support', () => {
    const [low] = build(false, true);
    expect(plateEntry(low!.id)!.surface.edgeSupports ?? []).toEqual([]);
  });
});
