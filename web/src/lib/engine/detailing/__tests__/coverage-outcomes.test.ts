/**
 * The 408/373 discrepancy — what the outcome population actually is.
 *
 * A live run on the 408-member flagship reported "408 members, 373 verified". PR15's own gate
 * asserts 408/408 VERIFIED on this fixture, so "373" is a DISPLAY BAND (utilisation below a
 * threshold) sitting next to 35 compliant warnings — not an outcome split. If detailing keyed
 * off the band rather than the outcome it would silently drop 35 fully compliant members.
 *
 * Split from the coverage-invariant suite because these two assertions need only the SOLVE and
 * DESIGN steps. Keeping them beside the detailing invariants meant every run of this concern
 * also paid for the detailing ones.
 */

import { describe, it, expect } from 'vitest';
import { flagshipRun, membersOfKind } from './helpers/flagship';
import { detailingReadiness } from '../run-detailing';
import type { MemberDesignOutcome } from '../../design/outcome';

describe('the 408/373 discrepancy', () => {
  it('every member is VERIFIED as an OUTCOME — 373 is a display band, not a split', () => {
    const { summary } = flagshipRun();
    expect(summary.total).toBe(408);
    expect(summary.verified).toBe(408);
    // No member sits in any non-VERIFIED outcome, so there is no population for
    // detailing to legitimately skip on outcome grounds.
    const notVerified = [...summary.outcomes.values()].filter((o) => o.outcome !== 'VERIFIED');
    expect(notVerified.map((o) => o.elementId)).toEqual([]);
  }, 300_000);

  it('detailing keys off the OUTCOME, so compliant warning members are not lost', () => {
    const { solved, summary } = flagshipRun();
    const readiness = detailingReadiness({
      contexts: solved.contexts,
      outcomes: summary.outcomes as ReadonlyMap<number, MemberDesignOutcome>,
    });
    // Walls are PR18's; everything else is detailable.
    const walls = membersOfKind('wall').length;
    expect(readiness.detailable.length).toBe(408 - walls);
    expect(readiness.prerequisites).toEqual([]);
  }, 300_000);
});
