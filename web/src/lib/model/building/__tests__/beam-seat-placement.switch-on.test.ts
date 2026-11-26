/**
 * The building generator's beams with their tops on the level state the project's level reference
 * as the slabs' top, so the slabs it lays next hang below the level too and every top is flush.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import '../../../store/index';
import { placeFrame, placeSlabs } from '../build-on-grid';
import { physicalPlates } from '../../../store/physical-plates';
import { placementData } from '../../../store/placement';
import type { StructuralGrid } from '../../grid';

const grid: StructuralGrid = {
  axes: [
    { id: 'A', name: 'A', axis: 'x', at: 0 }, { id: 'B', name: 'B', axis: 'x', at: 6 },
    { id: '1', name: '1', axis: 'y', at: 0 }, { id: '2', name: '2', axis: 'y', at: 5 },
  ],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }],
} as StructuralGrid;

describe('beams with their tops on the level', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('make the slabs\' top the project\'s level reference, and the slabs laid after hang below the level', () => {
    const mat = modelStore.addMaterial({ name: 'H-30', e: 27500, nu: 0.2, rho: 25, fy: 30, fc: 30 } as never);
    const col = modelStore.addSection({ name: 'C40', a: 0.16, iy: 0.002133, iz: 0.002133, j: 0.0036, b: 0.4, h: 0.4, shape: 'rect' } as never);
    const bm = modelStore.addSection({ name: 'V20x50', a: 0.1, iy: 0.00208, iz: 0.000333, j: 0.00093, b: 0.2, h: 0.5, shape: 'rect' } as never);
    placeFrame(grid, { x: ['A', 'B'], y: ['1', '2'], levels: ['N0', 'N1'], columns: { sectionId: col, materialId: mat }, beamsX: { sectionId: bm, materialId: mat }, beamsY: { sectionId: bm, materialId: mat } }, { beamTopFlush: true });
    expect(placementData().reference).toBe('slabTop');
    placeSlabs(grid, { levels: ['N1'], thickness: 0.12, materialId: mat, meshSize: 1, meshAtSolve: true });
    const slabs = physicalPlates().filter((p) => p.physical.kind === 'slab');
    expect(slabs.length).toBe(1);
    expect(slabs[0]!.surface.offset).toEqual({ frame: 'global', x: 0, y: 0, z: -0.06 });
    const beams = [...modelStore.elements.values()].filter((e) => e.sectionId === bm);
    expect(beams.every((e) => e.offset?.i?.z === -0.25)).toBe(true);
  });
});
