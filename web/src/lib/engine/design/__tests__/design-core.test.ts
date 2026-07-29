/**
 * PR15 core design engine: axis resolution, rebar hash, outcome contract,
 * optimisation ordering, section advice and its termination guards.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveDesignAxes, peakMy, peakMz, tupleMoment, tupleShear, axisLabel,
  BIAXIAL_RATIO_THRESHOLD,
} from '../design-axes';
import { rebarHash, canonicalRebarJson } from '../rebar-hash';
import {
  utilizationStatus, assertOutcomeInvariants, tallyRunSummary, isPassing,
  UTIL_FAIL_THRESHOLD, UTIL_WARN_THRESHOLD, UTILIZATION_CONVENTION,
  type MemberDesignOutcome,
} from '../outcome';
import { compareCandidates, compareFailures, computeCandidateCost, candidateSteelArea } from '../objective';
import { recommendSection, checkIterationGuard, MAX_SECTION_ITERATIONS, CAPS } from '../section-advice';
import { syntheticBeamContext } from './helpers';
import type { ElementDesignDemands } from '../../station-design-forces';
import type { ProvidedReinforcement } from '../../../store/model.svelte';

function demands(entries: Array<[string, number]>): ElementDesignDemands {
  return {
    elementId: 1, length: 6,
    demands: entries.map(([category, absValue]) => ({
      category: category as never, value: absValue, absValue,
      comboId: 1, comboName: 'C1', stationT: 0.5, stationX: 3,
      forces: { x: 3, t: 0.5, n: 0, vy: 0, vz: 0, my: 0, mz: 0 },
    })),
  };
}

describe('resolveDesignAxes — the governing-axis correction', () => {
  it('picks My for an upright beam bending over its depth (gravity case)', () => {
    const a = resolveDesignAxes('beam', { b: 0.3, h: 0.6 }, demands([['My+', 400], ['Mz+', 10]]));
    expect(a.flexure).toBe('My');
    expect(a.shear).toBe('Vz');          // paired shear, not Vy
    expect(a.bFlex).toBe(0.3);
    expect(a.hFlex).toBe(0.6);           // depth stays h
    expect(a.basis).toBe('stress-proxy');
  });

  it('picks Mz and ROTATES the section when the member bends over its width', () => {
    const a = resolveDesignAxes('beam', { b: 0.3, h: 0.6 }, demands([['My+', 5], ['Mz+', 300]]));
    expect(a.flexure).toBe('Mz');
    expect(a.shear).toBe('Vy');
    expect(a.bFlex).toBe(0.6);           // acts rotated
    expect(a.hFlex).toBe(0.3);
  });

  it('columns take the LARGER moment as primary (the old code hardcoded Mz)', () => {
    const a = resolveDesignAxes('column', { b: 0.4, h: 0.4 }, demands([['My+', 973], ['Mz+', 6]]));
    expect(a.flexure).toBe('My');
    expect(a.secondaryFlexure).toBe('Mz');
    expect(a.basis).toBe('dominant-moment');
  });

  it('flags biaxial only above the ratio threshold', () => {
    const low = resolveDesignAxes('column', { b: 0.4, h: 0.4 }, demands([['My+', 100], ['Mz+', 1]]));
    expect(low.biaxial).toBe(false);
    const high = resolveDesignAxes('column', { b: 0.4, h: 0.4 }, demands([['My+', 100], ['Mz+', 50]]));
    expect(high.biaxial).toBe(true);
    expect(high.secondaryRatio).toBeGreaterThan(BIAXIAL_RATIO_THRESHOLD);
  });

  it('reports no-demand instead of silently designing for zero', () => {
    expect(resolveDesignAxes('beam', { b: 0.3, h: 0.6 }, undefined).basis).toBe('no-demand');
    expect(resolveDesignAxes('beam', { b: 0.3, h: 0.6 }, demands([])).basis).toBe('no-demand');
  });

  it('tuple readers and labels follow the resolved axis', () => {
    const t = { my: -12, mz: 5, vy: 3, vz: -9 };
    expect(tupleMoment(t, 'My')).toBe(-12);
    expect(tupleMoment(t, 'Mz')).toBe(5);
    expect(tupleShear(t, 'Vz')).toBe(-9);
    expect(axisLabel('My', '-')).toBe('My-');
    expect(peakMy(demands([['My+', 3], ['My-', 8]]))).toBe(8);
    expect(peakMz(demands([['Mz+', 2]]))).toBe(2);
  });
});

describe('rebarHash — memo key and certificate identity', () => {
  const a: ProvidedReinforcement = {
    regions: { bottomSpanLayers: [{ count: 4, diameter: 20, row: 0 }], stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.15 } },
  };
  it('is invariant to key order', () => {
    const b: ProvidedReinforcement = {
      regions: { stirrupsSupport: { spacing: 0.15, legs: 2, diameter: 8 }, bottomSpanLayers: [{ diameter: 20, row: 0, count: 4 }] },
    } as never;
    expect(rebarHash(b)).toBe(rebarHash(a));
  });
  it('is invariant to float noise', () => {
    const b = JSON.parse(JSON.stringify(a));
    b.regions.stirrupsSupport.spacing = 0.15000000000000002;
    expect(rebarHash(b)).toBe(rebarHash(a));
  });
  it('changes on any real change', () => {
    for (const mutate of [
      (x: any) => { x.regions.bottomSpanLayers[0].count = 5; },
      (x: any) => { x.regions.bottomSpanLayers[0].diameter = 25; },
      (x: any) => { x.regions.stirrupsSupport.spacing = 0.125; },
      (x: any) => { x.regions.stirrupsSupport.legs = 4; },
    ]) {
      const b = JSON.parse(JSON.stringify(a));
      mutate(b);
      expect(rebarHash(b)).not.toBe(rebarHash(a));
    }
  });
  it('treats absent and explicit-undefined alike, and no rebar as "none"', () => {
    expect(rebarHash(undefined)).toBe(rebarHash(undefined));
    expect(canonicalRebarJson(undefined)).toBe('none');
    expect(rebarHash({ regions: { bottomSpan: undefined } } as never)).toBe(rebarHash({ regions: {} }));
  });
});

describe('utilization convention and thresholds (approved decision O4)', () => {
  it('is demand/capacity with warn 0.95–1.00 and fail above 1.00', () => {
    expect(UTILIZATION_CONVENTION).toBe('demandOverCapacity');
    expect(UTIL_WARN_THRESHOLD).toBe(0.95);
    expect(UTIL_FAIL_THRESHOLD).toBe(1.0);
    expect(utilizationStatus(0.5)).toBe('ok');
    expect(utilizationStatus(0.95)).toBe('ok');
    expect(utilizationStatus(0.96)).toBe('warn');
    // 0.95 < u <= 1.00 is the warn band: code-compliant, but flagged.
    expect(utilizationStatus(1.0)).toBe('warn');
    expect(utilizationStatus(1.001)).toBe('fail');
    expect(utilizationStatus(Number.POSITIVE_INFINITY)).toBe('fail');
  });
});

describe('outcome contract invariants', () => {
  const base = {
    elementId: 7, elementType: 'beam' as const, codeId: 'cirsoc', codeVersion: '2005',
    searchStats: { candidatesTried: 3, verifierCalls: 3, ms: 1, truncated: false, envelopeExhausted: false },
  };
  const cert = {
    verifierId: 'cirsoc201.provided.v2', codeId: 'cirsoc', codeVersion: '2005',
    analysisRevision: 1, demandRevision: 1, rebarHash: 'x',
    worstUtilization: 0.9, designTarget: 0.95, checkCount: 4,
    checkedAxes: ['My', 'Vz'], axisBasis: 'stress-proxy' as const,
    utilizationConvention: UTILIZATION_CONVENTION,
  };

  it('accepts a well-formed VERIFIED outcome', () => {
    const o: MemberDesignOutcome = { ...base, outcome: 'VERIFIED', accepted: {}, certificate: cert, limiting: [], reasons: [] };
    expect(() => assertOutcomeInvariants(o)).not.toThrow();
    expect(isPassing(o)).toBe(true);
  });

  it('rejects VERIFIED without a certificate, over-utilised, or with zero checks', () => {
    expect(() => assertOutcomeInvariants({ ...base, outcome: 'VERIFIED', accepted: {}, limiting: [], reasons: [] } as never))
      .toThrow(/without a certificate/);
    expect(() => assertOutcomeInvariants({
      ...base, outcome: 'VERIFIED', accepted: {}, limiting: [], reasons: [],
      certificate: { ...cert, worstUtilization: 1.2 },
    } as never)).toThrow(/utilization/);
    expect(() => assertOutcomeInvariants({
      ...base, outcome: 'VERIFIED', accepted: {}, limiting: [], reasons: [],
      certificate: { ...cert, checkCount: 0 },
    } as never)).toThrow(/zero checks/);
    expect(() => assertOutcomeInvariants({
      ...base, outcome: 'VERIFIED', accepted: {}, limiting: [], reasons: [],
      certificate: { ...cert, checkedAxes: [] },
    } as never)).toThrow(/checked axes/);
  });

  it('forbids assigning reinforcement or a certificate on a non-VERIFIED outcome', () => {
    expect(() => assertOutcomeInvariants({
      ...base, outcome: 'SEARCH_EXHAUSTED', accepted: {}, limiting: ['flexure'], reasons: [{ key: 'x' }],
    } as never)).toThrow(/must not assign reinforcement/);
    expect(() => assertOutcomeInvariants({
      ...base, outcome: 'SEARCH_EXHAUSTED', certificate: cert, limiting: ['flexure'], reasons: [{ key: 'x' }],
    } as never)).toThrow(/must not carry a certificate/);
  });

  it('requires a limiting constraint and a reason on every failure', () => {
    expect(() => assertOutcomeInvariants({ ...base, outcome: 'DEMAND_UNAVAILABLE', limiting: [], reasons: [{ key: 'x' }] } as never))
      .toThrow(/without a limiting constraint/);
    expect(() => assertOutcomeInvariants({ ...base, outcome: 'DEMAND_UNAVAILABLE', limiting: ['missingDemand'], reasons: [] } as never))
      .toThrow(/without a reason/);
  });

  it('requires exhaustion AND advice before claiming SECTION_INADEQUATE', () => {
    expect(() => assertOutcomeInvariants({
      ...base, outcome: 'SECTION_INADEQUATE', limiting: ['flexure'], reasons: [{ key: 'x' }],
    } as never)).toThrow(/without exhausting the permitted envelope/);
    expect(() => assertOutcomeInvariants({
      ...base, outcome: 'SECTION_INADEQUATE', limiting: ['flexure'], reasons: [{ key: 'x' }],
      searchStats: { ...base.searchStats, envelopeExhausted: true },
    } as never)).toThrow(/without a section recommendation/);
  });

  it('forbids reporting an exhausted envelope as SEARCH_EXHAUSTED', () => {
    expect(() => assertOutcomeInvariants({
      ...base, outcome: 'SEARCH_EXHAUSTED', limiting: ['flexure'], reasons: [{ key: 'x' }],
      searchStats: { ...base.searchStats, envelopeExhausted: true },
    } as never)).toThrow(/must be reported as SECTION_INADEQUATE/);
  });

  it('tallies a run without folding failures into the pass count', () => {
    const mk = (id: number, outcome: MemberDesignOutcome['outcome']): MemberDesignOutcome =>
      outcome === 'VERIFIED'
        ? { ...base, elementId: id, outcome, accepted: {}, certificate: cert, limiting: [], reasons: [] }
        : { ...base, elementId: id, outcome, limiting: ['flexure'], reasons: [{ key: 'x' }],
            provisional: { candidate: {}, verdict: {} as never, worstUtilization: 1.4, failingCheckCount: 1, governing: 'flexure', cost: {} as never },
            searchStats: base.searchStats };
    const s = tallyRunSummary('cirsoc', '2005',
      [mk(1, 'VERIFIED'), mk(2, 'SEARCH_EXHAUSTED'), mk(3, 'DEMAND_UNAVAILABLE'), mk(4, 'UNSUPPORTED')], 12, false, 0);
    expect(s.verified).toBe(1);
    expect(s.searchExhausted).toBe(1);
    expect(s.demandUnavailable).toBe(1);
    expect(s.unsupported).toBe(1);
    expect(s.provisionalRetained).toBe(3);
    expect(s.total).toBe(4);
  });
});

describe('optimisation ordering — constructability first, then weighted, then index', () => {
  const cost = (over: Partial<ReturnType<typeof computeCandidateCost>>) => ({
    layers: 1, distinctDiameters: 1, nonStandardSteps: 0, steelMassKg: 10,
    congestion: 0, arrangementCount: 2, spacingPracticality: 0, weighted: 0.1, ...over,
  });

  it('prefers fewer layers even at higher steel mass', () => {
    const a = { cost: cost({ layers: 1, weighted: 0.9 }), index: 5 };
    const b = { cost: cost({ layers: 2, weighted: 0.1 }), index: 1 };
    expect(compareCandidates(a, b)).toBeLessThan(0);
  });
  it('then fewer distinct diameters, then standard steps', () => {
    expect(compareCandidates(
      { cost: cost({ distinctDiameters: 1 }), index: 9 },
      { cost: cost({ distinctDiameters: 2 }), index: 0 },
    )).toBeLessThan(0);
    expect(compareCandidates(
      { cost: cost({ nonStandardSteps: 0 }), index: 9 },
      { cost: cost({ nonStandardSteps: 1 }), index: 0 },
    )).toBeLessThan(0);
  });
  it('falls back to the weighted scalar, then to the enumeration index', () => {
    expect(compareCandidates({ cost: cost({ weighted: 0.2 }), index: 3 }, { cost: cost({ weighted: 0.4 }), index: 1 })).toBeLessThan(0);
    expect(compareCandidates({ cost: cost({}), index: 1 }, { cost: cost({}), index: 2 })).toBeLessThan(0);
  });
  it('ranks failures by failing-check count, then utilization', () => {
    const f = (failing: number, u: number, index = 0) => ({ failingCheckCount: failing, worstUtilization: u, cost: cost({}), index });
    expect(compareFailures(f(1, 3.0), f(2, 1.1))).toBeLessThan(0);
    expect(compareFailures(f(1, 1.1), f(1, 3.0))).toBeLessThan(0);
    expect(compareFailures(f(1, Number.POSITIVE_INFINITY), f(1, 9))).toBeGreaterThan(0);
  });
  it('sums steel area across every region', () => {
    const r: ProvidedReinforcement = {
      regions: {
        bottomSpanLayers: [{ count: 4, diameter: 20, row: 0 }],
        topStartLayers: [{ count: 2, diameter: 16, row: 0 }],
      },
    };
    expect(candidateSteelArea(r)).toBeGreaterThan(0);
    const c = computeCandidateCost(r, { L: 6, layoutIssues: 0, arrangements: 2, spacings: [0.15] });
    expect(c.distinctDiameters).toBe(2);
    expect(c.nonStandardSteps).toBe(0);
    expect(c.steelMassKg).toBeGreaterThan(0);
    expect(c.weighted).toBeGreaterThanOrEqual(0);
  });
});

describe('section advice — preliminary, incremental, terminating', () => {
  const ctx = syntheticBeamContext();

  it('grows depth for flexure in standard 50 mm steps and stays preliminary', () => {
    const a = recommendSection(ctx, ['flexure'], { Mu: 1200, Vu: 100, Nu: 0 });
    expect(a).not.toBeNull();
    expect(a!.preliminary).toBe(true);
    expect(a!.proposedH).toBeGreaterThan(ctx.section.h);
    expect(Math.round((a!.proposedH * 1000)) % 50).toBe(0);
    expect(a!.driver).toBe('flexure');
    expect(a!.rationale.length).toBeGreaterThan(0);
  });

  it('grows width for a bar-fit failure', () => {
    const a = recommendSection(ctx, ['barFit'], { Mu: 100, Vu: 50, Nu: 0, requiredBarsPerRow: 6, requiredBarDia: 25 });
    expect(a!.proposedB).toBeGreaterThan(ctx.section.b);
    expect(a!.driver).toBe('barFit');
  });

  it('grows a column squarely for axial demand', () => {
    const col = syntheticBeamContext({
      elementType: 'column', section: { id: 1, name: '400×400', b: 0.4, h: 0.4 },
    });
    const a = recommendSection(col, ['axialFlexure'], { Mu: 400, Vu: 100, Nu: 9000 });
    expect(a!.proposedB).toBe(a!.proposedH);
    expect(a!.proposedB).toBeGreaterThan(0.4);
  });

  it('reports capReached instead of a no-op proposal at the dimensional cap', () => {
    const big = syntheticBeamContext({ section: { id: 1, name: 'cap', b: CAPS.beamB, h: CAPS.beamH } });
    const a = recommendSection(big, ['flexure'], { Mu: 999999, Vu: 100, Nu: 0 });
    expect(a!.capReached).toBe(true);
    expect(a!.proposedB).toBe(big.section.b);
    expect(a!.proposedH).toBe(big.section.h);
  });

  it('returns null when reinforcement, not geometry, is the limit', () => {
    expect(recommendSection(ctx, ['anchorage'], { Mu: 10, Vu: 10, Nu: 0 })).toBeNull();
  });

  it('terminates: max iterations, no growth, demand growth, cap', () => {
    expect(checkIterationGuard({ iterations: 0, lastArea: 0.18, lastGoverningDemand: 1.2 }, 0.245, 1.3, false)).toEqual({ ok: true });
    expect(checkIterationGuard({ iterations: MAX_SECTION_ITERATIONS, lastArea: 0.18, lastGoverningDemand: 1 }, 0.3, 1, false))
      .toEqual({ ok: false, reason: 'maxIterations' });
    expect(checkIterationGuard({ iterations: 0, lastArea: 0.30, lastGoverningDemand: 1 }, 0.30, 1, false))
      .toEqual({ ok: false, reason: 'noGrowth' });
    expect(checkIterationGuard({ iterations: 0, lastArea: 0.18, lastGoverningDemand: 1.0 }, 0.245, 1.4, false))
      .toEqual({ ok: false, reason: 'demandGrowth' });
    expect(checkIterationGuard({ iterations: 0, lastArea: 0.18, lastGoverningDemand: 1 }, 0.245, 1, true))
      .toEqual({ ok: false, reason: 'capReached' });
  });
});
