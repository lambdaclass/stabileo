import { afterEach, describe, expect, it, vi } from 'vitest';
import * as design from '../../design/candidate-search';
import { cirsoc201Adapter } from '../../design/adapters/cirsoc201-adapter';
import type { MemberContext } from '../../design/member-context';
import type { MemberDesignOutcome } from '../../design/outcome';
import type { RunDetailingResult } from '../run-detailing';
import { detailRegresses, runDesignFeedbackLoop } from '../design-feedback-loop';
import { continuityLines, searchPhysicalDesignAlternatives } from '../physical-design-search';
import { syntheticBeamContext } from '../../design/__tests__/helpers';
import { rebarHash } from '../../design/rebar-hash';

function outcome(id: number, diameter: number): MemberDesignOutcome {
  return { elementId: id, outcome: 'VERIFIED', accepted: {
    regions: { bottomSpan: { count: 2, diameter }, topStart: { count: 2, diameter }, topEnd: { count: 2, diameter } },
  }, searchStats: { candidatesTried: 1, verifierCalls: 1 } } as MemberDesignOutcome;
}

function detail(blocked: number[], fail: number[] = []): RunDetailingResult {
  return {
    assemblies: [{ id: 'floor', elementIds: [1, 2], unsupported: [], conflicts: blocked.map(id => ({
      elementIds: [id], severity: 'overlap',
    })) }],
    reverification: [1, 2].map(elementId => ({ elementId, status: fail.includes(elementId) ? 'fail' : 'ok' })),
    skipped: [], provisionalMembers: [],
  } as unknown as RunDetailingResult;
}

function harness() {
  const contexts = new Map([1, 2].map(elementId => [elementId, {
    elementId, elementType: 'beam', material: { stirrupDia: 8, longDiametersMm: [12, 16] },
  } as unknown as MemberContext]));
  const outcomes = new Map([1, 2].map(id => [id, outcome(id, 10)]));
  const generate = vi.spyOn(design, 'designMember').mockImplementation((_adapter, ctx) =>
    outcome(ctx.elementId, ctx.material.longDiametersMm![0]));
  return {
    generate, input: { contexts, outcomes, result: detail([1, 1]), adapter: cirsoc201Adapter,
      regresses: detailRegresses, budget: { maxDetailingRuns: 3, maxMemberSearches: 6 },
      detail: vi.fn((_outcomes: ReadonlyMap<number, MemberDesignOutcome>, _contexts: ReadonlyMap<number, MemberContext>) => detail([])),
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('atomic top continuity repair', () => {
  function paired() {
    const { input } = harness();
    for (const id of [1, 2]) input.contexts.set(id, syntheticBeamContext({ elementId: id }));
    input.outcomes.set(1, outcome(1, 12)); input.outcomes.set(2, outcome(2, 16));
    input.result = detail([1, 2]);
    input.result.assemblies[0].unsupported = [{ key: 'detailing.lapCheck.unarranged',
      scope: { elementIds: [1, 2] }, params: { joint: 'n2' }, message: 'overlap', refs: [] }];
    input.result.lapping = { laps: [{ jointId: 'n2', fromElementId: 1, toElementId: 2 }] as never, fused: 0, unmaterialised: [] };
    const verify = vi.spyOn(input.adapter, 'verify').mockReturnValue({
      overallStatus: 'ok', strengthCheckCount: 2, checks: [{ status: 'ok' }], worstUtilization: 0.8, checkedAxes: ['My'],
    } as never);
    return { input: { ...input, budget: { maxDetailingRuns: 2, maxMemberSearches: 4, operators: ['harmonizeTop'] as const } }, verify };
  }

  function line() {
    const { input, verify } = paired();
    const model = { ...input.contexts.get(1)!.modelData,
      nodes: new Map([1, 2, 3, 4].map(id => [id, { id, x: (id - 1) * 6, y: 0, z: 0 }])),
      elements: new Map([1, 2, 3].map(id => [id, { id, nodeI: id, nodeJ: id + 1,
        materialId: 1, sectionId: 1, type: 'frame' }])),
    };
    input.contexts.set(3, syntheticBeamContext({ elementId: 3 }));
    for (const ctx of input.contexts.values()) ctx.modelData = model;
    input.outcomes.set(3, outcome(3, 16));
    input.result.reverification.push({ ...input.result.reverification[0], elementId: 3 });
    input.result.layering = { lineOfMember: new Map([[1, 'line'], [2, 'line'], [3, 'line']]) } as never;
    const closed = detail([]);
    closed.reverification.push({ ...closed.reverification[0], elementId: 3 });
    input.detail.mockReturnValue(closed);
    return { input: { ...input, budget: { maxDetailingRuns: 2, maxMemberSearches: 6,
      operators: ['harmonizeTopLine'] as const } }, verify };
  }

  it('includes an already fused continuation with no lap record and certifies all three members', () => {
    const { input, verify } = line();
    expect(continuityLines(input.contexts, input.result)).toEqual([{ ids: [1, 2, 3], jointIds: ['n2', 'n3'] }]);
    const result = searchPhysicalDesignAlternatives(input);
    expect(result.trials[0]).toMatchObject({ elementIds: [1, 2, 3], disposition: 'accepted' });
    expect(verify).toHaveBeenCalledTimes(3);
    expect(result.changed).toEqual([1, 2, 3]);
    for (const id of [1, 2, 3]) expect(result.outcomes.get(id)!.certificate!.rebarHash)
      .toBe(rebarHash(result.outcomes.get(id)!.accepted));
  });

  it('explores catalog patterns for blocked lines even when all their splices are continuous', () => {
    const { input, verify } = line();
    input.result.assemblies[0].unsupported = [];
    input.result.lapping.laps = [];
    input.result.assemblies[0].bars = [{ id: 'shared-top', role: 'longitudinal',
      layerId: '1:top', ownerElementIds: [1, 2, 3] }] as never;
    input.result.assemblies[0].conflicts[0].barA = 'shared-top';
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { ...input.budget, operators: ['harmonizeTopCatalog'] } });
    expect(result.trials[0]).toMatchObject({ disposition: 'accepted', operator: 'harmonizeTopCatalog',
      elementIds: [1, 2, 3], splicePairsBefore: 0, splicePairsAfter: 0 });
    expect(verify).toHaveBeenCalledTimes(3);
    expect(result.result.assemblies[0].conflicts).toEqual([]);
  });

  it('does not spend a top catalog budget on bottom-only clashes', () => {
    const { input, verify } = line();
    input.result.assemblies[0].bars = [{ id: 'shared-bottom', role: 'longitudinal',
      layerId: '1:bottom', ownerElementIds: [1, 2, 3] }] as never;
    input.result.assemblies[0].conflicts[0].barA = 'shared-bottom';
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { ...input.budget, operators: ['harmonizeTopCatalog'] } });
    expect(result.trials).toEqual([]);
    expect(verify).not.toHaveBeenCalled();
    expect(input.detail).not.toHaveBeenCalled();
  });

  it('verifies a whole cage proposal atomically and records both face populations', () => {
    const { input, verify } = line();
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { ...input.budget, operators: ['harmonizeCageCatalog'] } });
    expect(result.trials[0]).toMatchObject({ disposition: 'accepted', operator: 'harmonizeCageCatalog',
      elementIds: [1, 2, 3], diameterMm: 16, counts: [2], bottomCounts: [2] });
    expect(verify).toHaveBeenCalledTimes(3);
    expect(input.detail).toHaveBeenCalledTimes(1);
    for (const o of result.outcomes.values()) {
      expect(o.accepted!.regions!.topStart!.diameter).toBe(16);
      expect(o.accepted!.regions!.bottomSpan!.diameter).toBe(16);
      expect(o.certificate!.rebarHash).toBe(rebarHash(o.accepted));
    }
  });

  it('retains both original faces when a cage proposal blocks a neighbour', () => {
    const { input } = line();
    input.result.assemblies[0].conflicts = input.result.assemblies[0].conflicts.slice(0, 1);
    input.detail.mockReturnValue(input.result);
    const worse = structuredClone(input.result);
    worse.assemblies[0].conflicts.push({ ...worse.assemblies[0].conflicts[0], elementIds: [99] });
    input.detail.mockReturnValue(worse);
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { maxDetailingRuns: 1, maxMemberSearches: 3, operators: ['harmonizeCageCatalog'] } });
    expect(result.trials[0]).toMatchObject({ disposition: 'regression', newlyBlocked: [99] });
    expect(result.outcomes).toBe(input.outcomes);
    expect(result.changed).toEqual([]);
  });

  it('certifies a mixed-diameter cage atomically and records each face diameter', () => {
    const { input, verify } = line();
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { ...input.budget, operators: ['harmonizeMixedCageCatalog'] } });
    expect(result.trials[0]).toMatchObject({ disposition: 'accepted', operator: 'harmonizeMixedCageCatalog',
      elementIds: [1, 2, 3], diameterMm: 16, bottomDiameterMm: 12, counts: [2], bottomCounts: [4] });
    expect(verify).toHaveBeenCalledTimes(3);
    expect(input.detail).toHaveBeenCalledTimes(1);
    for (const o of result.outcomes.values()) {
      expect(o.accepted!.regions!.topStart!.diameter).toBe(16);
      expect(o.accepted!.regions!.bottomSpan!.diameter).toBe(12);
      expect(o.certificate!.rebarHash).toBe(rebarHash(o.accepted));
    }
  });

  it.each(['harmonizeTopCatalog', 'harmonizeMixedCageCatalog'] as const)(
    'gives the next line a trial after a rejected proposal (%s)', operator => {
    const { input, verify } = line();
    const model = input.contexts.get(1)!.modelData;
    for (const id of [7, 8, 9, 10]) model.nodes.set(id, { id, x: id * 6, y: 0, z: 0 });
    for (const id of [4, 5, 6]) {
      model.elements.set(id, { ...model.elements.get(1)!, id, nodeI: id + 3, nodeJ: id + 4 });
      input.contexts.set(id, { ...syntheticBeamContext({ elementId: id }), modelData: model });
      input.outcomes.set(id, outcome(id, id === 4 ? 12 : 16));
      input.result.reverification.push({ ...input.result.reverification[0], elementId: id });
      input.result.layering!.lineOfMember.set(id, 'second');
    }
    input.result.assemblies[0].bars = [1, 4].map(id => ({ id: `top-${id}`, role: 'longitudinal',
      layerId: `${id}:top`, ownerElementIds: [id, id + 1, id + 2] })) as never;
    input.result.assemblies[0].conflicts = [1, 2, 4, 5].map(id => ({
      ...input.result.assemblies[0].conflicts[0], elementIds: [id], barA: `top-${id < 4 ? 1 : 4}`,
    }));
    const improved = { ...input.result, assemblies: [{ ...input.result.assemblies[0],
      conflicts: input.result.assemblies[0].conflicts.slice(0, 2) }] };
    input.detail.mockReturnValueOnce(input.result).mockReturnValueOnce(improved);
    if (operator === 'harmonizeMixedCageCatalog') {
      verify.mockImplementation(ctx => ({
        overallStatus: ctx.elementId < 4 ? 'fail' : 'ok', strengthCheckCount: 2,
        checks: [{ status: ctx.elementId < 4 ? 'fail' : 'ok' }], worstUtilization: 0.8, checkedAxes: ['My'],
      } as never));
      input.detail.mockReset().mockReturnValue(improved);
    }
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { maxDetailingRuns: 2, maxMemberSearches: 6, operators: [operator] } });
    expect(result.trials.map(t => [t.elementIds, t.disposition])).toEqual([
      [[1, 2, 3], operator === 'harmonizeMixedCageCatalog' ? 'nominalFailure' : 'noProgress'], [[4, 5, 6], 'accepted'],
    ]);
    expect(verify).toHaveBeenCalledTimes(6);
    expect(input.detail).toHaveBeenCalledTimes(operator === 'harmonizeMixedCageCatalog' ? 1 : 2);
  });

  it('does not join a crossing beam even if an upstream line identifier is shared', () => {
    const { input } = line();
    input.contexts.get(1)!.modelData.nodes.set(4, { id: 4, x: 12, y: 6, z: 0 });
    expect(continuityLines(input.contexts, input.result)).toEqual([{ ids: [1, 2], jointIds: ['n2'] }]);
  });

  it('does not join overlapping members extending in the same direction from a joint', () => {
    const { input } = line();
    input.contexts.get(1)!.modelData.nodes.set(4, { id: 4, x: 7, y: 0, z: 0 });
    expect(continuityLines(input.contexts, input.result)).toEqual([{ ids: [1, 2], jointIds: ['n2'] }]);
  });

  it('refuses an ambiguous fork with two collinear continuations at the same joint', () => {
    const { input } = line();
    input.contexts.get(1)!.modelData.elements.get(3)!.nodeI = 2;
    expect(continuityLines(input.contexts, input.result)).toEqual([]);
    expect(searchPhysicalDesignAlternatives(input).changed).toEqual([]);
    expect(input.detail).not.toHaveBeenCalled();
  });

  it('reserves the whole line budget before doing any member verification', () => {
    const { input, verify } = line();
    input.budget.maxMemberSearches = 2;
    const result = searchPhysicalDesignAlternatives(input);
    expect(result.termination).toBe('budget');
    expect(verify).not.toHaveBeenCalled();
    expect(input.detail).not.toHaveBeenCalled();
    expect(result.outcomes).toBe(input.outcomes);
  });

  it('rolls back the whole line and records the member whose final resistance worsened', () => {
    const { input } = line();
    const failed = detail([]);
    failed.reverification.push({ ...failed.reverification[0], elementId: 3, status: 'fail' });
    input.detail.mockReturnValue(failed);
    const result = searchPhysicalDesignAlternatives(input);
    expect(result.outcomes).toBe(input.outcomes);
    expect(result.trials.every(t => t.regressions?.includes('reverification:3'))).toBe(true);
  });

  it('checks both proposed members against their new neighbours and publishes the pair only after full detail', () => {
    const { input, verify } = paired();
    const result = searchPhysicalDesignAlternatives(input);
    expect(verify).toHaveBeenCalledTimes(2);
    expect(result.trials[0]).toMatchObject({ elementIds: [1, 2], jointId: 'n2', disposition: 'accepted' });
    expect(input.detail).toHaveBeenCalledTimes(1);
    const proposed = input.detail.mock.calls[0][0];
    for (const id of [1, 2]) {
      const r = proposed.get(id)!;
      expect(r.certificate!.rebarHash).toBe(rebarHash(r.accepted));
      expect(r.accepted!.regions!.topStart!.diameter).toBe(12);
    }
    // Top seats also account for the unchanged bottom hooks (Ø16).
    expect(verify.mock.calls[0][0].beamCorners!.get(2)!.topDiasMm).toEqual([12, 16]);
    expect(input.outcomes.get(2)!.accepted!.regions!.topStart!.diameter).toBe(16);
    expect(result.stats).toMatchObject({ detailingRuns: 1, memberSearches: 2, verifierCalls: 2, structuralSolves: 0 });
  });

  it('rejects the whole pair if either nominal check fails', () => {
    const { input, verify } = paired();
    verify.mockReturnValue({ strengthCheckCount: 2, checks: [{ status: 'fail' }], worstUtilization: 1.2 } as never);
    const result = searchPhysicalDesignAlternatives(input);
    expect(input.detail).not.toHaveBeenCalled();
    expect(result.outcomes).toBe(input.outcomes);
    expect(result.trials.every(t => t.nominalFailures?.length === 2)).toBe(true);
  });

  it('does not certify a warning that requires a hook the proposal does not provide', () => {
    const { input, verify } = paired();
    verify.mockReturnValue({ overallStatus: 'fail', strengthCheckCount: 2,
      checks: [{ status: 'warn', anchorHook: { face: 'bottom', toward: 'start', group: 0 } }],
      worstUtilization: 0.8, checkedAxes: ['My'] } as never);
    expect(searchPhysicalDesignAlternatives(input).changed).toEqual([]);
    expect(input.detail).not.toHaveBeenCalled();
  });

  it.each(['locked', 'provisional', 'budget'] as const)('does not partly replace a pair when %s', mode => {
    const { input, verify } = paired();
    if (mode === 'provisional') input.outcomes.set(2, { ...input.outcomes.get(2)!, outcome: 'PROVISIONAL_BIAXIAL' });
    if (mode === 'budget') input.budget.maxMemberSearches = 1;
    const result = searchPhysicalDesignAlternatives({ ...input, lockedMembers: mode === 'locked' ? new Set([2]) : undefined });
    expect(verify).not.toHaveBeenCalled();
    expect(result.outcomes).toBe(input.outcomes);
    expect(result.changed).toEqual([]);
    if (mode === 'budget') expect(result.termination).toBe('budget');
  });

  it('rejects a nominally valid pair if the final detail regresses', () => {
    const { input } = paired();
    input.detail.mockReturnValue(detail([], [2]));
    const result = searchPhysicalDesignAlternatives(input);
    expect(result.changed).toEqual([]);
    expect(result.result).toBe(input.result);
    expect(result.trials.map(t => t.disposition)).toEqual(['regression', 'regression']);
  });

  it('requires improvement of the target splice, not just fewer other clashes', () => {
    const { input } = paired();
    const fewer = detail([]);
    fewer.assemblies[0].unsupported = input.result.assemblies[0].unsupported;
    input.detail.mockReturnValue(fewer);
    expect(searchPhysicalDesignAlternatives(input).trials.map(t => t.disposition)).toEqual(['noProgress', 'noProgress']);
  });

  it('recognizes fewer unresolved pairs inside a still-open grouped splice warning', () => {
    const { input } = paired();
    input.result.assemblies[0].unsupported[0].params!.pairs = 8;
    const fewer = detail([1, 2]);
    fewer.assemblies[0].unsupported = [{ ...input.result.assemblies[0].unsupported[0],
      params: { joint: 'n2', pairs: 2 } }];
    input.detail.mockReturnValue(fewer);
    const result = searchPhysicalDesignAlternatives(input);
    expect(result.trials[0]).toMatchObject({ disposition: 'accepted', splicePairsBefore: 8, splicePairsAfter: 2 });
    expect(result.result.assemblies[0].unsupported).toHaveLength(1);
  });

  it('shares operation budgets across paired and single-member operators', () => {
    const { input } = paired();
    input.detail.mockReturnValueOnce(detail([1])).mockReturnValue(detail([]));
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { maxDetailingRuns: 2, maxMemberSearches: 3, operators: ['harmonizeTop', 'diameterFamily'] } });
    expect(result.trials.map(t => t.operator)).toEqual(['harmonizeTop', 'diameterFamily']);
    expect(result.trials.map(t => t.disposition)).toEqual(['accepted', 'accepted']);
    expect(result.stats).toMatchObject({ detailingRuns: 2, memberSearches: 3, verifierCalls: 3 });
    expect(result.changed).toEqual([1, 2]);
  });
});

describe('guided physical alternatives', () => {
  it('rejects a preserved-row cage with fewer clashes when it newly blocks a neighbor', () => {
    const { input } = harness();
    input.contexts.set(1, syntheticBeamContext());
    const current = outcome(1, 16);
    current.accepted!.regions!.bottomSpan = { count: 6, diameter: 16 };
    current.accepted!.regions!.bottomSpanLayers = [
      { count: 4, row: 0, diameter: 16 }, { count: 2, row: 1, diameter: 16 },
    ];
    input.outcomes.set(1, current);
    vi.spyOn(input.adapter, 'verify').mockReturnValue({
      strengthCheckCount: 2, checks: [{ status: 'ok' }], worstUtilization: 0.9, checkedAxes: ['My'],
    } as never);
    input.detail.mockReturnValue(detail([2])); // Two old conflicts replaced by one new neighbor conflict.
    const r = searchPhysicalDesignAlternatives({ ...input,
      budget: { maxDetailingRuns: 1, maxMemberSearches: 1, operators: ['preserveBottomRows'] },
    });
    expect(r.trials).toMatchObject([{ disposition: 'regression', blockingConflicts: 1, newlyBlocked: [2] }]);
    expect(r.outcomes).toBe(input.outcomes);
    expect(r.result).toBe(input.result);
    expect(r.changed).toEqual([]);
  });

  it.each([
    ['redistributeLayers', false], ['redistributeLayers', true],
    ['preserveBottomRows', false], ['preserveBottomRows', true],
  ] as const)('reverifies %s and retains it only if the full detail improves (nominal failure: %s)', (operator, nominalFailure) => {
    const { input, generate } = harness();
    input.contexts.set(1, syntheticBeamContext());
    const current = outcome(1, 16);
    current.accepted!.regions!.bottomSpan = { count: 6, diameter: 16 };
    current.accepted!.regions!.bottomSpanLayers = [
      { count: 4, row: 0, diameter: 16 }, { count: 2, row: 1, diameter: 16 },
    ];
    input.outcomes.set(1, current);
    const verify = vi.spyOn(input.adapter, 'verify').mockReturnValue({
      strengthCheckCount: 2, checks: [{ status: nominalFailure ? 'fail' : 'ok' }],
      worstUtilization: nominalFailure ? 1.1 : 0.9, checkedAxes: ['My'],
    } as never);
    const r = searchPhysicalDesignAlternatives({ ...input,
      budget: { maxDetailingRuns: 1, maxMemberSearches: 1, operators: [operator] },
    });
    expect(generate).not.toHaveBeenCalled();
    expect(verify).toHaveBeenCalledTimes(1);
    expect(r.stats.candidatesConsidered).toBe(1);
    expect(r.stats.verifierCalls).toBe(1);
    expect(r.trials[0].operator).toBe(operator);
    if (nominalFailure) {
      expect(input.detail).not.toHaveBeenCalled();
      expect(r.outcomes).toBe(input.outcomes);
    } else {
      expect(r.changed).toEqual([1]);
      const accepted = r.outcomes.get(1)!;
      expect(accepted.accepted!.regions!.bottomSpanLayers!.map(l => l.count))
        .toEqual(operator === 'preserveBottomRows' ? [4, 2] : [3, 3]);
      expect(accepted.certificate!.rebarHash).toBe(rebarHash(accepted.accepted));
      expect(accepted.certificate!.rebarHash).not.toBe(rebarHash(current.accepted));
    }
  });
  it('rejects damage to a neighbor, then tries another diameter and retains only the accepted assignment', () => {
    const { input } = harness();
    input.detail.mockReturnValueOnce(detail([], [2])).mockReturnValueOnce(detail([]));
    const r = searchPhysicalDesignAlternatives(input);
    expect(r.trials.map(t => t.disposition)).toEqual(['regression', 'accepted']);
    expect(r.outcomes.get(1)!.accepted!.regions!.bottomSpan!.diameter).toBe(12);
    expect(input.outcomes.get(1)!.accepted!.regions!.bottomSpan!.diameter).toBe(10);
    expect(r.outcomes.get(2)).toBe(input.outcomes.get(2));
    expect(r.result).toBe(input.detail.mock.results[1].value);
    expect(r.stats.detailingRuns).toBe(2);
    expect(r.stats.structuralSolves).toBe(0);
  });

  it('preserves physical approvals by identity even when total clashes decrease', () => {
    const { input } = harness();
    input.detail.mockReturnValue(detail([2]));
    const r = searchPhysicalDesignAlternatives(input);
    expect(r.changed).toEqual([]);
    expect(r.outcomes).toBe(input.outcomes);
    expect(r.result).toBe(input.result);
    expect(r.trials.every(t => t.newlyBlocked?.includes(2))).toBe(true);
  });

  it('does not accept fewer clashes achieved by dropping verification coverage', () => {
    const { input } = harness();
    const missing = detail([]);
    missing.reverification.pop();
    input.detail.mockReturnValue(missing);
    expect(searchPhysicalDesignAlternatives(input).changed).toEqual([]);
  });

  it('never drops a member after a nominal failure and bounds nominal search work', () => {
    const { input, generate } = harness();
    generate.mockReturnValue({ ...outcome(1, 12), outcome: 'SEARCH_EXHAUSTED', accepted: undefined, certificate: undefined });
    input.budget.maxMemberSearches = 1;
    const r = searchPhysicalDesignAlternatives(input);
    expect(r.termination).toBe('budget');
    expect(r.stats.memberSearches).toBe(1);
    expect(r.outcomes).toBe(input.outcomes);
    expect(input.detail).not.toHaveBeenCalled();
  });

  it.each(['locked', 'span', 'provisional'] as const)('does not redesign a %s member', mode => {
    const { input, generate } = harness();
    if (mode === 'span') input.contexts.get(1)!.span = { representative: 1, elements: [1, 2] } as never;
    if (mode === 'provisional') input.outcomes.set(1, { ...outcome(1, 10), outcome: 'PROVISIONAL_BIAXIAL' } as MemberDesignOutcome);
    const r = searchPhysicalDesignAlternatives({ ...input, lockedMembers: mode === 'locked' ? new Set([1]) : undefined });
    expect(generate).not.toHaveBeenCalled();
    expect(r.changed).toEqual([]);
  });

  it('passes updated neighboring seats into each full-detail verification without mutating contexts', () => {
    const { input } = harness();
    searchPhysicalDesignAlternatives(input);
    const contexts = input.detail.mock.calls[0][1];
    expect(contexts.get(2)!.beamCorners!.get(1)!.bottomDiasMm).toEqual([16]);
    expect(input.contexts.get(2)!.beamCorners).toBeUndefined();
  });

  it('uses the last accepted neighbor assignment for subsequent member searches', () => {
    const { input, generate } = harness();
    input.result = detail([1, 1, 2]);
    input.detail.mockReturnValueOnce(detail([2])).mockReturnValueOnce(detail([]));
    const r = searchPhysicalDesignAlternatives(input);
    expect(r.changed).toEqual([1, 2]);
    expect(generate.mock.calls[1][1].beamCorners!.get(1)!.bottomDiasMm).toEqual([16]);
  });

  it('respects the project catalog and a zero geometry budget', () => {
    const { input, generate } = harness();
    input.contexts.get(1)!.material.longDiametersMm = [12];
    searchPhysicalDesignAlternatives(input);
    expect(generate.mock.calls.map(c => c[1].material.longDiametersMm)).toEqual([[12]]);
    generate.mockClear();
    input.budget.maxDetailingRuns = 0;
    expect(searchPhysicalDesignAlternatives(input).termination).toBe('budget');
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([NaN, Infinity, -1, 1.5])('rejects invalid operation budgets (%s)', value => {
    const { input } = harness();
    input.budget.maxMemberSearches = value;
    expect(() => searchPhysicalDesignAlternatives(input)).toThrow('non-negative integers');
  });

  it('reports physical work pending when a budget prevents repair despite passing section checks', () => {
    const { input } = harness();
    const r = runDesignFeedbackLoop({ ...input, budget: undefined, detail: () => input.result,
      physicalSearch: { maxDetailingRuns: 0, maxMemberSearches: 0 },
    });
    expect(r.outcome).toBe('PHYSICAL_REPAIR_PENDING');
    expect(r.stats.truncated).toBe(true);
    expect(r.physicalSearch!.termination).toBe('budget');
    expect(r.outcomes).toBe(input.outcomes);
    expect(r.result).toBe(input.result);
  });
});
