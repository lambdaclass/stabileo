/**
 * Special slabs through the store: a grid with slabs declared waffle, solved; their panels read by
 * `readSlabPanel`, left out of the solid slab design, checked once a system is chosen (rib
 * geometry, a plank type, a deck profile), and carried in the memoria.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { verificationStore } from '../verification.svelte';
import { placeFrame, placeSlabs } from '../../model/building/build-on-grid';
import { physicalGroups, declarePhysicalTypology } from '../physical';
import { savePlankType, saveDeckProfile, setSlabSystem, specialPanels } from '../special-floors';
import { memoriaInput } from '../memoria-inputs';
import type { StructuralGrid } from '../../model/grid';
import * as wasmSolver from '../../engine/wasm-solver';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const grid: StructuralGrid = {
  axes: [
    { id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x1', name: '2', axis: 'x', at: 6 }, { id: 'x2', name: '3', axis: 'x', at: 12 },
    { id: 'y0', name: 'A', axis: 'y', at: 0 }, { id: 'y1', name: 'B', axis: 'y', at: 6 },
  ],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }],
};

describe('special slabs', () => {
  it('read, left out of the solid design, checked with their system, carried in the memoria', () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
    const mat = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
    const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.00213, iz: 0.00213, j: 0.0036, b: 0.4, h: 0.4, shape: 'rect' } as never);
    const bm = modelStore.addSection({ name: '20×50', a: 0.1, iy: 0.00208, iz: 0.000333, j: 0.00093, b: 0.2, h: 0.5, shape: 'rect' } as never);
    placeFrame(grid, { x: ['x0', 'x2'], y: ['y0', 'y1'], levels: ['N0', 'N1'], columns: { sectionId: col, materialId: mat }, beamsX: { sectionId: bm, materialId: mat }, beamsY: { sectionId: bm, materialId: mat } }, { fixBase: true });
    placeSlabs(grid, { levels: ['N1'], thickness: 0.24, materialId: mat, meshSize: 1, typology: 'waffle' });
    const lCase = modelStore.addLoadCase('L', 'L');
    for (const q of modelStore.quads.values()) { modelStore.addSurfaceLoad3D(q.id, 1.5, 1); modelStore.addSurfaceLoad3D(q.id, 3, lCase); }
    modelStore.addCombination('1.2D + 1.6L', [{ caseId: 1, factor: 1.2 }, { caseId: lCase, factor: 1.6 }]);
    const combo = modelStore.solveCombinations3D(true, false, true);
    if (!combo || typeof combo === 'string') throw new Error(String(combo));
    resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);

    let ps = specialPanels();
    expect(ps).toHaveLength(2);
    expect(ps[0]!.typology).toBe('waffle');
    expect(ps[0]!.status).toBe('notVerified');
    expect(ps[0]!.reading.live).toBeCloseTo(3, 9);

    setSlabSystem(ps[0]!.key, { ribbed: { h: 0.35, c: 0.05, spacingX: 0.7, spacingY: 0.7, ribBottom: 0.12, ribTop: 0.15, filler: 'removable' } });
    ps = specialPanels();
    const rows = ps[0]!.rows;
    expect(rows.map((r) => r.clause)).toEqual(expect.arrayContaining(['8.8.1.2', '8.8.1.3', '8.8.1.4', '8.8.3.1', '22.3', '8.8.1.5']));
    expect(ps[0]!.props!.hEq).toBeGreaterThan(0.2);

    // The second panel as hollow-core and then composite deck.
    const g2 = physicalGroups().find((g) => `S${g.id}` === ps[1]!.key)!;
    declarePhysicalTypology(g2.id, 'hollowCore');
    savePlankType({ id: 'p1', name: 'A20', depth: 0.2, width: 1.2, selfWeight: 2.8, phiMn: 120, phiVn: 90 });
    setSlabSystem(`S${g2.id}`, { plankId: 'p1' });
    const hc = specialPanels().find((p) => p.key === `S${g2.id}`)!;
    expect(hc.rows[0]!.titleKey).toBe('check.plank.flexure');
    declarePhysicalTypology(g2.id, 'composite');
    saveDeckProfile({ id: 'd1', name: 'D75', hr: 0.075, t: 0.0009, as: 0.0012, ycg: 0.0375, fy: 280, ribWidth: 0.15, ribSpacing: 0.3, weight: 0.12, phiMnDeck: 8 });
    setSlabSystem(`S${g2.id}`, { deckId: 'd1' });
    expect(specialPanels().find((p) => p.key === `S${g2.id}`)!.rows.map((r) => r.titleKey)).toContain('check.deck.flexure');

    const m = memoriaInput((k) => k, 'en');
    expect(m.elements.filter((e) => e.id.startsWith('sp-'))).toHaveLength(2);
  });
});
