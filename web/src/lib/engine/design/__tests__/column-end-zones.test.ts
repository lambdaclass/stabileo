/**
 * Denser ties at column ends as a project option: the design proposes them, lo = max(largest side,
 * height/6, 450 mm) at half the spacing; the verifier credits the denser ties to the shear at the
 * ends.
 */
import { describe, it, expect } from 'vitest';
import { COLUMN_LIMITS, endZoneFor } from '../candidate-enumerate-column';
import { extractGoverningDemands, verifyProvidedReinforcement } from '../../station-design-forces';

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
    const ties = (r: object, extracted: boolean) => verifyProvidedReinforcement(1, 'column', r as never,
      extracted ? extractGoverningDemands(stations) : undefined, {}, sec, extracted ? undefined : stations,
    ).checks.filter((c) => c.category.startsWith('Ties'));
    const vy = (cs: ReturnType<typeof ties>) => cs.find((c) => c.demand === 200)!;
    const d = sec.b - sec.cover - base.stirrups.diameter / 1000 - base.column.cornerDia / 2000;
    const gross = sec.b * sec.h;
    const mid = 0.75 * d * ((0.17 * Math.sqrt(sec.fc) * 1000 + 500 / (6 * gross)) * sec.h
      + 2 * 0.503e-4 * sec.fy * 1000 / base.stirrups.spacing);
    for (const extracted of [false, true]) {
      const plain = ties(base, extracted);
      const zoned = ties({ ...base, tieZones: { endLength: 0.5, endSpacing: 0.125 } }, extracted);
      expect(vy(plain).capacity).toBeCloseTo(mid, 1);
      expect(vy(zoned).capacity).toBeCloseTo(mid, 1);
      expect(vy(zoned).stationX).toBeCloseTo(1.5, 9);
    }
  });
});

describe('known wrong result: #1928 ordinary column end zones use the design spacing floor', () => {
  const ctx = { material: { columnEndZones: true }, section: { b: 0.3, h: 0.6 }, L: 3.2 } as never;
  const floor = COLUMN_LIMITS.minSpacing;

  it.each([floor / 2, floor, floor * 1.5, floor * 2])('keeps the project floor at a middle spacing of %s', spacing => {
    expect(endZoneFor(ctx, spacing)).toEqual({ endLength: 0.6, endSpacing: floor });
  });

  it('still proposes a wider end spacing when the ordinary grid allows it', () => {
    expect(endZoneFor(ctx, floor * 4)).toEqual({ endLength: 0.6, endSpacing: floor * 2 });
  });
});
