/**
 * The material limits of CIRSOC 201-2025 in shear and torsion
 * (docs/codes/CIRSOC/markdown/cirsoc-201-2025/):
 *   §22.5.3.1 (capitulo-22-…md:701-706): "Los valores de √f´c usados para calcular Vc, Vci y Vcw para
 *     corte en una dirección no deben exceder 8,3 MPa, excepto en lo permitido en el artículo 22.5.3.2."
 *   §22.5.3.3 (capitulo-22-…md:734-737): "Los valores de fy y fyt usados para calcular Vs no deben
 *     exceder los límites dados en el artículo 20.2.1.3."
 *   §22.7.2.1 (capitulo-22-…md:2113-2115): "Los valores de √f´c usados para calcular Tth y Tcr no deben
 *     exceder 8,3 MPa."
 *   §22.7.2.2 (capitulo-22-…md:2122-2126): "Los valores de fy y fyt usados en el cálculo de la armadura
 *     transversal y longitudinal para torsión no deben exceder los límites establecidos en el artículo 20.2.1.3."
 *   §20.2.1.3 (capitulo-20-…md:189-198, Tablas 20.2.1 and 20.2.2): the design fy is the characteristic
 *     yield stress of the tables: bars AL 220, ADN 420, ADN 420 S (220, 420, 420 MPa); welded wire
 *     ATR 500 N, AM 500 N (500 MPa). A stirrup bar therefore reads at most 420 MPa in Vs.
 *
 * Hand values, H-25 or H-80, bw 0,30 m, d 0,55 m, Ø10 (0,785 cm²) two legs c/0,15 (Av ≥ Av,min, row (a)):
 *   Vc = 0,17·√f'c·bw·d: H-25 0,17·5·300·550 = 140,25 kN; H-80 0,17·8,3·300·550 = 232,815 kN (8,944 uncapped: 250,88).
 *   Vs = (Av/s)·fyt·d = (1,57/0,15)·420·0,55/10 = 241,78 kN (fy 500 uncapped: 287,83).
 *   φVn = 0,75·(Vc + Vs): H-25 fy 500 → 286,52 kN (321,06 before); H-80 fy 420 → 355,95 kN (369,50 before).
 */
import { describe, it, expect } from 'vitest';
import { computeShearCapacity } from '../../station-design-forces';
import { checkTorsion2025 } from '../../../codes/cirsoc201/torsion';
import { checkShear, checkTorsion } from '../../codes/argentina/cirsoc201';

describe('CIRSOC 201-2025 shear limits in the verifier', () => {
  it('Vs reads fyt ≤ 420 MPa (22.5.3.3 → 20.2.1.3): an ADN 500 stirrup is credited 420', () => {
    const cap = computeShearCapacity(10, 2, 0.15, 0.3, 0.55, 25, 500, 0);
    expect(cap.avBelowMin).toBe(false);
    expect(cap.VsProv).toBeCloseTo(241.78, 1);
    expect(cap.phiVn).toBeCloseTo(286.52, 1);
  });

  it('Vc reads √f\'c ≤ 8,3 MPa (22.5.3.1)', () => {
    const cap = computeShearCapacity(10, 2, 0.15, 0.3, 0.55, 80, 420, 0);
    expect(cap.phiVc).toBeCloseTo(0.75 * 232.815, 1);
    expect(cap.phiVn).toBeCloseTo(355.95, 1);
  });
});

/*
 * Torsion, 0,30 × 0,60, d 0,55, cover 0,025, Ø10 c/0,10, H-80, ADN 500, Vu 100 kN, Tu 30 kN·m:
 *   Acp = 0,18 m², pcp = 1,8 m; Tth = 0,083·8,3·Acp²/pcp = 12,40 kN·m, φTth = 9,30 (√80 uncapped: 10,02).
 *   x1 = 0,30 − 2·0,030 = 0,24, y1 = 0,54; Aoh = 0,1296, Ao = 0,11016 m²;
 *   At/s = Tu/(φ·2·Ao·fyt) = 30/(0,75·2·0,11016·420 000) = 4,3227 cm²/m (fyt 500: 3,6311).
 */
describe('CIRSOC 201-2025 torsion limits in the verifier (22.7.2)', () => {
  it('Tth with √f\'c ≤ 8,3 MPa and At/s with fyt ≤ 420 MPa', () => {
    const r = checkTorsion2025({ b: 0.3, h: 0.6, d: 0.55, cover: 0.025, stirrupDiaMm: 10, fc: 80, fy: 500, fyt: 500, Vu: 100, Tu: 30, stirrup: { diameter: 10, legs: 2, spacing: 0.1 } });
    expect(r.phiTth).toBeCloseTo(9.3, 2);
    expect(r.AtOverS * 1e4).toBeCloseTo(4.3227, 3);
  });
});

/*
 * The design run's sizing (`verifyElement` → `checkShear`/`checkTorsion` with the 2025 edition),
 * 0,30 × 0,60, cover 0,025, Ø8 stirrups, H-25, ADN 500: d = 0,60 − 0,025 − 0,008 − 0,008 = 0,559 m.
 *   Vu = 300 kN: Vc = (1/6)·5·300·559 = 139,75 kN; Vs,req = 300/0,75 − 139,75 = 260,25 kN;
 *   Av/s = Vs/(fyt·d) = 260,25/(420·0,559)·10 = 11,0848 cm²/m (fyt 500: 9,3113).
 *   Torsion: At/s scales with 1/fyt, so the 2025 value is the 2005 one × 500/420.
 */
describe('CIRSOC 201-2025 limits in the required-steel sizing', () => {
  const p = { fc: 25, fy: 500, cover: 0.025, b: 0.3, h: 0.6, stirrupDia: 8 };
  it('checkShear 2025: Av/s with fyt = 420 MPa; the workbook\'s 2005 default keeps 500', () => {
    expect(checkShear(p, 300, 0, '2025').AvOverS).toBeCloseTo(11.0848, 3);
    expect(checkShear(p, 300, 0).AvOverS).toBeCloseTo(9.3113, 3);
    expect(checkShear(p, 300, 0, '2025').steps[0]).toBe('fyt = 420 MPa en Vs (§22.5.3.3, §20.2.1.3)');
  });
  it('checkTorsion 2025: the torsion steel with fy = 420 MPa', () => {
    const t25 = checkTorsion(p, 30, 0, '2025'), t05 = checkTorsion(p, 30, 0);
    expect(t25.AtOverS / t05.AtOverS).toBeCloseTo(500 / 420, 9);
    expect(t25.steps[0]).toBe('fy, fyt = 420 MPa en la armadura de torsión (§22.7.2.2, §20.2.1.3)');
  });
});
