/**
 * The six characteristic points, against the numbers FCR-VERIF prints.
 *
 * The sheet tabulates the whole shape of the interaction diagram rather than one
 * ordinate, which makes it the most checkable thing in the workbook: agreeing at
 * one point can be luck, agreeing at six is not. Every expectation below is a
 * figure read off the published sheet, not a figure this code produced.
 */
import { describe, it, expect } from 'vitest';
import { characteristicPoints, characteristicPointsBothEdges } from '../cirsoc-flex-points';
import type { Bar, Outline, Materials } from '../cirsoc201-section';

/* The sheet as it ships: 30 × 30, two levels of 10.668 cm² at 5 and 25 cm from
   the bottom face, f'c 25, fy 420, ties. Ast 21.336 cm². */
const OUTLINE: Outline = { kind: 'rect', b: 0.30, h: 0.30 };
const MAT = { fc: 25, fy: 420 } as Materials;
const BARS: Bar[] = [
  { x: 0, y: -0.10, area: 10.668e-4 },
  { x: 0, y: 0.10, area: 10.668e-4 },
];

/** As printed, bottom edge compressed: φMn [kN·m], φPn [kN], φ. */
const PUBLISHED: Record<string, [number, number, number]> = {
  axialCap:    [-40.69, 1436.90, 0.65],
  zeroStrain:  [-66.17, 1157.05, 0.65],
  yieldStrain: [-100.43, 486.59, 0.65],
  epsilon5:    [-115.53, 302.39, 0.90],
  pureFlexure: [-87.79, 0.00, 0.90],
  maxTension:  [0.00, -806.50, 0.90],
};

const points = characteristicPoints(OUTLINE, BARS, MAT);
const byKey = Object.fromEntries(points.map((p) => [p.key, p]));

describe('FCR-VERIF — the six points, as published', () => {
  it('produces the six, in the order the sheet prints them', () => {
    expect(points.map((p) => p.key)).toEqual([
      'axialCap', 'zeroStrain', 'yieldStrain', 'epsilon5', 'pureFlexure', 'maxTension',
    ]);
  });

  for (const [key, [mn, pn, phi]] of Object.entries(PUBLISHED)) {
    it(`${key}: φMn ${mn}, φPn ${pn}, φ ${phi}`, () => {
      const p = byKey[key];
      /*
       * 2 % on the values, and the worst of the six uses 1,7 % of it: the
       * axial cap is the end of a PLATEAU, so how close its moment lands
       * depends on where the grid happens to fall along it. The strain-named
       * points sit within 0,3 %, the axial cap value is exact, and pure
       * flexure is exact because it is interpolated rather than picked.
       */
      const near = (ours: number, published: number, what: string) => {
        if (Math.abs(published) < 1e-9) expect(Math.abs(ours), what).toBeLessThan(1e-6);
        else expect(Math.abs(ours / published - 1), `${what}: ${ours.toFixed(2)} vs ${published}`)
          .toBeLessThan(0.02);
      };
      near(p.phiMn, mn, 'φMn');
      near(p.phiPn, pn, 'φPn');
      expect(p.phi, 'φ').toBeCloseTo(phi, 2);
    });
  }

  it('gets the two closed-form ends exactly, not merely nearly', () => {
    /* The cap and pure tension are expressions, not grid searches. */
    expect(byKey.axialCap.phiPn).toBeCloseTo(1436.902, 1);
    expect(byKey.maxTension.phiPn / -806.5008).toBeCloseTo(1, 3);
  });

  it('puts pure flexure at exactly zero axial, as the sheet prints it', () => {
    /*
     * Interpolated across the crossing rather than picked off the grid. The
     * nearest grid point sat a couple of kN off — small, but this is the one
     * row where the axial value is a DEFINITION, and a table printing 2,46
     * where the sheet prints 0,00 invites the reader to wonder which is wrong.
     */
    expect(byKey.pureFlexure.phiPn).toBe(0);
    expect(Math.abs(byKey.pureFlexure.phiMn / -87.7876 - 1)).toBeLessThan(2e-3);
  });

  it('signs every moment for the edge in compression', () => {
    // Bottom compressed: the sheet prints the moments negative, except at pure
    // tension where there is none.
    for (const p of points) {
      if (p.key === 'maxTension') expect(p.phiMn).toBe(0);
      else expect(p.phiMn, p.key).toBeLessThan(0);
    }
  });
});

describe('the other edge', () => {
  const both = characteristicPointsBothEdges(OUTLINE, BARS, MAT);

  it('mirrors the moments and leaves the axial column alone', () => {
    /* The sheet prints the second table with the same φPn and the opposite
       φMn, because a symmetric section reaches the same states whichever face
       is compressed. */
    expect(both.topCompressed.length).toBe(6);
    for (let i = 0; i < 6; i++) {
      expect(both.topCompressed[i].phiMn).toBeCloseTo(-both.bottomCompressed[i].phiMn, 9);
      expect(both.topCompressed[i].phiPn).toBe(both.bottomCompressed[i].phiPn);
      expect(both.topCompressed[i].phi).toBe(both.bottomCompressed[i].phi);
    }
  });

  it('matches the published second table', () => {
    const top = Object.fromEntries(both.topCompressed.map((p) => [p.key, p]));
    expect(top.yieldStrain.phiMn / 100.43).toBeCloseTo(1, 1);
    expect(top.pureFlexure.phiMn / 87.79).toBeCloseTo(1, 1);
    expect(top.axialCap.phiPn).toBeCloseTo(1436.902, 1);
  });
});
