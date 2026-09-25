/**
 * A space model that the loads move without deforming is refused, not
 * shown: the engine solved the singular system and returned 1e11 m, flagged
 * only as warnings, and the app drew it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, uiStore } from '../../store';
import { defaultDofs } from '../../store/support-dofs';

beforeEach(() => { historyStore.clear(); uiStore.analysisMode = '3d'; modelStore.clear(); });

describe('excited mechanisms in 3D', () => {
  it('a portal on rollers is refused, in the plain solve and in the combinations', async () => {
    await modelStore.loadExample('3d-portal-frame');
    const m = modelStore.model;
    for (const s of m.supports.values()) m.supports.set(s.id, { ...s, type: 'rollerXY', dofRestraints: defaultDofs('rollerXY') });
    m.supports = new Map(m.supports);
    const r = modelStore.solve3D(false, false, false);
    expect(typeof r).toBe('string');
    expect(r as string).toMatch(/mecanismo|mechanism/i);
    const async3 = await modelStore.solve3DAsync(false, false, false);
    expect(typeof async3).toBe('string');
    if (m.combinations.length > 0) expect(typeof modelStore.solveCombinations3D(false)).toBe('string');
  });

  it('the same portal on its own supports solves', async () => {
    await modelStore.loadExample('3d-portal-frame');
    expect(typeof modelStore.solve3D(false, false, false)).toBe('object');
  });

  it('a raft on soil springs keeps its vertical springs (it used to float at 7e10 m)', async () => {
    uiStore.analysisMode = 'pro';
    await modelStore.loadExample('mat-foundation');
    const r = modelStore.solve3D(false, false, true) as unknown as { displacements: Array<{ uz: number }> } | string;
    expect(typeof r).toBe('object');
    const w = Math.max(...(r as { displacements: Array<{ uz: number }> }).displacements.map((d) => Math.abs(d.uz)));
    expect(w).toBeGreaterThan(1e-4);
    expect(w).toBeLessThan(0.05);
  });
});
