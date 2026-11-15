/**
 * A proposal is presented as a proposal, everywhere a status is shown.
 *
 * ── What was wrong ─────────────────────────────────────────────────
 *
 * `PROVISIONAL_BIAXIAL` members' steel fails the authoritative verifier BY CONSTRUCTION: the
 * verifier pushes the biaxial refusal for exactly these members. The detailing surfaces learned
 * to make that exception; the design surface did not, so the summary bar reported "✗ 22 fail"
 * about 22 members whose primary axis had passed every check that ran. Twenty-two red crosses
 * meaning "we did not look", drawn identically to crosses meaning "we looked and it does not
 * hold".
 *
 * ── What this file pins, and what it does not ──────────────────────
 *
 * It pins the RULE and the PRESENTATION. It does not pin the engineering, because none of it
 * changed: the outcome, the verdict, the certificate, the utilisation and the geometry are
 * untouched, and the tests that own those live elsewhere and are unaffected.
 *
 * Three properties, in order of how quietly they can break:
 *
 *   1. The exception is one predicate with two callers. It was two copies for a release and
 *      the copies disagreed, which is how one screen said PROVISIONAL while another said
 *      FAILED about the same member.
 *   2. It is NARROW. A proposal that also fails on flexure or shear is a failure. This is the
 *      assertion that stops the exception becoming a way to make red things green.
 *   3. Every display state has a glyph and a label in every locale. Adding a state and
 *      forgetting its label ships a badge that renders the raw key.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  failingLimits, isKnownBiaxialLimitation, statusOf, NOT_FOR_CONSTRUCTION_STATUSES,
  type DesignOutcomeSummary,
} from '../../engine/detailing/element-status';
import en from '../../i18n/locales/en';
import { allShippedLocales as shippedLocales, allDictFor as dictFor } from '../../i18n/locales/all';

// ─── The rule ────────────────────────────────────────────────────

function summary(over: Partial<DesignOutcomeSummary> = {}): DesignOutcomeSummary {
  return {
    outcome: 'PROVISIONAL_BIAXIAL',
    verificationStatus: 'fail',
    verificationLimiting: ['biaxial'],
    limiting: ['biaxial'],
    ...over,
  };
}

describe('the biaxial exception, stated once', () => {
  it('holds when every failing check is the biaxial one', () => {
    expect(isKnownBiaxialLimitation(summary())).toBe(true);
    expect(isKnownBiaxialLimitation(summary({
      verificationLimiting: ['biaxial', 'biaxial'],
    }))).toBe(true);
  });

  it('does NOT hold when something else also failed', () => {
    // The assertion that keeps this an exception rather than a softening. A proposal failing
    // on flexure has something wrong beyond the limitation it declares, and it stays a failure.
    for (const also of ['flexure', 'shear', 'barFit', 'anchorage']) {
      expect(
        isKnownBiaxialLimitation(summary({ verificationLimiting: ['biaxial', also] })),
        `biaxial + ${also}`,
      ).toBe(false);
    }
  });

  it('does NOT hold on an empty list, because silence is not agreement', () => {
    // An absent list means "no idea what failed", not "nothing else did".
    expect(isKnownBiaxialLimitation(summary({ verificationLimiting: [] }))).toBe(false);
    expect(isKnownBiaxialLimitation(summary({ verificationLimiting: undefined }))).toBe(false);
  });

  it('does NOT hold for any other outcome', () => {
    for (const outcome of
      ['VERIFIED', 'UNSUPPORTED', 'SECTION_INADEQUATE', 'SEARCH_EXHAUSTED'] as const) {
      expect(isKnownBiaxialLimitation(summary({ outcome })), outcome).toBe(false);
    }
    expect(isKnownBiaxialLimitation(undefined)).toBe(false);
  });

  it('reads the failing constraints and only the failing ones', () => {
    expect(failingLimits([
      { status: 'ok', limiting: 'flexure' },
      { status: 'fail', limiting: 'biaxial' },
      { status: 'warn', limiting: 'shear' },
      { status: 'fail' },
    ])).toEqual(['biaxial']);
    expect(failingLimits(undefined)).toEqual([]);
  });
});

describe('the detailing status agrees with the rule', () => {
  it('calls a proposal with steel PROVISIONAL, not FAILED', () => {
    expect(statusOf(true, summary())).toBe('PROVISIONAL');
  });

  it('calls a proposal that also fails on flexure FAILED', () => {
    expect(statusOf(true, summary({ verificationLimiting: ['biaxial', 'flexure'] })))
      .toBe('FAILED');
  });

  it('never presents a proposal as finished work', () => {
    // The one list the viewport legend, the sheets, the schedule and the report all read.
    expect(NOT_FOR_CONSTRUCTION_STATUSES).toContain('PROVISIONAL');
    expect(NOT_FOR_CONSTRUCTION_STATUSES).not.toContain('MODELLED');
  });
});

// ─── The presentation ────────────────────────────────────────────

const VERIFICATION = fileURLToPath(new URL('../verification.svelte.ts', import.meta.url));

/**
 * The `DisplayStatus` union's members, parsed from the type itself.
 *
 * Parsed rather than restated so that adding a state is what makes these tests demand a glyph
 * and a label for it. A hard-coded list would go quiet on exactly the change it exists for.
 */
function displayStatuses(): string[] {
  const src = readFileSync(VERIFICATION, 'utf8');
  const start = src.indexOf('export type DisplayStatus =');
  const decl = src.slice(start, src.indexOf(';', start));
  return [...decl.matchAll(/\|?\s*'([a-z]+)'/g)].map((m) => m[1]);
}

describe('every display state can be shown and read', () => {
  const statuses = displayStatuses();

  it('parses the union, and it contains the new state', () => {
    expect(statuses).toEqual(
      expect.arrayContaining(['ok', 'warn', 'fail', 'provisional', 'unavailable', 'stale']));
  });

  it('gives each one a label in every locale the app ships', () => {
    for (const s of statuses) {
      const key = `design.status.${s}`;
      expect(en, `en is missing ${key}`).toHaveProperty(key);
      for (const loc of shippedLocales()) {
        expect(dictFor(loc)[key], `${loc} is missing ${key}`).toBeTruthy();
      }
    }
  });
});
