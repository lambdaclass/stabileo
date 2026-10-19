/**
 * √f'c ≤ 8,3 MPa wherever the design computes the concrete's share of shear, CIRSOC 201-2025
 * (docs/codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-22-resistencia-de-las-secciones-de-los-elementos.md):
 *   §22.5.3.1 (:701-706): «Los valores de √f´c usados para calcular Vc, Vci y Vcw para corte en una dirección
 *     no deben exceder 8,3 MPa, excepto en lo permitido en el artículo 22.5.3.2.»
 *   §22.6.3.1 (:1536-1538): «El valor de √f´c usado para calcular vc para corte en dos direcciones no deben
 *     exceder 8,3 MPa.»
 *   §22.5.3.3 (:734-737): fy, fyt in Vs ≤ the limits of §20.2.1.3 (420 MPa for bars).
 * The seismic capacity shear (Cap. 18 of CIRSOC 201-2025 sends seismic design to INPRES-CIRSOC 103 Parte II
 * 2026, not in the repository; the module follows the ACI 318-19 arrangement it adopts) takes Vc = 0 in the
 * cases of §18.6.5.2 and §18.7.6.2, and otherwise Tabla 22.5.5.1 (a): the same limits apply there.
 *
 * H-80: √80 = 8,944 > 8,3.
 */
import { describe, it, expect } from 'vitest';
import { columnCapacityShear, hoopSpacingFor } from '../seismic/capacity';
import { slabVc } from '../slabs/one-way-shear';
import { twoWayVc } from '../slabs/drop-panels';
import { requiredVsForTable } from '../../../codes/cirsoc201/transverse-spacing';
import { beamOpeningDesign } from '../special/beam-opening';

describe('√f\'c ≤ 8,3 MPa in every Vc of the design', () => {
  /*
   * A 0,40 × 0,40 column, d 0,35, Pu = 1000 kN ≥ Ag·f'c/20 = 640 kN (so Vc counts), Mpr 300 + 300 over lu = 3 m:
   * Ve = 200 kN. Vc = 0,17·8,3·0,40·0,35 = 197,54 kN (√80: 212,87); ties Ø10, 2 legs, c/0,10, ADN 500 read 420:
   * Vs = 2·0,7854e-4·420 000·0,35/0,10 = 230,91 kN (500: 274,89); φVn = 0,75·(197,54 + 230,91) = 321,34 kN (365,82).
   */
  it('a column\'s capacity shear (seismic)', () => {
    const r = columnCapacityShear({ b: 0.4, h: 0.4, d: 0.35, fc: 80, fyt: 500, mpr: [300, 300], lu: 3, vu: 100, pu: 1000, ties: { diameter: 10, legs: 2, spacing: 0.1 } });
    expect(r.vcZero).toBe(false);
    expect(r.phiVn).toBeCloseTo(321.34, 1);
  });

  /*
   * Hoops for Ve = 400 kN, 0,30 × d 0,50, Ø10 two legs, ADN 500: Vc = 0,17·8,3·0,15 = 211,65 kN,
   * Vs,req = 400/0,75 − 211,65 = 321,68 kN, s = 2·0,7854e-4·420 000·0,50/321,68 = 0,1025 → 0,100 m
   * (√80 and 500: 0,1286 → 0,125 m).
   */
  it('the seismic hoop spacing', () => {
    expect(hoopSpacingFor(400, false, 0.3, 0.5, 80, 500, 10, 2)).toBe(0.1);
  });

  /* A slab strip 1 m wide, d = 0,20 m, ρw = 0,004: λs = 1; Vc = 0,66·0,004^⅓·8,3·1·0,20 = 173,92 kN (√80: 187,42). */
  it('one-way shear of a slab, Tabla 22.5.5.1(c)', () => {
    expect(slabVc(80, 1, 0.2, 0.004).vc).toBeCloseTo(173.92, 1);
  });

  /* Punching around a 0,40 × 0,40 column, d = 0,20, bo = 2,40 m: λs = 1; vc = min(0,33·8,3; 0,51·8,3; 0,083·5,333·8,3) = 2,739 MPa (√80: 2,952). */
  it('two-way shear, §22.6.5.2 with §22.6.3.1', () => {
    expect(twoWayVc(80, 0.2, 2.4, 0.4, 0.4).vc).toBeCloseTo(2.739, 3);
  });

  /* The Vs that selects the row of Tabla 9.7.6.2.2: Vu = 300 kN, 0,30 × d 0,50: Vc = (1/6)·8,3·0,15 = 207,5 kN; Vs = 400 − 207,5 = 192,5 kN (√80: 176,39). */
  it('the Vs that picks the stirrup spacing row', () => {
    expect(requiredVsForTable(300, 0.3, 0.5, 80)).toBeCloseTo(192.5, 6);
  });

  /*
   * A web opening's chords (the 0,30 × 0,70 beam of special-members.test.ts): the chord forces come from the
   * statics of the opening, not from f'c or fy, so with the limits a chord's Av/s at H-80 is the one at
   * √f'c = 8,3 (f'c = 68,89 MPa), and at ADN 500 the one at 420.
   */
  it('a web opening\'s chord shear', () => {
    const at = (fc: number, fy: number) => beamOpeningDesign({ b: 0.3, h: 0.7, cover: 0.025, stirrupDia: 8, barDia: 16, fc, fy, x: 2, lo: 0.6, ho: 0.25, Mu: 150, Vu: 120 }).bottom.avs!;
    expect(at(80, 420)).toBeCloseTo(at(8.3 ** 2, 420), 12);
    expect(at(25, 500)).toBeCloseTo(at(25, 420), 12);
  });
});
