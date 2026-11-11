import { describe, it, expect } from 'vitest';
import { computeMohrCircle, principalPlane, rotatePlane } from '../plane';
import { computeMohrCircle as fromSectionStress } from '../../engine/section-stress';

describe('plane stress', () => {
  const state = { sx: 80, sy: 20, txy: 30 };

  it('principal stresses of σx = 80, σy = 20, τ = 30', () => {
    const p = principalPlane(state);
    expect(p.sigma1).toBeCloseTo(92.4264, 4);
    expect(p.sigma2).toBeCloseTo(7.5736, 4);
    expect(p.tauMax).toBeCloseTo(42.4264, 4);
    expect(p.theta1).toBeCloseTo(22.5, 10);
    expect(p.theta2).toBeCloseTo(112.5, 10);
    expect(p.center).toBe(50);
  });

  it('rotating to θ1 gives the principal state with no shear', () => {
    const r = rotatePlane(state, 22.5);
    expect(r.sx).toBeCloseTo(92.4264, 4);
    expect(r.sy).toBeCloseTo(7.5736, 4);
    expect(r.txy).toBeCloseTo(0, 10);
  });

  it('rotating 90° swaps the normal stresses and flips the shear', () => {
    const r = rotatePlane(state, 90);
    expect(r.sx).toBeCloseTo(20, 10);
    expect(r.sy).toBeCloseTo(80, 10);
    expect(r.txy).toBeCloseTo(-30, 10);
  });

  it('a 23° rotation, worked by hand', () => {
    const r = rotatePlane(state, 23);
    expect(r.sx).toBeCloseTo(50 + 30 * Math.cos(46 * Math.PI / 180) + 30 * Math.sin(46 * Math.PI / 180), 10);
    expect(r.txy).toBeCloseTo(-0.7404, 4);
  });

  it('the first invariant and the radius do not depend on θ', () => {
    for (const theta of [-180, -97, -30, 0, 13, 45, 120, 180]) {
      const r = rotatePlane(state, theta);
      expect(r.sx + r.sy).toBeCloseTo(100, 10);
      expect(Math.hypot((r.sx - r.sy) / 2, r.txy)).toBeCloseTo(principalPlane(state).radius, 10);
    }
  });

  it('a hydrostatic plane state collapses to a point without NaN', () => {
    const p = principalPlane({ sx: 40, sy: 40, txy: 0 });
    expect(p).toEqual({ center: 40, radius: 0, sigma1: 40, sigma2: 40, theta1: 0, theta2: 90, tauMax: 0 });
    const r = rotatePlane({ sx: 40, sy: 40, txy: 0 }, 33);
    expect([r.sx, r.sy, r.txy].every(Number.isFinite)).toBe(true);
    expect(r.sx).toBeCloseTo(40, 12);
  });

  it('pure shear has its principal directions at 45°', () => {
    const p = principalPlane({ sx: 0, sy: 0, txy: 25 });
    expect(p.sigma1).toBe(25);
    expect(p.sigma2).toBe(-25);
    expect(p.theta1).toBeCloseTo(45, 12);
  });

  it('the section panel keeps the σy = 0 circle it had', () => {
    expect(fromSectionStress).toBe(computeMohrCircle);
    const m = computeMohrCircle(100, 40);
    expect(m.center).toBe(50);
    expect(m.radius).toBeCloseTo(Math.sqrt(50 ** 2 + 40 ** 2), 12);
    expect(m.thetaP).toBeCloseTo(0.5 * Math.atan2(80, 100), 12);
  });
});
