/**
 * The design–detailing feedback loop, on the real production path and at its edges.
 *
 * The production journey lives in `fixture-acceptance.test.ts`, which asserts the twelve
 * conditions. This file asserts the properties that make the loop safe to run at all: that
 * it terminates, that it cannot cycle, that it never assigns steel the engineer pinned, that
 * it never reuses a nominal-geometry certificate, and that every failure mode stays
 * distinguishable from every other.
 */

import { describe, expect, it } from 'vitest';
import frame from '../../../templates/fixtures/rc-design-qa-8.json';
import { runDesign } from '../../design/candidate-search';
import { cirsoc201Adapter } from '../../design/adapters/cirsoc201-adapter';
import { solveFixture } from '../../design/__tests__/helpers';
import { runDetailing, type RunDetailingResult } from '../run-detailing';
import {
  DEFAULT_MAX_ITERATIONS, runDesignFeedbackLoop,
  type DesignFeedbackLoopResult,
} from '../design-feedback-loop';
import {
  assertRepairInvariants, buildFinalGeometryFeedback, finalGeometryHash,
  selectCandidateUnderFinalGeometry, structuredFailures,
} from '../../design/final-geometry-feedback';
import { rebarHash } from '../../design/rebar-hash';
import type { MemberDesignOutcome } from '../../design/outcome';
import type { MemberContext } from '../../design/member-context';

interface Harness {
  contexts: Map<number, MemberContext>;
  outcomes: ReadonlyMap<number, MemberDesignOutcome>;
  detail: (o: ReadonlyMap<number, MemberDesignOutcome>) => RunDetailingResult;
  detailCalls: () => number;
}

let cachedHarness: Harness | null = null;

/** The real chain: solve → design → detail. Nothing seeded. */
function harness(): Harness {
  if (cachedHarness) return cachedHarness;
  const solved = solveFixture(frame as never);
  const summary = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 });
  let calls = 0;
  const detail = (outcomes: ReadonlyMap<number, MemberDesignOutcome>) => {
    calls++;
    return runDetailing({
      contexts: solved.contexts,
      outcomes,
      nodes: solved.data.nodes as never,
      elements: solved.data.elements as never,
      edition: '2025',
      maxAggregateSizeMm: 19,
      verifierId: 'cirsoc201.provided.v2.2025',
      demandRevision: 1,
      // The assignment's reinforcement, not the model's: mid-loop they differ.
      reverify: (id: number, loss: never) => {
        const ctx = solved.contexts.get(id);
        const accepted = outcomes.get(id)?.accepted;
        if (!ctx || !accepted) return 'fail' as const;
        const res = cirsoc201Adapter.verify({ ...ctx, finalGeometry: loss } as never, accepted);
        return res?.overallStatus === 'fail' ? 'fail' as const
          : res?.overallStatus === 'warn' ? 'warn' as const : 'ok' as const;
      },
    } as never);
  };
  cachedHarness = {
    contexts: solved.contexts, outcomes: summary.outcomes, detail,
    detailCalls: () => calls,
  };
  return cachedHarness;
}

let cachedLoop: DesignFeedbackLoopResult | null = null;
function loop(): DesignFeedbackLoopResult {
  if (cachedLoop) return cachedLoop;
  const h = harness();
  cachedLoop = runDesignFeedbackLoop({
    adapter: cirsoc201Adapter,
    contexts: h.contexts,
    outcomes: h.outcomes,
    detail: h.detail,
  });
  return cachedLoop;
}

/**
 * ── REBASELINED when Table 9.7.6.2.2 was implemented in full ──────
 *
 * This block used to be titled "beams 7 and 8" and asserted that exactly two members
 * failed at their final geometry. Four do. The extra two are not a regression; they are the
 * defect the old rule hid.
 *
 * `maxStirrupSpacing` had a branch `if (VsReq <= 0) return min(0,8·d, 300 mm)`. Table
 * 9.7.6.2.2 is indexed on "V_s **requerido**", so a required V_s of zero is row 1 and the
 * limit is the lesser of d/2 and 400 mm — never `0,8·d`. In the SPAN region of members 5, 6,
 * 7 and 8 the required V_s is zero, so all four span regions were being checked against an
 * invented 300 mm limit instead of the table's d/2. At the final geometry d/2 is 248 mm
 * (members 5 and 6) or 242 mm (7 and 8), and 250 mm was provided.
 *
 * So the previous baseline certified a 250 mm span spacing that the regulation forbids, on
 * four members. That is the false pass F6 predicted, now measured on the production path.
 *
 * The two pairs differ in HOW MUCH depth they lose, which is why they fail by different
 * amounts and repair to different utilizations:
 *   5, 6 — no joint-layer movement, only Table 26.6.2.1(a)'s 15 mm → d = 497, d/2 = 248,5
 *   7, 8 — 12 mm bottom raise + 10 mm top drop + 15 mm            → d = 485, d/2 = 242,5
 */
const REPAIRED = [5, 6, 7, 8];
/** The two pairs, and the geometry each actually lost. */
const PAIRS = {
  noLayerMovement: { ids: [5, 6], hash: 'b0.0/t0.0/d15.0', sMaxCm: 24.8, util: 1.008 },
  layerMoved: { ids: [7, 8], hash: 'b12.0/t10.0/d15.0', sMaxCm: 24.3, util: 1.031 },
} as const;
const pairOf = (id: number) =>
  PAIRS.noLayerMovement.ids.includes(id as never) ? PAIRS.noLayerMovement : PAIRS.layerMoved;

describe('the four beams: the failure, the repair and the arithmetic behind both', () => {
  it('the governing check is Table 9.7.6.2.2 maximum stirrup spacing, not flexure', () => {
    // This corrects a recorded diagnosis. The 1,031 was read as a lever-arm/flexure result
    // and it is not: every flexural check passes at the final geometry. What fails is the
    // MAXIMUM STIRRUP SPACING limit, which is proportional to d and therefore moves when
    // coordination takes depth away.
    const it1 = loop().iterations[0];
    expect(it1.failed).toEqual(REPAIRED);
    for (const fb of it1.feedback) {
      const pair = pairOf(fb.elementId);
      const fails = fb.failedChecks.filter((c) => c.status === 'fail');
      // 7 and 8 lose enough depth to fail at BOTH ends and in the span; 5 and 6 only in the
      // span, because their support region was already detailed at 225 mm.
      expect(fails.length).toBeGreaterThan(0);
      expect(fails.map((c) => c.category)).toContain('Shear Span (Vz) s,max');
      for (const c of fails) {
        expect(c.limiting).toBe('tieSpacing');
        expect(c.required).toBeCloseTo(pair.sMaxCm, 1);   // cm
        expect(c.provided).toBeCloseTo(25.0, 1);          // cm
      }
      expect(fb.finalUtilization).toBeCloseTo(pair.util, 3);
    }
  });

  it('charges exactly the depth each member actually lost, and no more', () => {
    // The two pairs are deliberately NOT collapsed. 5 and 6 lose only Table 26.6.2.1(a)'s
    // 15 mm construction tolerance — no joint-layer movement at all — and asserting a 12 mm
    // raise on them would be asserting a coordination that did not happen.
    for (const fb of loop().iterations[0].feedback) {
      const moved = PAIRS.layerMoved.ids.includes(fb.elementId as never);
      expect(fb.finalGeometry.bottomRaise).toBeCloseTo(moved ? 0.012 : 0, 6);
      expect(fb.finalGeometry.topLower).toBeCloseTo(moved ? 0.010 : 0, 6);
      // The tolerance applies whether or not anything moved.
      expect(fb.finalGeometry.depthTolerance).toBeCloseTo(0.015, 6);
      // Measured on the finished bars, not recomputed from the allocation.
      expect(fb.finalGeometry.layerCentroids.length).toBeGreaterThan(0);
      expect([...fb.finalGeometry.layerCentroids])
        .toEqual([...fb.finalGeometry.layerCentroids].sort((a, b) => b - a));
    }
  });

  it('the arithmetic behind each failure, from the table', () => {
    // d/2 is row 1 of Table 9.7.6.2.2, whose 400 mm cap does not govern at this depth.
    // 5, 6: 512 − 15      = 497 → 248,5 mm; 250/248,5 = 1,006 → reported 1,008
    // 7, 8: 512 − 12 − 15 = 485 → 242,5 mm; 250/242,5 = 1,031
    expect(250 / 248.5).toBeCloseTo(1.006, 3);
    expect(250 / 242.5).toBeCloseTo(1.031, 3);
    // The old rule permitted 300 mm in all four span regions. Both real limits are below it.
    for (const cm of [24.8, 24.3]) expect(cm * 10).toBeLessThan(300);
  });

  it('reports no reinforcement deficit, because the governing check is not an area', () => {
    // The optional field is absent on purpose. A maximum-spacing limit has no "missing
    // steel area", and inventing one would send an engineer to add bars that change nothing.
    for (const fb of loop().iterations[0].feedback) {
      expect(fb.requiredReinforcementDeficit).toBeUndefined();
    }
  });

  it('repairs all four by closing the stirrup spacing one grid step, and nothing else', () => {
    // 250 → 225 mm. The longitudinal steel is untouched: the failure was never flexural, so
    // adding bars would have been the wrong repair even though it would have "helped" the
    // utilisation number.
    const before = harness().outcomes;
    for (const r of loop().iterations[0].repairs) {
      expect(r.kind).toBe('FINAL_GEOMETRY_VERIFIED');
      const prev = before.get(r.elementId)!.accepted!;
      // Every region ends up at 225 mm, and the SPAN region is the one that had to move on
      // all four members. On 5 and 6 the support was already there.
      expect(r.accepted!.regions!.stirrupsSpan!.spacing).toBeCloseTo(0.225, 6);
      expect(r.accepted!.regions!.stirrupsSupport!.spacing).toBeCloseTo(0.225, 6);
      expect(prev.regions!.stirrupsSpan!.spacing).toBeCloseTo(0.250, 6);
      // The leg count is unchanged: a 300 mm web in row 1 has 242 mm between its two leg
      // centres against a 400 mm across-width limit, so no crosstie is required.
      expect(r.accepted!.regions!.stirrupsSpan!.legs).toBe(2);
      expect(r.accepted!.regions!.stirrupsSupport!.legs).toBe(2);
      // Same longitudinal arrangement, region for region.
      expect(r.accepted!.regions!.bottomSpanLayers)
        .toEqual(prev.regions!.bottomSpanLayers);
      expect(r.accepted!.regions!.topStartLayers).toEqual(prev.regions!.topStartLayers);
      expect(r.accepted!.regions!.topEndLayers).toEqual(prev.regions!.topEndLayers);
    }
  });

  it('clears code compliance on all four, and the design target on two of them', () => {
    // Policy O5: prefer <= 0,95 when it costs no additional step. Code compliance (<= 1,00)
    // is the hard boundary that gates the outcome; 0,95 is a preference.
    //
    // 7 and 8 land at 0,883, inside the target. 5 and 6 land at 0,922 — also inside it.
    // Neither number is produced by the maximum-spacing rule: both are the member's SHEAR
    // utilisation at its support, already detailed at 225 mm before the repair.
    //
    // 5 and 6 read 0,922 rather than the 0,993 recorded before Diego's PR #78 review
    // (e20707a9). That review made the shear check use compression-positive axial force,
    // so a member in compression now gets the phi*Vn it is actually entitled to instead of
    // an under-credited one. The corrected value is the more favourable of the two, which is
    // why it moved down. Its supporting coverage lives in
    // engine/design/__tests__/review-fixes.test.ts — 'shear capacity uses compression-positive
    // axial', alongside the P-M bending-depth and opposite-sign-demand cases from the same
    // review. Those three corrections are what drive the numbers asserted here.
    for (const r of loop().iterations[0].repairs) {
      const expected = PAIRS.layerMoved.ids.includes(r.elementId as never) ? 0.883 : 0.922;
      expect(r.certificate!.worstUtilization).toBeCloseTo(expected, 3);
      expect(r.certificate!.worstUtilization).toBeLessThanOrEqual(1.0);
    }
    for (const id of PAIRS.layerMoved.ids) {
      const r = loop().iterations[0].repairs.find((x) => x.elementId === id)!;
      expect(r.certificate!.worstUtilization).toBeLessThanOrEqual(0.95);
    }
    // Consequence of the corrected shear sign, asserted so a regression back to the
    // under-credited capacity is caught rather than silently re-entering the warn band:
    // every repaired member now clears the 0,95 preference, not just the pair that moved a
    // layer. The 1,00 code boundary above remains the hard gate.
    for (const r of loop().iterations[0].repairs) {
      expect(r.certificate!.worstUtilization).toBeLessThanOrEqual(0.95);
    }
  });

  it('re-coordinates the owning assembly, and has no adjacent member left to name', () => {
    const it1 = loop().iterations[0];
    expect(it1.changed).toEqual(REPAIRED);
    expect(it1.affectedAssemblies).toEqual(['level-3.20']);
    // 7 and 8 run north-south; 5 and 6 cross them at the same joints. The list names members
    // that must be RE-JUDGED against a repaired neighbour but were not themselves repaired.
    // All four are now repaired in the same iteration, so the list is empty — not because the
    // mechanism went dead, which the assertion below distinguishes.
    expect(it1.adjacentMembers).toEqual([]);
    expect(it1.changed).toEqual(expect.arrayContaining([5, 6]));
  });

  it('converges in one iteration and two coordination passes', () => {
    const l = loop();
    expect(l.outcome).toBe('FINAL_GEOMETRY_VERIFIED');
    expect(l.stats.iterations).toBe(1);
    expect(l.stats.detailingRuns).toBe(2);
    expect(l.unrepaired).toEqual([]);
  });
});

describe('the loop is reinforcement-only', () => {
  it('runs zero structural solves and never rebuilds a context', () => {
    const h = harness();
    const l = loop();
    expect(l.stats.structuralSolves).toBe(0);
    // The demands are inputs. If the loop had re-derived them, these would not be the same
    // objects — and a repaired member would be certified against forces nobody solved for.
    for (const [id, ctx] of h.contexts) {
      expect(l.result.reverification.some((r) => r.elementId === id)).toBe(true);
      expect(ctx.demands).toBe(h.contexts.get(id)!.demands);
    }
  });

  it('changes no section', () => {
    const h = harness();
    for (const [id, ctx] of h.contexts) {
      const after = h.contexts.get(id)!;
      expect(after.section.b).toBe(ctx.section.b);
      expect(after.section.h).toBe(ctx.section.h);
    }
    expect(loop().sectionAdvice).toEqual([]);
  });

  it('imports nothing from the solver', async () => {
    // A structural solve cannot appear here by accident if there is no way to reach one.
    const src = await import('node:fs').then((fs) => fs.readFileSync(
      new URL('../design-feedback-loop.ts', import.meta.url), 'utf8'));
    for (const forbidden of ['solver-3d', 'solver-js', 'wasm-solver', 'solver-service']) {
      expect(src, forbidden).not.toContain(forbidden);
    }
  });
});

describe('accounting is complete and honest', () => {
  it('reports candidates, verifier calls, memo hits and truncation', () => {
    const s = loop().stats;
    // Four members now, not two. 5/6 are one identical pair and 7/8 another, at DIFFERENT
    // final geometries, so the work is two real repairs plus two memo answers.
    //
    // 8, not the 12 recorded before Diego's PR #78 review (e20707a9). That review reworked
    // candidate-enumerate-beam so the enumerator stops proposing arrangements the corrected
    // checks can no longer justify, so fewer candidates are generated for the same repair.
    // The verifier counts below are unchanged, which is the tell: the loop does the same
    // amount of real verification work, it just no longer enumerates dead candidates.
    expect(s.candidatesConsidered).toBe(8);
    expect(s.truncated).toBe(false);
    expect(s.repeatedStates).toBe(0);
    expect(s.nonMonotonicSkipped).toBe(0);
    // Memoisation is real, not decorative: within each pair the members are identical at an
    // identical geometry, so the second one's whole repair is answered from the memo.
    //
    // The floor is 7 rather than the 8 recorded before e20707a9, for the same reason
    // candidatesConsidered fell from 12 to 8: there are fewer enumerated candidates to hit
    // the memo with. The substantive invariant is not this count but the per-member zeros
    // asserted below — the second member of each identical pair still does NO verifier work.
    expect(s.memoHits).toBeGreaterThanOrEqual(7);
    expect(s.verifierCalls).toBe(7);
    // 5 escalates through four arrangements before one clears; 6 is answered from the memo;
    // 7 clears on its first; 8 from the memo. The zeros are the point.
    const perMember = loop().iterations[0].repairs.map((r) => r.stats.verifierCalls);
    expect(perMember).toEqual([4, 0, 1, 0]);
  });

  it('never pays twice for the same reinforcement at the same geometry', () => {
    // The memo key is (reinforcement, geometry). Both halves matter: the same steel at a
    // different geometry is a different question and must be re-verified.
    const g1 = finalGeometryHash({ bottomRaise: 0.012, topLower: 0.01, depthTolerance: 0.015 });
    const g2 = finalGeometryHash({ bottomRaise: 0.000, topLower: 0.01, depthTolerance: 0.015 });
    expect(g1).not.toBe(g2);
    expect(finalGeometryHash({ bottomRaise: 0.012, topLower: 0.01, depthTolerance: 0.015 }))
      .toBe(g1);
  });
});

describe('certificates describe the geometry that exists', () => {
  it('every repaired certificate names its OWN final geometry', () => {
    // Two distinct hashes across the four members. A single expected hash would have been a
    // test that passes because both pairs happen to be certified, not because either is
    // certified at the geometry it actually has.
    const seen = new Set<string>();
    for (const r of loop().iterations[0].repairs) {
      expect(r.certificate!.finalGeometryHash).toBe(pairOf(r.elementId).hash);
      expect(r.certificate!.rebarHash).toBe(rebarHash(r.accepted!));
      seen.add(r.certificate!.finalGeometryHash);
    }
    expect([...seen].sort()).toEqual(['b0.0/t0.0/d15.0', 'b12.0/t10.0/d15.0']);
  });

  it('the published outcome carries the final-geometry certificate alongside the nominal one', () => {
    for (const id of REPAIRED) {
      const o = loop().outcomes.get(id)!;
      expect(o.finalGeometryCertificate?.finalGeometryHash).toBe(pairOf(id).hash);
      // The hash in the outcome is the steel actually assigned — not the arrangement the
      // nominal run certified, which is the substitution the twelve-condition gate exists
      // to catch.
      expect(o.certificate!.rebarHash).toBe(rebarHash(o.accepted!));
      expect(o.certificate!.rebarHash)
        .not.toBe(harness().outcomes.get(id)!.certificate!.rebarHash);
    }
  });

  it('a repair result cannot claim a pass it does not have', () => {
    const good = loop().iterations[0].repairs[0];
    expect(() => assertRepairInvariants(good)).not.toThrow();
    expect(() => assertRepairInvariants({ ...good, accepted: undefined }))
      .toThrow(/without reinforcement/);
    expect(() => assertRepairInvariants({ ...good, certificate: undefined }))
      .toThrow(/without a certificate/);
    expect(() => assertRepairInvariants({
      ...good, certificate: { ...good.certificate!, finalGeometryHash: '' },
    })).toThrow(/which geometry/);
    expect(() => assertRepairInvariants({
      ...good, certificate: { ...good.certificate!, worstUtilization: 1.2 },
    })).toThrow(/utilization/);
    expect(() => assertRepairInvariants({ ...good, limiting: ['shear'] }))
      .toThrow(/reports limiting constraints/);
    // A truncated search may never be reported as an exhaustive one.
    expect(() => assertRepairInvariants({
      ...good, kind: 'CANDIDATE_ENVELOPE_EXHAUSTED',
      accepted: undefined, certificate: undefined,
      limiting: ['tieSpacing'], reasons: [{ key: 'x' }],
      stats: { ...good.stats, truncated: true },
    })).toThrow(/truncated search/);
  });

  it('refuses to run a repair on a context that carries no final geometry', () => {
    // Without this, a caller could route a NOMINAL search through the repair path and get a
    // certificate that says nothing about the built geometry.
    const h = harness();
    const ctx = h.contexts.get(7)!;
    const fb = loop().iterations[0].feedback[0];
    expect(() => selectCandidateUnderFinalGeometry(cirsoc201Adapter, ctx, fb))
      .toThrow(/requires a context carrying finalGeometry/);
  });
});

describe('locked reinforcement is a hard constraint', () => {
  it('is refused rather than replaced, and says why', () => {
    const h = harness();
    const l = runDesignFeedbackLoop({
      adapter: cirsoc201Adapter,
      contexts: h.contexts,
      outcomes: h.outcomes,
      detail: h.detail,
      lockedMembers: new Set([7, 8]),
    });
    expect(l.outcome).toBe('LOCKED_REINFORCEMENT_PREVENTS_REPAIR');
    expect(l.unrepaired.map((u) => u.elementId)).toEqual([7, 8]);
    for (const u of l.unrepaired) {
      expect(u.kind).toBe('LOCKED_REINFORCEMENT_PREVENTS_REPAIR');
      expect(u.finalUtilization).toBeCloseTo(1.031, 3);
    }
    // The pinned steel is untouched and the honest verdict is preserved.
    for (const id of [7, 8]) {
      expect(rebarHash(l.outcomes.get(id)!.accepted!))
        .toBe(rebarHash(h.outcomes.get(id)!.accepted!));
    }
    // 5 and 6 are NOT locked, so they are still repaired: one engineer's pin does not stop
    // the rest of the floor from being corrected.
    expect(l.iterations[0].changed).toEqual([5, 6]);
    for (const a of l.result.assemblies) {
      expect(a.constructibility?.verdict).toBe('NOT_ESTABLISHED');
    }
    // Two passes and two iterations: iteration 1 repairs 5 and 6 and refuses 7 and 8, which
    // means the assembly must be re-coordinated; iteration 2 re-verifies at that NEW geometry,
    // finds the pinned members still failing, changes nothing and terminates. The second
    // iteration is not wasted work — without it the refusal would be a verdict about a
    // geometry that no longer exists.
    expect(l.stats.detailingRuns).toBe(2);
    expect(l.stats.iterations).toBe(2);
    expect(l.iterations[1].changed).toEqual([]);
    expect(l.iterations[1].failed).toEqual([7, 8]);
  });

  it('locking only member 7 still repairs 5, 6 and 8', () => {
    // Partial locking must not be all-or-nothing: the engineer pinned one bar, not the floor.
    const h = harness();
    const l = runDesignFeedbackLoop({
      adapter: cirsoc201Adapter,
      contexts: h.contexts,
      outcomes: h.outcomes,
      detail: h.detail,
      lockedMembers: new Set([7]),
    });
    expect(l.iterations[0].changed).toEqual([5, 6, 8]);
    expect(l.unrepaired.map((u) => u.elementId)).toEqual([7]);
    expect(l.outcome).toBe('LOCKED_REINFORCEMENT_PREVENTS_REPAIR');
  });
});

describe('bounds and termination', () => {
  it('an iteration budget of zero truncates instead of silently passing', () => {
    const h = harness();
    const l = runDesignFeedbackLoop({
      adapter: cirsoc201Adapter,
      contexts: h.contexts,
      outcomes: h.outcomes,
      detail: h.detail,
      maxIterations: 0,
    });
    expect(l.outcome).toBe('FEEDBACK_LOOP_TRUNCATED');
    expect(l.stats.truncated).toBe(true);
    expect(l.stats.detailingRuns).toBe(1);
    expect(l.unrepaired.map((u) => u.elementId)).toEqual(REPAIRED);
    for (const a of l.result.assemblies) {
      expect(a.constructibility?.verdict).toBe('NOT_ESTABLISHED');
    }
  });

  it('a candidate budget of one truncates rather than claiming the envelope is exhausted', () => {
    // One candidate is the arrangement already known to fail, so nothing can be found — and
    // that is emphatically not the same statement as "no arrangement exists".
    const h = harness();
    const l = runDesignFeedbackLoop({
      adapter: cirsoc201Adapter,
      contexts: h.contexts,
      outcomes: h.outcomes,
      detail: h.detail,
      budget: { maxCandidates: 1, maxVerifierCalls: 1 },
    });
    expect(l.outcome).toBe('FEEDBACK_LOOP_TRUNCATED');
    for (const r of l.iterations[0].repairs) {
      expect(r.kind).toBe('FEEDBACK_LOOP_TRUNCATED');
      expect(r.stats.truncated).toBe(true);
      expect(r.stats.envelopeExhausted).toBe(false);
      expect(r.sectionAdvice).toBeUndefined();
    }
  });

  it('the iteration bound is a count, so the verdict cannot depend on the machine', async () => {
    expect(DEFAULT_MAX_ITERATIONS).toBe(8);
    expect(Number.isInteger(DEFAULT_MAX_ITERATIONS)).toBe(true);
    // No wall-clock anywhere in the loop or the selector.
    const fs = await import('node:fs');
    for (const f of ['../design-feedback-loop.ts', '../../design/final-geometry-feedback.ts']) {
      const src = fs.readFileSync(new URL(f, import.meta.url), 'utf8');
      expect(src, f).not.toContain('Date.now');
      expect(src, f).not.toContain('performance.now');
    }
  });
});

describe('determinism', () => {
  it('two runs of the same input agree on every repair and every bar', () => {
    const h = harness();
    const run = () => runDesignFeedbackLoop({
      adapter: cirsoc201Adapter,
      contexts: h.contexts,
      outcomes: h.outcomes,
      detail: h.detail,
    });
    const shape = (l: DesignFeedbackLoopResult) => ({
      outcome: l.outcome,
      stats: l.stats,
      iterations: l.iterations.map((i) => ({
        failed: i.failed, changed: i.changed, hash: i.assignmentHash,
        affected: i.affectedAssemblies, adjacent: i.adjacentMembers,
        repairs: i.repairs.map((r) => `${r.elementId}:${r.kind}:${r.certificate?.rebarHash}`),
      })),
      bars: l.result.assemblies.flatMap((a) => a.bars
        .map((b) => `${b.id}|${b.layerId}|${b.cuttingLength.toFixed(6)}`)),
    });
    expect(shape(run())).toEqual(shape(run()));
  });

  it('assemblies owning no changed member come back byte-identical', () => {
    // The whole floor is re-coordinated on purpose — arc consistency propagates across
    // joints, so a scoped re-run would judge a neighbour against a cage that no longer
    // exists. What must hold is that re-coordination changes nothing it should not, and
    // that is observable on the output rather than argued about in a comment.
    const h = harness();
    const before = h.detail(h.outcomes);
    const l = loop();
    const changed = new Set(l.iterations.flatMap((i) => i.changed));
    const untouched = before.assemblies.filter((a) => !a.elementIds.some((e) => changed.has(e)));
    for (const a of untouched) {
      const after = l.result.assemblies.find((x) => x.id === a.id);
      expect(after, a.id).toBeDefined();
      expect(after!.bars.map((b) => `${b.id}|${b.cuttingLength.toFixed(6)}`))
        .toEqual(a.bars.map((b) => `${b.id}|${b.cuttingLength.toFixed(6)}`));
    }
  });
});

describe('the record is pure data', () => {
  it('carries no functions, and survives a JSON round trip unchanged', () => {
    // It has to be persistable, diffable and renderable in a report without a live run.
    const fb = loop().iterations[0].feedback[0];
    expect(JSON.parse(JSON.stringify(fb))).toEqual(fb);
    const walk = (v: unknown): void => {
      if (typeof v === 'function') throw new Error('feedback record contains a function');
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    expect(() => walk(fb)).not.toThrow();
  });

  it('names the rejected arrangement so the next iteration cannot retry it', () => {
    const h = harness();
    for (const fb of loop().iterations[0].feedback) {
      const prev = h.outcomes.get(fb.elementId)!.accepted!;
      expect(fb.previousCandidateHash).toBe(rebarHash(prev));
      expect(fb.rejectedCandidateHashes).toContain(fb.previousCandidateHash);
    }
  });

  it('structuredFailures reports warnings as well as failures, and never an ok check', () => {
    const h = harness();
    const ctx = h.contexts.get(7)!;
    const verdict = cirsoc201Adapter.verify(
      { ...ctx, finalGeometry: { bottomRaise: 0.012, topLower: 0.01, depthTolerance: 0.015 } } as never,
      h.outcomes.get(7)!.accepted!);
    const out = structuredFailures(verdict);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((c) => c.status !== 'ok')).toBe(true);
    expect(out.some((c) => c.status === 'fail')).toBe(true);
    // Every entry keeps the verifier's own category string, because that is what the
    // candidate generator escalates on. A second vocabulary here could drift from it.
    for (const c of out) {
      expect(verdict.checks.some((k) => k.category === c.category)).toBe(true);
    }
  });

  it('builds from the FINAL-geometry verdict, and a nominal one is visibly different', () => {
    const h = harness();
    const ctx = h.contexts.get(7)!;
    const reinf = h.outcomes.get(7)!.accepted!;
    const geom = {
      bottomRaise: 0.012, topLower: 0.01, depthTolerance: 0.015, layerCentroids: [3.4, 3.0],
    };
    const atFinal = buildFinalGeometryFeedback({
      elementId: 7, previousCandidate: reinf, finalGeometry: geom,
      verdict: cirsoc201Adapter.verify({ ...ctx, finalGeometry: geom } as never, reinf),
    });
    const atNominal = buildFinalGeometryFeedback({
      elementId: 7, previousCandidate: reinf, finalGeometry: geom,
      verdict: cirsoc201Adapter.verify(ctx, reinf),
    });
    expect(atFinal.finalUtilization).toBeCloseTo(1.031, 3);
    expect(atNominal.finalUtilization).toBeCloseTo(0.932, 3);
    expect(atFinal.failedChecks.some((c) => c.status === 'fail')).toBe(true);
    expect(atNominal.failedChecks.some((c) => c.status === 'fail')).toBe(false);
  });
});
