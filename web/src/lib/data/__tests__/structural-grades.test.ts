/**
 * Integrity of the multi-code grade database.
 *
 * A materials table fails quietly: a transposed digit produces a member that
 * is merely wrong, not one that errors, and nothing downstream can tell. So
 * what is pinned here is the physics that must hold of ANY grade — fu above
 * fy, strength falling with thickness, moduli in the right band — rather than
 * a restatement of the numbers, which would only test that the file equals
 * itself.
 */

import { describe, it, expect } from 'vitest';
import {
  ALL_GRADES,
  BASIC_REGIONS,
  MATERIAL_DESIGN_CODES,
  HOT_ROLLED,
  ALUMINIUM,
  STAINLESS,
  gradesForFamily,
  codesForFamily,
  gradeById,
  strengthAtThickness,
  searchGrades,
  gradesForMode,
  codesForMode,
  defaultCodeFor,
  gradesForCode,
  commercialGrade,
  commercialGradesForRegion,
  commercialGradesFor,
  isUnusualPairing,
  type GradeFamily,
} from '../structural-grades';
import type { GradeRegion } from '../structural-grades';
import { DESIGN_CODES } from '../section-catalog';
import en from '../../i18n/locales/en';
import es from '../../i18n/locales/es';
import pt from '../../i18n/locales/pt';

/** Every family that records a commercial pairing. */
const ALL_FAMILIES_WITH_PAIRINGS = [
  'IPN', 'UPN', 'IPE', 'HEA', 'HEB', 'T', 'L', 'W', 'HP', 'C', 'MC', 'M',
  'RHS', 'SHS', 'CHS',
];

const FAMILIES: GradeFamily[] = ['hot-rolled', 'cold-formed', 'aluminium', 'stainless'];

describe('every grade is physically coherent', () => {
  it('has a unique id', () => {
    const ids = ALL_GRADES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reaches its ultimate strength above its yield strength', () => {
    // Not a formality: fu <= fy would mean a material that ruptures before it
    // yields, and every code's ductility check divides by the gap.
    const bad = ALL_GRADES.filter((g) => !(g.fu > g.fy));
    expect(bad.map((g) => g.designation)).toEqual([]);
  });

  it('carries a positive modulus, density and Poisson ratio below one half', () => {
    for (const g of ALL_GRADES) {
      expect(g.e, g.designation).toBeGreaterThan(0);
      expect(g.rho, g.designation).toBeGreaterThan(0);
      // At nu = 0.5 the bulk modulus is infinite: no structural metal is there.
      expect(g.nu, g.designation).toBeGreaterThan(0);
      expect(g.nu, g.designation).toBeLessThan(0.5);
    }
  });

  it('names the product standard that fixes its values', () => {
    // The whole point of the table: a number without a source cannot be
    // checked, and a grade without a standard cannot be specified.
    const unsourced = ALL_GRADES.filter((g) => !g.productStandard.trim());
    expect(unsourced.map((g) => g.id)).toEqual([]);
  });
});

describe('the families are distinguishable by their physics', () => {
  it('aluminium has about a third of steel’s modulus', () => {
    // The reason aluminium structures are governed by deflection: same load,
    // three times the movement.
    for (const g of ALUMINIUM) {
      expect(g.e, g.designation).toBeGreaterThan(60000);
      expect(g.e, g.designation).toBeLessThan(80000);
    }
    for (const g of HOT_ROLLED) {
      expect(g.e, g.designation).toBeGreaterThanOrEqual(200000);
      expect(g.e, g.designation).toBeLessThanOrEqual(210000);
    }
  });

  it('stainless is denser than carbon steel', () => {
    const maxCarbon = Math.max(...HOT_ROLLED.map((g) => g.rho));
    // Austenitics run near 7900 kg/m³ against carbon steel's 7850.
    expect(Math.max(...STAINLESS.map((g) => g.rho))).toBeGreaterThanOrEqual(maxCarbon);
  });

  it('EN grades use 210 GPa and ASTM grades 200 GPa, as their codes state', () => {
    // A real difference between standards, not a rounding: it moves every
    // deflection by 5%.
    const en = HOT_ROLLED.filter((g) => g.productStandard.startsWith('EN 10025'));
    const astm = HOT_ROLLED.filter((g) => g.productStandard.startsWith('ASTM'));
    expect(en.length).toBeGreaterThan(0);
    expect(astm.length).toBeGreaterThan(0);
    expect(en.every((g) => g.e === 210000)).toBe(true);
    expect(astm.every((g) => g.e === 200000)).toBe(true);
  });
});

describe('strength falls with thickness where the standard says so', () => {
  it('S355 is 355 MPa thin and 335 MPa thick', () => {
    const s355 = gradeById('en-s355');
    if (!s355) throw new Error('en-s355 missing');
    expect(strengthAtThickness(s355, 20).fy).toBe(355);
    expect(strengthAtThickness(s355, 40).fy).toBe(355); // band is inclusive at its top
    expect(strengthAtThickness(s355, 60).fy).toBe(335);
  });

  it('beyond the tabulated range it holds the THICK value and says so', () => {
    // The unconservative failure would be to fall back to the headline (thin)
    // value out of range. Flagging the extrapolation lets a caller refuse.
    const s355 = gradeById('en-s355');
    if (!s355) throw new Error('en-s355 missing');
    const r = strengthAtThickness(s355, 150);
    expect(r.fy).toBe(335);
    expect(r.extrapolated).toBe(true);
  });

  it('STEEL bands never increase with thickness, and no band overlaps', () => {
    // Steel is quenched and worked less effectively as it gets thicker, so
    // yield falls. Aluminium 6082 is the documented exception and is checked
    // separately — asserting the rule globally would force the exception to be
    // hidden, which is the wrong way round.
    for (const g of ALL_GRADES) {
      const bands = g.byThickness;
      if (!bands) continue;
      for (let i = 1; i < bands.length; i++) {
        expect(bands[i].overMm, g.designation).toBe(bands[i - 1].upToMm);
        if (g.family !== 'aluminium') {
          expect(bands[i].fy, g.designation).toBeLessThanOrEqual(bands[i - 1].fy);
        }
      }
      // The headline value is the FIRST band either way, so a caller ignoring
      // thickness is wrong in a known direction rather than an arbitrary one.
      expect(g.fy, g.designation).toBe(bands[0].fy);
    }
  });

  it('a grade with no bands returns its headline values at any thickness', () => {
    const a36 = gradeById('astm-a36');
    if (!a36) throw new Error('astm-a36 missing');
    expect(strengthAtThickness(a36, 5)).toEqual({ fy: 250, fu: 400, extrapolated: false });
    expect(strengthAtThickness(a36, 90)).toEqual({ fy: 250, fu: 400, extrapolated: false });
  });
});

describe('grades and design codes are independent axes', () => {
  it('every family has both grades and at least one code', () => {
    for (const f of FAMILIES) {
      expect(gradesForFamily(f).length, f).toBeGreaterThan(0);
      expect(codesForFamily(f).length, f).toBeGreaterThan(0);
    }
  });

  it('every family is covered by codes from more than one region', () => {
    // The requirement that motivated the table: not CIRSOC-only.
    for (const f of FAMILIES) {
      const regions = new Set(codesForFamily(f).map((c) => c.region));
      expect(regions.size, f).toBeGreaterThan(1);
    }
  });

  it('a code never claims a family that has no grades', () => {
    for (const c of MATERIAL_DESIGN_CODES) {
      for (const f of c.families) {
        expect(gradesForFamily(f).length, `${c.name} / ${f}`).toBeGreaterThan(0);
      }
    }
  });

  it('code ids are unique', () => {
    const ids = MATERIAL_DESIGN_CODES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('search', () => {
  it('finds a grade by its designation, its standard, or its note', () => {
    expect(searchGrades('S355').some((g) => g.id === 'en-s355')).toBe(true);
    expect(searchGrades('NBR 7007').every((g) => g.productStandard.includes('NBR 7007'))).toBe(true);
    expect(searchGrades('weathering').some((g) => g.id === 'astm-a588')).toBe(true);
  });

  it('is case-insensitive and confined to the requested family', () => {
    const r = searchGrades('a', 'aluminium');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((g) => g.family === 'aluminium')).toBe(true);
  });

  it('returns the whole family for an empty query', () => {
    expect(searchGrades('   ', 'stainless')).toEqual(gradesForFamily('stainless'));
  });
});

/**
 * The profile catalogue keeps its own view of design codes — which dimensional
 * families each one ships. This one keeps which metal families each one covers.
 * Same codes, two projections, joined by id.
 *
 * They are not merged, because neither list has an opinion about the other's
 * axis. But they must not DISAGREE, and nothing structural stops them drifting:
 * the ids are plain strings in two files that no import connects.
 */
describe('the two views of a design code agree where they overlap', () => {
  it('an id shared with the profile catalogue names the same region', async () => {
    const { DESIGN_CODES: PROFILE_CODES } = await import('../section-catalog');
    const shared = PROFILE_CODES
      .map((p) => ({ p, m: MATERIAL_DESIGN_CODES.find((m) => m.id === p.id) }))
      .filter((x) => x.m);

    // If this drops to zero the test is vacuous, which is worth catching:
    // it would mean the ids were renamed apart rather than kept in step.
    expect(shared.length).toBeGreaterThan(0);
    for (const { p, m } of shared) {
      expect(m!.region, p.id).toBe(p.region);
    }
  });
});

/**
 * Mode gating and the code association.
 *
 * Basic ships European and American grades; PRO adds the rest. The gate lives
 * in the query rather than in a second database, so what is pinned here is that
 * the gate actually bites AND that nothing is lost behind it — a filter that
 * silently dropped Argentine grades would look identical to a working one until
 * someone went looking for F-24.
 */
describe('what Basic offers versus PRO', () => {
  it('Basic offers exactly the four regions it declares', () => {
    const basic = gradesForMode(ALL_GRADES, false);
    const regions = new Set(basic.map((g) => g.region));
    expect([...regions].sort()).toEqual(['AR', 'BR', 'EU', 'US']);
    // CIRSOC is the default, so its own grades must survive the Basic filter.
    expect(basic.some((g) => g.id === 'iram-f24')).toBe(true);
  });

  it('PRO loses nothing, and today adds no GRADES — only design codes', () => {
    const basic = gradesForMode(ALL_GRADES, false);
    const pro = gradesForMode(ALL_GRADES, true);
    expect(pro.length).toBe(ALL_GRADES.length);
    for (const g of basic) expect(pro).toContain(g);

    // Worth asserting rather than assuming: every grade loaded belongs to a
    // Basic region, so the gate currently withholds nothing. The AU/IN/ZA
    // entries are design CODES with no grades of their own yet. If grades for
    // those regions are ever added, this flips and the gate starts to bite —
    // which is the moment to notice, not to discover later.
    expect(pro.length).toBe(basic.length);
    expect(ALL_GRADES.every((g) => BASIC_REGIONS.includes(g.region))).toBe(true);
    const codeRegions = new Set(MATERIAL_DESIGN_CODES.map((c) => c.region));
    expect(codeRegions.has('AU')).toBe(true);
  });

  it('Basic still offers a code for every family', () => {
    // The failure this guards: gating regions so hard that a family is left
    // with no design code, which would render an empty picker.
    for (const f of FAMILIES) {
      const codes = codesForMode(codesForFamily(f), false);
      expect(codes.length, f).toBeGreaterThan(0);
    }
  });
});

describe('the picker defaults to CIRSOC', () => {
  it('chooses CIRSOC for the families it covers', () => {
    expect(defaultCodeFor('hot-rolled')?.id).toBe('cirsoc-301');
    expect(defaultCodeFor('cold-formed')?.id).toBe('cirsoc-303');
    expect(defaultCodeFor('aluminium')?.id).toBe('cirsoc-701');
  });

  it('falls back to a real code where CIRSOC has none, rather than nothing', () => {
    // There is no Argentine stainless code, and an empty default would open the
    // picker on a blank selection.
    const d = defaultCodeFor('stainless');
    expect(d).toBeDefined();
    expect(d!.families).toContain('stainless');
  });

  it('CIRSOC surfaces both IRAM and ASTM steels, because local practice uses both', () => {
    const cirsoc = MATERIAL_DESIGN_CODES.find((c) => c.id === 'cirsoc-301')!;
    const grades = gradesForCode(cirsoc, 'hot-rolled');
    expect(grades.some((g) => g.region === 'AR')).toBe(true);
    expect(grades.some((g) => g.region === 'US')).toBe(true);
    // ...and it does not sweep in European grades it has no tables for.
    expect(grades.some((g) => g.region === 'EU')).toBe(false);
  });

  it('a code with no matching grades returns the family rather than an empty list', () => {
    // An empty picker reads as broken. The association is a convenience for
    // finding grades, not a rule about which are permitted.
    const fake = { ...MATERIAL_DESIGN_CODES[0], gradeRegions: [] as never[] };
    expect(gradesForCode(fake, 'hot-rolled').length).toBe(gradesForFamily('hot-rolled').length);
  });
});

/**
 * Values checked against their published source.
 *
 * These were first loaded from memory and then audited against the standards
 * themselves. Four were wrong. Pinning the corrected ones stops a future edit
 * from quietly reverting them, and each case records WHICH document settles it,
 * because "someone said so" is what produced the errors in the first place.
 */
describe('audited against the published standards', () => {
  const g = (id: string) => {
    const found = gradeById(id);
    if (!found) throw new Error(`${id} missing`);
    return found;
  };

  it('IRAM grades follow IRAM-IAS U 500-503, where F-24 is 240 MPa — not 235', () => {
    // The trap: F-nn is nn kgf/mm², and CIRSOC 301 states 1 MPa = 10 kgf/cm²,
    // so it converts at 1 kgf = 10 N rather than 9,81. The physical conversion
    // gives 235 and the standard says 240.
    expect(g('iram-f24').fy).toBe(240);
    expect(g('iram-f24').fu).toBe(370);
    expect(g('iram-f26').fy).toBe(260);
    expect(g('iram-f26').fu).toBe(420);
    expect(g('iram-f36').fy).toBe(360);
    expect(g('iram-f36').fu).toBe(520);
  });

  it('IRAM grades use E = 200 GPa, as CIRSOC 301-2018 §A.3.5 fixes it', () => {
    // «(a) Módulo de Elasticidad longitudinal: E = 200000 MPa; (b) … G = 77200 MPa».
    // 210 GPa was the 1984 edition's value (chapter 2, Tabla 1).
    for (const id of ['iram-f24', 'iram-f26', 'iram-f36']) {
      expect(g(id).e, id).toBe(200000);
      expect(g(id).rho, id).toBe(78.5); // gamma = 78,5 kN/m³, also from CIRSOC
    }
  });

  it('IRAM yield drops 20 MPa above 30 mm, per CIRSOC’s own note', () => {
    expect(strengthAtThickness(g('iram-f24'), 20).fy).toBe(240);
    expect(strengthAtThickness(g('iram-f24'), 50).fy).toBe(220);
    expect(strengthAtThickness(g('iram-f36'), 50).fy).toBe(340);
  });

  it('S355 reaches 490 MPa, the nominal value of EN 1993-1-1 table 3.1', () => {
    // Held 510 before the audit — the figure often quoted from EN 10025-2's
    // range rather than the nominal one Eurocode 3 designs against.
    expect(g('en-s355').fu).toBe(490);
    expect(g('en-s355').fy).toBe(355);
  });

  it('the EN thickness bands match table 3.1 for every grade that has them', () => {
    const expected: Record<string, [number, number]> = {
      'en-s235': [235, 215], 'en-s275': [275, 255],
      'en-s355': [355, 335], 'en-s450': [440, 410],
    };
    for (const [id, [thin, thick]] of Object.entries(expected)) {
      expect(strengthAtThickness(g(id), 30).fy, id).toBe(thin);
      expect(strengthAtThickness(g(id), 60).fy, id).toBe(thick);
    }
  });

  it('stainless moduli follow EN 1993-1-4 clause 2.1.3: 200 GPa austenitic, 220 ferritic', () => {
    expect(g('ss-1.4301').e).toBe(200000);   // austenitic
    expect(g('ss-1.4462').e).toBe(200000);   // austenitic-ferritic (duplex)
    expect(g('ss-1.4003').e).toBe(220000);   // ferritic
    // The ferritics match table 2.1 exactly, cold rolled strip.
    expect(g('ss-1.4003').fy).toBe(280);
    expect(g('ss-1.4003').fu).toBe(450);
    expect(g('ss-1.4016').fy).toBe(260);
  });

  it('ASTM grades match their specifications', () => {
    expect(g('astm-a36').fy).toBe(250);
    expect(g('astm-a572-50').fy).toBe(345);
    expect(g('astm-a992').fy).toBe(345);
    expect(g('astm-a992').fu).toBe(450);
    for (const id of ['astm-a36', 'astm-a572-50', 'astm-a992']) {
      expect(g(id).e, id).toBe(200000);
    }
  });
});

/**
 * Brazil, audited and surfaced in Basic.
 *
 * Every ABNT value was checked against NBR 7007, NBR 7008 and Gerdau's own
 * catalogue, and unlike the Argentine set all of them were already right — so
 * these pin them against a future edit rather than record a correction.
 */
describe('Brazilian grades', () => {
  const g = (id: string) => {
    const found = gradeById(id);
    if (!found) throw new Error(`${id} missing`);
    return found;
  };

  it('NBR 7007 hot-rolled grades match the standard', () => {
    expect([g('nbr-mr250').fy, g('nbr-mr250').fu]).toEqual([250, 400]);
    expect([g('nbr-ar350').fy, g('nbr-ar350').fu]).toEqual([350, 450]);
    expect([g('nbr-ar415').fy, g('nbr-ar415').fu]).toEqual([415, 520]);
    expect([g('nbr-ar350cor').fy, g('nbr-ar350cor').fu]).toEqual([350, 485]);
  });

  it('NBR 7008 galvanised grades match the standard', () => {
    expect([g('nbr-zar250').fy, g('nbr-zar250').fu]).toEqual([250, 360]);
    expect([g('nbr-zar280').fy, g('nbr-zar280').fu]).toEqual([280, 380]);
    expect([g('nbr-zar345').fy, g('nbr-zar345').fu]).toEqual([345, 430]);
  });

  it('uses NBR 8800’s 200 GPa modulus, matching ASTM rather than EN', () => {
    for (const id of ['nbr-mr250', 'nbr-ar350', 'nbr-ar415']) {
      expect(g(id).e, id).toBe(200000);
    }
  });

  it('is equivalent to the ASTM grades without being numerically identical', () => {
    // Gerdau states A572 Gr.50 and AR 350 are the same steel under two
    // standards — but the nominal yields are 345 and 350 MPa, because each
    // standard rounds from its own unit system. Close enough to substitute,
    // different enough that quoting one for the other is wrong.
    expect(g('nbr-ar350').fy).toBe(350);
    expect(g('astm-a572-50').fy).toBe(345);
    expect(Math.abs(g('nbr-ar350').fy - g('astm-a572-50').fy)).toBeLessThanOrEqual(5);
    expect(g('nbr-ar350').fu).toBe(g('astm-a572-50').fu);   // both 450
    // MR-250 and A36 do coincide exactly.
    expect(g('nbr-mr250').fy).toBe(g('astm-a36').fy);
    expect(g('nbr-mr250').fu).toBe(g('astm-a36').fu);
  });

  it('is offered in Basic', () => {
    const basic = gradesForMode(ALL_GRADES, false);
    expect(basic.some((x) => x.region === 'BR')).toBe(true);
    expect(new Set(basic.map((x) => x.region))).toEqual(new Set(['AR', 'EU', 'US', 'BR']));
    // And the Brazilian design codes come with them.
    const codes = codesForMode(MATERIAL_DESIGN_CODES, false);
    expect(codes.some((c) => c.id === 'nbr-8800')).toBe(true);
    expect(codes.some((c) => c.id === 'nbr-14762')).toBe(true);
  });

  it('still withholds the regions PRO is for', () => {
    // Adding Brazil must not quietly open everything.
    const basic = gradesForMode(ALL_GRADES, false);
    expect(basic.some((x) => x.region === 'AU')).toBe(false);
    expect(basic.some((x) => x.region === 'IN')).toBe(false);
  });
});

describe('what a profile family is actually rolled in', () => {
  it('records the Argentine practice per family, W being the exception', () => {
    // Acindar's catalogue: the ordinary families in F-24, the wide-flange
    // series in F-36.
    expect(commercialGrade('IPN', 'AR')?.gradeId).toBe('iram-f24');
    expect(commercialGrade('UPN', 'AR')?.gradeId).toBe('iram-f24');
    expect(commercialGrade('W', 'AR')?.gradeId).toBe('iram-f36');
  });

  it('records Brazilian and American practice for the same family', () => {
    // One family, three regions, three different steels — which is exactly why
    // this cannot be a property of the family alone.
    expect(commercialGrade('W', 'BR')?.gradeId).toBe('astm-a572-50');
    expect(commercialGrade('W', 'US')?.gradeId).toBe('astm-a992');
    // Every ordinary grade across all three regions, de-duplicated.
    expect(commercialGradesFor('W').length).toBeGreaterThanOrEqual(5);
    expect(new Set(commercialGradesFor('W').map((p) => p.gradeId)).size)
      .toBe(commercialGradesFor('W').length);
  });

  it('accepts the grade a family was rolled in BEFORE the current one', () => {
    /*
     * A W in A36 is not unusual, it is most of the existing building stock:
     * A992 only arrived in 1998. Flagging it would fire on half the assessments
     * an engineer does, and a warning that fires on ordinary work teaches the
     * reader to ignore it.
     */
    expect(isUnusualPairing('W', 'astm-a36')).toBe(false);
    expect(isUnusualPairing('CHS', 'astm-a500b-round')).toBe(false);
    expect(isUnusualPairing('RHS', 'astm-a500b-shaped')).toBe(false);
  });

  it('covers every family Eurocode 3 offers, not only the European-named ones', () => {
    /*
     * IPN, UPN and L are on the Eurocode 3 list too — an IPN is a DIN section
     * and is rolled in Europe in EN steel. Recording only the Argentine
     * practice for them would flag S235 and S355 on a European frame, which
     * is the same false positive as flagging an Argentine channel in F-24.
     */
    for (const family of ['IPE', 'HEA', 'HEB', 'IPN', 'UPN', 'L']) {
      for (const g of ['en-s235', 'en-s275', 'en-s355']) {
        expect(isUnusualPairing(family, g), `${family} in ${g}`).toBe(false);
      }
    }
  });

  it('treats all three ordinary European grades as ordinary', () => {
    // S235, S275 and S355 are all stocked. Recording only one would flag the
    // other two, which are on drawings all over the continent.
    for (const g of ['en-s235', 'en-s275', 'en-s355']) {
      expect(isUnusualPairing('IPE', g), g).toBe(false);
      expect(isUnusualPairing('HEB', g), g).toBe(false);
    }
    // The default is the one current practice reaches for first.
    expect(commercialGrade('IPE', 'EU')?.gradeId).toBe('en-s355');
  });

  it('records the American channels and angles that were missing', () => {
    expect(commercialGrade('C', 'US')?.gradeId).toBe('astm-a36');
    expect(commercialGrade('MC', 'US')?.gradeId).toBe('astm-a36');
    expect(isUnusualPairing('C', 'astm-a572-50')).toBe(false);
  });

  it('keeps the local choice ordinary once a foreign one is recorded', () => {
    // An Argentine channel is rolled in F-24 like everything else Acindar
    // makes. Recording the American practice must not turn that into a
    // departure — which is exactly what happened when C and MC gained a US
    // entry with no AR entry beside it.
    expect(isUnusualPairing('C', 'iram-f24')).toBe(false);
    expect(isUnusualPairing('MC', 'iram-f24')).toBe(false);
  });

  it('records the Brazilian grades from NBR 7007, not only the ASTM ones', () => {
    expect(isUnusualPairing('W', 'nbr-ar350')).toBe(false);
    expect(isUnusualPairing('W', 'nbr-mr250')).toBe(false);
  });

  it('no design code offers a family whose ordinary grade it would then flag', () => {
    /*
     * The systematic version of the two false positives found by hand: adding
     * a foreign practice to a family silently turns the LOCAL practice into a
     * departure, because "unusual" means "in no list at all".
     *
     * So for every code, every family it offers, and every grade of that
     * code's own region: the pairing must not be flagged. A code that offers a
     * section and then objects to the steel it is made of is telling the user
     * off for following it.
     */
    const offenders: string[] = [];
    for (const code of DESIGN_CODES) {
      for (const family of code.families) {
        const local = commercialGradesForRegion(family, code.region as GradeRegion);
        if (local.length === 0) continue;   // nothing recorded: says nothing
        for (const pairing of local) {
          if (isUnusualPairing(family, pairing.gradeId) !== false) {
            offenders.push(`${code.label}: ${family} in ${pairing.gradeId}`);
          }
        }
      }
    }
    expect(offenders, `flagged its own practice:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('does not judge a region by another region’s record', () => {
    /*
     * The false positive region scoping fixed: once America recorded its tube
     * grades, a European tube in S235 — whose own product standards
     * (EN 10210/10219) are not in this file — was flagged as a departure, and
     * so were an American tee in A36 and a Brazilian M in MR-250. In each case
     * the grade's OWN region offers the family in its catalogue but records
     * nothing for it, and unknown is not unusual.
     */
    expect(isUnusualPairing('CHS', 'en-s235')).toBeNull();
    expect(isUnusualPairing('RHS', 'en-s355')).toBeNull();
    expect(isUnusualPairing('SHS', 'en-s235')).toBeNull();
    expect(isUnusualPairing('T', 'astm-a36')).toBeNull();
    expect(isUnusualPairing('M', 'nbr-mr250')).toBeNull();
  });

  it('flags a family the grade’s own region does not roll at all', () => {
    /*
     * The case region scoping alone went silent on: an IPN is a DIN/CIRSOC
     * series, recorded practice is Argentine F-24/F-26 and European EN 10025,
     * and America offers no IPN at all — it is not in the AISC list. So an
     * IPN in A992 is not "unknown in America", it is a departure from every
     * practice on record, and it is exactly the pairing the note exists for.
     */
    expect(isUnusualPairing('IPN', 'astm-a992')).toBe(true);
  });

  it('still flags a mismatch inside a region that HAS a record', () => {
    // Argentina rolls the wide-flange series in F-36, so an Argentine W in
    // F-24 is a special run there whatever other regions do. IPE records F-24
    // only, so F-26 on one is likewise a departure.
    expect(isUnusualPairing('W', 'iram-f24')).toBe(true);
    expect(isUnusualPairing('IPE', 'iram-f26')).toBe(true);
  });

  it('every source note it cites is translated in all three languages', () => {
    /*
     * These keys are asked for through a VARIABLE — `t(pairing.sourceKey)` —
     * which the Basic i18n coverage guard cannot see: it scans for literal
     * `t('...')` calls, by its own admission. That blind spot has already
     * shipped English text into a Spanish dialog once in this codebase, so the
     * keys that live in data get checked where the data is.
     */
    const missing: string[] = [];
    for (const family of ALL_FAMILIES_WITH_PAIRINGS) {
      for (const p of commercialGradesFor(family)) {
        for (const [loc, dict] of [['en', en], ['es', es], ['pt', pt]] as const) {
          const value = (dict as Record<string, string>)[p.sourceKey];
          if (!value || value === p.sourceKey) missing.push(`${loc}: ${p.sourceKey}`);
        }
      }
    }
    expect([...new Set(missing)], `untranslated source notes:\n${missing.join('\n')}`).toEqual([]);
  });

  it('every recorded pairing points at a grade that exists', () => {
    for (const family of ['IPN', 'UPN', 'IPE', 'HEA', 'HEB', 'T', 'L', 'W', 'HP', 'RHS', 'SHS', 'CHS']) {
      for (const p of commercialGradesFor(family)) {
        expect(gradeById(p.gradeId), `${family} → ${p.gradeId}`).toBeDefined();
        expect(p.sourceKey, `${family} → ${p.gradeId}`).toBeTruthy();
      }
    }
  });

  it('flags a departure from practice without flagging silence', () => {
    // An IPN in F-36 is buildable but not what is stocked.
    expect(isUnusualPairing('IPN', 'iram-f36')).toBe(true);
    expect(isUnusualPairing('IPN', 'iram-f24')).toBe(false);
    // A W in A992 is standard in the US even though Argentina rolls F-36 —
    // matching ANY recorded practice is enough, or the warning becomes noise.
    expect(isUnusualPairing('W', 'astm-a992')).toBe(false);
    expect(isUnusualPairing('W', 'astm-a572-50')).toBe(false);
  });

  it('says nothing where no practice is recorded, rather than warning', () => {
    /*
     * Silence is not the same as unusual. European structural hollow sections
     * are the remaining case: EN 10210/10219 are not in this file, so nothing
     * is recorded for a tube in Europe and nothing is claimed about one.
     */
    expect(isUnusualPairing('IPN', undefined)).toBeNull();
    expect(isUnusualPairing('nonesuch-family', 'iram-f24')).toBeNull();
  });
});

/**
 * Aluminium, audited against EN 1999-1-1, and the provenance field it produced.
 *
 * Eurocode 9's tables 3.2a/3.2b were only obtainable in part, so some tempers
 * were checked and some were not. Rather than delete the unchecked ones — they
 * are ordinary alloys carrying the usual values — or leave them looking as
 * settled as the rest, every grade now says which it is.
 */
describe('aluminium against Eurocode 9', () => {
  const g = (id: string) => {
    const found = gradeById(id);
    if (!found) throw new Error(`${id} missing`);
    return found;
  };

  it('5083-H111 extruded is 110/270, not the alloy’s typical 125/275', () => {
    // Characteristic values are guaranteed minima, so they sit BELOW the
    // typical figures quoted for an alloy. Taking one for the other is
    // unconservative, which is why this was worth checking.
    expect([g('alu-5083-h111').fy, g('alu-5083-h111').fu]).toEqual([110, 270]);
    expect(g('alu-5083-h111').verification).toBe('standard');
  });

  it('6060-T6 extruded is 140/170', () => {
    expect([g('alu-6060-t6').fy, g('alu-6060-t6').fu]).toEqual([140, 170]);
  });

  it('6082-T6 gets STRONGER with thickness — the one alloy that does', () => {
    // Eurocode 9's commentary flags this explicitly as not a misprint: a thin
    // extrusion develops a coarser grain and ends up slightly weaker.
    const s = g('alu-6082-t6');
    expect(strengthAtThickness(s, 3).fy).toBe(250);
    expect(strengthAtThickness(s, 10).fy).toBe(260);
    expect(strengthAtThickness(s, 10).fy).toBeGreaterThan(strengthAtThickness(s, 3).fy);
  });

  it('the thickness bands may rise, which the general band rule must allow', () => {
    // Every steel falls with thickness and a test asserts that. Aluminium 6082
    // is the exception, so the rule cannot be "bands never increase" globally.
    const rising = ALL_GRADES.filter((x) =>
      x.byThickness?.some((b, i, arr) => i > 0 && b.fy > arr[i - 1].fy));
    expect(rising.map((x) => x.id)).toEqual(['alu-6082-t6']);
  });

  it('keeps the modulus and density Eurocode 9 specifies', () => {
    for (const x of ALL_GRADES.filter((y) => y.family === 'aluminium')) {
      expect(x.e, x.designation).toBe(70000);
      expect(x.rho, x.designation).toBe(27.0);
    }
  });
});

describe('every grade declares whether it was checked against its standard', () => {
  it('says one or the other — never nothing', () => {
    const silent = ALL_GRADES.filter((g) => !g.verification);
    expect(silent.map((g) => g.id)).toEqual([]);
  });

  it('the audited steels are marked as read from the standard', () => {
    for (const id of ['iram-f24', 'en-s355', 'astm-a992', 'nbr-mr250', 'ss-1.4003']) {
      expect(gradeById(id)!.verification, id).toBe('standard');
    }
  });

  it('most of the table is verified, so the mark means something', () => {
    // If nearly everything were 'typical' the flag would be noise rather than
    // a signal.
    const verified = ALL_GRADES.filter((g) => g.verification === 'standard');
    expect(verified.length).toBeGreaterThan(20);
  });
});
