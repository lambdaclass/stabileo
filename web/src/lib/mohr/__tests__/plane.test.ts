import { describe, it, expect } from 'vitest';
import { computeMohrCircle, principalPlane, rotatePlane } from '../plane';
import { thetaOnCircle, snapAngle, roundTo, arcPath } from '../plot';
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

describe('dragging X′ around the circle', () => {
  const screenAngle = (s: { sx: number; sy: number; txy: number }, theta: number, tauDown: boolean) => {
    const p = principalPlane(s), r = rotatePlane(s, theta);
    return Math.atan2((tauDown ? 1 : -1) * r.txy, r.sx - p.center);
  };
  for (const tauDown of [false, true]) {
    it(`gives back the θ that put X′ there (τ ${tauDown ? 'down' : 'up'})`, () => {
      const s = { sx: 80, sy: 20, txy: 30 };
      const a0 = screenAngle(s, 0, tauDown);
      for (const theta of [-170, -95, -30, 0, 12.5, 44, 89, 120, 179]) {
        const got = thetaOnCircle(screenAngle(s, theta, tauDown), a0, tauDown, theta + 3);
        expect(got).toBeCloseTo(theta, 9);
        const r = rotatePlane(s, got), want = rotatePlane(s, theta);
        expect(r.sx).toBeCloseTo(want.sx, 9);
        expect(r.txy).toBeCloseTo(want.txy, 9);
      }
    });
  }
  it('stays continuous across ±180°', () => {
    expect(thetaOnCircle(Math.PI * 2 * (181 / 180), 0, false, 179)).toBeCloseTo(-179, 9);
    expect(thetaOnCircle(Math.PI * 2 * (1 / 180), 0, false, 2)).toBeCloseTo(1, 9);
  });
  it('snaps to the nearest target within the tolerance, around the circle', () => {
    expect(snapAngle(21.2, [22.5, 112.5], 2)).toBe(22.5);
    expect(snapAngle(18, [22.5], 2)).toBe(18);
    expect(snapAngle(-179.5, [180], 1)).toBe(180);
    expect(roundTo(12.3456, 0.5)).toBe(12.5);
  });
});

describe('the 2θ arc', () => {
  const points = (d: string) => [...d.matchAll(/(-?\d+\.\d+) (-?\d+\.\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  it('a full turn is two half arcs that meet where they started', () => {
    for (const sweep of [2 * Math.PI, -2 * Math.PI]) {
      const d = arcPath(100, 100, 30, 0.3, sweep);
      expect(d.match(/A/g)).toHaveLength(2);
      const [start, mid, end] = points(d);
      expect(Math.hypot(end[0] - start[0], end[1] - start[1])).toBeLessThan(0.02);
      expect(Math.hypot(mid[0] - start[0], mid[1] - start[1])).toBeCloseTo(60, 1);
    }
  });
  it('a quarter turn ends a quarter of the way round, on the side the sweep says', () => {
    const [start, mid, end] = points(arcPath(0, 0, 10, 0, Math.PI / 2));
    expect(start).toEqual([10, 0]);
    expect(end[0]).toBeCloseTo(0, 2);
    expect(end[1]).toBeCloseTo(10, 2);
    expect(mid[0]).toBeCloseTo(10 * Math.SQRT1_2, 2);
    expect(arcPath(0, 0, 10, 0, -1)).toContain(' 0 0 0 ');
    expect(arcPath(0, 0, 10, 0, 1)).toContain(' 0 0 1 ');
  });
});
