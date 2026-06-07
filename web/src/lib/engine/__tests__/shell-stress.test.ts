/**
 * CP2 — shell contour / principal-stress helpers.
 * Pins the Mohr derivation (used for plate+quad parity, no solver change) and
 * the component value / range mapping the contour + legend depend on.
 */
import { describe, it, expect } from 'vitest';
import {
  principalStresses, shellComponentValue, shellComponentRange, SHELL_CONTOUR_COMPONENTS,
  type ShellStressLike,
} from '../shell-stress';

const S = (o: Partial<ShellStressLike>): ShellStressLike => ({
  sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 0, my: 0, mxy: 0, vonMises: 0, ...o,
});

describe('principalStresses (Mohr)', () => {
  it('uniaxial: σ1=σxx, σ2=0, angle 0', () => {
    const p = principalStresses(100, 0, 0);
    expect(p.sigma1).toBeCloseTo(100, 9);
    expect(p.sigma2).toBeCloseTo(0, 9);
    expect(p.angleDeg).toBeCloseTo(0, 9);
  });

  it('pure shear: σ1=+τ, σ2=−τ at 45°', () => {
    const p = principalStresses(0, 0, 50);
    expect(p.sigma1).toBeCloseTo(50, 9);
    expect(p.sigma2).toBeCloseTo(-50, 9);
    expect(p.angleDeg).toBeCloseTo(45, 9);
  });

  it('σ1 ≥ σ2 always, invariant σ1+σ2 = σxx+σyy', () => {
    const p = principalStresses(80, -20, 30);
    expect(p.sigma1).toBeGreaterThanOrEqual(p.sigma2);
    expect(p.sigma1 + p.sigma2).toBeCloseTo(60, 9);
  });
});

describe('shellComponentValue', () => {
  it('maps direct components and derives principals', () => {
    const s = S({ sigmaXx: 100, sigmaYy: 0, tauXy: 0, mx: 5, my: -3, mxy: 2, vonMises: 100 });
    expect(shellComponentValue(s, 'sigmaXx')).toBe(100);
    expect(shellComponentValue(s, 'mxy')).toBe(2);
    expect(shellComponentValue(s, 'my')).toBe(-3);
    expect(shellComponentValue(s, 'vonMises')).toBe(100);
    expect(shellComponentValue(s, 'sigma1')).toBeCloseTo(100, 9);
    expect(shellComponentValue(s, 'sigma2')).toBeCloseTo(0, 9);
  });
});

describe('shellComponentRange', () => {
  it('spans min/max of the chosen component across shells', () => {
    const shells = [S({ mx: -8 }), S({ mx: 3 }), S({ mx: 12 })];
    expect(shellComponentRange(shells, 'mx')).toEqual({ min: -8, max: 12 });
  });
  it('empty set collapses to 0..0', () => {
    expect(shellComponentRange([], 'vonMises')).toEqual({ min: 0, max: 0 });
  });
});

describe('component catalogue', () => {
  it('Von Mises is unsigned, stresses/moments are signed', () => {
    const byKey = Object.fromEntries(SHELL_CONTOUR_COMPONENTS.map(c => [c.key, c]));
    expect(byKey.vonMises.signed).toBe(false);
    expect(byKey.sigmaXx.signed).toBe(true);
    expect(byKey.mx.signed).toBe(true);
    expect(byKey.sigma1.signed).toBe(true);
  });
});
