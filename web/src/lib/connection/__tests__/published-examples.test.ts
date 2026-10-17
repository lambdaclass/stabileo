/**
 * Connection checks against PUBLISHED worked examples, with their printed intermediate values.
 *
 * [E18] INTI-CIRSOC, «Ejemplos de aplicación del Reglamento Argentino de Estructuras de Acero
 *       para Edificios, CIRSOC 301-2018», julio 2018 (Troglia, Troglia, Angulo Bocco),
 *       inti.gob.ar/assets/uploads/files/cirsoc/08-reglamentos-3ra-generacion/
 *       ejemplos-aplicacion/09_01-Ejemplos-CIRSOC301-2018-Completo.pdf
 * [R18] Reglamento CIRSOC 301-2018, Tabla J.3.6 and eq. J.2.1 (docs/codes/CIRSOC/markdown).
 * [A15] AISC v15.1 Companion, Vol. 1: Design Examples (AISC 360-16), Example J.1.
 *
 * Printed values carry 3-4 significant figures and the sources round Ab (1,98 for 1,978 cm²),
 * so the tolerances are the sources' rounding, stated per case. Known slips in the sources are
 * NOT encoded (Ex 4's interior Lc subtracts d instead of the hole; Ex 5 web uses Fnv = 320).
 */
import { describe, it, expect } from 'vitest';
import { designBoltedJoint, boltGroupBearing, boltAreaCm2 } from '../bolted-joint';
import { designFilletWeld, effectiveLengthMm } from '../fillet-weld';
import { checkBoltGroup, checkFilletWeld } from '../../engine/connection-design';

const close = (got: number, want: number, rel: number) =>
  expect(Math.abs(got / want - 1)).toBeLessThan(rel);

describe('[E18] bolt shear, φ·Fnv·Ab·0,1', () => {
  it('Ex 1: A325 5/8" threads excluded — 61,63 kN per bolt', () => {
    // «Rd = 0,75 x 415 x 1,98 x 0,1 = 61,63 kN por bulón»; Ab printed rounded to 1,98.
    close(0.75 * 415 * boltAreaCm2(15.875) * 0.1, 61.63, 2e-3);
  });
  it('Ex 5 flange: ISO 8.8 16 mm threads included — 49,8 kN; 8 bolts, shear governs: 398,4 kN', () => {
    const d = designBoltedJoint(
      { diameterMm: 16, grade: 'A325', threads: 'included', count: 8, rows: 2, spacingMm: 50, edgeDistanceMm: 40 },
      { thicknessMm: 12.7, fuMPa: 370 }, { shearKN: 300 });
    close(d.checks.find((c) => c.id === 'boltShear')!.capacityKN! / 8, 49.8, 1.5e-3);
    // Bearing: end 174,80 kN, interior 180,44 kN (= the 2,4 d t Fu cap), both above shear, so
    // the group is 8 × 49,8 = 398,4 kN.
    const g = boltGroupBearing({ diameterMm: 16, holeMm: 18, thicknessMm: 12.7, fuMPa: 370,
      edgeDistanceMm: 40, spacingMm: 50, count: 8, rows: 2, deformationConsidered: true,
      shearPerBoltKN: 330 * boltAreaCm2(16) * 0.1 });
    close(g.endKN, 174.80, 1e-3);
    close(g.interiorKN, 180.44, 1e-3);
    close(d.checks.find((c) => c.id === 'bearing')!.capacityKN!, 398.4, 1.5e-3);
  });
});

describe('[E18] Ex 1 — bearing at the end bolt governs, summed per bolt (§J.3.10)', () => {
  // t = 0,64 cm, Fu = 370, hole 1,75 cm, e = 3,5 cm, s = 8,5 cm, three bolts in one line.
  const g = boltGroupBearing({ diameterMm: 15.875, holeMm: 17.5, thicknessMm: 6.4, fuMPa: 370,
    edgeDistanceMm: 35, spacingMm: 85, count: 3, rows: 1, deformationConsidered: true,
    shearPerBoltKN: 415 * 1.98 * 0.1 });
  it('end bolt: 1,2·(3,5 − 0,875)·0,64·370·0,1 = 74,6 kN, φ = 55,95 kN', () => {
    close(g.endKN, 74.6, 1e-3);
    close(0.75 * g.endKN, 55.95, 1e-3);
  });
  it('interior bolts hit the 2,4·d·t·Fu cap: 90,25 kN, φ = 67,69 kN', () => {
    close(g.interiorKN, 90.25, 1.5e-3);
  });
  it('group = 55,95 + 2 × 61,63 = 179,2 kN', () => {
    close(0.75 * g.effectiveKN, 179.2, 1e-3);
  });
});

describe('[R18] Tabla J.3.6 — reduced tension F′nt in a bearing joint', () => {
  // A325 threads included: F′nt = 806 − 2,5·fv ≤ 620 MPa, fv the REQUIRED shear stress.
  it('reproduces 806 − 2,5 fv at fv = 150 MPa', () => {
    const ab = boltAreaCm2(20);
    const shearKN = 150 * ab * 0.1;          // one bolt, one plane: fv = 150 MPa
    const d = designBoltedJoint(
      { diameterMm: 20, grade: 'A325', threads: 'included', count: 1, rows: 1, spacingMm: 60, edgeDistanceMm: 40 },
      { thicknessMm: 20, fuMPa: 400 }, { shearKN, tensionKN: 1 });
    const fnt = 806 - (620 / (0.75 * 330)) * 150; // the table's 2,5 is 620/(0,75·330) = 2,505
    close(d.checks.find((c) => c.id === 'combined')!.capacityKN!, 0.75 * fnt * ab * 0.1, 1e-9);
    // ...which the table rounds to 806 − 2,5·150 = 431 MPa.
    close(fnt, 431, 2e-3);
  });
  it('[E18] Ex 8: ISO 8.8 16 mm excluded, fv = 62,20 MPa → 681,6 > 620, so Rd = 93,4 kN', () => {
    const d = designBoltedJoint(
      { diameterMm: 16, grade: 'A325', threads: 'excluded', count: 1, rows: 1, spacingMm: 60, edgeDistanceMm: 40 },
      { thicknessMm: 12.7, fuMPa: 370 }, { shearKN: 12.5, tensionKN: 89.3 });
    close(d.checks.find((c) => c.id === 'combined')!.capacityKN!, 93.4, 1.5e-3);
  });
  it('the PRO-tab calculator agrees', () => {
    const r = checkBoltGroup({ diameter: 20, grade: '8.8', count: 1, shearPlanes: 1, threadsInShear: true,
      plateThickness: 20, plateFu: 400, edgeDistance: 40, Vu: 150 * Math.PI * 100 / 1000, Tu: 100 });
    const fnt = 806 - (620 / (0.75 * 330)) * 150;
    close(r.ratioInteraction, 100 / (0.75 * fnt * Math.PI * 100 / 1000), 1e-9);
  });
});

describe('[E18] fillet weld, φ = 0,60 × 0,6 FEXX × 0,707 w', () => {
  it('Ex 3: «Rd = 0,60 x 288 x (0,707 x 1) x 0,1 = 12,22 kN» per cm for dw = 1 cm', () => {
    const d = designFilletWeld({ legMm: 10, lengthMm: 100, fexxMPa: 480, thickerPartMm: 15.9,
      thinnerPartMm: 14.3, demandKN: 100 });
    close(d.checks.find((c) => c.id === 'strength')!.limit! / 10, 12.22, 1e-3);
    // Ex 3's limits: minimum 6 mm (t = 15,9), maximum 15,87 − 2 = 13,87 mm.
    expect(d.checks.find((c) => c.id === 'minimumSize')!.limit).toBe(6);
  });
  it('Ex 2: dw = 4 mm, L = 11,3 cm carries 55 kN; limits 5 mm min, 4,40 mm max (t = 6,4)', () => {
    const d = designFilletWeld({ legMm: 4, lengthMm: 113, fexxMPa: 480, thickerPartMm: 6.4,
      thinnerPartMm: 6.4, demandKN: 55 });
    close(d.checks.find((c) => c.id === 'strength')!.limit!, 55, 5e-3);
    expect(d.checks.find((c) => c.id === 'minimumSize')!.limit).toBe(5);
    close(d.checks.find((c) => c.id === 'maximumSize')!.limit!, 4.4, 1e-9);
  });
});

describe('end-loaded long welds, β (CIRSOC eq. J.2.1 = AISC eq. J2-1)', () => {
  it('[A15] Example J.1: l/w = 144 → β = 0,912', () => {
    const w = 25.4 * 3 / 16, L = 27 * 25.4;
    close(effectiveLengthMm(L, w, 'endLoaded') / L, 0.912, 1e-3);
  });
  it('beyond 300w the effective length is 180w — both calculators', () => {
    const w = 5, L = 500 * w;
    expect(effectiveLengthMm(L, w, 'endLoaded')).toBeCloseTo(180 * w, 9);
    const r = checkFilletWeld({ legSize: w, length: L, Fexx: 480, Vu: 100, plateThickness: 10 });
    close(r.phiRn, 0.6 * 0.6 * 480 * 0.707 * w * 180 * w / 1000, 1e-12);
  });
});

describe('the PRO-tab calculator, interior bolts (§J.3.10)', () => {
  it('a generous edge distance does not lift the interior bolts above s − dh', () => {
    // e = 100 mm, d = 20, hole 22: end Lc = 89 mm, but at s = 60 an interior bolt has 38 mm.
    const r = checkBoltGroup({ diameter: 20, grade: '10.9', count: 3, shearPlanes: 2, threadsInShear: false,
      plateThickness: 8, plateFu: 370, edgeDistance: 100, spacing: 60, Vu: 100, Tu: 0 });
    const perBolt = Math.min(1.2 * 38 * 8 * 370, 2.4 * 20 * 8 * 370) / 1000;
    close(r.phiRnBearing, 0.75 * perBolt * 3, 1e-12);
    // Without a spacing the code minimum 3d is assumed: the same 60 mm here.
    const noS = checkBoltGroup({ diameter: 20, grade: '10.9', count: 3, shearPlanes: 2, threadsInShear: false,
      plateThickness: 8, plateFu: 370, edgeDistance: 100, Vu: 100, Tu: 0 });
    close(noS.phiRnBearing, r.phiRnBearing, 1e-12);
  });
});
