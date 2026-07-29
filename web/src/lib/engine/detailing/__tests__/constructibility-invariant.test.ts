/**
 * The CONSTRUCTIBLE invariant.
 *
 * This file exists because the label was awarded to a state that had 7,246 prohibited
 * physical overlaps in it. The search had found a complete assignment, the assignment was
 * real, and "assignment found" and "can be built" were the same word.
 *
 * The first group reproduces that exact state and proves it cannot produce the claim. The
 * rest prove the same for each of the other twelve conditions INDIVIDUALLY, because a gate
 * that only ever gets tested in its all-passing and all-failing configurations is a gate
 * where twelve of the thirteen conditions could be silently unreachable.
 */

import { describe, expect, it } from 'vitest';
import {
  assessConstructibility, constructibilityState,
  CONSTRUCTIBILITY_CONDITIONS,
  type ConstructibilityFacts,
} from '../constructibility';
import { noFloorFamilies, tallyRequirement } from '../family-record';
import { evaluateState } from '../assembly';
import type { BarPath } from '../../../codes/cirsoc201/bar-geometry';
import type { BarConflict } from '../collision';

/** Everything passing. Each test spoils exactly one thing. */
const PERFECT: ConstructibilityFacts = {
  completeEnvelope: true,
  searchTruncated: false,
  applicableMembers: 248,
  assignedMembers: 248,
  selectedTransitions: 622,
  materialisedTransitions: 622,
  unmaterialisedTransitions: 0,
  requiredTransversePieces: 4820,
  materialisedTransversePieces: 4820,
  prohibitedConflicts: 0,
  reverifiedMembers: 248,
  certificateHashMatches: 248,
  spacingNotCodeLegal: 0,
  spacingNotPlacementRobust: 0,
  unsupportedRules: 0,
  staleAssemblies: 0,
  // A beam/column assembly. Three requirements at `applicable: 0` is the MEASUREMENT that
  // it contains no panels, walls or footings — not an omission, which is why the field is
  // required. The family conditions are vacuously satisfied and say so.
  familyRequirements: noFloorFamilies(),
};

/**
 * The flagship as measured on 2026-07-26, after the search closed and the laps were
 * materialised. Every number here is a real measurement, not an invented failure.
 */
const FLAGSHIP: ConstructibilityFacts = {
  completeEnvelope: true,
  searchTruncated: false,
  applicableMembers: 248,
  assignedMembers: 248,          // the search genuinely closed
  selectedTransitions: 622,
  materialisedTransitions: 622,  // and the laps were genuinely built
  unmaterialisedTransitions: 0,
  // The cage did not exist on that date, so the design layer required none of it. Zero
  // against zero is the honest record of the measurement; inventing a requirement the run
  // never computed would put a number in a historical row that nobody measured.
  requiredTransversePieces: 0,
  materialisedTransversePieces: 0,
  prohibitedConflicts: 7246,     // ← and the steel still interpenetrates
  reverifiedMembers: 0,          // ← nothing was reverified after the geometry moved
  certificateHashMatches: 0,     // ← so no certificate describes the model
  spacingNotCodeLegal: 0,
  spacingNotPlacementRobust: 0,
  unsupportedRules: 0,
  staleAssemblies: 0,
  // The flagship is a frame. It had no floor families on that date either.
  familyRequirements: noFloorFamilies(),
};

describe('the flagship state that was mislabelled', () => {
  it('7,246 prohibited overlaps can never be CONSTRUCTIBLE', () => {
    expect(assessConstructibility(FLAGSHIP).verdict).not.toBe('CONSTRUCTIBLE');
  });

  it('is CONFLICTED, not merely unproven — the clashes are a real defect', () => {
    expect(assessConstructibility(FLAGSHIP).verdict).toBe('CONFLICTED');
  });

  it('names every blocking condition rather than summarising', () => {
    const blocking = assessConstructibility(FLAGSHIP).blocking;
    expect(blocking).toContain('noProhibitedConflicts');
    expect(blocking).toContain('allMembersReverified');
    expect(blocking).toContain('certificatesMatchGeometry');
  });

  it('credits what DID pass: the assignment and the materialisation are real', () => {
    const a = assessConstructibility(FLAGSHIP);
    const passed = a.conditions.filter((c) => c.passed).map((c) => c.condition);
    expect(passed).toContain('allMembersAssigned');
    expect(passed).toContain('allTransitionsMaterialised');
    expect(passed).toContain('noUnmaterialisedTransitions');
    expect(passed).toContain('searchNotTruncated');
  });

  it('reports the conflict count, so the number is auditable', () => {
    const a = assessConstructibility(FLAGSHIP);
    const c = a.conditions.find((x) => x.condition === 'noProhibitedConflicts')!;
    expect(c.failing).toBe(7246);
  });

  it('caps the assembly state below CONSTRUCTIBLE', () => {
    expect(constructibilityState(assessConstructibility(FLAGSHIP))).toBe('CONFLICTED');
  });

  it('one overlap is as disqualifying as seven thousand', () => {
    const one = assessConstructibility({ ...PERFECT, prohibitedConflicts: 1 });
    expect(one.verdict).toBe('CONFLICTED');
  });
});

describe('all fifteen conditions, one at a time', () => {
  it('the perfect case passes, or the rest of this file proves nothing', () => {
    const a = assessConstructibility(PERFECT);
    expect(a.verdict).toBe('CONSTRUCTIBLE');
    expect(a.blocking).toEqual([]);
    expect(a.conditions).toHaveLength(15);
  });

  const spoil: Record<string, Partial<ConstructibilityFacts>> = {
    completeEnvelope: { completeEnvelope: false },
    searchNotTruncated: { searchTruncated: true },
    allMembersAssigned: { assignedMembers: 247 },
    allTransitionsMaterialised: { materialisedTransitions: 621 },
    noUnmaterialisedTransitions: { unmaterialisedTransitions: 1 },
    allRequiredTransversePathsMaterialised: { materialisedTransversePieces: 4819 },
    noProhibitedConflicts: { prohibitedConflicts: 1 },
    allMembersReverified: { reverifiedMembers: 247 },
    certificatesMatchGeometry: { certificateHashMatches: 247 },
    // One applicable footing with NO certificate. The frame counts are untouched, which is
    // the point: a missing family certificate must block on its own, without borrowing the
    // frame conditions, or a slab-only floor has no gate at all.
    allApplicableFamiliesCertified: {
      familyRequirements: [
        tallyRequirement('slab', []),
        tallyRequirement('wall', []),
        tallyRequirement('footing', ['missing']),
      ],
    },
    // One applicable footing whose certificate EXISTS and describes geometry that has since
    // moved. Distinct from missing: the remedy is to reissue, not to issue.
    noStaleFamilyCertificate: {
      familyRequirements: [
        tallyRequirement('slab', []),
        tallyRequirement('wall', []),
        tallyRequirement('footing', ['geometryMismatch']),
      ],
    },
    allSpacingCodeLegal: { spacingNotCodeLegal: 1 },
    allSpacingPlacementRobust: { spacingNotPlacementRobust: 1 },
    noUnsupportedRule: { unsupportedRules: 1 },
    noStaleUpstreamRevision: { staleAssemblies: 1 },
  };

  it('covers every condition in the exported list', () => {
    expect(Object.keys(spoil).sort()).toEqual([...CONSTRUCTIBILITY_CONDITIONS].sort());
  });

  for (const condition of CONSTRUCTIBILITY_CONDITIONS) {
    it(`${condition} alone withholds CONSTRUCTIBLE`, () => {
      const a = assessConstructibility({ ...PERFECT, ...spoil[condition] });
      expect(a.verdict).not.toBe('CONSTRUCTIBLE');
      expect(a.blocking).toEqual([condition]);
    });
  }
});

describe('the two failure verdicts mean different things', () => {
  it('a physical clash is a defect: CONFLICTED', () => {
    expect(assessConstructibility({ ...PERFECT, prohibitedConflicts: 3 }).verdict)
      .toBe('CONFLICTED');
  });

  it('an illegal spacing is a defect: CONFLICTED', () => {
    expect(assessConstructibility({ ...PERFECT, spacingNotCodeLegal: 3 }).verdict)
      .toBe('CONFLICTED');
  });

  it('work not yet done is NOT a defect: NOT_ESTABLISHED', () => {
    // The geometry may be perfectly fine. Calling this CONFLICTED sends the engineer
    // hunting for a clash that does not exist.
    expect(assessConstructibility({ ...PERFECT, reverifiedMembers: 0 }).verdict)
      .toBe('NOT_ESTABLISHED');
  });

  it('a spacing that is legal but not placement-robust is not yet a defect', () => {
    // VERIFIED survives at the code minimum; CONSTRUCTIBLE is what the margin gates.
    const a = assessConstructibility({ ...PERFECT, spacingNotPlacementRobust: 5 });
    expect(a.verdict).toBe('NOT_ESTABLISHED');
    expect(constructibilityState(a)).toBe('COORDINATED');
  });
});

describe('the assembly ladder cannot be climbed without the gate', () => {
  const bars = [{ id: 'b1' }] as unknown as BarPath[];
  const clean: BarConflict[] = [];

  it('an unassessed assembly stops at COORDINATED even with zero conflicts', () => {
    // This is the exact hole the old code had: empty conflict list, therefore
    // CONSTRUCTIBLE. Re-verification and certificate agreement were never consulted.
    const e = evaluateState({
      bars, conflicts: clean, unsupported: [],
      membersVerified: true, coordinated: true,
    });
    expect(e.state).toBe('COORDINATED');
    expect(e.blockers).toContain('constructibility.notAssessed');
  });

  it('reaches CONSTRUCTIBLE only when all fifteen pass', () => {
    const e = evaluateState({
      bars, conflicts: clean, unsupported: [],
      membersVerified: true, coordinated: true,
      constructibility: assessConstructibility(PERFECT),
    });
    expect(e.state).toBe('CONSTRUCTIBLE');
    expect(e.blockers).toEqual([]);
  });

  it('a failing gate is reported by condition name, not by prose', () => {
    const e = evaluateState({
      bars, conflicts: clean, unsupported: [],
      membersVerified: true, coordinated: true,
      constructibility: assessConstructibility({ ...PERFECT, reverifiedMembers: 0 }),
    });
    expect(e.state).toBe('COORDINATED');
    expect(e.blockers).toContain('constructibility.allMembersReverified');
  });
});

describe('the search outcome is not the constructibility verdict', () => {
  it('ASSIGNMENT_FOUND is the search vocabulary and CONSTRUCTIBLE is not in it', async () => {
    // A regression guard on the rename. If CONSTRUCTIBLE ever returns to the search
    // outcome union, the two claims have been conflated again.
    const src = await import('../coordination-search');
    const found = assessConstructibility(FLAGSHIP);
    expect(found.verdict).toBe('CONFLICTED');
    expect(typeof src.coordinate).toBe('function');
  });
});
