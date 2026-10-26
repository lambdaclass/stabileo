/**
 * A beam cast with its slab acts as a T: the slab's shells on both sides of an interior beam give
 * it a flange (Table 6.3.2.1), and its sagging capacity is the T's. Two bays of 5 m with a 0.12 m
 * slab meshed into three 6 m beams; the interior beam's flange is min(8·0.12, (5 − 0.25)/2, 6/8)
 * = 0.75 m a side, bf = 1.75 m; the edge beams are L's with min(0.72, 2.375, 0.5) = 0.5 m.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore } from '../../../store';
import { placeFrame, placeSlabs } from '../../../model/building/build-on-grid';
import { beamFlanges } from '../beam-flange';
import { computeFlexureCapacity } from '../../station-design-forces';
import { flangedCapacity } from '../../codes/argentina/cirsoc201-capacity';
import type { StructuralGrid } from '../../../model/grid';

const grid: StructuralGrid = {
  axes: [
    { id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x1', name: '2', axis: 'x', at: 6 },
    { id: 'y0', name: 'A', axis: 'y', at: 0 }, { id: 'y1', name: 'B', axis: 'y', at: 5 }, { id: 'y2', name: 'C', axis: 'y', at: 10 },
  ],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }],
};

describe('a beam cast with its slab', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('is a T inside the floor and an L at its edge', () => {
    const sec = modelStore.addSection({ name: '25×50', a: 0.125, iy: 0.0026, iz: 0.00065, b: 0.25, h: 0.5, shape: 'rect' } as never);
    placeFrame(grid, { x: ['x0', 'x1'], y: ['y0', 'y2'], levels: ['N0', 'N1'], columns: { sectionId: sec, materialId: 1 }, beamsX: { sectionId: sec, materialId: 1 }, beamsY: { sectionId: sec, materialId: 1 } });
    placeSlabs(grid, { levels: ['N1'], thickness: 0.12, materialId: 1, meshSize: 1 });
    const flanges = beamFlanges({
      nodes: modelStore.nodes, elements: modelStore.elements, sections: modelStore.sections, quads: modelStore.quads,
      spanOf: (id) => [...modelStore.model.groups.values()].find((g) => g.members.elements?.includes(id) && (g.data as { kind?: string })?.kind === 'beam')?.members.elements,
    });
    const at = (y: number) => [...modelStore.elements.values()].filter((e) => {
      const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!;
      return Math.abs(a.y - y) < 1e-6 && Math.abs(b.y - y) < 1e-6 && Math.abs((a.z ?? 0) - 3) < 1e-6;
    }).map((e) => flanges.get(e.id));
    expect(at(5).length).toBeGreaterThan(1);
    // Beam and slab both on the node line, neither placed by an insertion: the slab cast with the
    // beam's top is the assumption, and the flange says it is one.
    for (const f of at(5)) expect(f).toEqual({ bf: expect.closeTo(1.75, 9), hf: 0.12, kind: 'T', datum: 'assumed' });
    for (const f of at(0)) expect(f).toEqual({ bf: expect.closeTo(0.75, 9), hf: 0.12, kind: 'L', datum: 'assumed' });
  });

  it('the design reads the flange from the model', async () => {
    const { resultsStore, uiStore } = await import('../../../store');
    const { designRunStore } = await import('../../../store/design-run.svelte');
    const { verificationStore } = await import('../../../store/verification.svelte');
    uiStore.analysisMode = 'pro'; resultsStore.clear(); verificationStore.clear();
    const conc = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
    const sec = modelStore.addSection({ name: '25×50', a: 0.125, iy: 0.0026, iz: 0.00065, j: 0.0017, b: 0.25, h: 0.5, shape: 'rect' } as never);
    placeFrame(grid, { x: ['x0', 'x1'], y: ['y0', 'y2'], levels: ['N0', 'N1'], columns: { sectionId: sec, materialId: conc }, beamsX: { sectionId: sec, materialId: conc }, beamsY: { sectionId: sec, materialId: conc } }, { fixBase: true });
    placeSlabs(grid, { levels: ['N1'], thickness: 0.12, materialId: conc, meshSize: 1 });
    for (const q of modelStore.quads.values()) modelStore.addSurfaceLoad3D(q.id, 5, 1);
    const combo = modelStore.solveCombinations3D(false, false, true);
    if (!combo || typeof combo === 'string') throw new Error(String(combo));
    resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
    expect(designRunStore.computeDemands().ok).toBe(true);
    const interior = [...modelStore.elements.values()].find((e) => { const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!; return Math.abs(a.y - 5) < 1e-6 && Math.abs(b.y - 5) < 1e-6 && (a.z ?? 0) > 1; })!;
    expect(verificationStore.contextFor(interior.id)?.flange).toMatchObject({ kind: 'T', hf: 0.12 });
  });

  it('a T carries more sagging moment than its web, and the block stays in the flange', () => {
    // 4Ø20 at d = 0.45 m, H-25, ADN 420.
    const As = 12.57;
    const web = computeFlexureCapacity(As, 0.25, 0.45, 25, 420)!;
    const wide = computeFlexureCapacity(As, 1.75, 0.45, 25, 420)!;
    expect(wide.a).toBeLessThan(0.12);
    expect(wide.phiMn).toBeGreaterThan(web.phiMn);
    // By hand: a = 12.57e−4·420/(0.85·25·1.75) = 0.01420 m; φMn = 0.9·12.57e−4·420 000·(0.45 − 0.0071) = 210.4 kN·m.
    expect(wide.phiMn).toBeCloseTo(210.4, 0);
    // A thin flange: the block spreads into the web, and the T's own formula answers.
    const t = flangedCapacity({ fc: 25, fy: 420, h: 0.45 + 0.025 + 0.008 + 0.008, cover: 0.025, stirrupDia: 8 } as never, { bf: 1.75, hf: 0.01, bw: 0.25 }, As);
    expect(t.withinFlange).toBe(false);
    expect(t.phiMn).toBeLessThan(wide.phiMn);
    expect(t.phiMn).toBeGreaterThan(web.phiMn);
  });
});
