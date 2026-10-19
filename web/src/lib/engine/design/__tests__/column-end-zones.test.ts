/**
 * Denser ties at column ends as a project option: the design proposes them, lo = max(largest side,
 * height/6, 450 mm) at half the spacing; the verifier credits the denser ties to the shear at the
 * ends.
 */
import { describe, it, expect } from 'vitest';
import { endZoneFor } from '../candidate-enumerate-column';
import { computeShearCapacity, verifyProvidedReinforcement } from '../../station-design-forces';

describe('column end zones', () => {
  it('are proposed only when the project asks', () => {
    const ctx = { material: { columnEndZones: true }, section: { b: 0.3, h: 0.6 }, L: 3.2 } as never;
    // lo = max(0,60, 3,2/6 = 0,533, 0,45) = 0,60; half of 25 cm on the 2,5 cm grid is 12,5 cm.
    expect(endZoneFor(ctx, 0.25)).toEqual({ endLength: 0.6, endSpacing: 0.125 });
    expect(endZoneFor({ ...(ctx as object), material: {} } as never, 0.25)).toBeUndefined();
  });

  it('the shear at the ends is read with the denser ties', () => {
    const stations = {
      elementId: 1, length: 3, stationTs: [0, 0.5, 1],
      comboResults: [{ comboId: 1, comboName: 'C1', stations: [0, 0.5, 1].map((t) => ({ t, x: 3 * t, n: -500, vy: 200, vz: 0, my: 10, mz: 10, torsion: 0 })) }],
    };
    const base = { column: { cornerDia: 20, faceDia: 20, nBottom: 1, nTop: 1, nLeft: 1, nRight: 1 }, longitudinal: { count: 8, diameter: 20 }, stirrups: { diameter: 8, legs: 2, spacing: 0.25 } };
    const sec = { b: 0.4, h: 0.4, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
    const ties = (r: object) => verifyProvidedReinforcement(1, 'column', r as never, undefined, {}, sec, stations as never).checks.filter((c) => c.category.startsWith('Ties'));
    const plain = ties(base), zoned = ties({ ...base, tieZones: { endLength: 0.5, endSpacing: 0.125 } });
    const vy = (cs: typeof plain) => cs.find((c) => c.demand !== undefined && Math.abs(c.demand - 200) < 1e-6)!;
    // The worst station moves to the middle, where the spacing is still 25 cm.
    const mid = computeShearCapacity(8, 2, 0.25, 0.4, 0.4 - 0.025 - 0.008 - 0.008, 25, 420, 500, { Ag: 0.16, rhoW: 0 } as never).phiVn;
    expect(vy(zoned).capacity).toBeCloseTo(mid, 1);
    expect(vy(plain).capacity).toBeCloseTo(mid, 1);
    expect(vy(zoned).stationX).toBeCloseTo(1.5, 9);
  });
});
