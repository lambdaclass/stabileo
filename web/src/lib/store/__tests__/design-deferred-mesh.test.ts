import { afterEach, beforeAll, expect, it } from 'vitest';
import { modelStore, uiStore } from '..';
import { initSolver } from '../../engine/wasm-solver';
import { solveForDesign } from '../design-resize';

beforeAll(async () => { await initSolver(); });
afterEach(() => { modelStore.clear(); uiStore.analysisMode = 'pro'; });

it.each(['3d', 'pro'] as const)('known wrong result: #1928 the %s design solve uses the saved deferred panel mesh', mode => {
  for (const method of ['linear', 'pdelta'] as const) {
    modelStore.clear();
    uiStore.analysisMode = mode;
    const corners = [[0, 0], [4, 0], [4, 3], [0, 3]].map(([x, y]) => modelStore.addNode(x!, y!, 0)) as [number, number, number, number];
    for (const [i, node] of corners.entries()) {
      modelStore.addSupport(node, 'pinned3d');
      modelStore.addElement(node, corners[(i + 1) % 4]!, 'frame');
    }
    const q = modelStore.addQuad(corners, 1, 0.15);
    modelStore.addSurfaceLoad3D(q, 4, 1);
    const g = modelStore.addGroup('L1', 'physicalMember', { quads: [q] }, {
      data: { kind: 'slab', provenance: 'declared', meshAtSolve: { size: 0.5, meshed: false, panel: corners } },
    });
    modelStore.setAnalysis({ combinationMethod: 'solveEach', perCombination: method });
    modelStore.restore(modelStore.snapshot());
    const ok = solveForDesign();
    const cells = modelStore.model.groups.get(g)!.members.quads!;
    expect(cells.length).toBeGreaterThan(1);
    if (!__PUBLIC_FEATURES__.proPlatesUnified || mode === '3d') expect(cells).toHaveLength(48);
    expect(ok).toBe(mode === 'pro');
  }
});
