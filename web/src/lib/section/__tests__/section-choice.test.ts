import { describe, it, expect } from 'vitest';
import { toSectionFields, isStandard, type SectionChoice } from '../section-choice';
import { defaultProfileSpec } from '../profile-spec';
import { FAMILY_LIST, PROFILE_FAMILIES } from '../../data/steel-profiles';
import { composeBuiltUp } from '../../engine/generators/built-up-section';
import { resolveProfile } from '../../engine/generators/profile-resolve';

const std = (spec = defaultProfileSpec('IPE 200')): SectionChoice => ({ kind: 'standard', spec });

describe('a catalogue choice', () => {
  it('carries the properties a Section requires', () => {
    const f = toSectionFields(std(), 0)!;
    // `Section` has `a` and `iz` as required fields. A row without them is reported by the
    // canonical resolver as having no known geometry, which reads as "amorphous" for what the
    // user just picked out of a list.
    expect(f.a).toBeGreaterThan(0);
    expect(f.iz).toBeGreaterThan(0);
    expect(f.iy).toBeGreaterThan(0);
    expect(f.b).toBeGreaterThan(0);
    expect(f.h).toBeGreaterThan(0);
  });

  it('takes them from composeBuiltUp rather than recomputing them', () => {
    const spec = { ...defaultProfileSpec('L 50x50x5'), arrangement: 'doubleBack' as const, gapMm: 10 };
    const f = toSectionFields({ kind: 'standard', spec }, 0)!;
    const built = composeBuiltUp(resolveProfile('L 50x50x5')!.profile, 'doubleBack', 0.010);
    expect(f.a).toBeCloseTo(built.a, 12);
    expect(f.iy).toBeCloseTo(built.iy, 12);
    expect(f.iz).toBeCloseTo(built.iz, 12);
    expect(f.name).toBe(built.name);
  });

  it('records the composition, so the make-up is data and not a string', () => {
    const spec = { ...defaultProfileSpec('L 50x50x5'), arrangement: 'doubleBack' as const, gapMm: 10 };
    const f = toSectionFields({ kind: 'standard', spec }, 0)!;
    expect(f.composition).toEqual({ profileName: 'L 50x50x5', arrangement: 'doubleBack', gapMm: 10 });
    expect(f.profileFamily).toBe('L');
  });

  /*
   * `shape` for a single profile only. `resolveCanonicalSection` switches on it, and for a
   * compound section that would rebuild ONE part's outline and replace the assembly's composed
   * A, Iy and Iz — the solver would analyse a double-channel member as one channel.
   */
  it('sets shape for a single profile and withholds it for an assembly', () => {
    expect(toSectionFields(std(), 0)!.shape).toBe('I');
    const spec = { ...defaultProfileSpec('L 50x50x5'), arrangement: 'quadBox' as const, gapMm: 8 };
    expect(toSectionFields({ kind: 'standard', spec }, 0)!.shape).toBeUndefined();
  });

  /*
   * A closed arrangement reports no torsional constant, and the field is simply absent rather
   * than zero. Zero is not a small J; it is no answer, and a solver reading it as a number
   * would treat a box column as having no torsional stiffness at all.
   */
  it('omits J entirely when the arrangement encloses a cell', () => {
    const spec = { ...defaultProfileSpec('UPN 100'), arrangement: 'quadBox' as const, gapMm: 8 };
    const f = toSectionFields({ kind: 'standard', spec }, 0)!;
    expect('j' in f).toBe(false);
  });

  it('returns null for a name the catalogue does not know', () => {
    expect(toSectionFields({ kind: 'standard', spec: defaultProfileSpec('IPE 999') }, 0)).toBeNull();
  });

  it('resolves auto rotation against the angle the caller supplies', () => {
    expect(toSectionFields(std(), 0)!.rotation).toBe(0);
    expect(toSectionFields(std(), 11.3)!.rotation).toBeCloseTo(11.3, 9);
    const fixed = { ...defaultProfileSpec('IPE 200'), rotationDeg: 90 };
    expect(toSectionFields({ kind: 'standard', spec: fixed }, 11.3)!.rotation).toBe(90);
  });
});

describe('a built choice', () => {
  const built: SectionChoice = {
    kind: 'built', name: 'Rect 200x300', shapeType: 'rect',
    params: { b: 0.2, h: 0.3 },
    props: { a: 0.06, iy: 4.5e-4, iz: 2.0e-4, j: 1.0e-4, b: 0.2, h: 0.3, shape: 'rect' },
    rotationDeg: 'auto',
  };

  it('records the template and the numbers typed into it', () => {
    const f = toSectionFields(built, 0)!;
    // Without this a built section cannot be edited: reopening a project, the only way to
    // change a thickness was to delete it and retype everything.
    expect(f.built).toEqual({ shapeType: 'rect', params: { b: 0.2, h: 0.3 } });
  });

  it('carries the properties the template produced, unchanged', () => {
    const f = toSectionFields(built, 0)!;
    expect(f.a).toBe(0.06);
    expect(f.iy).toBe(4.5e-4);
    expect(f.iz).toBe(2.0e-4);
    expect(f.j).toBe(1.0e-4);
    expect(f.shape).toBe('rect');
  });

  it('has no composition: there is no catalogue part to name', () => {
    expect(toSectionFields(built, 0)!.composition).toBeUndefined();
  });

  /*
   * The four thicknesses, which this branch used to drop.
   *
   * `computeSectionProperties` returns `tw`, `tf`, `t` and `tl`; the built branch copied `a`,
   * `iy`, `iz`, `j`, `b`, `h` and `shape` and stopped. For a section with no catalogue entry
   * those four ARE the outline: `resolveCanonicalSection` switches on `shape` and calls
   * `need('b','h','tw','tf')`, so a lipped channel built through the modal came back
   * `properties-only` with `missing: ['tw','tf']` — undrawn, unextruded, and invisible to every
   * clause helper that dispatches on shape. The effect is asserted in
   * `built-section-contract.test.ts`; this pins the record itself.
   */
  it('carries the wall thicknesses, which the outline is made of', () => {
    const c: SectionChoice = {
      kind: 'built', name: 'C 200', shapeType: 'C-custom',
      params: { h: 0.2, b: 0.075, tw: 0.006, tf: 0.009, tl: 0.004 },
      props: {
        a: 3e-3, iy: 1e-5, iz: 1e-6, b: 0.075, h: 0.2, shape: 'C',
        tw: 0.006, tf: 0.009, tl: 0.004,
      },
      rotationDeg: 'auto',
    };
    const f = toSectionFields(c, 0)!;
    expect(f.tw).toBe(0.006);
    expect(f.tf).toBe(0.009);
    // The lip is its own input: `createSectionShape` substitutes the FLANGE when it is absent,
    // so a dropped `tl` draws a different section from the one whose properties were computed.
    expect(f.tl).toBe(0.004);
  });

  /*
   * And absent stays absent. A rectangle has no wall, and writing `tw: undefined` onto the
   * section would be a key that reads as a dimension nobody set rather than one that does not
   * apply — `need()` treats both as missing, but the record should not claim the question was
   * asked.
   */
  it('writes no thickness for a shape that has none', () => {
    const f = toSectionFields(built, 0)!;
    for (const k of ['tw', 'tf', 't', 'tl'] as const) expect(k in f).toBe(false);
  });
});

/**
 * The surviving path can still create everything the removed one could.
 *
 * `ProSectionsTab` used to add a section by calling `modelStore.addSection` from an inline
 * table row; that path is gone and `toSectionFields` is the only one left. Fifteen families is
 * not a number to take on trust after a deletion, so it is read from the catalogue and walked —
 * a family that stopped resolving, or a sixteenth that appeared, fails here.
 */
describe('every family the catalogue publishes', () => {
  it('resolves to a section with an area, through the one remaining path', () => {
    expect(FAMILY_LIST).toHaveLength(15);
    for (const family of FAMILY_LIST) {
      const rows = PROFILE_FAMILIES[family];
      expect(rows?.length, `${family} has rows`).toBeGreaterThan(0);
      // The middle of the family, so the test is not pinned to whichever row happens to be first.
      const rep = rows![Math.floor(rows!.length / 2)];
      const f = toSectionFields({ kind: 'standard', spec: defaultProfileSpec(rep.name) }, 0);
      expect(f, `${family}: ${rep.name} resolves`).not.toBeNull();
      expect(f!.a, `${family}: ${rep.name} has an area`).toBeGreaterThan(0);
      // Provenance: the family travels with the section, which the inline row never wrote.
      expect(f!.profileFamily, `${family}: ${rep.name} names its family`).toBe(family);
    }
  });
});

describe('isStandard', () => {
  it('separates the two kinds', () => {
    expect(isStandard(std())).toBe(true);
    expect(isStandard({
      kind: 'built', name: 'x', shapeType: 'rect', params: {},
      props: { a: 1, iy: 1, iz: 1, shape: 'rect' }, rotationDeg: 0,
    })).toBe(false);
  });
});
