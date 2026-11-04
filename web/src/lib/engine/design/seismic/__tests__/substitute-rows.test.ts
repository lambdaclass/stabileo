/**
 * The seismic frame checks are substitutes (ACI 318-19 chapter 18): CIRSOC 201-2025 §18.1
 * (docs/codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-18-especificaciones-especiales-para-el-proyecto.md:10-16)
 * sends the seismic design of concrete to INPRES-CIRSOC 103 Parte II 2026, which the repository does not hold.
 * Their rows are not verified, with no ratio; their result stays in the derivation.
 *
 * Column 0,40 × 0,40, d 0,35, H-80, ADN 500, Pu 1000 kN, Mpr 300 + 300 over lu 3 m, ties Ø10 ×2 c/0,10:
 * Ve = 200 kN, φVn = 0,75·(0,17·8,3·0,40·0,35 + 2·0,7854e-4·420 000·0,35/0,10) = 321,34 kN (§22.5.3.1 and
 * §22.5.3.3 applied), Ve/φVn = 0,622: it read ok.
 * Joint: T = 1,4·420 000·(10 + 6)e-4 = 940,8 kN, Vcol 150 kN, Vj = 790,8 kN; φVn = 0,85·1,2·√25·0,16 = 816 kN;
 * Vj/φVn = 0,969. Strong column 400 + 400 against 1,2·(300 + 200) = 600: 0,75.
 */
import { describe, it, expect } from 'vitest';
import { columnCapacityShear, seismicJointShear, strongColumn } from '../capacity';
import { seismicJointCheckRows, seismicMemberCheckRows } from '../../check-rows-families';

describe('seismic rows are substitutes, not verified', () => {
  it('a column\'s capacity shear at 0,622', () => {
    const sh = columnCapacityShear({ b: 0.4, h: 0.4, d: 0.35, fc: 80, fyt: 500, mpr: [300, 300], lu: 3, vu: 100, pu: 1000, ties: { diameter: 10, legs: 2, spacing: 0.1 } });
    expect(sh.utilization).toBeCloseTo(200 / 321.34, 3);
    const rows = seismicMemberCheckRows({ id: 1, kind: 'column', role: 'primary', shear: { ve: sh.ve, phiVn: sh.phiVn, utilization: sh.utilization, vcZero: sh.vcZero }, ok: true, issues: [] });
    expect(rows.map((r) => [r.titleKey, r.code, r.clause, r.status, r.ratio])).toEqual([
      ['check.seismic.shear', 'cirsoc-201', '18.1', 'notVerified', null],
      ['check.seismic.detailing', 'cirsoc-201', '18.1', 'notVerified', null],
    ]);
    expect(rows[0]!.derivation![0]).toContain('INPRES-CIRSOC 103 Parte II 2026, not in the repository: not verified');
    expect(rows[0]!.derivation![1]).toBe('ACI 318-19 §18.7.6: Ve/φVn = 0.622');
  });

  it('a joint: strong column and joint shear', () => {
    const sh = seismicJointShear({ fc: 25, fy: 420, overstrength: 1.4, topOneSide: 10, bottomOtherSide: 6, columnShear: 150, aj: 0.16, confinement: 'threeOrOpposite' });
    expect(sh.vj).toBeCloseTo(790.8, 6);
    expect(sh.phiVn).toBeCloseTo(816, 6);
    const sc = strongColumn({ columns: [400, 400], beams: [500], ratio: 1.2 });
    const rows = seismicJointCheckRows({ nodeId: 3, direction: 'X', columns: [1, 2], beams: [5, 6], strongColumn: { ...sc, roof: false }, shear: { ...sh, confinement: 'threeOrOpposite' }, ok: true });
    expect(rows.map((r) => [r.status, r.ratio])).toEqual([['notVerified', null], ['notVerified', null]]);
    expect(rows.map((r) => r.derivation![1])).toEqual(['ACI 318-19 §18.7.3.2: 1,2·ΣMnb/ΣMnc = 0.750', 'ACI 318-19 §18.8.4: Vj/φVn = 0.969']);
  });
});
