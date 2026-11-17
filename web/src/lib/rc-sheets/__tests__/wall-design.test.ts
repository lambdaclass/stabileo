import { describe, it, expect } from 'vitest';
import { checkWallAxialFlexure, checkWallInPlaneShear, maxWallSpacing, minimumWallRatios, minimumWallThickness } from '../wall-design';

describe('§11.6.1 minimum wall reinforcement', () => {
  it('applies the reduced ratios only to Ø16 and smaller with fy >= 420', () => {
    const relaxed = minimumWallRatios(12, 420, '2025');
    expect(relaxed.rhoL).toBeCloseTo(0.0012, 9);
    expect(relaxed.rhoT).toBeCloseTo(0.0020, 9);
  });

  it('does NOT give a Ø20 wall the reduced ratio', () => {
    // Applying it anyway under-reinforces the wall.
    const r = minimumWallRatios(20, 420, '2025');
    expect(r.rhoL).toBeCloseTo(0.0015, 9);
    expect(r.rhoT).toBeCloseTo(0.0025, 9);
    expect(r.note).toMatch(/NO corresponden/);
  });

  it('does not give a low-grade steel the reduced ratio either', () => {
    expect(minimumWallRatios(12, 220, '2025').rhoL).toBeCloseTo(0.0015, 9);
  });

  it('caps spacing at the lesser of 3h and 450 mm', () => {
    expect(maxWallSpacing(0.10, '2025').spacing).toBeCloseTo(0.30, 9);
    expect(maxWallSpacing(0.25, '2025').spacing).toBeCloseTo(0.45, 9);
  });

  it('applies the §11.3.1.1 minimum thickness', () => {
    // min(3.0, 6.0)/25 = 120 mm, above the 100 mm floor.
    expect(minimumWallThickness(3.0, 6.0, '2025').thickness).toBeCloseTo(0.12, 9);
    // A short wall is governed by the 100 mm floor.
    expect(minimumWallThickness(2.0, 2.0, '2025').thickness).toBeCloseTo(0.10, 9);
  });
});

describe('wall in-plane shear', () => {
  const base = {
    length: 4, thickness: 0.20, fc: 25, rhoT: 0.0025, fy: 420, edition: '2025' as const,
  };

  it('passes a lightly loaded wall', () => {
    expect(checkWallInPlaneShear({ ...base, vu: 200 }).ok).toBe(true);
  });

  it('recognises the §11.5.4.2 ceiling, where more steel does not help', () => {
    // Above 0,66 √f'c A_cv the wall fails by web crushing (0,83 was the 2005 value).
    const heavy = checkWallInPlaneShear({ ...base, rhoT: 0.02, vu: 100 });
    expect(heavy.atLimit).toBe(true);
    expect(heavy.phiVn).toBeCloseTo(0.75 * heavy.vnLimit, 6);
    expect(heavy.memo).toMatch(/aplastamiento del alma/);
  });

  it('does not send the engineer down the wrong path on an over-stressed wall', () => {
    const r = checkWallInPlaneShear({ ...base, rhoT: 0.02, vu: 99999 });
    expect(r.ok).toBe(false);
    expect(r.atLimit).toBe(true);
  });

  it('takes fyt at 420 MPa at most in Vs (§20.2.1.3): a stronger steel buys no shear', () => {
    const at420 = checkWallInPlaneShear({ ...base, vu: 600 });
    const at500 = checkWallInPlaneShear({ ...base, fy: 500, vu: 600 });
    expect(at420.atLimit).toBe(false);
    expect(at500.phiVn).toBeCloseTo(at420.phiVn, 9);
    expect(checkWallInPlaneShear({ ...base, fy: 300, vu: 600 }).phiVn).toBeLessThan(at420.phiVn);
  });

  it('scales the shear area with length and thickness', () => {
    expect(checkWallInPlaneShear({ ...base, vu: 100 }).acv).toBeCloseTo(0.8, 9);
    expect(checkWallInPlaneShear({ ...base, length: 8, vu: 100 }).acv).toBeCloseTo(1.6, 9);
  });
});

describe('wall axial-flexural interaction', () => {
  const base = {
    length: 4, thickness: 0.20, fc: 25, fy: 420, rhoL: 0.0015,
    edition: '2025' as const,
  };

  it('passes a lightly loaded wall', () => {
    expect(checkWallAxialFlexure({ ...base, pu: 500, mu: 200 }).ok).toBe(true);
  });

  it('fails an over-loaded wall', () => {
    expect(checkWallAxialFlexure({ ...base, pu: 20000, mu: 8000 }).ok).toBe(false);
  });

  it('increases utilization monotonically with both actions', () => {
    const a = checkWallAxialFlexure({ ...base, pu: 500, mu: 200 }).utilization;
    const morP = checkWallAxialFlexure({ ...base, pu: 2000, mu: 200 }).utilization;
    const morM = checkWallAxialFlexure({ ...base, pu: 500, mu: 900 }).utilization;
    expect(morP).toBeGreaterThan(a);
    expect(morM).toBeGreaterThan(a);
  });

  it('computes Pn0 from the gross section and the steel', () => {
    const r = checkWallAxialFlexure({ ...base, pu: 100, mu: 10 });
    const ag = 0.8;
    const ast = 0.0015 * ag;
    expect(r.pn0).toBeCloseTo((0.85 * 25 * (ag - ast) + 420 * ast) * 1000, 3);
  });
});
