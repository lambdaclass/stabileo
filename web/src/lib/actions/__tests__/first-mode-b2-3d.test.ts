import { describe, expect, it } from 'vitest';
import { modelStore } from '../../store';
import { solveBuckling3D } from '../../engine/wasm-solver';
import { resetModel3D, frame, support } from '../../engine/__tests__/helpers/random-models-3d';
import { withFirstModeB2 } from '../second-order';

function cantilever(Pz: number) {
  resetModel3D();
  modelStore.bulkMutate(() => {
    const sec = modelStore.addSection({ name: 'col', a: 0.01, iy: 8e-5, iz: 2e-5, j: 1e-4 });
    const ids = [0, 1, 2, 3, 4].map((i) => modelStore.addNode(0, 0, (5 * i) / 4));
    for (let i = 0; i < 4; i++) frame(ids[i], ids[i + 1], sec);
    support(ids[0], 'fixed3d');
    modelStore.addNodalLoad3D(ids[4], 1, 1, Pz, 0, 0, 0);
  });
  return modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;
}

describe('the space P-Δ takes B₂ from the lowest buckling factor', () => {
  it('a column in tension: the engine says no compression, read as λ₁ = ∞ and B₂ = 1, not as an unknown', () => {
    const input = cantilever(100);
    expect(() => solveBuckling3D(input, 1)).toThrow(/no compressed elements/i);
    const r = withFirstModeB2(input, { b2Factor: 1.0001, isStable: true });
    expect(r.secondOrder).toEqual({ lambda1: Infinity, b2: 1 });
    expect(r.b2Factor).toBe(1);
    expect(r.isStable).toBe(true);
  });

  it('modes come lowest first, so B₂ = 1/(1 − 1/λ₁) bounds every other mode\'s amplification', () => {
    const input = cantilever(-100);
    const modes = solveBuckling3D(input, 4).modes.map((m: { loadFactor: number }) => m.loadFactor);
    expect(modes.length).toBeGreaterThan(1);
    for (let i = 1; i < modes.length; i++) expect(modes[i]).toBeGreaterThanOrEqual(modes[i - 1]);
    const r = withFirstModeB2(input, { b2Factor: 1, isStable: true });
    const l1 = modes[0];
    expect(r.secondOrder!.lambda1).toBe(l1);
    expect(r.b2Factor).toBeCloseTo(1 / (1 - 1 / l1), 12);
    for (const l of modes) expect(r.b2Factor).toBeGreaterThanOrEqual(1 / (1 - 1 / l));
  });

  it('past the critical load: unstable, B₂ = ∞, never a negative factor', () => {
    const lambda1 = solveBuckling3D(cantilever(-100), 1).modes[0].loadFactor;
    const input = cantilever(-100 * lambda1 * 1.5);
    const r = withFirstModeB2(input, { b2Factor: 3, isStable: true });
    expect(r.secondOrder!.lambda1).toBeLessThan(1);
    expect(r.b2Factor).toBe(Infinity);
    expect(r.isStable).toBe(false);
  });
});
