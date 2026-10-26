import { afterEach, describe, expect, it, vi } from 'vitest';
import * as design from '../../design/candidate-search';
import * as transverseAlternatives from '../beam-stirrup-alternatives';
import { cirsoc201Adapter } from '../../design/adapters/cirsoc201-adapter';
import type { MemberContext } from '../../design/member-context';
import type { MemberDesignOutcome } from '../../design/outcome';
import type { RunDetailingResult } from '../run-detailing';
import type { UnsupportedCondition } from '../assembly';
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

describe('column diameter repair', () => {
  function column() {
    const { input, generate } = harness();
    input.contexts.get(1)!.elementType = 'column';
    input.contexts.get(1)!.material.longDiametersMm = [16];
    input.contexts.get(2)!.columnCages = new Map([[1, 12], [90, 20]]);
    input.contexts.get(2)!.columnBars = new Map([[1, { count: 28, diameterMm: 12 }],
      [90, { count: 8, diameterMm: 20 }]]);
    input.outcomes.set(1, { ...outcome(1, 12), elementType: 'column',
      accepted: { longitudinal: { count: 28, diameter: 12 } } });
    generate.mockImplementation((_adapter, ctx) => ({ ...outcome(ctx.elementId, 16), elementType: 'column',
      accepted: { longitudinal: { count: 16, diameter: ctx.material.longDiametersMm![0] } } }));
    return { generate, input: { ...input, budget: { maxDetailingRuns: 1, maxMemberSearches: 1,
      operators: ['columnDiameterFamily'] as const } } };
  }

  it('rebuilds neighbouring beam registries for the complete trial without changing the retained contexts', () => {
    const { input, generate } = column();
    const result = searchPhysicalDesignAlternatives(input);
    expect(result.changed).toEqual([1]);
    expect(result.trials[0]).toMatchObject({ operator: 'columnDiameterFamily', diameterMm: 16, disposition: 'accepted' });
    expect(generate).toHaveBeenCalledTimes(1);
    const beam = input.detail.mock.calls[0][1].get(2)!;
    expect(beam.columnCages).toEqual(new Map([[1, 16], [90, 20]]));
    expect(beam.columnBars).toEqual(new Map([[1, { count: 16, diameterMm: 16 }], [90, { count: 8, diameterMm: 20 }]]));
    expect(input.contexts.get(2)!.columnCages!.get(1)).toBe(12);
    expect(input.contexts.get(2)!.columnBars!.get(1)!.count).toBe(28);
    expect(result.stats).toEqual({ detailingRuns: 1, memberSearches: 1, candidatesConsidered: 1,
      verifierCalls: 1, structuralSolves: 0 });
  });

  it.each(['neighbourClash', 'strength', 'missingCheck', 'unsupported', 'noProgress'] as const)(
    'retains the assignment on %s', reason => {
    const { input } = column();
    const next = detail(reason === 'neighbourClash' ? [2] : reason === 'noProgress' ? [1, 1] : [],
      reason === 'strength' ? [1] : []);
    if (reason === 'missingCheck') next.reverification = next.reverification.filter(r => r.elementId !== 1);
    if (reason === 'unsupported') next.assemblies[0].unsupported.push({ key: 'generation', message: 'unbuilt cage',
      refs: [], scope: { elementIds: [1] } });
    input.detail.mockReturnValue(next);
    const result = searchPhysicalDesignAlternatives(input);
    expect(result.outcomes).toBe(input.outcomes);
    expect(result.changed).toEqual([]);
    expect(result.trials[0].disposition).toBe(reason === 'noProgress' ? 'noProgress' : 'regression');
  });

  it.each(['default', 'locked', 'provisional', 'span', 'budget'] as const)('respects %s exclusions', reason => {
    const { input, generate } = column();
    if (reason === 'provisional') input.outcomes.get(1)!.outcome = 'PROVISIONAL_BIAXIAL';
    if (reason === 'span') input.contexts.get(1)!.span = { elements: [1, 2], representative: 1 } as never;
    const result = searchPhysicalDesignAlternatives({ ...input,
      lockedMembers: reason === 'locked' ? new Set([1]) : undefined,
      budget: { ...input.budget, operators: reason === 'default' ? undefined : input.budget.operators,
        maxMemberSearches: reason === 'budget' ? 0 : 1 } });
    expect(generate).not.toHaveBeenCalled();
    expect(input.detail).not.toHaveBeenCalled();
    expect(result.changed).toEqual([]);
  });

  it('does not build a column candidate that fails nominal verification', () => {
    const { input, generate } = column();
    generate.mockReturnValue({ ...input.outcomes.get(1)!, outcome: 'SEARCH_EXHAUSTED', accepted: undefined });
    const result = searchPhysicalDesignAlternatives(input);
    expect(input.detail).not.toHaveBeenCalled();
    expect(result.trials[0].disposition).toBe('nominalFailure');
    expect(result.changed).toEqual([]);
  });
});

describe('reopening exhausted members', () => {
  function refused() {
    const { input, generate } = harness();
    input.outcomes.set(1, { ...outcome(1, 16), outcome: 'SEARCH_EXHAUSTED', accepted: undefined });
    input.result = detail([]);
    input.result.reverification[0].status = 'noBars';
    return { generate, input: { ...input, budget: { maxDetailingRuns: 1, maxMemberSearches: 1,
      operators: ['retryExhausted'] as const } } };
  }

  it('retries with actual neighbour seats and materializes a recovery before accepting it', () => {
    const { input, generate } = refused();
    const result = searchPhysicalDesignAlternatives(input);
    expect(result.changed).toEqual([1]);
    expect(result.trials).toEqual([expect.objectContaining({ elementId: 1, disposition: 'accepted' })]);
    expect(generate.mock.calls[0][1].absentBeams).toEqual(new Set([1]));
    const builtContexts = input.detail.mock.calls[0][1];
    expect(builtContexts.get(2)!.absentBeams).toEqual(new Set());
    expect(builtContexts.get(2)!.beamCorners!.has(1)).toBe(true);
    expect(result.outcomes.get(1)!.outcome).toBe('VERIFIED');
    expect(input.outcomes.get(1)!.outcome).toBe('SEARCH_EXHAUSTED');
    expect(result.stats).toMatchObject({ memberSearches: 1, detailingRuns: 1, verifierCalls: 1 });
  });

  it.each(['selfClash', 'neighbourClash', 'strength', 'missingCheck'] as const)(
    'does not install a nominal recovery with a %s regression', reason => {
    const { input } = refused();
    const trial = detail(reason === 'selfClash' ? [1] : reason === 'neighbourClash' ? [2] : [],
      reason === 'strength' ? [1] : []);
    if (reason === 'missingCheck') trial.reverification = trial.reverification.filter(r => r.elementId !== 1);
    input.detail.mockReturnValue(trial);
    const result = searchPhysicalDesignAlternatives(input);
    expect(result.changed).toEqual([]);
    expect(result.outcomes).toBe(input.outcomes);
    expect(result.trials[0].disposition).toBe('regression');
  });

  it.each(['locked', 'span', 'provisional', 'budget'] as const)('respects %s exclusions', reason => {
    const { input, generate } = refused();
    if (reason === 'span') input.contexts.get(1)!.span = { elements: [1, 2], representative: 1 } as never;
    if (reason === 'provisional') input.outcomes.set(1, { ...input.outcomes.get(1)!, outcome: 'PROVISIONAL_BIAXIAL' });
    const result = searchPhysicalDesignAlternatives({ ...input,
      lockedMembers: reason === 'locked' ? new Set([1]) : undefined,
      budget: { ...input.budget, maxMemberSearches: reason === 'budget' ? 0 : 1 } });
    expect(generate).not.toHaveBeenCalled();
    expect(input.detail).not.toHaveBeenCalled();
    expect(result.changed).toEqual([]);
    if (reason === 'budget') expect(result.termination).toBe('budget');
  });
});

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

  function finalDepthLine() {
    const { input, verify } = line();
    for (const ctx of input.contexts.values()) {
      ctx.material.longDiametersMm = [16];
      ctx.stations = { comboResults: [{ stations: [
        { t: 0, my: -120, vz: 0 }, { t: 0.5, my: 60, vz: 0 }, { t: 1, my: -120, vz: 0 },
      ] }] } as never;
    }
    input.result.assemblies[0].conflicts = [];
    input.result.assemblies[0].unsupported = [{ key: 'detailing.finalVerification.failed',
      message: 'final flexure', refs: [], scope: { elementIds: [1] } }];
    input.result.reverification[0] = { ...input.result.reverification[0], status: 'fail',
      finalGeometry: { topLower: 0.02, bottomRaise: 0, depthTolerance: 0.015 } };
    return { verify, input: { ...input, budget: { maxDetailingRuns: 1, maxMemberSearches: 3,
      operators: ['harmonizeDemandCatalog'] as const } } };
  }

  it('repairs a line with a final-depth failure even when it has no clashes or open splices', () => {
    const { input, verify } = finalDepthLine();
    const result = searchPhysicalDesignAlternatives(input);
    expect(result.trials[0]).toMatchObject({ elementIds: [1, 2, 3], disposition: 'accepted' });
    expect(result.result.assemblies[0].unsupported).toEqual([]);
    expect(result.stats).toMatchObject({ detailingRuns: 1, memberSearches: 3, structuralSolves: 0 });
    expect(verify.mock.calls.find(([c]) => c.elementId === 1)![0].finalGeometry)
      .toEqual(input.result.reverification[0].finalGeometry);
    expect(verify.mock.calls.filter(([c]) => c.elementId !== 1).every(([c]) => c.finalGeometry === undefined)).toBe(true);
    expect(input.contexts.get(1)!.finalGeometry).toBeUndefined();
  });

  it('rejects a candidate that still fails at the known final depth before spending a full build', () => {
    const { input, verify } = finalDepthLine();
    verify.mockImplementation(c => ({ overallStatus: c.finalGeometry ? 'fail' : 'ok', strengthCheckCount: 2,
      checks: [{ status: c.finalGeometry ? 'fail' : 'ok', limiting: 'flexure', category: 'Top Start (My-)' }],
      worstUtilization: c.finalGeometry ? 1.01 : 0.8, checkedAxes: ['My'],
    } as never));
    const result = searchPhysicalDesignAlternatives(input);
    expect(result.trials[0]).toMatchObject({ disposition: 'nominalFailure', nominalFailures: [1] });
    expect(input.detail).not.toHaveBeenCalled();
    expect(result.outcomes).toBe(input.outcomes);
    expect(result.stats).toMatchObject({ detailingRuns: 0, memberSearches: 3 });
  });

  it('tries a small opposite-face increment for flexure before adding a tensile row', () => {
    const { input, verify } = finalDepthLine();
    input.budget.maxMemberSearches = 6;
    for (const id of [1, 2, 3]) {
      const o = outcome(id, 16);
      for (const region of ['topStart', 'topEnd', 'bottomSpan'] as const) o.accepted!.regions![region]!.count = 3;
      input.outcomes.set(id, o);
    }
    verify.mockImplementation((_c, r) => ({ overallStatus: r.regions!.bottomSpan!.count >= 4 ? 'ok' : 'fail',
      strengthCheckCount: 2, checks: [{ category: 'Top Start (My-)', limiting: 'flexure',
        status: r.regions!.bottomSpan!.count >= 4 ? 'ok' : 'fail' }],
      worstUtilization: r.regions!.bottomSpan!.count >= 4 ? 0.99 : 1.005, checkedAxes: ['My'],
    } as never));
    const result = searchPhysicalDesignAlternatives(input);
    expect(result.trials).toEqual([
      expect.objectContaining({ counts: [3], bottomCounts: [3], disposition: 'nominalFailure' }),
      expect.objectContaining({ counts: [3], bottomCounts: [4], disposition: 'accepted' }),
    ]);
    expect(result.stats).toMatchObject({ detailingRuns: 1, memberSearches: 6 });
  });

  it('bounds consecutive final-depth trials before giving another line its turn', () => {
    const { input, verify } = finalDepthLine();
    input.contexts.set(4, { ...input.contexts.get(3)!, elementId: 4 });
    input.outcomes.set(4, outcome(4, 16));
    input.result.assemblies[0].conflicts = detail([4]).assemblies[0].conflicts;
    input.result.reverification.push({ ...input.result.reverification[1], elementId: 4 });
    input.budget.maxMemberSearches = 16;
    verify.mockReturnValue({ overallStatus: 'fail', strengthCheckCount: 2,
      checks: [{ category: 'Top Start (My-)', limiting: 'flexure', status: 'fail' }],
      worstUtilization: 1.1, checkedAxes: ['My'],
    } as never);
    const result = searchPhysicalDesignAlternatives(input);
    expect(result.trials.slice(0, 5).map(t => t.elementId)).toEqual([1, 1, 1, 1, 4]);
    expect(result.stats.memberSearches).toBeLessThanOrEqual(16);
    expect(result.stats.detailingRuns).toBe(0);
    expect(result.changed).toEqual([]);
    expect(result.outcomes).toBe(input.outcomes);
  });

  it('still requires a new final-depth verification after building the candidate', () => {
    const { input } = finalDepthLine();
    input.detail.mockReturnValue(input.result);
    const result = searchPhysicalDesignAlternatives(input);
    expect(result.trials[0].disposition).toBe('regression');
    expect(result.outcomes).toBe(input.outcomes);
    expect(result.result).toBe(input.result);
    expect(result.changed).toEqual([]);
  });

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

  it('does not count moving a clash to another already blocked member as demand-guided progress', () => {
    const { input } = line();
    for (const ctx of input.contexts.values()) ctx.stations = { comboResults: [{ stations: [
      { t: 0, my: -100, vz: 0 }, { t: 0.5, my: 60, vz: 0 }, { t: 1, my: -100, vz: 0 },
    ] }] } as never;
    const clash = input.result.assemblies[0].conflicts[0];
    const at = (id: number) => ({ ...clash, elementIds: [id] });
    input.result.assemblies[0].conflicts = [at(1), at(1), at(2), at(99)];
    const moved = { ...input.result, assemblies: [{ ...input.result.assemblies[0],
      conflicts: [at(1), at(2), at(99), at(99)] }] };
    input.detail.mockReturnValue(moved);
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { maxDetailingRuns: 1, maxMemberSearches: 3, operators: ['harmonizeDemandCatalog'] } });
    expect(result.trials[0]).toMatchObject({ disposition: 'noProgress', newlyBlocked: [],
      progressBefore: [3, 4, 1, 1], progressAfter: [3, 4, 1, 1] });
    expect(result.outcomes).toBe(input.outcomes);
    expect(result.changed).toEqual([]);
  });

  it('builds requested bottom hooks and reverifies them before accepting a demand-guided cage', () => {
    const { input, verify } = line();
    for (const ctx of input.contexts.values()) ctx.stations = { comboResults: [{ stations: [
      { t: 0, my: -100, vz: 0 }, { t: 0.5, my: 60, vz: 0 }, { t: 1, my: -100, vz: 0 },
    ] }] } as never;
    verify.mockImplementation((_ctx, r) => {
      const hooked = r.regions?.bottomGroups?.[0].anchorageStart === 'hook';
      return { overallStatus: hooked ? 'ok' : 'fail', strengthCheckCount: 2,
        checks: [hooked ? { status: 'ok' } : { status: 'warn',
          anchorHook: { face: 'bottom', toward: 'start', group: 0 } }],
        worstUtilization: 0.8, checkedAxes: ['My'] } as never;
    });
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { maxDetailingRuns: 1, maxMemberSearches: 3, operators: ['harmonizeDemandCatalog'] } });
    expect(result.trials[0]).toMatchObject({ disposition: 'accepted', anchorageCompleted: [1, 2, 3] });
    expect(result.stats).toMatchObject({ memberSearches: 3, verifierCalls: 6, detailingRuns: 1 });
    for (const o of result.outcomes.values()) {
      expect(o.accepted!.regions!.bottomGroups![0].anchorageStart).toBe('hook');
      expect(o.certificate!.rebarHash).toBe(rebarHash(o.accepted));
      expect(o.searchStats.verifierCalls).toBe(2);
    }
    const detailed = input.detail.mock.calls[0][0];
    expect([...detailed.values()].every(o => o.accepted!.regions!.bottomGroups![0].anchorageStart === 'hook')).toBe(true);
  });

  it.each(['provisional', 'exhausted', 'locked', 'span'] as const)(
    'repairs eligible segments on both sides of a %s member without changing that member', reason => {
    const { input, verify } = line();
    if (reason === 'provisional') {
      input.outcomes.set(2, { ...input.outcomes.get(2)!, outcome: 'PROVISIONAL_BIAXIAL', accepted: undefined,
        provisional: { candidate: input.outcomes.get(2)!.accepted! } } as MemberDesignOutcome);
      input.result.provisionalMembers = [2];
    }
    if (reason === 'exhausted') input.outcomes.set(2, { ...input.outcomes.get(2)!, outcome: 'SEARCH_EXHAUSTED', accepted: undefined });
    if (reason === 'span') input.contexts.get(2)!.span = { elements: [2, 20], representative: 2 } as never;
    for (const ctx of input.contexts.values()) ctx.stations = { comboResults: [{ stations: [
      { t: 0, my: -120, vz: 0 }, { t: 0.5, my: 60, vz: 0 }, { t: 1, my: -120, vz: 0 },
    ] }] } as never;
    input.result.assemblies[0].unsupported = [];
    input.result.assemblies[0].conflicts.push({ ...input.result.assemblies[0].conflicts[0], elementIds: [3] });
    input.detail.mockImplementation(proposed => ({ ...input.result,
      assemblies: [{ ...input.result.assemblies[0], conflicts: input.result.assemblies[0].conflicts
        .filter(c => c.elementIds.some(id => proposed.get(id) === input.outcomes.get(id))) }] }));
    const result = searchPhysicalDesignAlternatives({ ...input,
      lockedMembers: reason === 'locked' ? new Set([2]) : undefined,
      budget: { maxDetailingRuns: 2, maxMemberSearches: 2, operators: ['harmonizeDemandCatalog'] } });
    expect(result.changed).toEqual([1, 3]);
    expect(verify.mock.calls.map(([ctx]) => ctx.elementId)).toEqual([1, 3]);
    expect(result.outcomes.get(2)).toBe(input.outcomes.get(2));
    expect(result.result.provisionalMembers).toEqual(input.result.provisionalMembers);
    expect(result.result.assemblies[0].conflicts.map(c => c.elementIds)).toEqual([[2]]);
  });

  it('keeps adjacent eligible members in one atomic segment when the next member is locked', () => {
    const { input, verify } = line();
    for (const ctx of input.contexts.values()) ctx.stations = { comboResults: [{ stations: [
      { t: 0, my: -120, vz: 0 }, { t: 0.5, my: 60, vz: 0 }, { t: 1, my: -120, vz: 0 },
    ] }] } as never;
    const result = searchPhysicalDesignAlternatives({ ...input, lockedMembers: new Set([3]),
      budget: { maxDetailingRuns: 1, maxMemberSearches: 2, operators: ['harmonizeDemandCatalog'] } });
    expect(result.trials).toHaveLength(1);
    expect(result.trials[0]).toMatchObject({ elementIds: [1, 2], disposition: 'accepted' });
    expect(verify.mock.calls.map(([ctx]) => ctx.elementId)).toEqual([1, 2]);
    expect(result.outcomes.get(3)).toBe(input.outcomes.get(3));
  });

  it('rejects a partial-line repair that worsens a boundary splice', () => {
    const { input } = line();
    input.outcomes.set(2, { ...input.outcomes.get(2)!, outcome: 'SEARCH_EXHAUSTED', accepted: undefined });
    for (const ctx of input.contexts.values()) ctx.stations = { comboResults: [{ stations: [
      { t: 0, my: -120, vz: 0 }, { t: 0.5, my: 60, vz: 0 }, { t: 1, my: -120, vz: 0 },
    ] }] } as never;
    input.detail.mockReturnValue({ ...input.result, assemblies: [{ ...input.result.assemblies[0],
      conflicts: [], unsupported: [...input.result.assemblies[0].unsupported,
        { key: 'detailing.lapCheck.integrity', scope: { elementIds: [1, 2] }, params: { joint: 'n2' }, message: 'boundary', refs: [] }] }] });
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { maxDetailingRuns: 1, maxMemberSearches: 1, operators: ['harmonizeDemandCatalog'] } });
    expect(result.trials[0]).toMatchObject({ elementIds: [1], disposition: 'regression' });
    expect(result.trials[0].regressions).toContain('detailing.lapCheck.integrity');
    expect(result.outcomes).toBe(input.outcomes);
  });

  it('retries a rejected prefix when an adjacent line changes, without renewing its budget', () => {
    const { input } = line();
    const model = input.contexts.get(1)!.modelData;
    for (const id of [5, 6]) model.nodes.set(id, { id, x: 6, y: id === 5 ? -6 : 6, z: 0 });
    for (const id of [4, 5]) {
      model.elements.set(id, { ...model.elements.get(1)!, id,
        nodeI: id === 4 ? 5 : 2, nodeJ: id === 4 ? 2 : 6 });
      input.contexts.set(id, { ...syntheticBeamContext({ elementId: id }), modelData: model });
      input.outcomes.set(id, outcome(id, 16));
      input.result.reverification.push({ ...input.result.reverification[0], elementId: id });
      input.result.layering!.lineOfMember.set(id, 'crossing');
    }
    for (const ctx of input.contexts.values()) {
      ctx.material.longDiametersMm = [16];
      ctx.stations = { comboResults: [{ stations: [
        { t: 0, my: -120, vz: 0 }, { t: 0.5, my: 60, vz: 0 }, { t: 1, my: -120, vz: 0 },
      ] }] } as never;
    }
    input.result.assemblies[0].unsupported = [];
    input.result.assemblies[0].conflicts.push({ ...input.result.assemblies[0].conflicts[0], elementIds: [4] });
    input.detail.mockImplementation(proposed => {
      const mainChanged = proposed.get(1)!.accepted!.regions!.topStart!.count === 4;
      const crossing = proposed.get(4)!.accepted!.regions!;
      const firstCrossingProposal = crossing.topStart!.count === 4 && crossing.bottomSpan!.count === 3;
      return { ...input.result, assemblies: [{ ...input.result.assemblies[0],
        conflicts: mainChanged ? firstCrossingProposal ? [] : input.result.assemblies[0].conflicts.slice(-1)
          : input.result.assemblies[0].conflicts }] };
    });
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { maxDetailingRuns: 3, maxMemberSearches: 7, operators: ['harmonizeDemandCatalog'] } });
    expect(result.trials.map(t => [t.elementIds, t.disposition, t.counts, t.bottomCounts])).toEqual([
      [[4, 5], 'noProgress', [4], [3]], [[1, 2, 3], 'accepted', [4], [3]],
      [[4, 5], 'accepted', [4], [3]],
    ]);
    expect(result.stats).toMatchObject({ detailingRuns: 3, memberSearches: 7, verifierCalls: 7 });
    expect(result.result.assemblies[0].conflicts).toEqual([]);
  });

  it('reaches a different diameter pair before row variants consume a short detailing budget', () => {
    const { input } = line();
    for (const ctx of input.contexts.values()) {
      ctx.material.longDiametersMm = [12, 16, 20];
      ctx.stations = { comboResults: [{ stations: [
        { t: 0, my: -120, vz: 0 }, { t: 0.5, my: 60, vz: 0 }, { t: 1, my: -120, vz: 0 },
      ] }] } as never;
    }
    const closed = input.detail.getMockImplementation()!(input.outcomes, input.contexts);
    input.detail.mockImplementation(proposed => {
      const r = proposed.get(1)!.accepted!.regions!;
      return r.topStart!.diameter === 20 && r.bottomSpan!.diameter === 12 ? closed : input.result;
    });
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { maxDetailingRuns: 9, maxMemberSearches: 27, operators: ['harmonizeDemandCatalog'] } });
    expect(result.changed).toEqual([1, 2, 3]);
    expect(result.trials.at(-1)).toMatchObject({ disposition: 'accepted', diameterMm: 20, bottomDiameterMm: 12 });
    expect(result.stats.detailingRuns).toBeLessThanOrEqual(9);
    expect(result.stats.memberSearches).toBeLessThanOrEqual(27);
    expect(result.result).toBe(closed);
  });

  function stirrupLine() {
    const { input, verify } = line();
    for (const [id, ctx] of input.contexts) {
      ctx.material.stirrupDiametersMm = [6, 8, 10];
      const r = input.outcomes.get(id)!.accepted!;
      r.regions!.stirrupsSupport = { diameter: id === 1 ? 8 : 6, legs: 2, spacing: 0.1 };
      r.regions!.stirrupsSpan = { diameter: id === 1 ? 8 : 6, legs: 2, spacing: 0.15 };
    }
    return { verify, input: { ...input, budget: { maxDetailingRuns: 1, maxMemberSearches: 3,
      operators: ['harmonizeStirrupCatalog'] as const } } };
  }

  it('verifies every member of a transverse repair and keeps all longitudinal steel', () => {
    const { input, verify } = stirrupLine();
    const result = searchPhysicalDesignAlternatives(input);
    expect(result.changed).toEqual([2, 3]);
    expect(result.trials[0]).toMatchObject({ disposition: 'accepted', stirrupDiameterMm: 8,
      stirrupSpacings: [1, 2, 3].map(elementId => ({ elementId, support: 0.1, span: 0.15 })) });
    expect(result.trials[0].diameterMm).toBeUndefined();
    expect(verify).toHaveBeenCalledTimes(3);
    expect(result.stats).toMatchObject({ detailingRuns: 1, memberSearches: 3, structuralSolves: 0 });
    for (const [id, o] of result.outcomes) {
      expect(o.accepted!.regions!.topStart).toEqual(input.outcomes.get(id)!.accepted!.regions!.topStart);
      expect(o.accepted!.regions!.bottomSpan).toEqual(input.outcomes.get(id)!.accepted!.regions!.bottomSpan);
      expect(o.certificate!.rebarHash).toBe(rebarHash(o.accepted));
    }
    expect(input.outcomes.get(2)!.accepted!.regions!.stirrupsSupport!.diameter).toBe(6);
  });

  it.each(['nominal', 'cover', 'neighbour', 'budget', 'locked'] as const)(
    'does not install a transverse change with a %s failure or restriction', reason => {
      const { input, verify } = stirrupLine();
      if (reason === 'nominal') verify.mockReturnValue({ overallStatus: 'fail', strengthCheckCount: 1,
        checks: [{ status: 'fail', category: 'Shear', limiting: 'shear' }] } as never);
      if (reason === 'cover') {
        const closed = input.detail.getMockImplementation()!(input.outcomes, input.contexts);
        closed.assemblies[0].unsupported.push({ key: 'detailing.cover.violated', refs: [], message: 'cover',
          scope: { elementIds: [1] } });
      }
      if (reason === 'neighbour') input.detail.mockReturnValue({ ...input.result,
        assemblies: [{ ...input.result.assemblies[0], conflicts: [{ ...input.result.assemblies[0].conflicts[0], elementIds: [3] }] }] });
      const result = searchPhysicalDesignAlternatives({ ...input,
        lockedMembers: reason === 'locked' ? new Set([2]) : undefined,
        budget: { ...input.budget, maxMemberSearches: reason === 'budget' ? 2 : 3 } });
      expect(result.changed).toEqual([]);
      expect(result.outcomes).toBe(input.outcomes);
      if (reason === 'nominal' || reason === 'budget' || reason === 'locked') expect(input.detail).not.toHaveBeenCalled();
      if (reason === 'cover') expect(result.trials[0].regressions).toContain('detailing.cover.violated');
      if (reason === 'neighbour') expect(result.trials[0].newlyBlocked).toEqual([3]);
    });

  it('does not silently add longitudinal hooks to make a transverse-only repair pass', () => {
    const { input, verify } = stirrupLine();
    verify.mockImplementation((_ctx, r) => ({ overallStatus: 'warn', strengthCheckCount: 2,
      checks: r.regions?.bottomGroups?.[0].anchorageStart === 'hook' ? [{ status: 'ok' }]
        : [{ status: 'warn', anchorHook: { face: 'bottom', toward: 'start', group: 0 } }],
    } as never));
    const result = searchPhysicalDesignAlternatives(input);
    expect(result.changed).toEqual([]);
    expect(result.outcomes).toBe(input.outcomes);
    expect(result.trials[0]).toMatchObject({ disposition: 'nominalFailure', nominalFailures: [1, 2, 3] });
    expect(verify).toHaveBeenCalledTimes(3);
    expect(input.detail).not.toHaveBeenCalled();
  });

  it('repairs longitudinal steel and transverse seats together when neither isolated change works', () => {
    const { input } = stirrupLine();
    for (const ctx of input.contexts.values()) {
      ctx.material.longDiametersMm = [16]; ctx.material.stirrupDiametersMm = [6, 8];
      ctx.stations = { comboResults: [{ stations: [
        { t: 0, my: -120, vz: 0 }, { t: 0.5, my: 60, vz: 0 }, { t: 1, my: -120, vz: 0 },
      ] }] } as never;
    }
    const closed = input.detail.getMockImplementation()!(input.outcomes, input.contexts);
    input.detail.mockImplementation(proposed => {
      const both = [...proposed.values()].every(o => o.accepted!.regions!.topStart!.count === 4
        && o.accepted!.regions!.stirrupsSupport!.diameter === 8);
      return both ? closed : input.result;
    });
    for (const operator of ['harmonizeDemandCatalog', 'harmonizeStirrupCatalog'] as const) {
      const isolated = searchPhysicalDesignAlternatives({ ...input,
        budget: { maxDetailingRuns: 2, maxMemberSearches: 6, operators: [operator] } });
      expect(isolated.changed).toEqual([]);
      expect(isolated.outcomes).toBe(input.outcomes);
    }
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { maxDetailingRuns: 2, maxMemberSearches: 6, operators: ['harmonizeCoupledCatalog'] } });
    expect(result.trials.map(t => t.disposition)).toEqual(['noProgress', 'accepted']);
    expect(result.trials[1]).toMatchObject({ diameterMm: 16, counts: [4], stirrupDiameterMm: 8 });
    expect(result.stats).toMatchObject({ detailingRuns: 2, memberSearches: 6, structuralSolves: 0 });
    expect(result.changed).toEqual([1, 2, 3]);
    expect(result.result).toBe(closed);
  });

  function coupledLines(residualRegression = false) {
    const { input } = line();
    const model = input.contexts.get(1)!.modelData;
    for (const id of [5, 6, 7]) model.nodes.set(id, { id, x: (id - 5) * 6, y: 12, z: 0 });
    for (const id of [4, 5]) {
      model.elements.set(id, { ...model.elements.get(1)!, id, nodeI: id + 1, nodeJ: id + 2 });
      input.contexts.set(id, { ...syntheticBeamContext({ elementId: id }), modelData: model });
      input.outcomes.set(id, outcome(id, 16));
      input.result.reverification.push({ ...input.result.reverification[0], elementId: id });
      input.result.layering!.lineOfMember.set(id, 'remote');
    }
    for (const ctx of input.contexts.values()) {
      ctx.material.longDiametersMm = [16];
      ctx.stations = { comboResults: [{ stations: [
        { t: 0, my: -120, vz: 0 }, { t: 0.5, my: 60, vz: 0 }, { t: 1, my: -120, vz: 0 },
      ] }] } as never;
    }
    input.result.assemblies[0].elementIds = [1, 2, 3, 4, 5];
    input.result.assemblies[0].unsupported = [];
    input.detail.mockImplementation(proposed => {
      const primary = proposed.get(1)!.accepted!.regions!.topStart!.count === 4;
      const companion = proposed.get(4)!.accepted!.regions!.topStart!.count === 4;
      return { ...input.result, assemblies: [{ ...input.result.assemblies[0],
        conflicts: primary ? [] : input.result.assemblies[0].conflicts,
        unsupported: [
          ...(primary && !companion ? [{ key: 'detailing.lapCheck.integrity', message: 'remote splice', refs: [],
            scope: { elementIds: [4, 5] }, params: { joint: 'n6' } }] : []),
          ...(primary && residualRegression ? [{ key: 'detailing.lapCheck.integrity', message: 'other splice', refs: [],
            scope: { elementIds: [99] }, params: { joint: 'n99' } }] : []),
        ],
      }] };
    });
    return { ...input, budget: { maxDetailingRuns: 2, maxMemberSearches: 5,
      operators: ['harmonizeCoupledCatalog'] as const } };
  }

  it.each(['generation', 'detailing.cover.violated', 'detailing.lapCheck.spacing', 'unscoped'] as const)(
    'repairs a %s condition even when no member has blocking collisions', kind => {
    const { input } = line();
    for (const ctx of input.contexts.values()) ctx.stations = { comboResults: [{ stations: [
      { t: 0, my: -120, vz: 0 }, { t: 0.5, my: 60, vz: 0 }, { t: 1, my: -120, vz: 0 },
    ] }] } as never;
    input.result.assemblies[0].conflicts = [];
    // Older serialized conditions can omit scope; they conservatively hold the assembly.
    input.result.assemblies[0].unsupported = [{ key: kind === 'unscoped' ? 'generation' : kind,
      message: 'cannot construct', refs: [], ...(kind === 'unscoped' ? {} : { scope: { elementIds: [1] } }) } as UnsupportedCondition];
    const before = structuredClone(input.outcomes);
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { operators: ['harmonizeCoupledCatalog'], maxDetailingRuns: 2, maxMemberSearches: 4 } });
    // The queued whole-line target must disappear once the local generation hold clears.
    expect(result.trials).toHaveLength(1);
    expect(result.trials[0]).toMatchObject({ disposition: 'accepted', elementIds: kind === 'generation' ? [1] : [1, 2, 3] });
    expect(result.stats).toMatchObject({ detailingRuns: 1, memberSearches: kind === 'generation' ? 1 : 3 });
    expect(result.result.assemblies[0].unsupported).toEqual([]);
    expect(input.outcomes).toEqual(before);
  });

  it('gives a line held only by a construction condition a turn before congested lines', () => {
    const input = coupledLines();
    input.result.assemblies[0].unsupported = [{ key: 'generation', message: 'empty bend', refs: [],
      scope: { elementIds: [4] } }];
    input.detail.mockImplementation(() => ({ ...input.result,
      assemblies: [{ ...input.result.assemblies[0], unsupported: [] }] }));
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { ...input.budget, maxDetailingRuns: 1, maxMemberSearches: 2 } });
    expect(result.trials.map(t => [t.elementIds, t.disposition])).toEqual([[[4], 'accepted']]);
    expect(result.changed).toEqual([4]);
    expect(result.stats).toMatchObject({ detailingRuns: 1, memberSearches: 1 });
    expect(result.result.assemblies[0].conflicts).toEqual(input.result.assemblies[0].conflicts);
  });

  it('repairs a generation-only defect with transverse steel before introducing new longitudinal patterns', () => {
    const input = coupledLines();
    input.result.assemblies[0].conflicts = [];
    input.result.assemblies[0].unsupported = [{ key: 'generation', message: 'empty bend', refs: [],
      scope: { elementIds: [1] } }];
    for (const id of [1, 2, 3]) {
      const r = input.outcomes.get(id)!.accepted!.regions!;
      r.stirrupsSupport = { diameter: 8, legs: 2, spacing: 0.15 };
      r.stirrupsSpan = { diameter: 6, legs: 2, spacing: 0.15 };
    }
    const before = structuredClone(input.outcomes);
    input.detail.mockImplementation(proposed => ({ ...input.result, assemblies: [{ ...input.result.assemblies[0],
      unsupported: proposed.get(1)!.accepted!.regions!.stirrupsSpan!.diameter === 8
        ? [] : input.result.assemblies[0].unsupported,
    }] }));
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { ...input.budget, maxDetailingRuns: 1, maxMemberSearches: 3 } });
    expect(result.trials[0]).toMatchObject({ disposition: 'accepted', stirrupDiameterMm: 8 });
    expect(result.trials[0].counts).toBeUndefined();
    expect(result.trials[0].diameterMm).toBeUndefined();
    expect(result.result.assemblies[0].unsupported).toEqual([]);
    for (const id of [1, 2, 3]) {
      const r = result.outcomes.get(id)!.accepted!.regions!, old = before.get(id)!.accepted!.regions!;
      expect(r.topStart).toEqual(old.topStart);
      expect(r.topEnd).toEqual(old.topEnd);
      expect(r.bottomSpan).toEqual(old.bottomSpan);
      expect(r.stirrupsSpan).toEqual({ diameter: id === 1 ? 8 : 6, legs: 2, spacing: 0.15 });
    }
    expect(input.outcomes).toEqual(before);
    expect(result.stats).toMatchObject({ detailingRuns: 1, memberSearches: 1 });
    expect(result.changed).toEqual([1]);
  });

  it.each([true, false])('retains a generation repair only when its global condition measure improves (%s)', improves => {
    const input = coupledLines();
    input.result.assemblies[0].conflicts = [{ ...input.result.assemblies[0].conflicts[0], severity: 'marginal' }];
    const marginal = { key: 'detailing.clash.unresolved', message: 'unchanged contact', refs: [], scope: { elementIds: [1, 2] } };
    const generation = { key: 'generation', message: 'empty bend', refs: [], scope: { elementIds: [1] } };
    input.result.assemblies[0].unsupported = [marginal, generation];
    input.detail.mockImplementation(() => ({ ...input.result, assemblies: [{ ...input.result.assemblies[0],
      unsupported: improves ? [marginal] : [marginal, generation],
    }] }));
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { ...input.budget, maxDetailingRuns: 1, maxMemberSearches: 1 } });
    expect(result.trials[0]).toMatchObject({ disposition: improves ? 'accepted' : 'noProgress',
      progressBefore: [2, 0, 2, 0], progressAfter: [2, 0, improves ? 1 : 2, 0] });
    expect(result.changed).toEqual(improves ? [1] : []);
    expect(result.stats).toMatchObject({ detailingRuns: 1, memberSearches: 1 });
    expect(result.result.assemblies[0].conflicts).toEqual(input.result.assemblies[0].conflicts);
  });

  it('does not trade a generation condition for more unresolved pairs hidden in one splice report', () => {
    const input = coupledLines();
    input.result.assemblies[0].conflicts = [];
    const lap = { key: 'detailing.lapCheck.unarranged', message: 'unarranged', refs: [],
      scope: { elementIds: [1, 2] }, params: { joint: 'n2', pairs: 2 } };
    input.result.assemblies[0].unsupported = [lap,
      { key: 'generation', message: 'empty bend', refs: [], scope: { elementIds: [1] } }];
    input.detail.mockImplementation(() => ({ ...input.result, assemblies: [{ ...input.result.assemblies[0],
      unsupported: [{ ...lap, params: { ...lap.params, pairs: 3 } }],
    }] }));
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { ...input.budget, maxDetailingRuns: 1, maxMemberSearches: 1 } });
    expect(result.trials[0]).toMatchObject({ disposition: 'noProgress',
      progressBefore: [2, 0, 2, 2], progressAfter: [2, 0, 1, 3] });
    expect(result.changed).toEqual([]);
    expect(result.outcomes).toBe(input.outcomes);
  });

  it('does not create a repair target from a marginal-only clash report', () => {
    const { input } = line();
    input.result.assemblies[0].conflicts = input.result.assemblies[0].conflicts
      .map(c => ({ ...c, severity: 'marginal' }));
    input.result.assemblies[0].unsupported = [{ key: 'detailing.clash.unresolved', message: 'marginal', refs: [],
      scope: { elementIds: [1, 2, 3] } }];
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { ...input.budget, operators: ['harmonizeCoupledCatalog'] } });
    expect(result.changed).toEqual([]);
    expect(input.detail).not.toHaveBeenCalled();
    expect(result.stats).toMatchObject({ detailingRuns: 0, memberSearches: 0 });
  });

  it.each(['clash', 'condition'] as const)('reopens a consumed prefix after its remote %s dependency changes', mode => {
    const input = coupledLines();
    input.result.assemblies[0].conflicts = detail([1, 4]).assemblies[0].conflicts;
    const matches = (r: ReturnType<typeof outcome>['accepted']) => r!.regions!.topStart!.count === 4
      && r!.regions!.bottomSpan!.count === 3;
    input.detail.mockImplementation(proposed => {
      const primary = matches(proposed.get(1)!.accepted), remote = matches(proposed.get(4)!.accepted);
      const rejected = primary && !remote;
      return { ...input.result, assemblies: [{ ...input.result.assemblies[0],
        bars: [{ id: 'remote', role: 'longitudinal', ownerElementIds: [4, 5], layerId: 'e4:top:0' }],
        conflicts: rejected && mode === 'clash'
          ? [{ elementIds: [4, 99], severity: 'overlap', barA: 'remote', barB: 'column' }]
          : detail([...(primary ? [] : [1]), ...(remote ? [] : [4])]).assemblies[0].conflicts,
        unsupported: rejected && mode === 'condition' ? [{ key: 'detailing.cover.violated', message: 'cover', refs: [],
          scope: { elementIds: [4] }, params: { bar: 'remote' } }] : [],
      }] } as unknown as RunDetailingResult;
    });
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { operators: ['harmonizeDemandCatalog'], maxDetailingRuns: 3, maxMemberSearches: 8 } });
    expect(result.trials.map(t => [t.elementId, t.counts, t.bottomCounts, t.disposition])).toEqual([
      [1, [4], [3], 'regression'], [4, [4], [3], 'accepted'], [1, [4], [3], 'accepted'],
    ]);
    expect(result.changed).toEqual([1, 2, 3, 4, 5]);
    expect(result.stats).toMatchObject({ detailingRuns: 3, memberSearches: 8 });
    expect(result.result.assemblies[0].conflicts).toEqual([]);
    expect(result.result.assemblies[0].unsupported).toEqual([]);
  });

  it('does not reopen a prefix because an unchanged condition shares the regressed key', () => {
    const input = coupledLines();
    const existing = { key: 'detailing.cover.violated', message: 'existing', refs: [],
      scope: { elementIds: [4] }, params: { bar: 'remote' } };
    input.result.assemblies[0].conflicts = detail([1, 4]).assemblies[0].conflicts;
    input.result.assemblies[0].unsupported = [existing];
    const matches = (r: ReturnType<typeof outcome>['accepted']) => r!.regions!.topStart!.count === 4
      && r!.regions!.bottomSpan!.count === 3;
    input.detail.mockImplementation(proposed => {
      const primary = matches(proposed.get(1)!.accepted), remote = matches(proposed.get(4)!.accepted);
      return { ...input.result, assemblies: [{ ...input.result.assemblies[0],
        bars: [{ id: 'remote', role: 'longitudinal', ownerElementIds: [4, 5] }],
        conflicts: detail([...(primary ? [] : [1]), ...(remote ? [] : [4])]).assemblies[0].conflicts,
        unsupported: [existing, ...(primary ? [{ ...existing, message: 'new',
          scope: { elementIds: [99] }, params: { bar: 'other' } }] : [])],
      }] } as unknown as RunDetailingResult;
    });
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { operators: ['harmonizeDemandCatalog'], maxDetailingRuns: 3, maxMemberSearches: 8 } });
    expect(result.trials.map(t => [t.elementId, t.disposition])).toEqual([
      [1, 'regression'], [4, 'accepted'], [1, 'noProgress'],
    ]);
    expect(result.changed).toEqual([4, 5]);
    expect(result.stats).toMatchObject({ detailingRuns: 3, memberSearches: 8 });
  });

  it.each([
    ['unchanged', 4], ['collateral', 8], ['otherRegression', 4],
  ] as const)('prioritizes congestion but bounds the %s neighbourhood before yielding', (mode, limit) => {
    const generate = transverseAlternatives.beamCompatibleCageAlternatives;
    const enumerated = vi.fn();
    vi.spyOn(transverseAlternatives, 'beamCompatibleCageAlternatives').mockImplementation(function* (...args) {
      enumerated(args[0].map(c => c.elementId));
      yield* generate(...args);
    });
    const input = coupledLines();
    input.result.assemblies[0].conflicts.push(...detail([4]).assemblies[0].conflicts);
    const next = mode === 'unchanged' ? input.result : { ...input.result,
      assemblies: [{ ...input.result.assemblies[0], conflicts: detail([99]).assemblies[0].conflicts,
        unsupported: mode === 'otherRegression' ? [{ key: 'detailing.cover.violated', message: 'cover', refs: [],
          scope: { elementIds: [99] } }] : [] }] };
    input.detail.mockReturnValue(next);
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { ...input.budget, maxDetailingRuns: limit + 1, maxMemberSearches: limit * 3 + 2 } });
    expect(result.trials.map(t => t.elementId)).toEqual([...Array(limit).fill(1), 4]);
    expect(enumerated.mock.calls).toEqual([[[1, 2, 3]], [[4, 5]]]);
    expect(result.stats).toMatchObject({ detailingRuns: limit + 1, memberSearches: limit * 3 + 2, structuralSolves: 0 });
    expect(result.outcomes).toBe(input.outcomes);
    expect(result.changed).toEqual([]);
  });

  it.each(['member', 'detail'] as const)('does not build a coupled catalog without enough %s budget for one proposal', kind => {
    const input = coupledLines();
    const catalog = vi.spyOn(transverseAlternatives, 'beamCompatibleCageAlternatives');
    const result = searchPhysicalDesignAlternatives({ ...input, budget: { ...input.budget,
      maxDetailingRuns: kind === 'detail' ? 0 : 2, maxMemberSearches: kind === 'member' ? 2 : 5 } });
    expect(catalog).not.toHaveBeenCalled();
    expect(input.detail).not.toHaveBeenCalled();
    expect(result.termination).toBe('budget');
    expect(result.stats).toMatchObject({ detailingRuns: 0, memberSearches: 0 });
    expect(result.outcomes).toBe(input.outcomes);
  });

  it.each(['mixed', 'uniform'] as const)('bounds a %s transverse catalog at twelve proposals before yielding', mode => {
    const input = coupledLines();
    input.result.assemblies[0].conflicts.push(...detail([4]).assemblies[0].conflicts);
    for (const id of [1, 2, 3]) {
      const regions = input.outcomes.get(id)!.accepted!.regions!;
      regions.stirrupsSupport = { diameter: mode === 'mixed' && id === 1 ? 6 : 8, legs: 2, spacing: 0.15 };
      regions.stirrupsSpan = { ...regions.stirrupsSupport };
    }
    input.detail.mockReturnValue(input.result);
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { ...input.budget, maxDetailingRuns: 13, maxMemberSearches: 38 } });
    expect(result.trials.map(t => t.elementId)).toEqual([...Array(12).fill(1), 4]);
    expect(result.stats).toMatchObject({ detailingRuns: 13, memberSearches: 38, structuralSolves: 0 });
    expect(result.outcomes).toBe(input.outcomes);
    expect(result.changed).toEqual([]);
  });

  it.each(['top', 'bottom'] as const)('changes the %s face that blocks a new neighbour after nominal verification passes', face => {
    const input = coupledLines();
    for (const ctx of input.contexts.values()) ctx.material.longDiametersMm = [12, 16];
    input.detail.mockImplementation(proposed => {
      const r = proposed.get(1)!.accepted!.regions!;
      const closed = r.topStart!.count === (face === 'top' ? 5 : 4) && r.bottomSpan!.count === (face === 'top' ? 3 : 4);
      return { ...input.result, assemblies: [{ ...input.result.assemblies[0], unsupported: [],
        bars: [{ id: 'primary-top', role: 'longitudinal', ownerElementIds: [1], layerId: `e1:${face}:0` }],
        conflicts: closed ? [] : [{ elementIds: [1, 4, 99], severity: 'overlap', barA: 'primary-top', barB: 'joint-tie' }],
      }] } as unknown as RunDetailingResult;
    });
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { ...input.budget, maxDetailingRuns: 2, maxMemberSearches: 6 } });
    expect(result.trials.map(t => [t.counts, t.bottomCounts, t.disposition])).toEqual([
      [[4], [3], 'regression'], [[face === 'top' ? 5 : 4], [face === 'top' ? 3 : 4], 'accepted'],
    ]);
    expect(result.stats).toMatchObject({ detailingRuns: 2, memberSearches: 6 });
    expect(result.result.assemblies[0].conflicts).toEqual([]);
    expect(result.changed).toEqual([1, 2, 3]);
  });

  it('retains the deferred companion route when changing the primary bars cannot close the joint', () => {
    const input = coupledLines();
    const generate = transverseAlternatives.beamCompatibleCageAlternatives;
    vi.spyOn(transverseAlternatives, 'beamCompatibleCageAlternatives').mockImplementation(function* (...args) {
      const first = generate(...args).next();
      if (!first.done) yield first.value;
    });
    input.detail.mockImplementation(proposed => {
      const closed = proposed.get(4)!.accepted!.regions!.topStart!.count === 4;
      return { ...input.result, assemblies: [{ ...input.result.assemblies[0], unsupported: [],
        bars: [{ id: 'primary', role: 'longitudinal', ownerElementIds: [1], layerId: 'e1:top:0' }],
        conflicts: closed ? [] : [{ elementIds: [1, 4, 5, 99], severity: 'overlap', barA: 'primary', barB: 'joint-tie' }],
      }] } as unknown as RunDetailingResult;
    });
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { ...input.budget, maxDetailingRuns: 3, maxMemberSearches: 8 } });
    expect(result.trials.map(t => t.disposition)).toEqual(['regression', 'accepted']);
    expect(result.trials[0].companionTrials).toBeUndefined();
    expect(result.trials[1].companionRetained).toBe(true);
    expect(result.changed).toEqual([1, 2, 3, 4, 5]);
    expect(result.stats).toMatchObject({ detailingRuns: 3, memberSearches: 8 });
    expect(result.result.assemblies[0].conflicts).toEqual([]);
  });

  it('repairs every owner of a continuous bar even when its cover report names only one span', () => {
    const input = coupledLines();
    const base = input.detail.getMockImplementation()!;
    input.detail.mockImplementation((...args) => {
      const next = base(...args);
      if (next.assemblies[0].unsupported.length) {
        next.assemblies[0].unsupported = [{ key: 'detailing.cover.violated', message: 'cover', refs: [],
          scope: { elementIds: [4] }, params: { bar: 'continuous' } }];
        next.assemblies[0].bars = [{ id: 'continuous', ownerElementIds: [4, 5], role: 'longitudinal' }] as never;
      }
      return next;
    });
    const result = searchPhysicalDesignAlternatives(input);
    expect(result.changed).toEqual([1, 2, 3, 4, 5]);
    expect(result.trials[0]).toMatchObject({ disposition: 'accepted', companionIds: [4, 5] });
    expect(result.stats).toMatchObject({ detailingRuns: 2, memberSearches: 5 });
    expect(result.result.assemblies[0].unsupported).toEqual([]);
  });

  it('can complete a companion beyond four builds without exceeding the shared budget', () => {
    const input = coupledLines();
    const base = input.detail.getMockImplementation()!;
    input.detail.mockImplementation((...args) => {
      const next = base(...args);
      const r = args[0].get(4)!.accepted!.regions!;
      if (r.topStart!.count !== 3 || r.bottomSpan!.count !== 3)
        next.assemblies[0].unsupported = [{ key: 'detailing.lapCheck.integrity', message: 'remote splice', refs: [],
          scope: { elementIds: [4, 5] }, params: { joint: 'n6' } }];
      else next.assemblies[0].unsupported = [];
      return next;
    });
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { ...input.budget, maxDetailingRuns: 7, maxMemberSearches: 15 } });
    expect(result.changed).toEqual([1, 2, 3, 4, 5]);
    expect(result.trials[0]).toMatchObject({ disposition: 'accepted', companionRetained: true });
    expect(result.trials[0].companionTrials!.length).toBeGreaterThan(4);
    expect(result.stats.detailingRuns).toBeLessThanOrEqual(7);
    expect(result.stats.memberSearches).toBeLessThanOrEqual(15);
    expect(result.result.assemblies[0].unsupported).toEqual([]);
  });

  it('charges failed companion builds to the primary line turn before visiting another blocked line', () => {
    const input = coupledLines(true);
    input.result.assemblies[0].conflicts.push(...detail([4]).assemblies[0].conflicts);
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { ...input.budget, maxDetailingRuns: 8, maxMemberSearches: 100 } });
    expect(result.trials.map(t => t.elementId)).toEqual([1, 4]);
    expect(result.trials[0].companionTrials).toHaveLength(6);
    expect(result.trials[0].companionRetained).toBe(false);
    expect(result.stats.detailingRuns).toBe(8);
    expect(result.outcomes).toBe(input.outcomes);
    expect(result.changed).toEqual([]);
  });

  it('caps a failing companion at six full builds even when the outer budget has room', () => {
    const input = coupledLines(true);
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { ...input.budget, maxDetailingRuns: 8, maxMemberSearches: 100 } });
    expect(result.trials[0].companionTrials).toHaveLength(6);
    expect(result.trials[0].companionRetained).toBe(false);
    expect(result.stats.detailingRuns).toBeLessThanOrEqual(8);
    expect(result.outcomes).toBe(input.outcomes);
    expect(result.changed).toEqual([]);
  });

  it('repairs a remote lap-only regression atomically within the shared budget', () => {
    const input = coupledLines();
    const result = searchPhysicalDesignAlternatives(input);
    expect(result.changed).toEqual([1, 2, 3, 4, 5]);
    expect(result.stats).toMatchObject({ detailingRuns: 2, memberSearches: 5, verifierCalls: 5, structuralSolves: 0 });
    expect(result.trials).toEqual([expect.objectContaining({ disposition: 'accepted',
      companionRetained: true, companionIds: [4, 5], companionTrials: [expect.objectContaining({
        elementIds: [4, 5], operator: 'harmonizeDemandCatalog', disposition: 'accepted',
      })] })]);
    expect(result.result.assemblies[0].unsupported).toEqual([]);
    expect(result.result.assemblies[0].conflicts).toEqual([]);
    // The primary assignment stays fixed while the companion is explored.
    for (const id of [1, 2, 3]) expect(input.detail.mock.calls[1][0].get(id))
      .toBe(input.detail.mock.calls[0][0].get(id));
    expect(input.outcomes.get(1)!.accepted!.regions!.topStart!.count).toBe(2);
  });

  it('judges the combination against the retained design rather than its incomplete first half', () => {
    const input = coupledLines();
    const build = input.detail.getMockImplementation()!;
    input.detail.mockImplementation((...args) => {
      const next = build(...args);
      if (args[0].get(4)!.accepted!.regions!.topStart!.count === 4)
        next.assemblies[0].conflicts.push({ ...input.result.assemblies[0].conflicts[0] });
      return next;
    });
    const result = searchPhysicalDesignAlternatives(input);
    expect(input.detail.mock.results.map(r => r.value.assemblies[0].conflicts.length)).toEqual([0, 1]);
    expect(result.trials[0]).toMatchObject({ disposition: 'accepted', companionRetained: true });
    expect(result.result.assemblies[0].conflicts).toHaveLength(1);
    expect(result.result.assemblies[0].unsupported).toEqual([]);
    expect(input.result.assemblies[0].conflicts).toHaveLength(2);
  });

  it('does not enlarge the companion to conditions that changed scope without regressing', () => {
    const input = coupledLines();
    const model = input.contexts.get(1)!.modelData;
    model.nodes.set(8, { id: 8, x: -6, y: 12, z: 0 });
    model.elements.set(6, { ...model.elements.get(4)!, id: 6, nodeI: 8, nodeJ: 5 });
    input.contexts.set(6, { ...input.contexts.get(4)!, elementId: 6 });
    input.outcomes.set(6, outcome(6, 16));
    input.result.layering!.lineOfMember.set(6, 'remote');
    input.result.reverification.push({ ...input.result.reverification[0], elementId: 6 });
    input.result.assemblies[0].unsupported.push({ key: 'detailing.clash.unresolved', message: 'old', refs: [],
      scope: { elementIds: [4, 5, 6] } });
    const build = input.detail.getMockImplementation()!;
    input.detail.mockImplementation((...args) => {
      const next = build(...args);
      next.assemblies[0].unsupported.push({ key: 'detailing.clash.unresolved', message: 'shifted', refs: [],
        scope: { elementIds: [5, 6] } });
      return next;
    });
    const result = searchPhysicalDesignAlternatives(input);
    expect(result.trials[0]).toMatchObject({ disposition: 'accepted', companionIds: [4, 5] });
    expect(result.outcomes.get(6)).toBe(input.outcomes.get(6));
    expect(result.stats.memberSearches).toBe(5);
  });

  it('discards an accepted companion when the primary members still fail final verification', () => {
    const input = coupledLines();
    input.result.reverification[0].status = 'fail';
    const result = searchPhysicalDesignAlternatives(input);
    expect(result.outcomes).toBe(input.outcomes);
    expect(result.result).toBe(input.result);
    expect(result.changed).toEqual([]);
    expect(result.trials[0]).toMatchObject({ disposition: 'regression', companionRetained: false,
      companionTrials: [expect.objectContaining({ disposition: 'accepted' })] });
  });

  it('discards a combination that leaves a new blocker outside either repair segment', () => {
    const input = coupledLines(true);
    const result = searchPhysicalDesignAlternatives(input);
    expect(result.outcomes).toBe(input.outcomes);
    expect(result.changed).toEqual([]);
    expect(result.trials[0]).toMatchObject({ disposition: 'regression', companionRetained: false,
      companionTrials: [expect.objectContaining({ disposition: 'regression', newlyBlocked: [99] })] });
  });

  it.each(['detailBudget', 'memberBudget', 'locked', 'provisional'] as const)(
    'does not exceed %s restrictions while exploring a companion', restriction => {
      const input = coupledLines();
      if (restriction === 'detailBudget') input.budget.maxDetailingRuns = 1;
      if (restriction === 'memberBudget') input.budget.maxMemberSearches = 3;
      if (restriction === 'provisional') for (const id of [4, 5])
        input.outcomes.set(id, { ...input.outcomes.get(id)!, outcome: 'PROVISIONAL_BIAXIAL' });
      const result = searchPhysicalDesignAlternatives({ ...input,
        lockedMembers: restriction === 'locked' ? new Set([4, 5]) : undefined });
      expect(result.changed).toEqual([]);
      expect(result.outcomes).toBe(input.outcomes);
      expect(result.stats.detailingRuns).toBe(1);
      expect(result.stats.memberSearches).toBe(3);
      expect(result.trials.flatMap(t => t.companionTrials ?? [])).toEqual([]);
    });

  it('uses joint congestion to rebalance rows before adding steel or changing the opposite face', () => {
    const { input, verify } = line();
    for (const ctx of input.contexts.values()) {
      ctx.material.longDiametersMm = [16];
      ctx.stations = { comboResults: [{ stations: [
        { t: 0, my: -60, vz: 0 }, { t: 0.5, my: 300, vz: 0 }, { t: 1, my: -60, vz: 0 },
      ] }] } as never;
    }
    verify.mockImplementation((_ctx, r) => {
      const fits = r.regions!.bottomSpanLayers![0].count < 6;
      return { overallStatus: fits ? 'ok' : 'fail', strengthCheckCount: 2,
        checks: [{ status: fits ? 'ok' : 'fail', limiting: 'congestion', category: 'Bottom joint' }],
        worstUtilization: 0.8, checkedAxes: ['My'] } as never;
    });
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { maxDetailingRuns: 1, maxMemberSearches: 6, operators: ['harmonizeDemandCatalog'] } });
    expect(result.trials.map(t => [t.disposition, t.counts, t.bottomCounts])).toEqual([
      ['nominalFailure', [3], [6, 3]], ['accepted', [3], [5, 4]],
    ]);
    expect(result.stats).toMatchObject({ verifierCalls: 6, detailingRuns: 1 });
    for (const o of result.outcomes.values()) {
      expect(o.accepted!.regions!.bottomSpanLayers!.map(l => l.count)).toEqual([5, 4]);
      expect(o.certificate!.rebarHash).toBe(rebarHash(o.accepted));
    }
  });

  it('uses a top resistance rejection to try more top steel before unrelated bottom alternatives', () => {
    const { input, verify } = line();
    for (const ctx of input.contexts.values()) ctx.stations = { comboResults: [{ stations: [
      { t: 0, my: -120, vz: 0 }, { t: 0.5, my: 60, vz: 0 }, { t: 1, my: -120, vz: 0 },
    ] }] } as never;
    verify.mockImplementation((_ctx, r) => {
      const sufficient = r.regions!.topStart!.count >= 5;
      return { overallStatus: sufficient ? 'ok' : 'fail', strengthCheckCount: 2,
        checks: [{ status: sufficient ? 'ok' : 'fail', limiting: 'flexure', category: 'Top Start (My-)', ratio: 1.1 }],
        worstUtilization: sufficient ? 0.8 : 1.1, checkedAxes: ['My'] } as never;
    });
    const result = searchPhysicalDesignAlternatives({ ...input,
      budget: { maxDetailingRuns: 1, maxMemberSearches: 6, operators: ['harmonizeDemandCatalog'] } });
    expect(result.trials.map(t => [t.disposition, t.diameterMm, t.counts, t.bottomCounts])).toEqual([
      ['nominalFailure', 16, [4], [3]], ['accepted', 16, [5], [3]],
    ]);
    expect(result.trials[0].nominalChecks![0]).toMatchObject({ elementId: 1,
      checks: [{ limiting: 'flexure', category: 'Top Start (My-)', ratio: 1.1 }] });
    expect(result.stats).toMatchObject({ memberSearches: 6, verifierCalls: 6, detailingRuns: 1 });
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
