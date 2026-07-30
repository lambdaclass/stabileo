/**
 * The feasible fixture, through the real production path, against all twelve conditions.
 *
 * ── Why this file is not another unit test ─────────────────────────
 *
 * Every defect that took a cycle to find in this PR was invisible to unit tests and
 * obvious in the full run. `placeGroup` was correct in isolation while the persisted
 * geometry was wrong. The layer allocator was correct while the repair ladder undid it.
 * The roof hook was geometrically fine and forbidden by the clause it was meant to satisfy.
 *
 * So this runs solve → design → detailing exactly as the app does, seeds nothing, and
 * asserts the twelve conditions the product actually claims.
 */

import { describe, expect, it } from 'vitest';
import frame from '../../../templates/fixtures/rc-design-qa-8.json';
import { runDesign } from '../../design/candidate-search';
import { cirsoc201Adapter } from '../../design/adapters/cirsoc201-adapter';
import { solveFixture } from '../../design/__tests__/helpers';
import { runDetailing, type RunDetailingResult } from '../run-detailing';
import { runDesignFeedbackLoop, type DesignFeedbackLoopResult } from '../design-feedback-loop';
import type { MemberDesignOutcome } from '../../design/outcome';

let cached: DesignFeedbackLoopResult | null = null;

/**
 * One full production run, shared across the assertions.
 *
 * `runDetailing` alone is not the production path any more. The command closes the
 * design–detailing loop: coordinate, re-verify at the geometry that results, and where that
 * fails, re-enumerate candidates knowing the final geometry and coordinate again. Beams 7
 * and 8 need exactly that, and nothing here seeds it.
 */
function loop(): DesignFeedbackLoopResult {
  if (cached) return cached;
  const solved = solveFixture(frame as never);
  const summary = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 });
  cached = runDesignFeedbackLoop({
    adapter: cirsoc201Adapter,
    contexts: solved.contexts,
    outcomes: summary.outcomes,
    detail: (outcomes: ReadonlyMap<number, MemberDesignOutcome>) => runDetailing({
      contexts: solved.contexts,
      outcomes,
      nodes: solved.data.nodes as never,
      elements: solved.data.elements as never,
      edition: '2025',
      maxAggregateSizeMm: 19,
      verifierId: 'cirsoc201.provided.v2.2025',
      demandRevision: 1,
      // The production command always supplies a verifier; a run without one leaves
      // `allMembersReverified` unmet by design. It checks the ASSIGNMENT'S reinforcement,
      // because mid-loop that is not yet the model's.
      reverify: (elementId: number, loss: {
        bottomRaise: number; topLower: number; depthTolerance: number;
      }) => {
        const ctx = solved.contexts.get(elementId);
        const accepted = outcomes.get(elementId)?.accepted;
        if (!ctx || !accepted) return 'fail';
        const res = cirsoc201Adapter.verify(
          { ...ctx, finalGeometry: loss } as never, accepted as never);
        return res?.overallStatus === 'fail' ? 'fail'
          : res?.overallStatus === 'warn' ? 'warn' : 'ok';
      },
    } as never),
  });
  return cached;
}

/** The detailing result the loop settled on — the one the store persists. */
function run(): RunDetailingResult {
  return loop().result;
}

describe('rc-design-qa-8 reaches CONSTRUCTIBLE through the production path', () => {
  it('the search finds an assignment', () => {
    expect(run().layoutSearch.outcome).toBe('ASSIGNMENT_FOUND');
  });

  it('produces assemblies with real bars', () => {
    const r = run();
    expect(r.assemblies.length).toBeGreaterThan(0);
    expect(r.assemblies[0].bars.length).toBeGreaterThan(20);
  });

  it('skips no member', () => {
    expect(run().skipped).toEqual([]);
  });

  it('leaves no transition unmaterialised', () => {
    expect(run().lapping.unmaterialised).toEqual([]);
  });

  it('has ZERO prohibited physical conflicts', () => {
    // Not "fewer than before". Zero. This is the condition that took five cycles.
    const conflicts = run().assemblies
      .flatMap((a) => a.conflicts)
      .filter((c) => c.pairClass === 'prohibitedOverlap');
    expect(conflicts.map((c) => `${c.barA}/${c.barB} ${Math.round(c.clearance * 1000)}mm`))
      .toEqual([]);
  });

  it('has no conflicts of any reportable class', () => {
    expect(run().assemblies.flatMap((a) => a.conflicts)).toEqual([]);
  });

  it('ALL FIFTEEN conditions pass', () => {
    // Asserted by name rather than by count, so a condition that stopped being evaluated
    // could not pass this by disappearing.
    const expected = [
      'allMembersAssigned', 'allMembersReverified', 'allSpacingCodeLegal',
      'allSpacingPlacementRobust', 'allTransitionsMaterialised', 'certificatesMatchGeometry',
      'allRequiredTransversePathsMaterialised',
      'completeEnvelope', 'noProhibitedConflicts', 'noStaleUpstreamRevision',
      'noUnmaterialisedTransitions', 'noUnsupportedRule', 'searchNotTruncated',
      // A beam/column fixture contains no floor families, so both family conditions are
      // satisfied by a MEASURED empty requirement. They are asserted here by name because
      // this fixture is the frame path's proof that adding them did not silently gate it.
      'allApplicableFamiliesCertified', 'noStaleFamilyCertificate',
    ].sort();
    for (const a of run().assemblies) {
      const conditions = a.constructibility?.conditions ?? [];
      expect(conditions.map((c) => c.condition).sort(), `${a.id}`).toEqual(expected);
      expect(conditions.filter((c) => !c.passed).map((c) => c.condition), `${a.id}`).toEqual([]);
    }
  });

  it('reaches CONSTRUCTIBLE, and the last two conditions were closed by design feedback', () => {
    // The two that used to fail — `allMembersReverified` and `certificatesMatchGeometry` —
    // were the SAME failure: the beams came out of the authoritative re-verification above
    // ratio 1,00 once the joint-layer movement and Table 26.6.2.1(a)'s tolerance were charged
    // against their effective depth.
    //
    // The governing check is Table 9.7.6.2.2's maximum stirrup spacing, s <= d/2 — NOT
    // flexure, which passes throughout. The design had placed the stirrups at the nominal
    // limit (250 mm against 256 mm) because wider spacing is less steel, and coordination
    // then moved the limit to 242 mm. That is also why deepening the section to 300×600 was
    // measured making it worse: a deeper member gets a larger s,max and the search spends it,
    // arriving at the same zero margin one grid step wider.
    //
    // The repair is reinforcement-only and design-side: re-enumerate with the final geometry
    // known, which closes the spacing to 225 mm.
    //
    // REBASELINED: all FOUR beams are repaired, not two. Members 5 and 6 fail in their SPAN
    // region, which the removed `if (VsReq <= 0) return min(0,8·d, 300 mm)` branch had been
    // checking against an invented 300 mm limit. A required V_s of zero is row 1 of Table
    // 9.7.6.2.2 and its limit is d/2 = 248 mm, so the previous baseline had certified a
    // 250 mm span spacing the regulation forbids. Correcting the rule surfaced it.
    const l = loop();
    expect(l.outcome).toBe('FINAL_GEOMETRY_VERIFIED');
    expect(l.unrepaired).toEqual([]);
    expect(l.iterations.flatMap((i) => i.changed)).toEqual([5, 6, 7, 8]);
    // Reinforcement is downstream of analysis: repairing it can never require a solve.
    expect(l.stats.structuralSolves).toBe(0);
    for (const a of run().assemblies) {
      expect(a.constructibility?.verdict, `${a.id}`).toBe('CONSTRUCTIBLE');
      expect(a.state, `${a.id}`).toBe('CONSTRUCTIBLE');
      expect(a.stateBlockers ?? [], `${a.id}`).toEqual([]);
    }
  });

  it('every member is re-verified at its own final geometry, and none is skipped', () => {
    // `noVerifier` and `noBars` are recorded rather than omitted precisely so this can be
    // asserted: a missing record would read as a pass.
    const records = run().reverification;
    expect(records.map((r) => r.elementId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const r of records) {
      expect(['ok', 'warn'], `element ${r.elementId} → ${r.status}`).toContain(r.status);
      expect(r.finalGeometry.depthTolerance).toBeGreaterThan(0);
    }
  });
});

describe('§25.4.1.2 — no hook anchors a compression bar', () => {
  it('the compression-only roof columns terminate straight', () => {
    // The clause is a prohibition, not a preference: "no se deben emplear para anclar
    // barras en compresión". A hook here is not conservative, it is non-compliant — and it
    // was also putting a 12db extension through the beam's top mat.
    const hooked = run().assemblies
      .flatMap((a) => a.bars)
      .filter((b) => b.role === 'longitudinal'
        && (b.startTreatment.kind === 'hook' || b.endTreatment.kind === 'hook'));
    expect(hooked.map((b) => b.id)).toEqual([]);
  });

  it('and nothing was reported unsupported to achieve it', () => {
    // ldc is checked against the embedment the joint offers; a shortfall would appear here
    // rather than being silently swapped for a hook the code will not credit.
    expect(run().assemblies.flatMap((a) => a.unsupported)).toEqual([]);
  });
});

describe('the layer invariants hold in the finished geometry', () => {
  it('two distinct layer ids never share a physical centroid', () => {
    // The failure this guards: `applyJointLayers` flattening a two-layer mat onto one
    // plane, which then read as an overlap and sent the repair ladder sideways.
    const offenders: string[] = [];
    for (const a of run().assemblies) {
      const byLayer = new Map<string, number[]>();
      for (const b of a.bars) {
        // Longitudinal only. A layer is a mat at one elevation; the cage shares this bar list
        // and a stirrup spans the whole depth by design, so including it would compare a
        // flexural invariant against a piece it was never about.
        if (b.role !== 'longitudinal') continue;
        if (!b.layerId) continue;
        const z = b.segments[0]?.start.z ?? 0;
        byLayer.set(b.layerId, [...(byLayer.get(b.layerId) ?? []), z]);
      }
      const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
      const entries = [...byLayer.entries()];
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const [ia, za] = entries[i];
          const [ib, zb] = entries[j];
          // Only layers of the same member and face can be compared this way.
          if (ia.split(':').slice(0, 2).join(':') !== ib.split(':').slice(0, 2).join(':')) continue;
          if (Math.abs(mean(za) - mean(zb)) < 1e-6) offenders.push(`${ia} == ${ib}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every bar in one layer shares that layer’s elevation', () => {
    // The rigid-mat invariant, observed on the output rather than asserted on the code.
    const offenders: string[] = [];
    for (const a of run().assemblies) {
      const byLayer = new Map<string, number[]>();
      for (const b of a.bars) {
        if (b.role !== 'longitudinal') continue;
        if (!b.layerId) continue;
        byLayer.set(b.layerId,
          [...(byLayer.get(b.layerId) ?? []), b.segments[0]?.start.z ?? 0]);
      }
      for (const [id, zs] of byLayer) {
        if (Math.max(...zs) - Math.min(...zs) > 1e-6) {
          offenders.push(`${id}: ${Math.round((Math.max(...zs) - Math.min(...zs)) * 1000)}mm`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('layer identity carries the longitudinal region', () => {
    // `e7:top:1` shared by both supports' hogging steel is what made the rigid move drag
    // bars at the far end of the member.
    const ids = new Set(run().assemblies.flatMap((a) => a.bars)
      .map((b) => b.layerId).filter(Boolean) as string[]);
    const tops = [...ids].filter((x) => x.includes(':top'));
    expect(tops.length).toBeGreaterThan(0);
    // Three top regions, not two. `topI` and `topJ` are the hogging mats at the two ends;
    // `topRun` is the pair that runs the whole member so every stirrup's top bends contain a
    // bar (§25.7.1.2). It has to be its OWN layer for exactly the reason this test exists —
    // the repair ladder moves a layer as a rigid body, and a continuous bar dragged by a
    // support mat's nudge would move at the far end too.
    for (const id of tops) expect(id).toMatch(/:(top[IJ]|topRun):\d+$/);
    expect(tops.some((x) => x.includes(':topRun:'))).toBe(true);
  });
});

describe('determinism', () => {
  it('two runs of the same fixture agree bar for bar', () => {
    cached = null;
    const a = run();
    cached = null;
    const b = run();
    cached = null;
    const shape = (r: RunDetailingResult) => r.assemblies.map((x) => ({
      id: x.id, state: x.state,
      bars: x.bars.map((bar) => `${bar.id}|${bar.layerId}|${bar.cuttingLength.toFixed(6)}`),
    }));
    expect(shape(b)).toEqual(shape(a));
  });
});
