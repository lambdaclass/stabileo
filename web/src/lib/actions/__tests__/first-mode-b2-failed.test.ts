import { describe, expect, it, vi } from 'vitest';
import type { SolverInput3D } from '../../engine/types-3d';
import { CodedRefusal } from '../../engine/containment-error';

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

  it('an unstable P-Δ stays unstable when the buckling check cannot run', () => {
    buckling.impl = () => { throw new Error('eigen solver did not converge'); };
    const r = withFirstModeB2(input, { b2Factor: 1.37, isStable: false });
    expect(r.isStable).toBe(false);
    expect(Number.isNaN(r.b2Factor)).toBe(true);
    buckling.impl = () => ({ modes: [] });
    expect(withFirstModeB2(input, { b2Factor: 1.37, isStable: false }).isStable).toBe(false);
  });

  it('the no_compressed_elements refusal is still λ₁ = ∞ with B₂ = 1, whatever its message', () => {
    buckling.impl = () => { throw new CodedRefusal('nothing to buckle', 'no_compressed_elements'); };
    const r = withFirstModeB2(input, { b2Factor: 1.37, isStable: true });
    expect(r.b2Factor).toBe(1);
    expect(r.isStable).toBe(true);
    expect(r.secondOrder).toEqual({ lambda1: Infinity, b2: 1 });
  });

  it('a "no compressed elements" refusal that also carries a containment refusal leaves B₂ unknown (#1558)', () => {
    const both = new Error(JSON.stringify({ message: 'withheld', structuredDiagnostics: [
      { code: 'no_compressed_elements', severity: 'error', message: 'coded' },
      { code: 'known_issue', severity: 'error', phase: 'BU-BOUND', value: 741, message: 'withheld' },
    ] }));
    buckling.impl = () => { throw both; };
    const r = withFirstModeB2(input, { b2Factor: 1.37, isStable: true });
    expect(Number.isNaN(r.b2Factor)).toBe(true);
    expect(r.isStable).toBeNull();
    expect(r.secondOrder?.lambda1).toBeNull();
    expect(r.secondOrder?.bucklingError).toBe(both.message);
  });

  it('the words "no compressed elements" without the code are a buckling failure, not λ₁ = ∞', () => {
    buckling.impl = () => { throw new Error('No compressed elements — buckling not applicable'); };
    const r = withFirstModeB2(input, { b2Factor: 1.37, isStable: true });
    expect(Number.isNaN(r.b2Factor)).toBe(true);
    expect(r.isStable).toBeNull();
    expect(r.secondOrder).toEqual({ lambda1: null, b2: NaN, bucklingError: 'No compressed elements — buckling not applicable' });
  });
});
