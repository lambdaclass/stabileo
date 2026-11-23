import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { applyPlateMeshes, createPlate, planPlateMesh, plateEntry, plateStatus, platesNeedingMesh } from '../physical-plates';
import { physicalPlateProblems } from '../../model/physical/plate-analysis';

const free = { followMembers: false };
const nodes = new Map<string, number>();
const at = (x: number, y: number) => nodes.get(`${x},${y}`) ?? nodes.set(`${x},${y}`, modelStore.addNode(x, y, 3)).get(`${x},${y}`)!;
const panel = (x0: number, x1: number) => {
  const corners = [at(x0, 0), at(x1, 0), at(x1, 3), at(x0, 3)];
  return (createPlate({ outline: corners, materialId: 1, thickness: 0.15 }) as { id: number }).id;
};

beforeEach(() => { nodes.clear(); modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro'; });

describe('a plate meshed beside another plate\'s mesh', () => {
  it('is current both for the plates and for the analysis that refuses stale meshes', () => {
    const a = panel(0, 4), b = panel(4, 8);
    applyPlateMeshes([planPlateMesh(a, free)!]);
    applyPlateMeshes([planPlateMesh(b, free)!]);
    expect([plateStatus(a), plateStatus(b)]).toEqual(['current', 'current']);
    expect(platesNeedingMesh()).toEqual([]);
    expect(physicalPlateProblems(modelStore.model).needsMesh).toEqual([]);
  });

  it('reads the same for both after the neighbour it met is meshed again at another size', () => {
    const a = panel(0, 4), b = panel(4, 8);
    applyPlateMeshes([planPlateMesh(a, free)!]);
    applyPlateMeshes([planPlateMesh(b, free)!]);
    applyPlateMeshes([planPlateMesh(a, { ...free, size: 0.3 })!]);
    const analysisStale = new Set(physicalPlateProblems(modelStore.model).needsMesh.map((p) => p.id));
    for (const id of [a, b]) expect(analysisStale.has(id)).toBe(plateStatus(id) !== 'current');
    expect(plateEntry(b)!.surface.meshed!.footprints).toBeUndefined();
  });
});
