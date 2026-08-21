/**
 * The grade source: query, group, and the authority attached to every number.
 *
 * These are the assertions the PRO picker rests on, kept out of the component so a UI change
 * never has to re-prove that a filter works — only that it is wired.
 */

import { describe, it, expect } from 'vitest';
import {
  GRADE_BASES, GRADE_FAMILIES, GRADE_PROPERTY_ORDER,
  bandTable, gradePropertyRows, groupByFamily, pairing, populatedRegions,
  queryGrades, structuralGradeSource,
} from '../catalogue';
import { ALL_GRADES, BASIC_REGIONS, gradesForCode, MATERIAL_DESIGN_CODES } from '../../data/structural-grades';

describe('the source covers what the tables hold', () => {
  it('lists every grade, once', () => {
    const all = queryGrades();
    expect(all.length).toBe(ALL_GRADES.length);
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
  });

  it('resolves by the id the model stores, and nothing else', () => {
    // `Material.gradeId` holds this. A second identifier would be a second way to name a steel.
    for (const g of ALL_GRADES) {
      expect(structuralGradeSource.byId(g.id)?.designation, g.id).toBe(g.designation);
    }
    expect(structuralGradeSource.byId('S355')).toBeNull();   // a designation is not an id
  });

  it('carries the product standard and the band standard as separate fields', () => {
    // The distinction the whole data module is built around: the bands are a design code's
    // table, and collapsing the two would attribute them to the mill's standard.
    const s355 = structuralGradeSource.byId('en-s355')!;
    expect(s355.productStandard).toBe('EN 10025-2');
    expect(s355.bandStandard).toBe('EN 1993-1-1 t.3.1');
    expect(s355.bandStandard).not.toBe(s355.productStandard);
  });
});

describe('the filters', () => {
  it('narrows by family, and groups in the order a drawing specifies', () => {
    const cold = queryGrades({ families: ['cold-formed'] });
    expect(cold.length).toBeGreaterThan(0);
    for (const e of cold) expect(e.family).toBe('cold-formed');

    const groups = groupByFamily(queryGrades());
    expect(groups.map((g) => g.key)).toEqual(
      GRADE_FAMILIES.filter((f) => queryGrades({ families: [f] }).length > 0),
    );
    expect(groups[0].key).toBe('hot-rolled');
  });

  it('narrows by region, and only reports regions it has grades for', () => {
    const ar = queryGrades({ regions: ['AR'] });
    expect(ar.length).toBeGreaterThan(0);
    for (const e of ar) expect(e.region).toBe('AR');

    // The data module says plainly that no Australian, Indian or South African GRADES are
    // loaded yet even though codes for them are. The picker must not offer an empty chip.
    const regions = populatedRegions();
    for (const r of regions) expect(queryGrades({ regions: [r] }).length).toBeGreaterThan(0);
    expect(regions).not.toContain('AU');
  });

  it('searches designation, standard and note together', () => {
    // "EN 10025" is how someone working to Eurocode finds the grades it is written around,
    // and it appears in no designation.
    const byStandard = queryGrades({ text: 'EN 10025' });
    expect(byStandard.length).toBeGreaterThan(0);
    expect(byStandard.every((e) => e.productStandard.includes('EN 10025'))).toBe(true);

    expect(queryGrades({ text: 'f-24' }).map((e) => e.id)).toContain('iram-f24');
    expect(queryGrades({ text: 'zzz' })).toEqual([]);
  });

  it('applies the code filter through the data module, not a copy of its rule', () => {
    const code = MATERIAL_DESIGN_CODES.find((c) => c.id === 'en-1993-1-1')!;
    const expected = new Set(gradesForCode(code, 'hot-rolled').map((g) => g.id));
    const got = queryGrades({ families: ['hot-rolled'], designCodeId: 'en-1993-1-1' });
    expect(new Set(got.map((e) => e.id))).toEqual(expected);
  });

  it('ignores a code filter when the family is ambiguous rather than guessing', () => {
    // A design code covers exactly one family. With two families selected the control has no
    // single meaning, so it does nothing — and does nothing visibly, because the panel says so.
    const two = queryGrades({ families: ['hot-rolled', 'aluminium'], designCodeId: 'en-1993-1-1' });
    expect(two.some((e) => e.family === 'aluminium')).toBe(true);
    expect(two.length).toBe(queryGrades({ families: ['hot-rolled', 'aluminium'] }).length);
  });

  it('offers every region by default, and the Basic four when asked', () => {
    // PRO is the default here, which is the opposite of `gradesForMode`'s default and is why
    // the flag is named for what it restricts to.
    const pro = queryGrades();
    const basic = queryGrades({ basicRegionsOnly: true });
    expect(basic.length).toBeLessThanOrEqual(pro.length);
    for (const e of basic) expect(BASIC_REGIONS).toContain(e.region);
  });

  it('composes filters instead of letting the last one win', () => {
    const both = queryGrades({ families: ['hot-rolled'], regions: ['US'], text: 'a572' });
    expect(both.length).toBeGreaterThan(0);
    for (const e of both) {
      expect(e.family).toBe('hot-rolled');
      expect(e.region).toBe('US');
      expect(e.designation.toLowerCase()).toContain('a572');
    }
  });
});

describe('the card, and the authority behind each number', () => {
  it('lists the rows in the declared order, with a label key each', () => {
    const rows = gradePropertyRows(structuralGradeSource.byId('iram-f24')!);
    expect(rows.map((r) => r.key)).toEqual([...GRADE_PROPERTY_ORDER]);
    for (const r of rows) expect(r.labelKey).toBe(`steel.grades.label.${r.key}`);
  });

  it('marks a strength carried from general knowledge as typical, not as published', () => {
    // 45 of 68 grades are marked `typical` in the source and the reason is recorded there. A
    // card that showed them like the rest would present them as equally settled.
    const typical = structuralGradeSource.byId('astm-a529-50')!;
    expect(typical.verification).toBe('typical');
    const rows = gradePropertyRows(typical);
    expect(rows.find((r) => r.key === 'fy')!.quantity.basis).toBe('typicalValue');
    expect(rows.find((r) => r.key === 'fu')!.quantity.basis).toBe('typicalValue');
    // The elastic constants are the alloy's and come from the standard the grade is published
    // under, so the mark does not spread to them.
    expect(rows.find((r) => r.key === 'e')!.quantity.basis).toBe('productStandard');
  });

  it('derives the shear modulus and says that it derived it', () => {
    const s355 = structuralGradeSource.byId('en-s355')!;
    const g = gradePropertyRows(s355).find((r) => r.key === 'g')!;
    // G = E / 2(1+nu) = 210000 / 2.6 = 80769 MPa, which is the 81 000 CIRSOC 301 chapter 2
    // quotes for these steels — an independent confirmation that the identity is the right one.
    expect(g.quantity.value!).toBeCloseTo(80769, 0);
    expect(g.quantity.basis).toBe('derived');
    expect(g.quantity.noteKey).toBe('steel.grades.note.shearModulusDerived');
  });

  it('says that a banded grade’s headline fy is the first band', () => {
    const s355 = gradePropertyRows(structuralGradeSource.byId('en-s355')!);
    expect(s355.find((r) => r.key === 'fy')!.quantity.noteKey).toBe('steel.grades.note.firstBand');
    // And says nothing of the kind for a grade whose source quotes one value.
    const a36 = gradePropertyRows(structuralGradeSource.byId('astm-a36')!);
    expect(a36.find((r) => r.key === 'fy')!.quantity.noteKey).toBeUndefined();
  });

  it('keeps every basis inside the declared set, on every grade', () => {
    for (const e of queryGrades()) {
      for (const row of gradePropertyRows(e)) {
        expect(GRADE_BASES, `${e.id}.${row.key}`).toContain(row.quantity.basis);
        // Nothing in the catalogue is unavailable today, and a zero would be a false value.
        expect(row.quantity.value, `${e.id}.${row.key}`).not.toBeNull();
        expect(row.quantity.value!, `${e.id}.${row.key}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('the thickness bands', () => {
  it('returns the rows with the standard that tabulated them', () => {
    const table = bandTable(structuralGradeSource.byId('en-s355')!)!;
    expect(table.standard).toBe('EN 1993-1-1 t.3.1');
    expect(table.rows.length).toBe(2);
    // The safety-relevant fact: yield falls with thickness, so the second band is lower.
    expect(table.rows[1].fy).toBeLessThan(table.rows[0].fy);
  });

  it('reports null where the source quotes a single value', () => {
    expect(bandTable(structuralGradeSource.byId('astm-a36')!)).toBeNull();
  });

  it('never invents a source for the bands it does return', () => {
    for (const e of queryGrades()) {
      const table = bandTable(e);
      if (!table) continue;
      expect(table.standard, e.id).toBeTruthy();
      expect(table.standard, e.id).not.toBe(e.productStandard);
    }
  });

  it('carries the one grade that gets STRONGER with thickness without smoothing it', () => {
    // 6082-T6 runs the other way from every other alloy here, and Eurocode 9 flags it as not a
    // misprint. A band table that assumed a direction would have to lie about this one.
    const table = bandTable(structuralGradeSource.byId('alu-6082-t6')!)!;
    expect(table.rows[table.rows.length - 1].fy).toBeGreaterThan(table.rows[0].fy);
  });
});

describe('the pairing verdict', () => {
  it('calls an ordinary combination ordinary', () => {
    // Acindar rolls IPN in F-24; that is what the family is supplied in.
    expect(pairing('IPN', 'iram-f24').verdict).toBe('ordinary');
    // And a mill selling across borders is still ordinary: Gerdau quotes perfis W in A572.
    expect(pairing('W', 'astm-a572-50').verdict).toBe('ordinary');
  });

  it('flags a combination that departs from every recorded practice', () => {
    // A992 is specified for W shapes. An IPN is a DIN/CIRSOC series that America does not roll
    // at all, so the pairing departs from every practice on record.
    const p = pairing('IPN', 'astm-a992');
    expect(p.verdict).toBe('unusual');
    expect(p.noteKey).toBe('steel.grades.pairing.unusual');
  });

  it('says nothing where nothing is recorded', () => {
    // Europe's tubes: EN 10210/10219 are not in the file, and unknown is not unusual.
    expect(pairing('RHS', 'en-s235').verdict).toBe('notRecorded');
    expect(pairing('IPN', undefined).verdict).toBe('notRecorded');
    expect(pairing('IPN', 'no-such-grade').verdict).toBe('notRecorded');
  });

  it('always hands the component a note key, so null never reaches the UI', () => {
    for (const family of ['IPN', 'W', 'RHS', 'MC', 'T']) {
      for (const id of ['iram-f24', 'astm-a992', 'en-s235', undefined]) {
        expect(pairing(family, id).noteKey).toBeTruthy();
      }
    }
  });
});
