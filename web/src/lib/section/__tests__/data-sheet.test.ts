import { describe, it, expect } from 'vitest';
import { sectionDataSheet, hasValue } from '../data-sheet';
import { steelProfileSource } from '../../profiles/catalogue';
import { PROPERTY_ORDER } from '../../profiles/properties';

const byName = (name: string) => {
  const e = steelProfileSource.list({ text: name }).find((x) => x.name === name);
  if (!e) throw new Error(`no entry for ${name}`);
  return e;
};

describe('identity', () => {
  it('records the dimensional standard, not a design code', () => {
    const s = sectionDataSheet({ entry: byName('IPE 200') });
    expect(s.identity.designation).toBe('IPE 200');
    expect(s.identity.family).toBe('IPE');
    // EN 10365 is a dimensional standard. CIRSOC 301 is a design code and must not appear here.
    expect(s.identity.standard).toBe('EN 10365');
    expect(s.identity.standard).not.toMatch(/CIRSOC|Eurocode|AISC/);
    expect(s.identity.standardsBody).toBe('CEN');
    expect(s.identity.country).toBe('EU');
  });

  it('says whether the family is rolled or cold-formed', () => {
    expect(sectionDataSheet({ entry: byName('IPE 200') }).identity.material).toBe('hot-rolled-steel');
    // The IRAM structural tubes are cold-formed, and the catalogue says so.
    const tube = steelProfileSource.list({ families: ['RHS'] })[0];
    expect(sectionDataSheet({ entry: tube }).identity.material).toBe('cold-formed-steel');
  });
});

describe('rows', () => {
  it('carries every quantity the catalogue defines, in its order', () => {
    const s = sectionDataSheet({ entry: byName('IPE 200') });
    expect(s.rows.map((r) => r.key)).toEqual([...PROPERTY_ORDER]);
  });

  it('every row carries a basis, so no number is shown without its provenance', () => {
    for (const r of sectionDataSheet({ entry: byName('IPE 200') }).rows) {
      expect(r.quantity.basis).toBeTruthy();
    }
  });

  /*
   * The rule the whole provenance vocabulary exists for: an unavailable quantity is null, never
   * a zero. A zero torsional constant is not a small torsional constant, it is no answer.
   */
  it('an unavailable quantity is null and never zero', () => {
    for (const name of ['IPE 200', 'UPN 100', 'L 50x50x5']) {
      for (const r of sectionDataSheet({ entry: byName(name) }).rows) {
        if (r.quantity.basis === 'unavailable') expect(r.quantity.value).toBeNull();
        else expect(r.quantity.value).not.toBeNull();
      }
    }
  });

  it('groups the unavailable ones so a sheet need not show thirteen dashes', () => {
    const s = sectionDataSheet({ entry: byName('IPE 200') });
    expect(s.unavailable.every((r) => r.quantity.basis === 'unavailable')).toBe(true);
    expect(s.unavailable.length).toBe(s.rows.filter((r) => !hasValue(r.quantity)).length);
  });
});

describe('centroid', () => {
  /*
   * Null without geometry, and this is the point of the field rather than a limitation of it.
   * `h/2` is the centroid only for a doubly symmetric section, and the sections whose centroid
   * anyone looks up — channels, angles — are exactly the ones where it is not.
   */
  it('is null when no canonical geometry is supplied', () => {
    expect(sectionDataSheet({ entry: byName('UPN 100') }).centroid).toBeNull();
  });

  it('is reported when it is', () => {
    const s = sectionDataSheet({ entry: byName('UPN 100'), canonical: { yc: 0.0152, zc: 0.05 } });
    expect(s.centroid).toEqual({ yM: 0.0152, zM: 0.05 });
  });
});

describe('the cold-formed block', () => {
  it('is absent for a rolled profile, with the reason "does not apply"', () => {
    const cf = sectionDataSheet({ entry: byName('IPE 200') }).coldFormed;
    expect(cf.present).toBe(false);
    expect(cf.present === false && cf.reasonKey).toBe('section.sheet.coldFormed.notApplicable');
  });

  /*
   * A tube IS cold-formed, and it still has no block — because the block describes a folded
   * lipped section, and no C/Z series is sourced. Two different absences, and collapsing them
   * into one "not available" would tell a user their tube is missing data it never had.
   */
  it('distinguishes "does not apply" from "not catalogued"', () => {
    const tube = steelProfileSource.list({ families: ['RHS'] })[0];
    const cf = sectionDataSheet({ entry: tube }).coldFormed;
    expect(cf.present === false && cf.reasonKey).toBe('section.sheet.coldFormed.notCatalogued');
  });

  it('is present, with its provenance, when a cold-formed entry is supplied', () => {
    const cf = sectionDataSheet({
      entry: byName('IPE 200'),
      coldFormed: {
        id: 'CFZ 200x60x20x2', family: 'CFZ', shape: 'Z', spec: {} as never,
        heightMm: 200, widthMm: 60, thicknessMm: 2,
        areaCm2: 7.5, iyCm4: 480, izCm4: 40, ixyCm4: 95, jCm4: 0.1,
        massKgPerM: 5.9, principalAngleDeg: 11.4,
      },
    }).coldFormed;
    expect(cf.present).toBe(true);
    if (!cf.present) throw new Error('unreachable');
    expect(cf.thicknessMm).toBe(2);
    // The zed facts the rest of the app has nowhere to store, surfaced here rather than lost.
    expect(cf.ixyCm4).toBe(95);
    expect(cf.principalAngleDeg).toBeCloseTo(11.4, 6);
    // One word for the whole block: every quantity on a cold-formed entry is derived.
    expect(cf.basis).toBe('derivedFromGeometry');
  });
});

describe('limitations', () => {
  it('are i18n keys, never prose', () => {
    for (const name of ['IPE 200', 'W 200x35.9', 'UPN 100']) {
      let s;
      try { s = sectionDataSheet({ entry: byName(name) }); } catch { continue; }
      for (const l of s.limitations) {
        expect(l.key).toMatch(/^[a-z][A-Za-z0-9.]+$/);
        expect(l.key).not.toMatch(/\s/);
      }
    }
  });

  /*
   * The nominal-dimensions families are the ones whose source table marks its dimensions
   * nominal and derives the area from nominal mass, so the outline is the right shape without
   * reproducing the published numbers. That is a fact about the whole section and belongs at
   * the top of the sheet, not inside one row.
   */
  it('name the nominal-dimensions caveat as a geometry limitation', () => {
    const wf = steelProfileSource.list({ families: ['W'] })[0];
    const s = sectionDataSheet({ entry: wf });
    const geo = s.limitations.filter((l) => l.kind === 'geometry').map((l) => l.key);
    expect(geo).toContain('section.sheet.limit.nominalDimensions');
  });

  it('an exact family carries no geometry limitation', () => {
    const s = sectionDataSheet({ entry: byName('IPE 200') });
    expect(s.limitations.filter((l) => l.kind === 'geometry')).toHaveLength(0);
  });
});
