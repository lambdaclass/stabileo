/**
 * The five facts, and the failure mode this file exists to prevent.
 *
 * «The state explains it» is an opinion until something enumerates what "it" is. Five separate
 * facts have to reach a user — one capability and four limits — and the way they get lost is not
 * by being deleted, it is by collapsing: rendered as prose they become «cold-formed is not
 * supported», which is false, because the parametric geometry works.
 *
 * So the assertions below are mostly about COMPLETENESS and KIND rather than wording: all five
 * present, exactly one of them a capability, the capability first, and clauses only where a
 * normative claim is actually being made.
 */

import { describe, it, expect } from 'vitest';
import {
  COLD_FORMED_SCOPE, COLD_FORMED_AVAILABLE, COLD_FORMED_LIMITS,
  type ColdFormedScopeFact,
} from '../cold-formed-scope';
import * as scope from '../cold-formed-scope';
import { axesNoticeKeyFor } from '../../section/axes';
import es from '../../i18n/locales/steel/es';
import en from '../../i18n/locales/steel/en';
import pt from '../../i18n/locales/steel/pt';

/** The five, named here so a deletion fails rather than silently shrinking the list. */
const EXPECTED: ColdFormedScopeFact[] = [
  'parametricGeometryAvailable',
  'tabulatedCatalogueUnavailable',
  'cirsoc301Excludes',
  'cirsoc303NotIncorporated',
  'noNormativeVerification',
];

describe('all five facts, in reading order', () => {
  it('carries exactly the five, in the order the argument runs', () => {
    expect(COLD_FORMED_SCOPE.map((e) => e.fact)).toEqual(EXPECTED);
  });

  it('opens with the capability, not with a refusal', () => {
    /*
     * The order is an argument: a reader who stops after the first line has learned something
     * true. Reversing it would bury the fact that anything works at all.
     */
    expect(COLD_FORMED_SCOPE[0].kind).toBe('available');
    expect(COLD_FORMED_SCOPE.slice(1).every((e) => e.kind === 'unavailable')).toBe(true);
  });

  it('has exactly one capability and four limits', () => {
    // Asserted as counts because this is what stops the capability being reclassified into the
    // limits and the panel becoming a wall of four refusals.
    expect(COLD_FORMED_AVAILABLE).toHaveLength(1);
    expect(COLD_FORMED_LIMITS).toHaveLength(4);
    expect(COLD_FORMED_AVAILABLE[0].fact).toBe('parametricGeometryAvailable');
  });

  it('cannot be reordered or filtered by a consumer', () => {
    // Frozen, because a caller that could reorder could show the conclusion without its premises.
    expect(Object.isFrozen(COLD_FORMED_SCOPE)).toBe(true);
  });
});

describe('the axes rule does NOT live here', () => {
  it('exports no axes key of its own any more', () => {
    /*
     * It used to: `COLD_FORMED_ZED_AXES_KEY`, with its own predicate (`shape === 'Z'`). Both moved
     * to `section/axes.ts`, because the rotated axes are a property of a SHAPE and not of the
     * cold-formed family — the 37 catalogued angles have the same problem.
     *
     * Asserted as an absence so the duplicate cannot come back quietly. Two surfaces warning on
     * two different predicates teaches a reader that the app is inconsistent, not that their
     * section is unsymmetric.
     */
    expect(Object.keys(scope)).not.toContain('COLD_FORMED_ZED_AXES_KEY');
    expect(Object.keys(scope).some((k) => /axes/i.test(k))).toBe(false);
  });

  it('and the shared rule is the one that answers for a zed', () => {
    expect(axesNoticeKeyFor('Z')).toBe('section.axes.notPrincipal.zed');
  });
});

describe('clauses appear only where a normative claim is made', () => {
  it('cites a clause for the two that are about regulations', () => {
    const byFact = new Map(COLD_FORMED_SCOPE.map((e) => [e.fact, e]));
    expect(byFact.get('cirsoc301Excludes')!.clause).toContain('301');
    expect(byFact.get('cirsoc303NotIncorporated')!.clause).toContain('303');
  });

  it('and cites none for the three that are about this app', () => {
    /*
     * «No sourced series» is a fact about this repository's contents, not a clause. Dressing it
     * as one would borrow authority it does not have — the same discipline the profile catalogue
     * keeps when it refuses to guess a root radius.
     */
    for (const fact of ['parametricGeometryAvailable', 'tabulatedCatalogueUnavailable', 'noNormativeVerification'] as const) {
      const entry = COLD_FORMED_SCOPE.find((e) => e.fact === fact)!;
      expect(entry.clause, fact).toBeUndefined();
    }
  });
});

describe('every key resolves in all three offered languages', () => {
  const dicts = { es, en, pt } as Record<string, Record<string, string>>;

  it('renders a real sentence, not a key', () => {
    for (const [name, dict] of Object.entries(dicts)) {
      for (const entry of COLD_FORMED_SCOPE) {
        expect(dict[entry.key], `${name}: ${entry.key}`).toBeTruthy();
        expect(dict[entry.key].length, `${name}: ${entry.key} is a sentence`).toBeGreaterThan(20);
      }
    }
  });

  it('keeps the measured-angle placeholder in every language', () => {
    // A lost `{angle}` turns «rotated 23°» into «rotated », which is the weaker of the two
    // warnings and reads like a rendering bug. The sentence lives in the cold-formed namespace
    // because only this surface has the geometry to measure it.
    for (const [name, dict] of Object.entries(dicts)) {
      expect(dict['steel.coldFormed.axesAngle'], `${name}`).toContain('{angle}');
    }
  });

  it('names both regulations in every language, since those are the citations', () => {
    for (const [name, dict] of Object.entries(dicts)) {
      const byFact = new Map(COLD_FORMED_SCOPE.map((e) => [e.fact, e]));
      expect(dict[byFact.get('cirsoc301Excludes')!.key], name).toContain('301');
      expect(dict[byFact.get('cirsoc303NotIncorporated')!.key], name).toContain('303');
    }
  });
});
