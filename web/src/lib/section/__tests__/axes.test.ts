/**
 * Presence AND absence, because a warning that fires on everything informs nobody.
 *
 * The rule is one line of data — a shape maps to a symmetry — so the interesting assertions are
 * not about the arithmetic. They are about coverage and about the two ways this can rot:
 *
 *   · a shape added later that nobody classifies, silently defaulting to «do not warn». The
 *     `Record<Shape, …>` makes that a COMPILE error; the first test below makes it a test failure
 *     too, so it fails even for a reader who only runs the suite.
 *   · the notice creeping onto symmetric sections, which would train users to ignore it.
 *
 * Also asserted here rather than in a component: that `generic` does NOT warn and is NOT called
 * symmetric. A properties-only section has no outline, so its symmetry is not a fact the app has,
 * and claiming either way would be a guess.
 */

import { describe, it, expect } from 'vitest';
import {
  axesSymmetryOf, warnsAboutAxes, axesNoticeKeyFor, KNOWN_SHAPES, type AxesSymmetry,
} from '../axes';
import { ALL_PROFILES, familyToShape } from '../../data/steel-profiles';
import es from '../../i18n/locales/steel/es';
import en from '../../i18n/locales/steel/en';
import pt from '../../i18n/locales/steel/pt';

/**
 * The decision for every shape, written out independently of the module.
 *
 * Duplicated on purpose: a test that imported the same table it checks would assert nothing. This
 * is a second opinion, and the reasoning for each is in the module.
 */
const EXPECTED: Record<string, AxesSymmetry> = {
  I: 'principal', H: 'principal', RHS: 'principal', CHS: 'principal', rect: 'principal',
  U: 'principal', C: 'principal', T: 'principal',
  L: 'notPrincipal', invL: 'notPrincipal', Z: 'notPrincipal',
  generic: 'unknown',
};

describe('every shape is classified, and none is missed', () => {
  it('covers exactly the shapes the model can store', () => {
    // If a literal is added to `Section['shape']` and not classified, the module stops compiling.
    // This is the runtime half of the same guard.
    expect([...KNOWN_SHAPES].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it('agrees with the second opinion on all twelve', () => {
    for (const shape of KNOWN_SHAPES) {
      expect(axesSymmetryOf(shape), shape).toBe(EXPECTED[shape]);
    }
  });

  it('treats a section with no shape at all as unknown', () => {
    // Properties-only, same as `generic`: no geometry to reason from.
    expect(axesSymmetryOf(undefined)).toBe('unknown');
    expect(warnsAboutAxes(undefined)).toBe(false);
  });
});

describe('it warns on the unsymmetric shapes', () => {
  it('warns on both angles and on the zed', () => {
    for (const shape of ['L', 'invL', 'Z'] as const) {
      expect(warnsAboutAxes(shape), shape).toBe(true);
      expect(axesNoticeKeyFor(shape), shape).toBeTruthy();
    }
  });

  it('and gives the zed its own sentence, because its caveat is different', () => {
    /*
     * An angle has no escape: its axes are rotated and that is that. A sheeted purlin usually
     * does — and the provision that says when the restraint counts is in the code the app lacks.
     * One sentence covering both would have to be vague enough to be useless.
     */
    expect(axesNoticeKeyFor('Z')).toBe('section.axes.notPrincipal.zed');
    expect(axesNoticeKeyFor('L')).toBe('section.axes.notPrincipal.angle');
    expect(axesNoticeKeyFor('invL')).toBe('section.axes.notPrincipal.angle');
  });
});

describe('it stays quiet everywhere else', () => {
  it('does not warn on any symmetric shape', () => {
    // The half that keeps the notice meaningful. One axis of symmetry is enough — a channel and a
    // tee are as principal as an I-beam.
    for (const shape of ['I', 'H', 'RHS', 'CHS', 'rect', 'U', 'C', 'T'] as const) {
      expect(warnsAboutAxes(shape), shape).toBe(false);
      expect(axesNoticeKeyFor(shape), shape).toBeNull();
    }
  });

  it('does not warn on `generic`, and does not call it symmetric either', () => {
    // Both halves matter: no warning (it would be a guess) and no claim of symmetry (also a
    // guess). That is what `unknown` is for.
    expect(warnsAboutAxes('generic')).toBe(false);
    expect(axesSymmetryOf('generic')).toBe('unknown');
    expect(axesSymmetryOf('generic')).not.toBe('principal');
  });
});

describe('against the real catalogue', () => {
  /** Every catalogued profile, with the shape the catalogue gives it. */
  const shaped = ALL_PROFILES.map((p) => ({ name: p.name, shape: familyToShape(p.family) }));

  it('warns on every catalogued angle, and there are 37 of them', () => {
    /*
     * The count is asserted, not just the predicate: this is the population the warning exists
     * for, and «it warns on angles» would still pass if the family were emptied to one row.
     *
     * 10 European in `steel-profiles.ts` plus 27 IRAM-IAS U 500-558 in `iram-angles.ts`.
     */
    const angles = shaped.filter((p) => p.shape === 'L');
    expect(angles).toHaveLength(37);
    for (const p of angles) expect(warnsAboutAxes(p.shape), p.name).toBe(true);
  });

  it('warns on nothing else in the catalogue', () => {
    // Every other family — IPE, IPN, HEB, HEA, UPN, W, HP, M, C, MC, T, RHS, SHS, CHS — has an
    // axis of symmetry, so the notice must not appear on any of them.
    const warned = shaped.filter((p) => warnsAboutAxes(p.shape));
    expect(warned.every((p) => p.shape === 'L'), warned.map((p) => p.name).join()).toBe(true);
  });

  it('classifies every catalogued profile — none falls to unknown', () => {
    // `unknown` is for properties-only sections. A CATALOGUED profile with a family should always
    // resolve to a real shape, so an `unknown` here would mean a family lost its mapping.
    for (const p of shaped) {
      expect(axesSymmetryOf(p.shape), p.name).not.toBe('unknown');
    }
  });
});

describe('both sentences exist in all three offered languages', () => {
  const dicts = { es, en, pt } as Record<string, Record<string, string>>;

  it('renders real prose, not a key', () => {
    for (const [name, dict] of Object.entries(dicts)) {
      for (const key of ['section.axes.notPrincipal.angle', 'section.axes.notPrincipal.zed']) {
        expect(dict[key], `${name}: ${key}`).toBeTruthy();
        expect(dict[key].length, `${name}: ${key}`).toBeGreaterThan(60);
      }
    }
  });

  it('says in every language that the app cannot store the product of inertia', () => {
    // The fact that makes the notice actionable rather than alarming: it is a limitation of the
    // representation, and a reader who knows that knows what to do about it.
    for (const [name, dict] of Object.entries(dicts)) {
      for (const key of ['section.axes.notPrincipal.angle', 'section.axes.notPrincipal.zed']) {
        // `in[eé]rc` because Portuguese accents it — «inércia» — and Spanish does not.
        expect(dict[key].toLowerCase(), `${name}: ${key}`).toMatch(/in[eé]rc|inert/);
      }
    }
  });

  it('cites CIRSOC 303 in the zed sentence and not in the angle one', () => {
    // The angle has no restraint provision to appeal to. Citing 303 there would suggest a way out
    // that does not exist.
    for (const [name, dict] of Object.entries(dicts)) {
      expect(dict['section.axes.notPrincipal.zed'], name).toContain('303');
      expect(dict['section.axes.notPrincipal.angle'], name).not.toContain('303');
    }
  });

  it('claims no verification in any of them', () => {
    // A notice about representation must not read as an outcome.
    for (const [name, dict] of Object.entries(dicts)) {
      for (const key of ['section.axes.notPrincipal.angle', 'section.axes.notPrincipal.zed']) {
        const text = dict[key].toLowerCase();
        for (const word of ['verificad', 'verified', 'aprobad', 'approved', 'certificad', 'cumple']) {
          expect(text, `${name}: ${key} must not say "${word}"`).not.toContain(word);
        }
      }
    }
  });
});
