/**
 * How beams sit on the grid (QA of 20-oct): the beams on the range's edges with their outer face
 * on the columns' outer face, each moved outward on its own side; and a beam's top face on the
 * level, the slab's top, its axis half its depth below. Two bays along Y, so one line of beams
 * along X is inside the range and stays on its axis.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import '../../../store/index';
import { placeFrame } from '../build-on-grid';
import type { StructuralGrid } from '../../grid';

const grid: StructuralGrid = {
  axes: [
    { id: 'A', name: 'A', axis: 'x', at: 0 }, { id: 'B', name: 'B', axis: 'x', at: 6 },
    { id: '1', name: '1', axis: 'y', at: 0 }, { id: '2', name: '2', axis: 'y', at: 5 }, { id: '3', name: '3', axis: 'y', at: 10 },
  ],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }],
};

describe('beams seated on the grid', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('edge beams flush with the columns\' outer face, inner ones on the axis, tops on the level', () => {
    const mat = modelStore.addMaterial({ name: 'H-30', e: 27500, nu: 0.2, rho: 25, fy: 30, fc: 30 } as never);
    const col = modelStore.addSection({ name: 'C40', a: 0.16, iy: 0.002133, iz: 0.002133, j: 0.0036, b: 0.4, h: 0.4, shape: 'rect' } as never);
    const bm = modelStore.addSection({ name: 'V20x50', a: 0.1, iy: 0.00208, iz: 0.000333, j: 0.00093, b: 0.2, h: 0.5, shape: 'rect' } as never);
    placeFrame(grid, { x: ['A', 'B'], y: ['1', '3'], levels: ['N0', 'N1'], columns: { sectionId: col, materialId: mat }, beamsX: null, beamsY: null });
    placeFrame(grid, { x: ['A', 'B'], y: ['1', '3'], levels: ['N1', 'N1'], columns: null, beamsX: { sectionId: bm, materialId: mat }, beamsY: { sectionId: bm, materialId: mat } },
      { beamPerimeterFlush: true, beamTopFlush: true });
    const beams = [...modelStore.elements.values()].filter((e) => e.sectionId === bm);
    expect(beams.length).toBeGreaterThan(0);
    const P = (id: number) => modelStore.nodes.get(id)!;
    for (const e of beams) {
      const a = P(e.nodeI), b = P(e.nodeJ);
      const off = (e as { offset?: { i: { x: number; y: number; z: number } } }).offset?.i ?? { x: 0, y: 0, z: 0 };
      // Top face on the level: the axis 0,25 m below.
      expect(off.z).toBeCloseTo(-0.25, 9);
      const alongX = Math.abs(b.x - a.x) > Math.abs(b.y - a.y);
      const across = alongX ? a.y : a.x, shift = alongX ? off.y : off.x;
      const [lo, hi] = alongX ? [0, 10] : [0, 6];
      // On an edge: outward by 0,20 − 0,10 = 0,10 m, so the beam's outer face is the column's.
      const want = Math.abs(across - lo) < 1e-6 ? -0.1 : Math.abs(across - hi) < 1e-6 ? 0.1 : 0;
      expect(shift, `${alongX ? 'X' : 'Y'} beam at ${across}`).toBeCloseTo(want, 9);
      expect(alongX ? off.x : off.y).toBeCloseTo(0, 9);
    }
    // The beam along X on axis 2 (y = 5) is inside the range: on its axis.
    expect(beams.some((e) => { const a = P(e.nodeI), b = P(e.nodeJ); return Math.abs(a.y - 5) < 1e-6 && Math.abs(b.y - 5) < 1e-6; })).toBe(true);
  });
});
