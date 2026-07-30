/**
 * The global coordination search.
 *
 * The cases that matter are the ones a per-joint heuristic gets wrong. Two such heuristics
 * were built and measured before this one, and both made the flagship worse; the tests
 * below encode WHY, so a future "simplification" back to greedy fails here rather than in
 * a QA session.
 */
import { describe, it, expect } from 'vitest';
import {
  generateLayoutCandidates, worstCasePlacementSpacing, candidateClears,
  type LayoutCandidate, type KeepOut,
} from '../candidates';
import {
  coordinate, pairCompatible, DEFAULT_LIMITS,
  type JointConstraint, type MemberVariable,
} from '../coordination-search';
import { minClearSpacingFor } from '../../../codes/cirsoc201/spacing';

const EDITION = '2025' as const;
const DAGG = 19;
const TOL = 0.010;

function candidates(count: number, dia: number, clearWidth: number, locked?: number[]) {
  return generateLayoutCandidates({
    count, diameterMm: dia, clearWidth, edition: EDITION,
    maxAggregateSizeMm: DAGG, memberKind: 'beam', placementTolerance: TOL,
    lockedAcross: locked,
  });
}

function variable(
  elementId: number, domain: LayoutCandidate[], dia: number,
  extra: Partial<MemberVariable> = {},
): MemberVariable {
  return { elementId, domain, diameterMm: dia, neighbours: [], ...extra };
}

function joint(
  jointId: string, elementIds: number[],
  keepOuts: Record<number, KeepOut[]>,
  relation: (a: number, b: number) => 'collinear' | 'crossing' | 'independent'
    = () => 'independent',
): JointConstraint {
  return {
    jointId, elementIds,
    keepOutsFor: new Map(Object.entries(keepOuts).map(([k, v]) => [Number(k), v])),
    relation,
  };
}

// ─── Candidate legality ──────────────────────────────────────────

describe('layout candidates are legal before anything else looks at them', () => {
  it('produces alternatives, not a single arrangement', () => {
    const c = candidates(3, 16, 0.40);
    expect(c.length).toBeGreaterThan(1);
    expect(new Set(c.map((x) => x.id)).size).toBe(c.length);
  });

  it('never breaches the code minimum clear spacing', () => {
    const min = minClearSpacingFor(EDITION, 'beam', {
      barDiameterMm: 16, maxAggregateSizeMm: DAGG,
    }).minClear;
    for (const c of candidates(4, 16, 0.45)) {
      expect(c.minClearInLayer - 0.016).toBeGreaterThanOrEqual(min - 1e-9);
    }
  });

  it('ADDS the placement tolerance to the nominal spacing and never subtracts it', () => {
    // The invariant that must never invert: after the worst allowed drift the pair is
    // still code-legal. A tolerance is a guard, not an excuse for a tight drawing.
    const min = minClearSpacingFor(EDITION, 'beam', {
      barDiameterMm: 20, maxAggregateSizeMm: DAGG,
    }).minClear;
    for (const c of candidates(3, 20, 0.50)) {
      expect(worstCasePlacementSpacing(c, 20, TOL)).toBeGreaterThanOrEqual(min - 1e-9);
    }
  });

  it('keeps every bar inside the clear width', () => {
    for (const c of candidates(4, 20, 0.40)) {
      expect(c.halfSpan).toBeLessThanOrEqual(0.40 / 2 + 1e-9);
    }
  });

  it('offers a multi-layer alternative when plan width is the scarce resource', () => {
    const c = candidates(5, 25, 0.35);
    expect(c.some((x) => x.layers > 1)).toBe(true);
    // …but prefers the single layer when one exists: layers cost effective depth.
    if (c.some((x) => x.layers === 1)) expect(c[0].layers).toBe(1);
  });

  it('honours a locked bar by RESTRICTING the domain, never by moving it', () => {
    const free = candidates(3, 16, 0.45);
    const pinned = free[2] ?? free[1] ?? free[0];
    const lockAt = pinned.slots[0].across;
    const locked = candidates(3, 16, 0.45, [lockAt]);
    expect(locked.length).toBeGreaterThan(0);
    expect(locked.length).toBeLessThan(free.length);
    for (const c of locked) {
      expect(c.slots.some((s) => Math.abs(s.across - lockAt) < 1e-6)).toBe(true);
    }
  });

  it('is deterministic: same request, same list, same order', () => {
    expect(candidates(4, 16, 0.42).map((c) => c.id))
      .toEqual(candidates(4, 16, 0.42).map((c) => c.id));
  });

  it('returns nothing rather than something illegal when one bar will not fit', () => {
    // Narrower than a single bar: there is no arrangement, and inventing one by letting a
    // bar sit outside the cover is the failure mode this guards.
    expect(candidates(2, 32, 0.02)).toEqual([]);
  });

  it('will stack a narrow section into layers rather than call it impossible', () => {
    // 6Ø32 in a 120 mm core IS legal, in three layers of two — deep, but the spacing and
    // the cover both hold. Refusing it would be the opposite error to inventing a layout.
    const c = candidates(6, 32, 0.12);
    expect(c.length).toBeGreaterThan(0);
    for (const x of c) {
      expect(x.halfSpan).toBeLessThanOrEqual(0.06 + 1e-9);
      expect(x.layers).toBeGreaterThan(1);
    }
  });
});

// ─── The cases greedy gets wrong ─────────────────────────────────

describe('global coordination succeeds where per-joint choice cannot', () => {
  it('fixing one beam end must not break the other', () => {
    // A beam through two columns whose bars sit at DIFFERENT transverse positions. Any
    // heuristic that satisfies the near joint first will pick a layout the far joint
    // rejects; only a choice made against both at once works.
    const dom = candidates(2, 16, 0.40);
    expect(dom.length).toBeGreaterThan(2);

    const nearBlocks: KeepOut[] = [{ at: -0.06, halfWidth: 0.03 }];
    const farBlocks: KeepOut[] = [{ at: 0.06, halfWidth: 0.03 }];

    const r = coordinate({
      members: [variable(1, dom, 16)],
      joints: [
        joint('J-near', [1], { 1: nearBlocks }),
        joint('J-far', [1], { 1: farBlocks }),
      ],
    });

    expect(r.outcome).toBe('ASSIGNMENT_FOUND');
    const chosen = r.assignment.get(1)!;
    // The single chosen layout clears BOTH ends. That is the whole point.
    expect(candidateClears(chosen, 16, nearBlocks).ok).toBe(true);
    expect(candidateClears(chosen, 16, farBlocks).ok).toBe(true);
  });

  it('two beams continuing through a support are coordinated, by continuity or by lap', () => {
    const dom = () => candidates(2, 16, 0.40);
    const r = coordinate({
      members: [variable(1, dom(), 16), variable(2, dom(), 16)],
      joints: [joint('J', [1, 2], {}, () => 'collinear')],
    });
    expect(r.outcome).toBe('ASSIGNMENT_FOUND');
    // The objective prefers one continuous bar — one piece, one mark — but a lap is a
    // legal outcome too, and demanding identity is what stranded fifty members.
    expect(r.assignment.size).toBe(2);
  });

  it('two beams CROSSING at a joint are layered, so their layouts are free', () => {
    const dom = () => candidates(2, 16, 0.40);
    const blocks: KeepOut[] = [{ at: -0.08, halfWidth: 0.02 }];
    const r = coordinate({
      members: [variable(1, dom(), 16), variable(2, dom(), 16)],
      joints: [joint('J', [1, 2], { 1: blocks }, () => 'crossing')],
    });
    expect(r.outcome).toBe('ASSIGNMENT_FOUND');
    // Member 1 still had to clear the column; member 2 was unconstrained by it.
    expect(candidateClears(r.assignment.get(1)!, 16, blocks).ok).toBe(true);
  });

  it('solves a beam LINE exactly, keeping every shared joint compatible', () => {
    const dom = () => candidates(2, 16, 0.40);
    const line = [1, 2, 3].map((id, i) =>
      variable(id, dom(), 16, { lineId: 'B', lineIndex: i }));
    const blocks: KeepOut[] = [{ at: 0, halfWidth: 0.035 }];
    const r = coordinate({
      members: line,
      joints: [
        joint('J1', [1, 2], { 1: blocks, 2: blocks }, () => 'collinear'),
        joint('J2', [2, 3], { 2: blocks, 3: blocks }, () => 'collinear'),
      ],
    });
    expect(r.outcome).toBe('ASSIGNMENT_FOUND');
    expect(r.stats.dpTransitions).toBeGreaterThan(0);
    for (const id of [1, 2, 3]) {
      expect(candidateClears(r.assignment.get(id)!, 16, blocks).ok).toBe(true);
    }
  });

  it('propagation removes candidates that no partner can accept', () => {
    const r = coordinate({
      members: [variable(1, candidates(2, 16, 0.40), 16)],
      joints: [joint('J', [1], { 1: [{ at: 0, halfWidth: 0.03 }] })],
    });
    expect(r.stats.domainsRemovedByPropagation).toBeGreaterThan(0);
    expect(r.outcome).toBe('ASSIGNMENT_FOUND');
  });

  it('a locked bar forces a different, still-valid solution', () => {
    const free = candidates(2, 16, 0.44);
    const blocks: KeepOut[] = [{ at: -0.05, halfWidth: 0.025 }];
    const unlocked = coordinate({
      members: [variable(1, free, 16)],
      joints: [joint('J', [1], { 1: blocks })],
    });
    expect(unlocked.outcome).toBe('ASSIGNMENT_FOUND');

    // Pin a bar where the unconstrained answer did NOT put one.
    const other = free.find((c) => c.id !== unlocked.assignment.get(1)!.id)!;
    const pin = other.slots[0].across;
    const locked = coordinate({
      members: [variable(1, candidates(2, 16, 0.44, [pin]), 16)],
      joints: [joint('J', [1], { 1: blocks })],
    });
    if (locked.outcome === 'ASSIGNMENT_FOUND') {
      const c = locked.assignment.get(1)!;
      expect(c.slots.some((s) => Math.abs(s.across - pin) < 1e-6)).toBe(true);
      expect(candidateClears(c, 16, blocks).ok).toBe(true);
    } else {
      // Honouring the pin may genuinely leave nothing legal — reported as exhaustion of
      // what was searched, never by quietly moving the pinned bar.
      expect(locked.outcome).toBe('PARTIAL_ENVELOPE_EXHAUSTED');
    }
  });
});

// ─── Honest outcomes ─────────────────────────────────────────────

describe('the four outcomes are never conflated', () => {
  it('DETAILING_INADEQUATE when the domain is exhausted and nothing fits', () => {
    // An obstacle across the whole section: no arrangement of any kind clears it.
    const r = coordinate({
      members: [variable(1, candidates(3, 20, 0.40), 20)],
      joints: [joint('J', [1], { 1: [{ at: 0, halfWidth: 0.25 }] })],
    });
    // Beams only were searched, so the honest verdict is the weaker one.
    expect(r.outcome).toBe('PARTIAL_ENVELOPE_EXHAUSTED');
    expect(r.stats.truncated).toBe(false);
    expect(r.emptiedDomains.map((e) => e.jointId)).toContain('J');
    expect(r.infeasibleJoints.length).toBeGreaterThan(0);
  });

  it('an inadequacy verdict states the envelope it was proved within', () => {
    // "No arrangement fits" is only honest if the search could vary everything relevant.
    // With the columns held fixed the truthful claim is narrower, and the result says so
    // rather than letting a reader infer that the geometry itself is impossible.
    const r = coordinate({
      members: [variable(1, candidates(3, 20, 0.40), 20)],
      joints: [joint('J', [1], { 1: [{ at: 0, halfWidth: 0.25 }] })],
    });
    expect(r.outcome).toBe('PARTIAL_ENVELOPE_EXHAUSTED');
    expect(r.envelope).toBe('beamLayoutsOnly');
    expect(r.evidence.completeColumnEnvelope).toBe(false);
  });

  it('UNSUPPORTED when a member has no representable layout at all', () => {
    const r = coordinate({
      members: [variable(1, [], 32)],
      joints: [],
    });
    expect(r.outcome).toBe('UNSUPPORTED');
  });

  it('SEARCH_EXHAUSTED, not INADEQUATE, when a limit stops the search', () => {
    // Many mutually-constrained members with a node budget of almost nothing. The search
    // proves nothing, and saying "inadequate" would be a claim it did not earn.
    const members = Array.from({ length: 12 }, (_, i) =>
      variable(i + 1, candidates(3, 16, 0.40), 16));
    const ids = members.map((m) => m.elementId);
    const r = coordinate({
      members,
      joints: [joint('J', ids, {}, () => 'collinear')],
      limits: { maxNodes: 3, maxDomain: DEFAULT_LIMITS.maxDomain },
    });
    expect(r.outcome).toBe('SEARCH_EXHAUSTED');
    expect(r.stats.truncated).toBe(true);
  });

  it('a nonzero conflict result never becomes a coordinated assignment', () => {
    const r = coordinate({
      members: [variable(1, candidates(2, 20, 0.35), 20)],
      joints: [joint('J', [1], { 1: [{ at: 0, halfWidth: 0.30 }] })],
    });
    expect(r.outcome).not.toBe('ASSIGNMENT_FOUND');
    expect(r.assignment.size).toBe(0);
  });
});

// ─── Determinism ─────────────────────────────────────────────────

describe('the search is deterministic', () => {
  const build = (order: number[]) => ({
    members: order.map((id) => variable(id, candidates(2, 16, 0.42), 16)),
    joints: [joint('J', [1, 2, 3], {
      1: [{ at: -0.07, halfWidth: 0.02 }],
      2: [{ at: 0.07, halfWidth: 0.02 }],
      3: [{ at: 0, halfWidth: 0.02 }],
    }, () => 'independent')],
  });

  it('gives byte-identical output when the members arrive in a different order', () => {
    const a = coordinate(build([1, 2, 3]));
    const b = coordinate(build([3, 1, 2]));
    expect(a.outcome).toBe(b.outcome);
    const shape = (r: typeof a) =>
      [...r.assignment.entries()].sort((x, y) => x[0] - y[0]).map(([k, v]) => [k, v.id]);
    expect(shape(b)).toEqual(shape(a));
  });

  it('bounds the search by node COUNT, so the machine cannot change the answer', () => {
    const a = coordinate({ ...build([1, 2, 3]), limits: { maxNodes: 500, maxDomain: 24 } });
    const b = coordinate({ ...build([1, 2, 3]), limits: { maxNodes: 500, maxDomain: 24 } });
    expect(a.stats.branchNodes).toBe(b.stats.branchNodes);
    expect(a.stats.compatibilityChecks).toBe(b.stats.compatibilityChecks);
  });

  it('memoises compatibility rather than recomputing it', () => {
    const r = coordinate(build([1, 2, 3]));
    expect(r.stats.compatibilityChecks + r.stats.compatibilityCacheHits).toBeGreaterThan(0);
  });
});

// ─── Pair compatibility ──────────────────────────────────────────

describe('pairCompatible reads the relation, not just the geometry', () => {
  const c = () => candidates(2, 16, 0.40)[0];
  const other = () => candidates(2, 16, 0.40)[1];

  it('collinear members of the same size may LAP — §25.5.1.2, no separation needed', () => {
    // This block previously demanded that differing layouts be rejected, which is not one
    // of the code's options. §25.5.1.2 permits a contact lap: the two bars touch, and clear
    // spacing is measured to ADJACENT bars. Requiring identical layouts stranded fifty
    // flagship members that had an ordinary lap available.
    const j = joint('J', [1, 2], {}, () => 'collinear');
    expect(pairCompatible(j,
      { elementId: 1, diameterMm: 16, layout: c() },
      { elementId: 2, diameterMm: 16, layout: c() }).ok).toBe(true);
    expect(pairCompatible(j,
      { elementId: 1, diameterMm: 16, layout: c() },
      { elementId: 2, diameterMm: 16, layout: other() }).ok).toBe(true);
  });

  it('without an oracle it falls back to the code default, not to identity', () => {
    const j = joint('J', [1, 2], {}, () => 'collinear');
    expect(pairCompatible(j,
      { elementId: 1, diameterMm: 16, layout: c() },
      { elementId: 2, diameterMm: 20, layout: other() }).ok).toBe(false);
  });

  it('an oracle may permit differing bar sizes, and is believed', () => {
    // Different sizes lap legally all the time; whether THIS pair can is a question about
    // development length and available room, which the oracle owns.
    const permissive = joint('J', [1, 2], {}, () => 'collinear');
    permissive.transitionExists = () => true;
    expect(pairCompatible(permissive,
      { elementId: 1, diameterMm: 16, layout: c() },
      { elementId: 2, diameterMm: 20, layout: c() }).ok).toBe(true);
  });

  it('crossing members are stacked in layers, so any pair of layouts works', () => {
    const j = joint('J', [1, 2], {}, () => 'crossing');
    expect(pairCompatible(j,
      { elementId: 1, diameterMm: 16, layout: c() },
      { elementId: 2, diameterMm: 16, layout: other() }).ok).toBe(true);
  });

  it('an oracle may permit differing bar sizes, and is believed', () => {
    // Different sizes lap legally all the time; whether THIS pair can is a question about
    // development length and available room, which the oracle owns.
    const permissive = joint('J', [1, 2], {}, () => 'collinear');
    permissive.transitionExists = () => true;
    expect(pairCompatible(permissive,
      { elementId: 1, diameterMm: 16, layout: c() },
      { elementId: 2, diameterMm: 20, layout: c() }).ok).toBe(true);
  });

  it('either member failing the joint own obstacles fails the pair', () => {
    const j = joint('J', [1, 2], { 1: [{ at: 0, halfWidth: 0.30 }] }, () => 'crossing');
    const r = pairCompatible(j,
      { elementId: 1, diameterMm: 16, layout: c() },
      { elementId: 2, diameterMm: 16, layout: c() });
    expect(r.ok).toBe(false);
    expect(r.worstOverlap).toBeLessThan(0);
  });
});
