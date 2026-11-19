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
import { checkShear, verifyElement } from '../../codes/argentina/cirsoc201';
import { declaredTestDemands } from '../../__tests__/helpers/declared-demands';
import { checkTorsion, torsionDemand } from '../../__tests__/helpers/manual-interactions';

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
    const r = checkTorsion2025({ b: 0.3, h: 0.6, d: 0.55, dSecondary: 0.25, cover: 0.025, stirrupDiaMm: 10, fc: 80, fy: 500, fyt: 500, demand: torsionDemand(30, 100), stirrup: { diameter: 10, legs: 2, spacing: 0.1 } });
    expect(r.phiTth).toBeCloseTo(9.3, 2);
    expect(r.AtOverS * 1e4).toBeCloseTo(4.3227, 3);
  });
});

/*
 * The design run's sizing (`verifyElement` → `checkShear`/`checkTorsion` with the 2025 edition),
 * 0,30 × 0,60, cover 0,025, Ø8 stirrups, H-25. Shear is sized against the engine, which reads
 * fyt ≤ 420 MPa in Vs (§22.5.3.3 → §20.2.1.3): where the demand governs, an ADN 500 stirrup
 * needs the Av/s an ADN 420 one does. Torsion is computed here: At/s scales with 1/fyt, so the
 * 2025 value is the 2005 one × 500/420.
 */
describe('CIRSOC 201-2025 limits in the required-steel sizing', () => {
  const p = { fc: 25, fy: 500, cover: 0.025, b: 0.3, h: 0.6, stirrupDia: 8 };
  it('checkShear 2025: Av/s with fyt = 420 MPa, so ADN 500 needs what ADN 420 needs', () => {
    const a500 = checkShear(p, 300, 0, { edition: '2025' }), a420 = checkShear({ ...p, fy: 420 }, 300, 0, { edition: '2025' });
    expect(a500.AvOverS).toBeGreaterThan(a500.AvOverSMin);
    expect(a500.AvOverS).toBeCloseTo(a420.AvOverS, 2);
  });
  it('checkTorsion 2025: the torsion steel with fy = 420 MPa', () => {
    const t25 = checkTorsion(p, 30, 0, '2025'), t05 = checkTorsion(p, 30, 0);
    expect(t25.AtOverS / t05.AtOverS).toBeCloseTo(500 / 420, 9);
    expect(t25.steps[0]).toBe('fy, fyt = 420 MPa en la armadura de torsión (§22.7.2.2, §20.2.1.3)');
  });
});

const issue2309 = process.env.RUN_KNOWN_WRONG === '2309' ? it : it.skip;
issue2309('known wrong result: #2309 Ø8 at 125 mm gives stirrup φTn = 28.24 < 30 < 33.62 kN·m at 420 and 500 MPa respectively', () => {
  const beam = { b: 0.3, h: 0.6, fc: 25, fy: 500, cover: 0.025, stirrupDia: 8 };
  const torque = 30;
  const cage = { diameter: 8, legs: 2, spacing: 0.125 };
  const centerlineInset = 2 * beam.cover + cage.diameter / 1000;
  const ao = 0.85 * (beam.b - centerlineInset) * (beam.h - centerlineInset);
  const cirsoc201Section11634YieldLimit = 420;
  const provided = Math.PI * (cage.diameter / 1000) ** 2 / (4 * cage.spacing);
  const strengthPerArea = (fy: number) => 0.75 * 2 * ao * fy * 1000;
  const requiredCm2PerM = 1e4 * torque / strengthPerArea(cirsoc201Section11634YieldLimit);
  expect(strengthPerArea(cirsoc201Section11634YieldLimit) * provided).toBeLessThan(torque);
  expect(strengthPerArea(beam.fy) * provided).toBeGreaterThan(torque);

  const [loads] = declaredTestDemands([{ comboId: 1, comboName: 'C1',
    forces: { t: 0, x: 0, n: 0, my: 0, mz: 0, vy: 0, vz: 0, torsion: torque } }]);
  const verify = (fy: number, spacing: number) => verifyElement({
    ...beam, fy, elementId: 1, elementType: 'beam', edition: '2005', demand: loads!.section('My'),
  }, { shear: { ...cage, spacing }, torsion: { AlProv: 100 } }).torsion;
  expect(verify(cirsoc201Section11634YieldLimit, cage.spacing)?.status).toBe('fail');
  expect(verify(beam.fy, 0.1)?.status).toBe('ok');

  const result = verify(beam.fy, cage.spacing);
  expect(result?.refusal).toBeUndefined();
  expect(result?.AtOverSProv).toBeCloseTo(provided * 1e4, 12);
  expect.soft(result?.AtOverS).toBeCloseTo(requiredCm2PerM, 12);
  expect.soft(result?.status).toBe('fail');
});
