/**
 * Mp for the plastic collapse analysis, from each section's own plastic
 * modulus — not the solid rectangle b·h²/4 the engine assumes whenever a
 * section carries b and h, which every catalogue profile does.
 */
import { describe, it, expect } from 'vitest';
import { historyStore, modelStore, uiStore } from '../../store';
import { plasticModulus, plasticMoments } from '../plastic-moments';
import { solvePlastic } from '../wasm-solver';
import type { Section } from '../../store/model.svelte';

describe('plastic moments', () => {
  it('the cantilever-point example: IPN 300 at its tabulated Zx ≈ 762 cm³, first hinge at λ = Mp/(PL)', async () => {
    historyStore.clear(); uiStore.analysisMode = '2d'; modelStore.clear();
    await modelStore.loadExample('cantilever-point');
    const [m] = plasticMoments(modelStore.sections, modelStore.materials, modelStore.elements);
    expect(m.source).toBe('geometry');
    expect(Math.abs(m.zp * 1e6 / 762 - 1)).toBeLessThan(0.05);
    expect(m.fyAssumed).toBe(false);

    const sections = new Map([...modelStore.sections].map(([id, s]) => [id, { a: s.a, iz: s.iy ?? s.iz, materialId: 1 }]));
    const materials = new Map([...modelStore.materials].map(([id, x]) => [id, { fy: x.fy }]));
    const r = solvePlastic({ solver: modelStore.buildSolverInput(false)!, sections, materials, mpOverrides: new Map([[m.sectionId, m.mp]]) });
    expect(r.steps[0].loadFactor).toBeCloseTo(m.mp / (15 * 3), 6);
    expect(r.steps[0].loadFactor).toBeLessThan(4.5); // 15,625 with the rectangle
  });

  it('a rectangle declared by b and h is b·h²/4', () => {
    const r = plasticModulus({ id: 1, name: 'R', a: 0.08, iz: 0.2 * 0.4 ** 3 / 12, iy: 0.2 * 0.4 ** 3 / 12, b: 0.2, h: 0.4, shape: 'rect' } as Section);
    expect(r.zp).toBeCloseTo(0.2 * 0.4 ** 2 / 4, 6);
  });

  it('a section known only by A and I is estimated, and says so', () => {
    const r = plasticModulus({ id: 1, name: 'G', a: 0.005, iz: 8e-5, iy: 8e-5, shape: 'generic' } as Section);
    expect(r.source).toBe('estimated');
    expect(r.zp).toBeGreaterThan(0);
  });

  it('a material without fy is analysed at 250 MPa, and flagged', async () => {
    historyStore.clear(); uiStore.analysisMode = '2d'; modelStore.clear();
    await modelStore.loadExample('cantilever-point');
    for (const mat of modelStore.materials.values()) delete (mat as { fy?: number }).fy;
    const [m] = plasticMoments(modelStore.sections, modelStore.materials, modelStore.elements);
    expect(m.fyAssumed).toBe(true);
    expect(m.fy).toBe(250);
  });
});
