/**
 * CIRSOC rows carried to ACI 318-19 and AISC 360-10 only by an established equivalence: the same
 * formula, the same φ, within the material limits both texts set. Everything else is not
 * verified, with the reason and the CIRSOC clause it came from, and carries no CIRSOC number.
 *
 * The limits each test reads, from the texts:
 *   ACI 318-19 22.5.3.3 and 22.7.2.2: fy, fyt in Vs and torsion ≤ 420 MPa (Table 20.2.2.4(a));
 *     22.5.3.1, 22.7.2.1: √f'c ≤ 8,3 MPa (f'c ≤ 69 MPa); Table 19.2.1.1: f'c ≥ 17 MPa;
 *     22.4.2.1: fy in Po ≤ 550 MPa, against 500 MPa in CIRSOC 201-2025 22.4.2.1
 *     (docs/codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-22-…md:403-408).
 *   ACI 318-19 25.4.3.1(a): ℓdh = fy·ψe·ψr·ψo·ψc/(55·λ·√f'c)·db^1,5; CIRSOC 201-2025 25.4.3.1(a):
 *     0,24·fy·ψe·ψs·ψcc·ψr/√f'c·db (capitulo-25-…md:719-731).
 *   Specified cover: 20.5.1.3 in both (capitulo-20-…md:1204).
 *   AISC 360-10 E1: φc = 0,90; CIRSOC 301-2018 E.1: φc = 0,85 (capitulo-e-…md:39-43).
 *   AISC 360-10 F2-1: Mn = Fy·Zx; CIRSOC 301-2018 F.2.1: ≤ 1,5·My. F6-1: Fy·Zy ≤ 1,6·Fy·Sy; F.6.1: ≤ 1,5·Fy·Sy.
 *   AISC 360-10 G2.1(a): rolled I, h/tw ≤ 2,24·√(E/Fy): φv = 1,00, Cv = 1,0; CIRSOC 301-2018 G.1: φv = 0,90
 *     (capitulo-g-…md:60). Weak-axis shear: AISC 360-10 G7 = CIRSOC 301-2018 G.6 (capitulo-g-…md:406-418).
 */
import { describe, it, expect } from 'vitest';
import { aci318Rows, aisc360Rows, CIRSOC_SHAPED_PATHS_ON_TABLE_21_2_2, type MemberShape, type SteelBranches } from '../equivalence';
import type { CheckRow } from '../../../../design-contract';

const row = (titleKey: string, clause: string, extra: Partial<CheckRow> = {}): CheckRow => ({
  code: titleKey.startsWith('check.rc') ? 'cirsoc-201' : 'cirsoc-301', edition: titleKey.startsWith('check.rc') ? '2025' : '2018',
  clause, title: titleKey, titleKey, inputs: [{ symbol: 'φMn', value: 100 }], demand: 80, capacity: 100, ratio: 0.8, status: 'ok', ...extra,
});
const brief = (r: CheckRow) => [r.code, r.clause, r.status, r.ratio];
const why = (r: CheckRow) => r.derivation?.[0] ?? '';

/** H-25, ADN 420: inside every limit. */
const H25: Pick<MemberShape, 'fc' | 'fy'> = { fc: 25, fy: 420 };

describe('ACI 318-19 from CIRSOC 201-2025', () => {
  it('maps by clause where the formula is ACI\'s; both texts number the specified cover 20.5.1.3', () => {
    const out = aci318Rows([
      row('check.rc.flexure', '22.3'), row('check.rc.cover', '20.5.1.3'), row('check.rc.minSteel', '10.6.1.1'),
      row('check.rc.shear', '22.5'), row('check.rc.axialFlexure', '22.4'), row('check.rc.barFit', '25.2.1'),
    ], { elementType: 'column', ...H25 });
    expect(out.map(brief)).toEqual([
      ['aci-318', '22.3; 21.2.2', 'ok', 0.8],
      ['aci-318', '20.5.1.3', 'ok', 0.8],
      ['aci-318', '10.6.1.1', 'ok', 0.8],
      ['aci-318', '22.5', 'ok', 0.8],
      ['aci-318', '22.4; 21.2.2; 6.6.4', 'ok', 0.8],
      ['aci-318', '25.2.1', 'ok', 0.8],
    ]);
  });

  it('shear and torsion: fyt above 420 MPa or f\'c above 69 MPa is no equivalence', () => {
    const rows = [row('check.rc.shear', '22.5'), row('check.rc.torsion', '22.7')];
    const adn500 = aci318Rows(rows, { elementType: 'beam', fc: 25, fy: 500 });
    expect(adn500.map(brief)).toEqual([['aci-318', '22.5', 'notVerified', null], ['aci-318', '22.7', 'notVerified', null]]);
    expect(why(adn500[0]!)).toContain('fyt = 500 MPa in Vs; ACI 318-19 22.5.3.3 limits it to 420 MPa');
    expect(why(adn500[1]!)).toContain('ACI 318-19 22.7.2.2');
    const h70 = aci318Rows(rows, { elementType: 'beam', fc: 70, fy: 420 });
    expect(h70.map((r) => r.status)).toEqual(['notVerified', 'notVerified']);
    expect(why(h70[0]!)).toContain('22.5.3.1 limits √f\'c to 8,3 MPa');
    expect(aci318Rows(rows, { elementType: 'beam', fc: 69, fy: 420 }).map((r) => r.status)).toEqual(['ok', 'ok']);
  });

  it('P–M: fy in Po is 500 MPa at most in CIRSOC 201-2025 and 550 MPa in ACI 318-19', () => {
    const r = [row('check.rc.axialFlexure', '22.4')];
    expect(aci318Rows(r, { elementType: 'column', fc: 25, fy: 500 })[0]!.status).toBe('ok');
    const [over] = aci318Rows(r, { elementType: 'column', fc: 25, fy: 550 });
    expect(brief(over!)).toEqual(['aci-318', '22.4; 21.2.2; 6.6.4', 'notVerified', null]);
    expect(why(over!)).toContain('fy ≤ 500 MPa in CIRSOC 201-2025 22.4.2.1 and fy ≤ 550 MPa in ACI 318-19 22.4.2.1');
  });

  it('development length is not carried: the hooked length is linear in db in CIRSOC, db^1,5 in ACI 318-19', () => {
    for (const fy of [420, 500]) {
      const [a] = aci318Rows([row('check.rc.anchorage', '25.4.2', { ratio: 1.5, status: 'fail' })], { elementType: 'beam', fc: 25, fy });
      expect(brief(a!)).toEqual(['aci-318', '25.4.2.3; 25.4.3.1', 'notVerified', null]);
      expect(why(a!)).toContain('ACI 318-19 25.4.3.1 in db^1,5');
      expect(why(a!)).toContain('(cirsoc-201 2025 25.4.2)');
    }
  });

  it('a wall\'s minimum-steel row evaluates 9.6.1.2, not Table 11.6.1; f\'c below 17 MPa is outside ACI 318-19', () => {
    const [w] = aci318Rows([row('check.rc.minSteel', '9.6.1.2')], { elementType: 'wall', ...H25 });
    expect(w!.status).toBe('notVerified');
    expect(why(w!)).toContain('not ACI 318-19 Table 11.6.1');
    const [t] = aci318Rows([row('check.rc.minSteel', '11.6.1')], { elementType: 'wall', ...H25 });
    expect(brief(t!)).toEqual(['aci-318', '11.6.1', 'ok', 0.8]);
    const [b] = aci318Rows([row('check.rc.minSteel', '9.6.1.2')], { elementType: 'beam', ...H25 });
    expect(brief(b!)).toEqual(['aci-318', '9.6.1.2', 'ok', 0.8]);
    const [low] = aci318Rows([row('check.rc.flexure', '22.3')], { elementType: 'beam', fc: 15, fy: 420 });
    expect(low!.status).toBe('notVerified');
    expect(why(low!)).toContain('below the 17 MPa of ACI 318-19 Table 19.2.1.1');
  });

  it('a row without equivalence carries no CIRSOC number: no ratio, demand, capacity, inputs or clause of its own', () => {
    const [bi] = aci318Rows([row('check.rc.biaxial', '22.4')], { elementType: 'column', ...H25 });
    expect(bi!.status).toBe('notVerified');
    expect([bi!.ratio, bi!.demand, bi!.capacity, bi!.inputs, bi!.clause]).toEqual([null, undefined, undefined, [], undefined]);
    expect(why(bi!)).toBe('no equivalence established with ACI 318-19: the reciprocal load method is not a provision of ACI 318-19 (cirsoc-201 2025 22.4)');
    const [t] = aci318Rows([row('check.rc.flexure', '22.3')], { elementType: 'beam', pendingPhi: true, ...H25 });
    expect(t!.status).toBe(CIRSOC_SHAPED_PATHS_ON_TABLE_21_2_2 ? 'ok' : 'notVerified');
    // What the CIRSOC engine does not evaluate stays unsupported.
    const [u] = aci318Rows([row('check.rc.unsupportedCheck', '18.7', { status: 'unsupported', ratio: null })], { elementType: 'column', ...H25 });
    expect(u!.status).toBe('unsupported');
  });
});

/** An I-shape or a channel on AISC 360-10's branch everywhere. */
const ON: SteelBranches = {
  strongCapBinds: false, strongSimplifiedLtb: false, strongReadsFL: false, webCompactFlexure: true, flangeCompactFlexure: true,
  weakCapBinds: false, webShearCv1: true, interactionAxial: 'tension',
};
const I = (b: Partial<SteelBranches> = {}): MemberShape => ({ elementType: 'member', steelShape: 'I', steel: { ...ON, ...b } });
const U = (b: Partial<SteelBranches> = {}): MemberShape => ({ elementType: 'member', steelShape: 'U', steel: { ...ON, ...b } });

describe('AISC 360-10 from CIRSOC 301-2018', () => {
  it('numbers weak-axis shear G7 and carries tension, flexure and H1 with tension where the branch is AISC\'s', () => {
    const rows = [row('check.steel.F.2', 'F.2'), row('check.steel.G.6', 'G.6'), row('check.steel.H1', 'H1-1b'), row('check.steel.D.2', 'D.2'), row('check.steel.F.6', 'F.6')];
    expect(aisc360Rows(rows, I()).map(brief)).toEqual([
      ['aisc-360', 'F2; F3', 'ok', 0.8], ['aisc-360', 'G7', 'ok', 0.8], ['aisc-360', 'H1-1b', 'ok', 0.8], ['aisc-360', 'D2', 'ok', 0.8], ['aisc-360', 'F6', 'ok', 0.8],
    ]);
    const rhs = aisc360Rows(rows, { elementType: 'member', steelShape: 'RHS', steel: ON });
    expect(rhs.map((r) => r.status)).toEqual(['notVerified', 'notVerified', 'notVerified', 'ok', 'notVerified']);
  });

  it('compression is never carried: φc = 0,85 in CIRSOC 301-2018 E.1, 0,90 in AISC 360-10 E1', () => {
    for (const m of [I(), U()]) {
      const [c] = aisc360Rows([row('check.steel.E.3', 'E.3')], m);
      expect(brief(c!)).toEqual(['aisc-360', 'E3; E4; E7', 'notVerified', null]);
      expect(why(c!)).toContain('φc = 0,85 in CIRSOC 301-2018 E.1 against 0,90 in AISC 360-10 E1');
    }
    const [h] = aisc360Rows([row('check.steel.H1', 'H1-1a')], I({ interactionAxial: 'compression' }));
    expect(h!.status).toBe('notVerified');
    expect(why(h!)).toContain('with compression H1 reads φc·Pn');
  });

  it('strong-axis flexure: the 1,5·My cap, the simplified Lr, a noncompact web or a channel\'s noncompact flange are not AISC\'s', () => {
    const f2 = [row('check.steel.F.2', 'F.2')];
    const read = (m: MemberShape) => aisc360Rows(f2, m)[0]!;
    expect(why(read(I({ strongCapBinds: true })))).toContain('Mp = 1,5·My by CIRSOC 301-2018 F.2.1; AISC 360-10 F2-1 has no such cap');
    expect(why(read(I({ strongSimplifiedLtb: true })))).toContain('not AISC 360-10 F2-4 and F2-6');
    // The checker now evaluates CIRSOC F.4 and F.5; they are not AISC's because their FL is Fy − Fr.
    expect(why(read(I({ webCompactFlexure: false })))).toContain('CIRSOC 301-2018 F.4 or F.5, whose FL is Fy − Fr');
    expect(why(read(I({ strongReadsFL: true })))).toContain('FL = Fy − Fr (69 or 114 MPa) by CIRSOC 301-2018 F.2.7');
    expect(why(read(U({ flangeCompactFlexure: false })))).toContain('AISC 360-10 F2 covers channels with compact flanges only');
    expect(brief(read(U()))).toEqual(['aisc-360', 'F2', 'ok', 0.8]);
    expect(read({ elementType: 'member', steelShape: 'I' }).status).toBe('notVerified');
    // H1 with tension rests on the same flexural terms.
    expect(aisc360Rows([row('check.steel.H1', 'H1-1b')], I({ strongCapBinds: true }))[0]!.status).toBe('notVerified');
  });

  it('weak-axis flexure: F6-1 caps Mp at 1,6·Fy·Sy, F.6.1 at 1,5·Fy·Sy', () => {
    const [f6] = aisc360Rows([row('check.steel.F.6', 'F.6')], I({ weakCapBinds: true }));
    expect(brief(f6!)).toEqual(['aisc-360', 'F6', 'notVerified', null]);
    expect(why(f6!)).toContain('AISC 360-10 F6-1 caps it at 1,6·Fy·Sy');
  });

  it('strong-axis shear: none for an I-shape (φv = 1,00 in G2.1(a)); a channel where its web\'s Cv is 1', () => {
    const g2 = [row('check.steel.G.2', 'G.2')];
    const [i] = aisc360Rows(g2, I());
    expect(brief(i!)).toEqual(['aisc-360', 'G2', 'notVerified', null]);
    expect(why(i!)).toContain('φv = 1,00 and Cv = 1,0');
    expect(brief(aisc360Rows(g2, U())[0]!)).toEqual(['aisc-360', 'G2', 'ok', 0.8]);
    expect(aisc360Rows(g2, U({ webShearCv1: false }))[0]!.status).toBe('notVerified');
  });
});
