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
import {
  matchesFilter, sortRows, type DesignRow,
} from '../../../components/pro/design/design-view';
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
const BADGE = fileURLToPath(
  new URL('../../../components/pro/design/OutcomeBadge.svelte', import.meta.url));
/** The summary counts moved to `DesignOverview.svelte`; both files carry the presentation. */
const TOOLBAR_FILES = [
  fileURLToPath(new URL('../../../components/pro/design/DesignToolbar.svelte', import.meta.url)),
  fileURLToPath(new URL('../../../components/pro/design/DesignOverview.svelte', import.meta.url)),
];

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

  it('gives each one a glyph, so colour is never the only carrier', () => {
    const badge = readFileSync(BADGE, 'utf8');
    const map = badge.slice(badge.indexOf('const STATUS_GLYPH'));
    for (const s of statuses) {
      expect(map.slice(0, map.indexOf('};')), `${s} has a glyph`).toContain(`${s}:`);
    }
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

  it('counts the proposals in the summary bar, apart from passes and failures', () => {
    const toolbar = TOOLBAR_FILES.map((f) => readFileSync(f, 'utf8')).join('\n');
    // Beside `fail`, not inside it, and always rendered so a zero is a visible zero.
    expect(toolbar).toContain('{counts.provisional}');
    expect(toolbar).toContain('data-testid="summary-count-provisional"');
    // And never folded into the verified count, which is the failure this whole state
    // exists to prevent in the other direction.
    const verifiedChip = toolbar.slice(
      toolbar.indexOf('summary-count-verified'), toolbar.indexOf('summary-count-warn'));
    expect(verifiedChip).not.toContain('provisional');
  });
});

// ─── The table ───────────────────────────────────────────────────

function row(over: Partial<DesignRow> = {}): DesignRow {
  return {
    elementId: 1, elementType: 'beam', sectionName: 'RC Beam 350×650', sectionId: 2,
    elevation: 0, elevationLabel: 'L0', utilization: 0.5, status: 'ok',
    governingCheck: '', comboName: '', outcome: 'VERIFIED', hasReinforcement: true,
    edited: false, auto: true, provisional: false, certified: true, sloped: false,
    provided: null,
    ...over,
  };
}

describe('the design table sorts and filters a proposal as its own thing', () => {
  it('does not answer the "fail" filter', () => {
    const p = row({ status: 'provisional', provisional: true, certified: false });
    expect(matchesFilter(p, 'fail', new Set())).toBe(false);
    expect(matchesFilter(p, 'ok', new Set())).toBe(false);
    expect(matchesFilter(p, 'warn', new Set())).toBe(false);
  });

  it('answers the "provisional" filter from EITHER signal', () => {
    // The run's outcome flag and the display status are the same members today and can
    // diverge — the flag is what the run decided, the status is what the steel is now.
    expect(matchesFilter(row({ provisional: true }), 'provisional', new Set())).toBe(true);
    expect(matchesFilter(row({ status: 'provisional' }), 'provisional', new Set())).toBe(true);
    expect(matchesFilter(row(), 'provisional', new Set())).toBe(false);
  });

  it('sorts a proposal above a warning and below a real failure', () => {
    const rows = [
      row({ elementId: 3, status: 'ok' }),
      row({ elementId: 2, status: 'warn' }),
      row({ elementId: 1, status: 'fail' }),
      row({ elementId: 4, status: 'provisional' }),
    ];
    expect(sortRows(rows, 'status', true).map((r) => r.elementId)).toEqual([1, 4, 2, 3]);
  });
});
