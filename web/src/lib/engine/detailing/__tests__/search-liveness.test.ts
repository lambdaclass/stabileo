/**
 * Every advertised search mechanism must actually run.
 *
 * ── Why this file exists ───────────────────────────────────────────
 *
 * Two mechanisms have already been dead code without anyone noticing:
 *
 *   * channel-aware candidate generation was added, measured as "no improvement", and
 *     found three sessions later to have generated ZERO candidates the entire time —
 *     `freeChannelsOf` never clipped to the section, so every candidate it produced was
 *     discarded on a cover violation;
 *   * the chain DP reported `dpStates: 0` on every flagship run since it was written,
 *     because no member ever carried a `lineId`.
 *
 * In both cases the mechanism existed, had unit tests, and did nothing. Unit tests prove a
 * function computes; only a liveness assertion proves the pipeline calls it. Each test here
 * fails if its mechanism silently stops contributing.
 */
import { describe, it, expect } from 'vitest';
import { generateLayoutCandidates, type KeepOut } from '../candidates';
import { generateColumnCandidates } from '../column-candidates';
import { coordinate, type JointConstraint, type MemberVariable } from '../coordination-search';
import { transitionExists } from '../splice';
import { deriveDevelopment } from '../../../codes/cirsoc201/anchorage';

const DEV = deriveDevelopment({
  diameterMm: 16, fy: 420, fc: 25, favourableSpacing: true, edition: '2025',
});

function beamDomain(obstacles?: readonly KeepOut[]) {
  return generateLayoutCandidates({
    count: 4, diameterMm: 16, clearWidth: 0.284, edition: '2025',
    maxAggregateSizeMm: 19, memberKind: 'beam', placementTolerance: 0.010, obstacles,
  });
}

describe('channel-aware generation is live', () => {
  it('produces channel-aware candidates when obstacles split the section', () => {
    const obstacles: KeepOut[] = [{ at: 0, halfWidth: 0.020 }];
    const withCh = beamDomain(obstacles).filter((c) => c.id.startsWith('ch'));
    expect(withCh.length,
      'channel-aware generation has stopped contributing — the exact failure that went '
      + 'unnoticed for three sessions').toBeGreaterThan(0);
  });

  it('and its candidates stay inside the section', () => {
    // The clipping defect: an obstacle far outside must not grant a channel reaching it.
    const obstacles: KeepOut[] = [{ at: 0, halfWidth: 0.020 }, { at: 0.9, halfWidth: 0.020 }];
    for (const c of beamDomain(obstacles)) {
      expect(Math.abs(c.slots[0].across) + 0.008).toBeLessThanOrEqual(0.142 + 1e-9);
    }
  });
});

describe('column candidate generation is live', () => {
  it('offers more than one arrangement where the geometry allows it', () => {
    const cages = generateColumnCandidates({
      count: 8, diameterMm: 20, b: 0.5, h: 0.5, cover: 0.03, tieDiaMm: 8,
      edition: '2025', maxAggregateSizeMm: 19, placementTolerance: 0.010,
    });
    expect(cages.length).toBeGreaterThan(1);
    expect(new Set(cages.map((c) => c.arrangement)).size).toBeGreaterThan(1);
  });
});

describe('the chain DP is live', () => {
  it('evaluates states and transitions on a multi-span line', () => {
    // dpStates === 0 is the exact symptom that hid the missing lineId assignment.
    const line: MemberVariable[] = [1, 2, 3].map((id, i) => ({
      elementId: id, domain: beamDomain(), diameterMm: 16, neighbours: [],
      lineId: 'L', lineIndex: i,
    }));
    const joints: JointConstraint[] = [
      { jointId: 'J1', elementIds: [1, 2], keepOutsFor: new Map(),
        relation: () => 'collinear' },
      { jointId: 'J2', elementIds: [2, 3], keepOutsFor: new Map(),
        relation: () => 'collinear' },
    ];
    const r = coordinate({ members: line, joints });
    expect(r.stats.dpStates, 'the chain DP did not run').toBeGreaterThan(0);
    expect(r.stats.dpTransitions, 'the chain DP evaluated no transitions')
      .toBeGreaterThan(0);
    expect(r.outcome).toBe('ASSIGNMENT_FOUND');
  });
});

describe('splice transitions are live', () => {
  it('a differing-layout pair is connected by a lap, not rejected', () => {
    expect(transitionExists([-0.06, 0.06], [-0.05, 0.07], 16, DEV)).toBe(true);
  });

  it('arc consistency keeps a candidate that a transition reaches', () => {
    // The greedy-incompatible case resolved by a transition: two collinear members whose
    // domains share no identical layout, which the previous rule declared impossible.
    const a: MemberVariable = {
      elementId: 1, domain: beamDomain([{ at: -0.05, halfWidth: 0.02 }]),
      diameterMm: 16, neighbours: [],
    };
    const b: MemberVariable = {
      elementId: 2, domain: beamDomain([{ at: 0.05, halfWidth: 0.02 }]),
      diameterMm: 16, neighbours: [],
    };
    const joints: JointConstraint[] = [{
      jointId: 'J', elementIds: [1, 2], keepOutsFor: new Map(),
      relation: () => 'collinear',
      transitionExists: (_aId, aL, _bId, bL) => transitionExists(
        aL.slots.map((s) => s.across), bL.slots.map((s) => s.across), 16, DEV),
    }];
    const r = coordinate({ members: [a, b], joints });
    expect(r.outcome).toBe('ASSIGNMENT_FOUND');
    expect(r.assignment.size).toBe(2);
  });
});

describe('propagation is live', () => {
  it('removes candidates that no partner accepts', () => {
    const r = coordinate({
      members: [{
        elementId: 1, domain: beamDomain(), diameterMm: 16, neighbours: [],
      }],
      joints: [{
        jointId: 'J', elementIds: [1],
        keepOutsFor: new Map([[1, [{ at: 0, halfWidth: 0.03 }]]]),
        relation: () => 'independent',
      }],
    });
    expect(r.stats.domainsRemovedByPropagation).toBeGreaterThan(0);
  });
});
