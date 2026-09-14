/**
 * The project's additional bar-spacing margin, end to end.
 *
 * The rule this file defends: a zero margin must introduce NO allowance anywhere. Not a
 * small one, not a rounding one — none. The 10 mm that used to be hardcoded was silently
 * deducted from every measured clearance, so a cage drawn exactly to §25.2.1 failed its own
 * check on every pair in every model. Zero has to mean the regulation's minimum IS the
 * requirement.
 *
 * And a positive margin must actually do something: raise the required clear distance above
 * the minimum, be visible as a project decision rather than a code one, and withhold
 * CONSTRUCTIBLE when the cage no longer clears it.
 */

import { describe, expect, it } from 'vitest';
import {
  assessSpacing, normaliseMargin, DEFAULT_SPACING_MARGIN_M, DEFAULT_PLACEMENT_POLICY,
} from '../../../codes/cirsoc201/placement';
import { assessConstructibility } from '../constructibility';
import { DEFAULT_TOLERANCES } from '../collision';
import { noFloorFamilies } from '../family-record';

const CODE_MIN = 0.025;

describe('zero is the default and it is a real zero', () => {
  it('the default margin is exactly zero', () => {
    expect(DEFAULT_SPACING_MARGIN_M).toBe(0);
    expect(DEFAULT_PLACEMENT_POLICY.spacingAllowance).toBe(0);
  });

  it('the collision engine deducts nothing by default', () => {
    expect(DEFAULT_TOLERANCES.placement).toBe(0);
  });

  it('a cage drawn exactly to the code minimum is legal AND robust', () => {
    const a = assessSpacing({ codeMinimum: CODE_MIN, achievedNominalClear: CODE_MIN });
    expect(a.codeLegal).toBe(true);
    expect(a.placementRobust).toBe(true);
    expect(a.worstCasePlacedClear).toBe(CODE_MIN);
  });

  it('at zero margin the target IS the code minimum, not more', () => {
    const a = assessSpacing({ codeMinimum: CODE_MIN, achievedNominalClear: CODE_MIN });
    expect(a.targetNominalClear).toBe(CODE_MIN);
  });

  it('zero carries no assumption caveat, because it asserts nothing', () => {
    const a = assessSpacing({ codeMinimum: CODE_MIN, achievedNominalClear: 0.030 });
    expect(a.allowanceIsAssumed).toBe(false);
    expect(a.assumption).toBeUndefined();
  });
});

describe('a positive margin is applied above the required clear distance', () => {
  const policy = { spacingAllowance: 0.010, stated: true };

  it('raises the target without touching the code minimum', () => {
    const a = assessSpacing({ codeMinimum: CODE_MIN, achievedNominalClear: 0.030, policy });
    expect(a.codeMinimum).toBe(CODE_MIN);
    expect(a.targetNominalClear).toBeCloseTo(0.035, 9);
  });

  it('separates the two questions: legal at 30 mm, not robust to a 10 mm margin', () => {
    const a = assessSpacing({ codeMinimum: CODE_MIN, achievedNominalClear: 0.030, policy });
    expect(a.codeLegal).toBe(true);
    expect(a.placementRobust).toBe(false);
    expect(a.worstCasePlacedClear).toBeCloseTo(0.020, 9);
  });

  it('both hold once the cage clears the margin too', () => {
    const a = assessSpacing({ codeMinimum: CODE_MIN, achievedNominalClear: 0.040, policy });
    expect(a.codeLegal).toBe(true);
    expect(a.placementRobust).toBe(true);
  });

  it('a stated margin is not flagged as an assumption; an unstated one is', () => {
    const stated = assessSpacing({
      codeMinimum: CODE_MIN, achievedNominalClear: 0.040, policy,
    });
    expect(stated.allowanceIsAssumed).toBe(false);
    const unstated = assessSpacing({
      codeMinimum: CODE_MIN, achievedNominalClear: 0.040,
      policy: { spacingAllowance: 0.010, stated: false },
    });
    expect(unstated.allowanceIsAssumed).toBe(true);
    expect(unstated.assumption).toBeDefined();
  });
});

describe('the margin can only ever be conservative', () => {
  it('a negative entry is clamped to zero, never used to erode the minimum', () => {
    expect(normaliseMargin(-0.010)).toBe(0);
    expect(normaliseMargin(-1)).toBe(0);
  });

  it('nonsense is zero, not NaN', () => {
    expect(normaliseMargin(Number.NaN)).toBe(0);
    expect(normaliseMargin(Number.POSITIVE_INFINITY)).toBe(0);
    expect(normaliseMargin(null)).toBe(0);
    expect(normaliseMargin(undefined)).toBe(0);
  });

  it('a positive entry passes through unchanged', () => {
    expect(normaliseMargin(0.012)).toBe(0.012);
  });
});

describe('placementRobust gates CONSTRUCTIBLE', () => {
  const PASSING = {
    completeEnvelope: true, searchTruncated: false,
    applicableMembers: 4, assignedMembers: 4,
    selectedTransitions: 2, materialisedTransitions: 2, unmaterialisedTransitions: 0,
    // No stirrup zones in this fixture, so the design layer requires no cage. 0 of 0 is
    // the truthful reading, not a waiver.
    requiredTransversePieces: 0, materialisedTransversePieces: 0,
    prohibitedConflicts: 0, reverifiedMembers: 4, certificateHashMatches: 4,
    spacingNotCodeLegal: 0, spacingNotPlacementRobust: 0,
    unsupportedRules: 0, staleAssemblies: 0,
    // All four members drawn. This file is about the spacing margin, and a coverage
    // shortfall here would block the gate for a reason none of its tests are asking about.
    undetailedScopeMembers: 0,
    familyRequirements: noFloorFamilies(),
  };

  it('a cage that is legal but not robust is withheld', () => {
    const a = assessConstructibility({ ...PASSING, spacingNotPlacementRobust: 3 });
    expect(a.verdict).not.toBe('CONSTRUCTIBLE');
    expect(a.blocking).toEqual(['allSpacingPlacementRobust']);
  });

  it('and it is NOT reported as a defect — the code is still satisfied', () => {
    // VERIFIED survives at the code minimum. The margin is the project's own stricter
    // requirement, and failing it is a shortfall against the project, not the regulation.
    const a = assessConstructibility({ ...PASSING, spacingNotPlacementRobust: 3 });
    expect(a.verdict).toBe('NOT_ESTABLISHED');
  });

  it('the count is reported, so the engineer can see the size of the gap', () => {
    const a = assessConstructibility({ ...PASSING, spacingNotPlacementRobust: 7 });
    const c = a.conditions.find((x) => x.condition === 'allSpacingPlacementRobust')!;
    expect(c.failing).toBe(7);
    expect(c.passed).toBe(false);
  });

  it('an illegal spacing IS a defect, and the two are distinguished', () => {
    expect(assessConstructibility({ ...PASSING, spacingNotCodeLegal: 1 }).verdict)
      .toBe('CONFLICTED');
  });
});
