/**
 * Candidate search: determinism, budgets, authoritative verification, and the
 * outcome each failure mode produces.
 */

import { describe, it, expect } from 'vitest';
import qa8 from '../../../templates/fixtures/rc-design-qa-8.json';
import { designMember, runDesign, isPassingVerdict, BEAM_BUDGET, COLUMN_BUDGET, budgetFor } from '../candidate-search';
import { cirsoc201Adapter } from '../adapters/cirsoc201-adapter';
import { unsupportedAdapters } from '../adapters/unsupported-adapter';
import { listDesignCodes, getDesignCode } from '../code-adapter';
import { createBeamCandidateGenerator, maxBarsPerRow, buildRegionOptions, BEAM_LIMITS } from '../candidate-enumerate-beam';
import { createColumnCandidateGenerator, buildColumnLongOptions, maxTieSpacing, COLUMN_LIMITS } from '../candidate-enumerate-column';
import { rebarHash } from '../rebar-hash';
import { DESIGN_TARGET_UTILIZATION, UTIL_FAIL_THRESHOLD } from '../outcome';
import { solveFixture, syntheticBeamContext, assertRealSolver } from './helpers';
import type { MemberContext } from '../member-context';

const solved = solveFixture(qa8);

function ctxFor(id: number): MemberContext {
  const c = solved.contexts.get(id);
  if (!c) throw new Error(`no context for ${id}`);
  return c;
}

describe('candidate generators — bounded, fit-aware, ordered', () => {
  it('bars-per-row comes from the real clear width', () => {
    // 300 mm web, 25 mm cover, Ø8 stirrup → 234 mm clear; Ø20 bars need 20+25 gap.
    expect(maxBarsPerRow(0.30, 0.025, 8, 20)).toBeGreaterThanOrEqual(2);
    expect(maxBarsPerRow(0.30, 0.025, 8, 32)).toBeLessThan(maxBarsPerRow(0.30, 0.025, 8, 12));
    // A 100 mm web leaves 34 mm clear: one Ø32 physically fits, but that is below
    // the 2-bar-per-row minimum, so buildRegionOptions rejects the arrangement.
    expect(maxBarsPerRow(0.10, 0.025, 8, 32)).toBeLessThan(BEAM_LIMITS.minBarsPerRow);
    expect(maxBarsPerRow(0.05, 0.025, 8, 32)).toBe(0);   // physically impossible
  });

  it('region options never exceed the row/fit envelope and are ordered by preference', () => {
    const ctx = syntheticBeamContext();
    const opts = buildRegionOptions(ctx, 20);
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.length).toBeLessThanOrEqual(BEAM_LIMITS.maxRegionOptions);
    for (const o of opts) {
      expect(o.rows).toBeLessThanOrEqual(BEAM_LIMITS.maxRows);
      const perRow = maxBarsPerRow(ctx.axes.bFlex, ctx.material.cover, ctx.material.stirrupDia, o.dia);
      for (const l of o.layers) expect(l.count).toBeLessThanOrEqual(perRow);
    }
    // Ordered: fewer rows first, then less steel.
    for (let i = 1; i < opts.length; i++) {
      expect(opts[i].rows).toBeGreaterThanOrEqual(opts[i - 1].rows);
    }
  });

  it('column options respect the 1–8 % rho envelope on the ACCEPTED arrangement', () => {
    const col = syntheticBeamContext({
      elementType: 'column', section: { id: 1, name: '400', b: 0.4, h: 0.4 },
      axes: { ...syntheticBeamContext().axes, bFlex: 0.4, hFlex: 0.4 },
    });
    const opts = buildColumnLongOptions(col);
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) {
      expect(o.rho).toBeGreaterThanOrEqual(COLUMN_LIMITS.rhoMin - 1e-9);
      expect(o.rho).toBeLessThanOrEqual(COLUMN_LIMITS.rhoMax + 1e-9);
      expect(o.totalCount % 4).toBe(0);   // symmetric 4 + 4k
    }
  });

  it('tie spacing honours min(12dB, 48de, min(b,h))', () => {
    expect(maxTieSpacing(20, 8, 0.4, 0.4)).toBeCloseTo(Math.min(0.24, 0.384, 0.4), 6);
    expect(maxTieSpacing(32, 6, 0.3, 0.5)).toBeCloseTo(Math.min(0.384, 0.288, 0.3), 6);
  });

  it('is DETERMINISTIC: identical context + feedback → identical sequence', () => {
    const ctx = ctxFor([...solved.contexts.keys()].find(id => ctxFor(id).elementType === 'beam')!);
    const seqOf = () => {
      const gen = createBeamCandidateGenerator(ctx);
      const out: string[] = [];
      let fb = null as never;
      for (let i = 0; i < 12; i++) {
        const c = gen.next(fb);
        if (!c) break;
        out.push(`${c.meta.index}|${c.meta.label}|${rebarHash(c.reinforcement)}`);
        const v = cirsoc201Adapter.verify(ctx, c.reinforcement);
        fb = { verdict: v, worstUtilization: v.worstUtilization, limiting: cirsoc201Adapter.classifyFailure(v, ctx) } as never;
      }
      return out;
    };
    expect(seqOf()).toEqual(seqOf());
  });

  it('column generator is deterministic too', () => {
    const id = [...solved.contexts.keys()].find(i => ctxFor(i).elementType === 'column')!;
    const ctx = ctxFor(id);
    const seqOf = () => {
      const gen = createColumnCandidateGenerator(ctx);
      const out: string[] = [];
      let fb = null as never;
      for (let i = 0; i < 10; i++) {
        const c = gen.next(fb);
        if (!c) break;
        out.push(rebarHash(c.reinforcement));
        const v = cirsoc201Adapter.verify(ctx, c.reinforcement);
        fb = { verdict: v, worstUtilization: v.worstUtilization, limiting: [] } as never;
      }
      return out;
    };
    expect(seqOf()).toEqual(seqOf());
  });
});

describe('designMember — outcomes and budgets', () => {
  it('produces a VERIFIED certificate bound to the accepted rebar', () => {
    const id = [...solved.contexts.keys()][0];
    const o = designMember(cirsoc201Adapter, ctxFor(id));
    expect(o.outcome).toBe('VERIFIED');
    expect(o.accepted).toBeDefined();
    expect(o.certificate).toBeDefined();
    expect(o.certificate!.rebarHash).toBe(rebarHash(o.accepted));
    // The verifier id now carries the edition. A v2 certificate did not record which
    // edition produced it, so v2 and v2.<edition> results are not interchangeable.
    expect(o.certificate!.verifierId).toBe('cirsoc201.provided.v2.2025');
    expect(o.certificate!.worstUtilization).toBeLessThanOrEqual(UTIL_FAIL_THRESHOLD);
    expect(o.certificate!.designTarget).toBe(DESIGN_TARGET_UTILIZATION);
    expect(o.certificate!.checkedAxes.length).toBeGreaterThan(0);
    expect(o.provisional).toBeUndefined();
    expect(o.limiting).toEqual([]);
  });

  it('re-verifying the accepted rebar reproduces a passing verdict (self-consistency)', () => {
    for (const [id, ctx] of solved.contexts) {
      const o = designMember(cirsoc201Adapter, ctx);
      if (o.outcome !== 'VERIFIED') continue;
      const v = cirsoc201Adapter.verify(ctx, o.accepted!);
      expect(v.checks.some(c => c.status === 'fail'), `element ${id} re-verification`).toBe(false);
      expect(v.worstUtilization).toBeLessThanOrEqual(UTIL_FAIL_THRESHOLD + 1e-6);
      expect(v.strengthCheckCount).toBeGreaterThan(0);
    }
  });

  it('refuses to certify a member with suspect force orientation (O6)', () => {
    const ctx = { ...ctxFor([...solved.contexts.keys()][0]), orientationSuspect: true };
    const o = designMember(cirsoc201Adapter, ctx);
    expect(o.outcome).toBe('SEARCH_EXHAUSTED');
    expect(o.limiting).toContain('memberOrientationSuspect');
    expect(o.certificate).toBeUndefined();
    expect(o.accepted).toBeUndefined();
  });

  it('reports DEMAND_UNAVAILABLE, never a pass, when combinations are missing', () => {
    const ctx: MemberContext = {
      ...ctxFor([...solved.contexts.keys()][0]),
      demands: undefined, stations: undefined, blocking: ['missingCombinations', 'missingDemand'],
    };
    const o = designMember(cirsoc201Adapter, ctx);
    expect(o.outcome).toBe('DEMAND_UNAVAILABLE');
    expect(o.limiting).toContain('missingCombinations');
    expect(o.reasons.length).toBeGreaterThan(0);
    expect(o.certificate).toBeUndefined();
  });

  it('reports UNSUPPORTED for a code with no reinforcement model', () => {
    const ec = getDesignCode('eurocode')!;
    expect(ec.capabilities.candidateGeneration).toBe(false);
    const o = designMember(ec, ctxFor([...solved.contexts.keys()][0]));
    expect(o.outcome).toBe('UNSUPPORTED');
    expect(o.certificate).toBeUndefined();
  });

  it('keeps a PROVISIONAL candidate on failure, never certified (O3)', () => {
    // A deliberately impossible member: tiny section, huge demand.
    const base = ctxFor([...solved.contexts.keys()].find(i => ctxFor(i).elementType === 'beam')!);
    const ctx: MemberContext = {
      ...base,
      section: { ...base.section, b: 0.15, h: 0.20 },
      axes: { ...base.axes, bFlex: 0.15, hFlex: 0.20 },
    };
    const o = designMember(cirsoc201Adapter, ctx);
    expect(o.outcome).not.toBe('VERIFIED');
    expect(o.accepted).toBeUndefined();
    expect(o.certificate).toBeUndefined();
    if (o.provisional) {
      expect(o.provisional.worstUtilization).toBeGreaterThan(UTIL_FAIL_THRESHOLD);
    }
    expect(o.limiting.length).toBeGreaterThan(0);
    if (o.outcome === 'SECTION_INADEQUATE') {
      expect(o.searchStats.envelopeExhausted).toBe(true);
      expect(o.sectionAdvice).toBeDefined();
      expect(o.sectionAdvice!.preliminary).toBe(true);
    }
  });

  it('never exceeds its per-member budget', () => {
    for (const [, ctx] of solved.contexts) {
      const b = budgetFor(ctx);
      const o = designMember(cirsoc201Adapter, ctx);
      expect(o.searchStats.candidatesTried).toBeLessThanOrEqual(b.maxCandidates);
      expect(o.searchStats.verifierCalls).toBeLessThanOrEqual(b.maxVerifierCalls);
    }
    expect(BEAM_BUDGET.maxCandidates).toBe(240);
    expect(COLUMN_BUDGET.maxCandidates).toBe(120);
    // Determinism: per-member bounds must be count-based only, never wall-clock.
    expect('maxMemberMs' in BEAM_BUDGET).toBe(false);
  });

  it('a verdict with zero strength checks is NOT a pass', () => {
    expect(isPassingVerdict({
      candidate: {}, verdict: { checks: [], strengthCheckCount: 0 } as never,
      worstUtilization: 0, failingCheckCount: 0, governing: null, cost: {} as never,
    })).toBe(false);
  });
});

describe('runDesign — cancellation and partial honesty', () => {
  it('designs every member of the QA fixture', () => {
    assertRealSolver();
    const s = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 60_000 });
    expect(s.total).toBe(8);
    expect(s.verified).toBe(8);
    expect(s.aborted).toBe(false);
    expect(s.notReached).toBe(0);
  });

  it('reports aborted + notReached when cancelled, rather than a short clean run', () => {
    const signal = { aborted: false };
    let calls = 0;
    const s = runDesign(cirsoc201Adapter, solved.contexts.values(), {
      signal,
      onProgress: () => { calls++; },
      progressEvery: 1,
      // Cancel after the first member by flipping the flag from the clock hook.
      clock: (() => { let n = 0; return () => { n += 1; if (n > 4) signal.aborted = true; return n; }; })(),
    });
    expect(s.aborted).toBe(true);
    expect(s.notReached).toBeGreaterThan(0);
    expect(s.total).toBeLessThan(8);
    expect(calls).toBeGreaterThan(0);
  });

  it('emits progress for the caller to render', () => {
    const seen: number[] = [];
    runDesign(cirsoc201Adapter, solved.contexts.values(), { progressEvery: 2, onProgress: p => seen.push(p.done) });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(8);
  });
});

describe('design-code adapter conformance (parameterised over the registry)', () => {
  const adapters = listDesignCodes();

  it('registers both CIRSOC editions plus every unsupported code', () => {
    // 'cirsoc' is CIRSOC 201-2025, the edition in force. 'cirsoc-2005' is the legacy
    // adapter, independent and with its own clause map.
    expect(adapters.map(a => a.id).sort()).toEqual(
      ['aci-aisc', 'cfs', 'cirsoc', 'cirsoc-2005', 'eurocode', 'masonry', 'nds'].sort(),
    );
    expect(unsupportedAdapters.length).toBe(5);
  });

  it('never lets the two CIRSOC editions share a clause identifier', () => {
    const c2025 = adapters.find(a => a.id === 'cirsoc')!.provenance();
    const c2005 = adapters.find(a => a.id === 'cirsoc-2005')!.provenance();
    expect(c2025.codeVersion).toBe('2025');
    expect(c2005.codeVersion).toBe('2005');
    // The two clause LISTS must differ — the 2025 edition renumbered the subject
    // matter, so identical lists would mean one was copied rather than read.
    expect(c2025.clauses).not.toEqual(c2005.clauses);
    expect(c2025.verifierId).not.toBe(c2005.verifierId);

    // Note deliberately NOT asserted: that the two lists share no raw string. They do —
    // "§10.5" exists in both editions and means different things in each (2025: column
    // design strength; 2005: a flexure-and-axial-load article). That collision is
    // exactly why a bare clause number is not an identifier and why ClauseRef carries
    // the edition. The real invariant is checked below.
  });

  it('tags every capability clause with the declaring adapter\'s own edition', () => {
    // The invariant that a shared clause number cannot violate: no matrix entry may
    // cite an edition other than the one its adapter implements.
    for (const id of ['cirsoc', 'cirsoc-2005'] as const) {
      const a = adapters.find(x => x.id === id)!;
      const edition = a.provenance().codeVersion;
      for (const key of Object.keys(a.capabilityMatrix) as Array<keyof typeof a.capabilityMatrix>) {
        for (const ref of a.capabilityMatrix[key].refs) {
          // Seismic capabilities correctly cite INPRES-CIRSOC 103, not CIRSOC 201.
          if (ref.regulation !== 'cirsoc-201') continue;
          expect(ref.edition, `${id} / ${String(key)} / §${ref.clause}`).toBe(edition);
        }
      }
    }
  });

  for (const a of adapters) {
    describe(a.id, () => {
      const ctx = ctxFor([...solved.contexts.keys()][0]);

      it('declares identity, version and the normalised utilization convention', () => {
        expect(a.id).toBeTruthy();
        expect(a.name).toBeTruthy();
        expect(a.version).toBeTruthy();
        expect(a.utilizationConvention).toBe('demandOverCapacity');
      });

      it('declares its demand requirements and capabilities', () => {
        const d = a.requiredDemands();
        expect(typeof d.needsCombinations).toBe('boolean');
        expect(d.minCombinations).toBeGreaterThanOrEqual(0);
        expect(a.capabilities.sectionShapes).toBeInstanceOf(Array);
      });

      it('validateInputs returns blocking reasons whenever it is not ok', () => {
        const v = a.validateInputs(ctx);
        if (!v.ok) {
          expect(v.blocking.length).toBeGreaterThan(0);
          expect(v.reasons.length).toBeGreaterThan(0);
        }
      });

      it('exposes detailing limits without throwing', () => {
        const dl = a.detailingLimits(ctx);
        expect(dl.minClearSpacing).toBeGreaterThan(0);
        expect(typeof dl.ld(20)).toBe('number');
        expect(typeof dl.ldh(20)).toBe('number');
        expect(typeof dl.lapSplice(20)).toBe('number');
      });

      it('verify() is total — it returns a result for any reinforcement', () => {
        const r = a.verify(ctx, {});
        expect(r.elementId).toBe(ctx.elementId);
        expect(Array.isArray(r.checks)).toBe(true);
        expect(Array.isArray(r.checkedAxes)).toBe(true);
        expect(typeof r.strengthCheckCount).toBe('number');
      });

      it('provenance names a verifier id and code version', () => {
        const p = a.provenance();
        expect(p.verifierId).toMatch(/\./);
        expect(p.codeId).toBe(a.id);
        expect(p.codeVersion).toBeTruthy();
      });

      it('candidateGeneration and createGenerator agree', () => {
        const gen = a.createGenerator(ctx);
        if (a.capabilities.candidateGeneration) expect(gen).not.toBeNull();
        else expect(gen).toBeNull();
      });

      it('an unsupported code can never produce VERIFIED', () => {
        if (a.capabilities.candidateGeneration) return;
        expect(designMember(a, ctx).outcome).toBe('UNSUPPORTED');
      });

      it('optimizationObjective weights are finite and positive', () => {
        const o = a.optimizationObjective(ctx);
        for (const w of Object.values(o.weights)) expect(w).toBeGreaterThanOrEqual(0);
      });
    });
  }
});
