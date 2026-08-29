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
  COLD_FORMED_SCOPE, COLD_FORMED_AVAILABLE, COLD_FORMED_LIMITS, COLD_FORMED_ZED_AXES_KEY,
  type ColdFormedScopeFact,
} from '../cold-formed-scope';
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
      expect(dict[COLD_FORMED_ZED_AXES_KEY], `${name}: zed axes`).toBeTruthy();
    }
  });

  it('keeps the zed warning’s placeholder in every language', () => {
    // A lost `{angle}` turns «rotated 23°» into «rotated », which is the weaker of the two
    // warnings and reads like a rendering bug.
    for (const [name, dict] of Object.entries(dicts)) {
      expect(dict[COLD_FORMED_ZED_AXES_KEY], `${name}`).toContain('{angle}');
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
