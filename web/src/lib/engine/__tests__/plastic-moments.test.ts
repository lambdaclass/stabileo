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

describe('3-D pushover payload', () => {
  it('a steel cantilever collapses at Mp/(P·L), with the members’ fy and the profile’s own Zp', async () => {
    const { plasticInput3D, plasticMoments3D } = await import('../plastic-moments');
    const { solvePlastic3D, initSolver } = await import('../wasm-solver');
    const { buildSolverInput3D } = await import('../solver-service');
    await initSolver();
    historyStore.clear(); uiStore.analysisMode = 'pro'; modelStore.clear();
    const mid = modelStore.addMaterial({ name: 'S355', e: 200000, nu: 0.3, rho: 78.5, fy: 355, fu: 510 } as never);
    const a = modelStore.addNode(0, 0, 3), b = modelStore.addNode(4, 0, 3);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.updateElementMaterial(e, mid);
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addNodalLoad3D(b, 0, 0, -10, 0, 0, 0);
    const p = plasticInput3D(modelStore.sections, modelStore.materials, modelStore.elements);
    const [m] = plasticMoments3D(modelStore.sections, modelStore.materials, modelStore.elements);
    expect(m.fy).toBe(355);
    expect(m.source).toBe('geometry');
    const r = solvePlastic3D({ solver: buildSolverInput3D(modelStore.model as never, false, false), ...p, maxHinges: 5 });
    expect(r.collapseFactor).toBeCloseTo(m.mp / (10 * 4), 4);
    uiStore.analysisMode = '2d';
  });
});

describe('3-D Mp of a rotated section', () => {
  it('stays about the profile’s own axes: the roll already turns the member’s local axes', async () => {
    const { plasticMoments3D, plasticModulus } = await import('../plastic-moments');
    historyStore.clear(); uiStore.analysisMode = '2d'; modelStore.clear();
    await modelStore.loadExample('cantilever-point');
    const [id, sec] = [...modelStore.sections.entries()][0]!;
    const upright = plasticMoments3D(modelStore.sections, modelStore.materials, modelStore.elements)[0]!;
    modelStore.sections.set(id, { ...sec, rotation: 90 });
    const turned = plasticMoments3D(modelStore.sections, modelStore.materials, modelStore.elements)[0]!;
    expect(turned.zp).toBeCloseTo(upright.zp, 9);
    expect(turned.zpz).toBeCloseTo(upright.zpz, 9);
    // 2-D does turn it: its bending axis does not follow the section.
    expect(plasticModulus({ ...sec, rotation: 90 }).zp).toBeCloseTo(upright.zpz, 7);
  });
});
