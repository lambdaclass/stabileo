/**
 * The CIRSOC 201 flexure and shear design against INTI-CIRSOC's published worked examples.
 *
 * Source: V. Hernández Balat, J. F. Bissio, D. A. Ortega, *Ejemplos de Aplicación del
 * Reglamento CIRSOC 201-2005*, INTI-CIRSOC, August 2005. Page numbers are the examples'.
 *
 * `checkFlexure` and `checkShear` DESIGN (they size steel for a demand), which is also what
 * these examples do, so the comparison is direct: same inputs, same required quantities.
 * Printed rounding is three significant figures → 0.5 % relative.
 * Coverage table: `docs/verification/DESIGN_EXAMPLES.md`.
 */

import { describe, it, expect } from 'vitest';
import { checkFlexure, checkShear } from '../cirsoc201';

function published(actual: number, printed: number, rel = 0.005): void {
  const err = Math.abs(actual - printed) / Math.abs(printed);
  expect(err, `stabileo ${actual}, published ${printed} (off by ${(err * 100).toFixed(3)} %)`)
    .toBeLessThanOrEqual(rel);
}

describe('INTI CIRSOC 201-2005 examples', () => {
  /**
   * Ejemplo 2.I.1 (p. 17): H-25, ADN 420, bw = 0,12 m, h = 0,40 m, cc = 0,02 m, stirrups
   * db6, bars db16 → d = 0,366 m; Mu = 52 kNm, φ = 0,9 → Mn = 57,78 kNm; mn = 0,16915,
   * ka = 0,18655, kc = 0,219 (< 0,375, tension-controlled); As = 415 mm².
   */
  it('2.I.1 — rectangular section, required tension steel', () => {
    const r = checkFlexure({ fc: 25, fy: 420, cover: 0.02, b: 0.12, h: 0.40, stirrupDia: 6 }, 52, 0, { edition: '2005' });
    published(r.d, 0.366);
    published(r.aReq / r.d, 0.18655);
    published(r.c / r.d, 0.219);
    published(r.AsFlexural, 4.15);
    expect(r.isDoublyReinforced).toBe(false);
  });

  /**
   * Ejemplo 3.I, case a) (pp. 52 – 53): H-20, ADN 420, bw = 0,20 m, h = 0,60 m,
   * d = 0,575 m; √f'c·bw·d = 514,3 kN; Vc = 514,3/6 = 85,8 kN (§11.3.1.1); Vu = 174,6 kN,
   * φ = 0,75 → Vn = 232,8 kN, Vs = 147 kN, Av/s = 609 mm²/m; (Av/s)min = bw/1,26 = 159 mm²/m.
   *
   * `checkShear` derives d from cover + stirrup + half a db16; the cover below is the one
   * that reproduces the printed d = h − 0,025 m with a db6 stirrup.
   */
  it('3.I — uniform stirrups without bent bars', () => {
    const r = checkShear({ fc: 20, fy: 420, cover: 0.011, b: 0.20, h: 0.60, stirrupDia: 6 }, 174.6, 0, { edition: '2005' });
    published(r.d, 0.575);
    published(r.phiVc / 0.75, 85.8);
    published(r.Vs, 147.0);
    published(r.AvOverS, 6.09);
    // DISCREPANCY (example rounding): §11.5.6.3 gives 0,33·bw/fyt = 157 mm²/m for
    // f'c < 30 MPa, which the example's own §3.4.4 restates; its shortcut "bw/1,26" rounds
    // fyt/(0,33·1000) = 1,273 down to 1,26 and prints 159 mm²/m (+1,2 %). stabileo follows
    // the clause.
    published(r.AvOverSMin, (0.33 * 200 / 420) * 10, 1e-12);
    published(r.AvOverSMin, 1.59, 0.015);
  });
});
