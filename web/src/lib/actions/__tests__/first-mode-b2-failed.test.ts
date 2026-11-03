import { describe, expect, it, vi } from 'vitest';
import type { SolverInput3D } from '../../engine/types-3d';

const buckling = vi.hoisted(() => ({ impl: (): unknown => { throw new Error('eigen solver did not converge'); } }));
vi.mock('../../engine/wasm-solver', async (orig) => ({ ...(await orig<object>()), solveBuckling3D: () => buckling.impl() }));

import { withFirstModeB2 } from '../second-order';

const input = {} as SolverInput3D;

describe('the space P-Δ when its first-mode buckling check cannot run', () => {
  it('a buckling failure other than "no compression" leaves B₂ unknown and says why', () => {
    buckling.impl = () => { throw new Error('eigen solver did not converge'); };
    const r = withFirstModeB2(input, { b2Factor: 1.37, isStable: true });
    expect(Number.isNaN(r.b2Factor)).toBe(true);
    expect(r.isStable).toBeNull();
    expect(r.secondOrder).toEqual({ lambda1: null, b2: NaN, bucklingError: 'eigen solver did not converge' });
  });

  it('no mode returned is the same unknown, not a kept B₂', () => {
    buckling.impl = () => ({ modes: [] });
    const r = withFirstModeB2(input, { b2Factor: 1.37, isStable: true });
    expect(Number.isNaN(r.b2Factor)).toBe(true);
    expect(r.isStable).toBeNull();
    expect(r.secondOrder?.lambda1).toBeNull();
    expect(r.secondOrder?.bucklingError).toBeTruthy();
  });

  it('"no compressed elements" is still λ₁ = ∞ with B₂ = 1', () => {
    buckling.impl = () => { throw new Error('Buckling: no compressed elements'); };
    const r = withFirstModeB2(input, { b2Factor: 1.37, isStable: true });
    expect(r.b2Factor).toBe(1);
    expect(r.isStable).toBe(true);
    expect(r.secondOrder).toEqual({ lambda1: Infinity, b2: 1 });
  });
});
