/**
 * The longitudinal steel for torsion, CIRSOC 201-2025 (docs/codes/CIRSOC/markdown/cirsoc-201-2025/):
 *   §22.7.1.1 (capitulo-22-…md:2083-2093): the article applies «cuando Tu ≥ φTth»; below, torsion may be neglected
 *     (§9.5.4.1, capitulo-9-vigas.md:609-615: then «no es necesario cumplir con los requisitos para armadura mínima del
 *     artículo 9.6.4 ni los requisitos de armado de los artículos 9.7.5 y 9.7.6.3»).
 *   §9.6.4.1 (capitulo-9-vigas.md:1027-1029): «Debe colocarse un área mínima de armadura para torsión en todas las
 *     secciones donde Tu ≥ φTth».
 *   §9.6.4.3 (:1056-1070): Al,min «la menor entre (a) y (b)»: (a) 0,42√f'c·Acp/fy − (At/s)·ph·fyt/fy,
 *     (b) 0,42√f'c·Acp/fy − (0,175·bw/fyt)·ph·fyt/fy.
 *   §9.5.4.3 (:625-628): the torsion steel is added to the steel «necesaria para Vu, Mu y Pu que actúan en
 *     combinación con la torsión»; C 9.5.4.3: «el acero longitudinal requerido se evalúa en varias ubicaciones».
 *   §22.7.6.1 (capitulo-22-…md:2369-2385): Tn = 2·Ao·Al·fy/ph·tanθ, so Al = (At/s)·ph·(fyt/fy)·cot²θ, θ = 45°.
 *
 * 0,20 × 0,50, H-30 (√30 = 5,477), ADN 420, cover 0,025, Ø8 stirrups 2 legs c/0,10 (s/s,máx = 0,10/0,146 = 0,685,
 * so the stirrup ratio differs by Tu); 4 Ø16 bottom (8,044 cm²) and 2 Ø16 top at both ends (4,022 cm²), continuing
 * along the span; d = 0,50 − 0,025 − 0,008 − 0,008 = 0,459 m. Acp = 0,10 m², pcp = 1,40 m:
 *   Tth = 0,083·5,477·0,10²/1,40 = 3,247 kN·m, φ·Tth = 2,435 kN·m.
 *   x1 = 0,20 − 2·0,029 = 0,142, y1 = 0,442; Ao = 0,85·x1·y1 = 0,05335 m², ph = 1,168 m.
 *   At/s = Tu/(0,75·2·Ao·420 000); Al = (At/s)·ph; 0,42·√30·0,10/420 = 5,477 cm²; 0,175·bw/fyt = 0,833 cm²/m.
 *   As,flex ≈ Mu/(0,9·420 000·0,9·d). Al spread along the stirrups' perimeter, each face (x1 + y1)/ph = 1/2 of it;
 *   the face in tension takes As,flex besides.
 * Three combinations along the span (x = 1,8 m and 3,0 m of 6 m; sagging, so the bottom is in tension):
 *   C1, Tu = 14,0 (governs the stirrups: 2·At/s = 8,33 of 2·0,503/0,10 = 10,06 cm²/m, 0,828 > 0,685), Mu 22:
 *     At/s = 4,165 cm²/m, Al = 4,865 (Al,min 0,612); bottom 1,409 + 2,433 = 3,842 of 8,044 (0,478), top 2,433 of
 *     4,022 (0,605). The stirrup ratio of C2 and C3 is the spacing's, 0,685: they do not tie with C1.
 *   C2, Tu = 3,0 ≥ 2,435, Mu 95: At/s = 0,893, Al = 1,043, Al,min = 5,477 − 0,893·1,168 = 4,435 (At/s > 0,833, so (a)
 *     is the lesser); bottom 6,084 + 2,217 = 8,301 cm² > 8,044 → 1,032, fails.
 *   C3, Tu = 2,0 < 2,435, Mu 100: negligible (§9.5.4.1); its Al,min (4,504) would have read 1,076.
 */
import { describe, it, expect } from 'vitest';
import { verifyProvidedReinforcement, type ElementStationResult, type StationForces } from '../../station-design-forces';
import type { DesignAxes } from '../design-axes';
import type { ProvidedReinforcement } from '../../../store/model.svelte';

const st = (t: number, my: number, vz: number, torsion: number): StationForces => ({ t, x: t * 6, n: 0, vy: 0, vz, my, mz: 0, torsion });
const combo = (id: number, name: string, a: [number, number, number], b: [number, number, number]) => ({
  comboId: id, comboName: name, stations: [st(0, 0, 0, 0), st(0.3, ...a), st(0.5, ...b), st(1, 0, 0, 0)],
});
const stations: ElementStationResult = {
  elementId: 1, length: 6, stationTs: [0, 0.3, 0.5, 1],
  comboResults: [combo(1, 'C1', [20, 40, 14], [22, 30, 14]), combo(2, 'C2', [90, 5, 3], [95, 5, 3]), combo(3, 'C3', [95, 5, 2], [100, 5, 2])],
};
const axes: DesignAxes = {
  flexure: 'My', shear: 'Vz', secondaryFlexure: 'Mz', secondaryShear: 'Vy',
  bFlex: 0.2, hFlex: 0.5, biaxial: false, sagCategory: 'My+', hogCategory: 'My-', basis: 'stress-proxy', secondaryRatio: 0,
};
const reinf: ProvidedReinforcement = {
  regions: { bottomSpan: { count: 4, diameter: 16 }, topStart: { count: 2, diameter: 16 }, topEnd: { count: 2, diameter: 16 }, stirrupsSpan: { diameter: 8, legs: 2, spacing: 0.1 }, stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.1 } },
};

describe('torsion longitudinal steel at every section where Tu ≥ φ·Tth (§9.6.4.1, §9.5.4.3)', () => {
  it('a smaller Tu above φ·Tth with its own Mu governs; one below it does not count', () => {
    const res = verifyProvidedReinforcement(
      1, 'beam', reinf, undefined, { flexure: { AsReq: 0 }, shear: { AvOverS: 0, AvOverSMin: 0 } },
      { b: 0.2, h: 0.5, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 }, stations, undefined, { axes },
    );
    const al = res.checks.find((c) => c.category.startsWith('Torsion Al Span'))!;
    expect([al.comboName, al.stationX, al.status]).toEqual(['C2', 3, 'fail']);
    expect(al.required!).toBeCloseTo(8.30, 2);
    expect(al.provided!).toBeCloseTo(8.04, 2);
    expect(al.ratio).toBeCloseTo(1.032, 2);
    expect(al.description).toContain('cara inferior');
    expect(al.description).toContain('Al,min §9.6.4.3');
    // The stirrups are still read at the tuple that governs them.
    expect(res.checks.find((c) => c.category === 'Torsion Span (Vz)')!.comboName).toBe('C1');
  });
});
