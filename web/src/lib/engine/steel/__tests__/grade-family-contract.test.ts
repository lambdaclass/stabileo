/**
 * The contract of `catalogueGradeFamily`, on its own.
 *
 * ── Why this file exists separately from M1's ──────────────────────
 *
 * M1's `grade-family.test.ts` asserts the same contract AND the consequences it has for the
 * metallic inventory — the notice, the `nonFerrousOnly` empty reason, the warning that
 * disappears once a grade is declared. Those depend on M1's own changes to `steel-inventory.ts`,
 * so that file cannot travel on its own.
 *
 * This one depends on nothing but the module under test, the catalogue it reads and
 * `material-family.ts`, all three of which exist unchanged on the base both branches share. So
 * this commit is takeable by itself: one new module, one new test, no edits to anything.
 *
 * What it pins is exactly what the consumer needs to trust:
 *
 *   · the lookup answers for every id the catalogue holds, and never with `unknown`;
 *   · `null` means "this catalogue cannot answer", not "unknown family", so the caller falls
 *     back rather than reporting a material with a plain strength as unclassifiable;
 *   · a declared grade wins over the magnitude of `fy`, with no caveat;
 *   · a MISSING or UNRECOGNISED `gradeId` changes nothing — which is what makes passing the
 *     lookup additive rather than a migration.
 *
 * Pure: no store, no runes, no i18n.
 */

import { describe, it, expect } from 'vitest';
import { catalogueGradeFamily } from '../grade-family';
import { isInferred, materialFamilyOf } from '../material-family';
import { ALL_GRADES } from '../../../data/structural-grades';
import { CONCRETE, TIMBER } from '../../../data/non-metal-grades';

describe('catalogueGradeFamily — the lookup itself', () => {
  it('answers for every grade the catalogue holds, and never with unknown', () => {
    for (const g of ALL_GRADES) {
      const family = catalogueGradeFamily(g.id);
      expect(family, g.id).not.toBeNull();
      expect(family, g.id).not.toBe('unknown');
    }
    for (const c of CONCRETE) expect(catalogueGradeFamily(c.id), c.id).toBe('concrete');
    for (const w of TIMBER) expect(catalogueGradeFamily(w.id), w.id).toBe('timber');
  });

  it('maps the metal families the way the consumer expects', () => {
    expect(catalogueGradeFamily('iram-f24')).toBe('steel');        // hot-rolled
    expect(catalogueGradeFamily('en-s355')).toBe('steel');          // hot-rolled
    expect(catalogueGradeFamily('astm-a653-50')).toBe('steel');     // cold-formed
    expect(catalogueGradeFamily('ss-1.4301')).toBe('steel');        // stainless — ferrous
    expect(catalogueGradeFamily('alu-6082-t6')).toBe('aluminium');
  });

  it('returns null — not a family — for an id it does not know', () => {
    // The load-bearing part of the return type. `null` says "this catalogue cannot answer", so
    // the caller falls back to whatever it had.
    expect(catalogueGradeFamily('withdrawn-grade-1957')).toBeNull();
    expect(catalogueGradeFamily('')).toBeNull();
    expect(catalogueGradeFamily('design.floor.state.notRun')).toBeNull();
  });

  it('does not normalise its input, because an id is an id', () => {
    // Stated so a caller does not expect trimming or case-folding that is not there.
    expect(catalogueGradeFamily(' iram-f24')).toBeNull();
    expect(catalogueGradeFamily('IRAM-F24')).toBeNull();
  });
});

describe('what the lookup does to a family verdict', () => {
  it('lets a declared grade win over the magnitude, with no caveat', () => {
    const material = { fy: 240, gradeId: 'iram-f24' };

    const guessed = materialFamilyOf(material);
    expect(guessed.basis).toBe('inferredFromFy');
    expect(isInferred(guessed)).toBe(true);

    const read = materialFamilyOf(material, catalogueGradeFamily);
    expect(read.family).toBe('steel');
    expect(read.basis).toBe('declaredGrade');
    expect(read.caveatKey).toBeUndefined();
    expect(isInferred(read)).toBe(false);
  });

  it('separates aluminium from steel, which no strength threshold can', () => {
    const alu = { fy: 250, gradeId: 'alu-6082-t6' };
    expect(materialFamilyOf(alu).family).toBe('steel');
    expect(materialFamilyOf(alu, catalogueGradeFamily).family).toBe('aluminium');
  });

  it('classifies a timber class as timber, which is the case that matters', () => {
    /*
     * The reason this contract is worth taking. EN 338 runs C16 to D60, so every class sits at or
     * under the 80 MPa ceiling that separates concrete from metal by magnitude. Without the
     * lookup a C24 reads as 24 MPa concrete; with it, it reads as what it is.
     */
    for (const w of TIMBER) {
      expect(materialFamilyOf({ fy: w.fmk }).family, w.designation).toBe('concrete');
      expect(materialFamilyOf({ fy: w.fmk, gradeId: w.id }, catalogueGradeFamily).family, w.designation)
        .toBe('timber');
    }
  });

  it('keeps a declared concrete exactly where it was', () => {
    const v = materialFamilyOf({ fy: 25, gradeId: 'cirsoc-h25' }, catalogueGradeFamily);
    expect(v.family).toBe('concrete');
    expect(v.basis).toBe('declaredGrade');
  });
});

describe('the fallback — why passing the lookup is additive', () => {
  it('changes nothing for a material with no gradeId', () => {
    // Every project saved before the picker carried the field. This is the assertion that says
    // wiring the lookup is not a migration.
    for (const fy of [20, 25, 30, 50, 80, 130, 240, 355]) {
      const without = materialFamilyOf({ fy });
      const with_ = materialFamilyOf({ fy }, catalogueGradeFamily);
      expect(with_.family, `fy=${fy}`).toBe(without.family);
      expect(with_.basis, `fy=${fy}`).toBe(without.basis);
      expect(with_.caveatKey, `fy=${fy}`).toBe(without.caveatKey);
    }
  });

  it('changes nothing for a gradeId the catalogue no longer knows', () => {
    // A withdrawn grade must not make a member unclassifiable.
    const stale = { fy: 25, gradeId: 'withdrawn-grade-1957' };
    expect(materialFamilyOf(stale, catalogueGradeFamily).family).toBe('concrete');
    expect(materialFamilyOf(stale, catalogueGradeFamily).basis).toBe('inferredFromFy');
  });

  it('still refuses to classify a material with no strength and no grade', () => {
    for (const m of [{}, { fy: 0 }, { fy: -5 }, { fy: NaN }]) {
      const v = materialFamilyOf(m, catalogueGradeFamily);
      expect(v.family).toBe('unknown');
      expect(v.basis).toBe('noData');
      expect(v.caveatKey).toBeTruthy();
    }
    expect(materialFamilyOf(undefined, catalogueGradeFamily).family).toBe('unknown');
    expect(materialFamilyOf(null, catalogueGradeFamily).family).toBe('unknown');
  });

  it('is a pure function of its arguments — no store, no order dependence', () => {
    // Called twice in either order, the answers are the same. Worth pinning because the consumer
    // will call it inside a loop over a model.
    const a = materialFamilyOf({ fy: 240, gradeId: 'iram-f24' }, catalogueGradeFamily);
    const b = materialFamilyOf({ fy: 25 }, catalogueGradeFamily);
    const a2 = materialFamilyOf({ fy: 240, gradeId: 'iram-f24' }, catalogueGradeFamily);
    expect(a2).toEqual(a);
    expect(b.family).toBe('concrete');
  });
});
