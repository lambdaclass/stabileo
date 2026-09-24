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
import { ring } from '../cirsoc201-layouts';

/* The sheet as it ships: 30 × 30, two levels of 10.668 cm² at 5 and 25 cm from
   the bottom face, f'c 25, fy 420, ties. Ast 21.336 cm². */
const OUTLINE: Outline = { kind: 'rect', b: 0.30, h: 0.30 };
const MAT = { fc: 25, fy: 420 } as Materials;
const BARS: Bar[] = [
  { x: 0, y: -0.10, area: 10.668e-4 },
  { x: 0, y: 0.10, area: 10.668e-4 },
];

/** The sheet's cells, bottom edge compressed: φMn [kN·m], φPn [kN], φ. */
const PUBLISHED: Record<string, [number, number, number]> = {
  axialCap:    [-40.6917, 1436.9020, 0.65],
  zeroStrain:  [-66.1740, 1157.0481, 0.65],
  yieldStrain: [-100.4318, 486.5915, 0.65],
  epsilon5:    [-115.5324, 302.3877, 0.90],
  pureFlexure: [-87.7876, 0.00, 0.90],
  maxTension:  [0.00, -806.5008, 0.90],
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
       * This was 2 % while the six were read off a sampled curve — the axial
       * cap alone used 1,7 % of it. Solved from their definitions, the four
       * strain-named rows are the sheet's cells to 2e-6. The other two are
       * found by SEARCH on both sides, and the sheet's search is a stepped
       * one: its widest point of the cap is 1e-4 short of the solved one and
       * its pure flexure 1,8e-5 short. Measured, and held there.
       */
      const tol = key === 'axialCap' ? 1.2e-4 : key === 'pureFlexure' ? 2e-5 : 2e-6;
      const near = (ours: number, published: number, what: string) => {
        if (Math.abs(published) < 1e-9) expect(Math.abs(ours), what).toBeLessThan(1e-6);
        else expect(Math.abs(ours / published - 1), `${what}: ${ours.toFixed(4)} vs ${published}`)
          .toBeLessThan(tol);
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

  it('is the mirror of the first for this section, because it is symmetric', () => {
    /* Computed separately, and equal and opposite only because the two
       levels are — which the next test shows is not something to assume. */
    expect(both.topCompressed.length).toBe(6);
    for (let i = 0; i < 6; i++) {
      expect(both.topCompressed[i].phiMn).toBeCloseTo(-both.bottomCompressed[i].phiMn, 6);
      expect(both.topCompressed[i].phiPn).toBeCloseTo(both.bottomCompressed[i].phiPn, 6);
      expect(both.topCompressed[i].phi).toBeCloseTo(both.bottomCompressed[i].phi, 9);
    }
  });

  it('is NOT a mirror when the levels are not symmetric', () => {
    /*
     * Three times the steel at the bottom as at the top. Compressing the
     * bottom puts the light level in tension, and yield there comes at a
     * different load than yield in the heavy level. Mirroring the first table
     * — as this used to — printed the same φPn for both.
     */
    const lopsided: Bar[] = [
      { x: 0, y: -0.10, area: 15e-4 },
      { x: 0, y: 0.10, area: 5e-4 },
    ];
    const t = characteristicPointsBothEdges(OUTLINE, lopsided, MAT);
    const yB = t.bottomCompressed.find((p) => p.key === 'yieldStrain')!;
    const yT = t.topCompressed.find((p) => p.key === 'yieldStrain')!;
    expect(Math.abs(yB.phiPn - yT.phiPn)).toBeGreaterThan(100);
    expect(yB.phiMn).toBeLessThan(0);
    expect(yT.phiMn).toBeGreaterThan(0);
  });

  it('matches the published second table', () => {
    const top = Object.fromEntries(both.topCompressed.map((p) => [p.key, p]));
    expect(top.yieldStrain.phiMn / 100.43).toBeCloseTo(1, 1);
    expect(top.pureFlexure.phiMn / 87.79).toBeCloseTo(1, 1);
    expect(top.axialCap.phiPn).toBeCloseTo(1436.902, 1);
  });
});

/*
 * FCR-CIR-VERIF prints the same table for its ring: D 0,40, twelve bars of
 * 7,21 cm² centred 3 cm in, spirals, a bar at the extreme fibre ("favorable").
 * A different engine path — the circle's compressed zone is a segment — and a
 * different φ law, which is why pure flexure lands at φ = 0,8456 and not 0,90.
 */
describe('FCR-CIR-VERIF — the ring’s six points', () => {
  const OUT: Outline = { kind: 'circle', D: 0.40 };
  const M: Materials = { fc: 25, fy: 420, confinement: 'spiral', deductDisplacedConcrete: true };
  const ringBars = ring(0.40, 0.03, 12, 12 * 7.21, true);
  const both = characteristicPointsBothEdges(OUT, ringBars, M);
  const CIR: Record<string, [number, number, number]> = {
    axialCap:    [-80.0979, 3641.6016, 0.70],
    zeroStrain:  [-155.3606, 2988.0773, 0.70],
    yieldStrain: [-299.6415, 1002.5282, 0.70],
    epsilon5:    [-370.2172, -295.0844, 0.90],
    pureFlexure: [-363.4409, 0.00, 0.8456],
    maxTension:  [0.00, -3270.456, 0.90],
  };
  for (const [key, [mn, pn, phi]] of Object.entries(CIR)) {
    it(`${key}, both edges`, () => {
      const b = both.bottomCompressed.find((p) => p.key === key)!;
      const t = both.topCompressed.find((p) => p.key === key)!;
      /* The circle is a 360-gon in our engine; measured worst is 0,05 %. */
      const tol = 6e-4;
      if (key === 'axialCap') {
        /*
         * ── The one cell we do NOT reproduce, on purpose ──────────────
         *
         * The sheet's circular curve has no samples between zero strain in
         * the far steel (φPn 2 988, φMn 155,36) and its next row at φPn
         * 4 002,74, φMn 38,51 — and its 80,0979 is the straight chord between
         * those two, read at the cap: 155,36 + 0,644·(38,51 − 155,36). The
         * section's real curve bows INSIDE that chord, so the cell overstates
         * the moment at the cap by 4,4 %. Ours is the curve's own point.
         */
        const chord = 155.3606 + ((3641.6016 - 2988.0773) / (4002.74 - 2988.0773)) * (38.508 - 155.3606);
        expect(chord).toBeCloseTo(-mn, 1);
        expect(-b.phiMn).toBeLessThan(-mn);
        expect(-b.phiMn / -mn).toBeGreaterThan(0.95);
        expect(b.phiPn / pn).toBeCloseTo(1, 4);
        return;
      }
      if (Math.abs(mn) > 1e-9) {
        expect(Math.abs(b.phiMn / mn - 1), `${key} φMn ${b.phiMn.toFixed(3)}`).toBeLessThan(tol);
        expect(Math.abs(t.phiMn / -mn - 1)).toBeLessThan(tol);
      }
      if (Math.abs(pn) > 1e-9) expect(Math.abs(b.phiPn / pn - 1), `${key} φPn ${b.phiPn.toFixed(3)}`).toBeLessThan(tol);
      expect(b.phi).toBeCloseTo(phi, 3);
    });
  }
});
