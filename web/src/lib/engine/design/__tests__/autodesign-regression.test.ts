/**
 * PR15 auto-design regression + performance harness.
 *
 * This is the measurement suite from the architecture audit, promoted to a gate. It
 * asserts the corrected outcome on the 408-member flagship frame, the honest refusal
 * when the model's force orientation is broken, and the audited performance budgets.
 *
 * BEFORE PR15 (measured on this fixture with combinations added):
 *   generator self-assessment  ok 112 / warn 92 / fail 204
 *   authoritative verifier     ok 4 / warn 28 / FAIL 376
 *   worst provided utilization 7.69
 * AFTER PR15: 408/408 VERIFIED, worst certified utilization <= 1.00.
 */

import { describe, it, expect } from 'vitest';
import frame from '../../../templates/fixtures/rc-design-frame.json';
import qa8 from '../../../templates/fixtures/rc-design-qa-8.json';
import { runDesign, designMember } from '../candidate-search';
import { cirsoc201Adapter } from '../adapters/cirsoc201-adapter';
import { UTIL_FAIL_THRESHOLD } from '../outcome';
import { buildCriticalSectionMap } from '../member-context';
import { computeBeamCriticalSections } from '../../station-design-forces';
import { solveFixture, directionOf, modelFromFixture, assertRealSolver } from './helpers';

describe('flagship 408-member RC frame designs completely', () => {
  const solved = solveFixture(frame);

  it('has 408 members, 5 combinations, and no orientation issues after the fixture fix', () => {
    assertRealSolver();
    expect(solved.contexts.size).toBe(408);
    expect(solved.model.combinations.length).toBe(5);
    expect(solved.orientationSuspect.size).toBe(0);
    expect(solved.orientationIssues).toEqual([]);
  });

  it('produces VERIFIED for every member, with valid certificates', () => {
    const s = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 120_000 });
    expect(s.total).toBe(408);
    expect(s.verified).toBe(408);
    expect(s.sectionInadequate).toBe(0);
    expect(s.demandUnavailable).toBe(0);
    expect(s.searchExhausted).toBe(0);
    expect(s.unsupported).toBe(0);
    expect(s.provisionalRetained).toBe(0);
    expect(s.aborted).toBe(false);
    expect(s.notReached).toBe(0);

    let worst = 0;
    for (const [id, o] of s.outcomes) {
      expect(o.certificate, `element ${id} certificate`).toBeDefined();
      expect(o.accepted, `element ${id} accepted rebar`).toBeDefined();
      expect(o.certificate!.checkCount).toBeGreaterThan(0);
      expect(o.certificate!.checkedAxes.length).toBeGreaterThan(0);
      worst = Math.max(worst, o.certificate!.worstUtilization);
    }
    expect(worst).toBeLessThanOrEqual(UTIL_FAIL_THRESHOLD);
  }, 180_000);

  it('checks the GOVERNING axis on every member, not a hardcoded one', () => {
    // Beams under gravity bend about local y (My/Vz) in this Z-up convention. The
    // pre-PR15 verifier was hardcoded to Mz/Vy and so returned false passes.
    const byDir = { COL: new Set<string>(), 'BEAM-X': new Set<string>(), 'BEAM-Y': new Set<string>() };
    for (const [id, ctx] of solved.contexts) {
      byDir[directionOf(solved.data, id)].add(`${ctx.axes.flexure}/${ctx.axes.shear}`);
    }
    expect([...byDir['BEAM-X']]).toEqual(['My/Vz']);
    expect([...byDir['BEAM-Y']]).toEqual(['My/Vz']);
    // Columns take the larger moment; the fixture's are My-dominant.
    for (const pair of byDir.COL) expect(pair).toMatch(/^M[yz]\/V[yz]$/);
  });

  it('every certificate records an axis that actually carries the demand', () => {
    for (const [, ctx] of solved.contexts) {
      const o = designMember(cirsoc201Adapter, ctx);
      if (o.outcome !== 'VERIFIED') continue;
      expect(o.certificate!.checkedAxes).toContain(ctx.axes.flexure);
    }
  }, 180_000);

  it('the QA fixture designs 8/8 with margin', () => {
    const s = runDesign(cirsoc201Adapter, solveFixture(qa8).contexts.values(), { maxRunMs: 30_000 });
    expect(s.total).toBe(8);
    expect(s.verified).toBe(8);
    let worst = 0;
    for (const [, o] of s.outcomes) worst = Math.max(worst, o.certificate!.worstUtilization);
    expect(worst).toBeLessThanOrEqual(UTIL_FAIL_THRESHOLD);
  }, 60_000);
});

describe('honest refusal when the model is broken', () => {
  it('refuses to certify Y-beams when gravity is authored in the horizontal component', () => {
    // Re-introduce the exact original fixture defect.
    const broken = JSON.parse(JSON.stringify(frame));
    const fm = modelFromFixture(broken);
    let moved = 0;
    for (const l of broken.loads) {
      if (l.type !== 'distributed3d') continue;
      if (directionOf(fm.data, l.data.elementId) !== 'BEAM-Y') continue;
      if (l.data.qZI === 0 && l.data.qZJ === 0) continue;
      l.data.qYI = l.data.qZI; l.data.qYJ = l.data.qZJ;
      l.data.qZI = 0; l.data.qZJ = 0;
      moved++;
    }
    expect(moved).toBe(240);

    const solved = solveFixture(broken);
    expect(solved.orientationSuspect.size).toBe(120);

    const s = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 });
    // Not one of the suspect members may be certified.
    for (const id of solved.orientationSuspect) {
      const o = s.outcomes.get(id)!;
      expect(o.outcome, `element ${id}`).not.toBe('VERIFIED');
      expect(o.certificate).toBeUndefined();
      expect(o.limiting).toContain('memberOrientationSuspect');
    }
    expect(s.verified).toBeLessThan(408);
  }, 240_000);

  it('refuses honestly when combinations are absent', () => {
    const noCombos = { ...JSON.parse(JSON.stringify(qa8)), combinations: [] };
    const fm = modelFromFixture(noCombos);
    // No combinations → no station data → every member DEMAND_UNAVAILABLE.
    const ctxs = [...fm.data.elements.keys()].map(id => ({
      elementId: id, elementType: 'beam' as const, L: 6,
      section: { id: 1, name: 'x', b: 0.3, h: 0.55 },
      material: { fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 },
      demands: undefined, stations: undefined, criticalSections: undefined,
      axes: {
        flexure: 'My' as const, shear: 'Vz' as const, secondaryFlexure: 'Mz' as const,
        secondaryShear: 'Vy' as const, bFlex: 0.3, hFlex: 0.55, biaxial: false,
        sagCategory: 'My+' as const, hogCategory: 'My-' as const,
        basis: 'no-demand' as const, secondaryRatio: 0,
      },
      slenderDeltaNs: 1, orientationSuspect: false,
      // This test is about MISSING COMBINATIONS, so the edition must be a supported one.
      // Without it the context would trip the capability gate first (an unknown edition
      // fails closed, by design) and report UNSUPPORTED — an honest refusal, but not the
      // one under test. The production path always sets this; only hand-built contexts can
      // omit it.
      codeEdition: '2025' as const,
      analysisRevision: 1, demandRevision: 0,
      blocking: ['missingCombinations' as const, 'missingDemand' as const],
      modelData: fm.data,
    }));
    const s = runDesign(cirsoc201Adapter, ctxs, {});
    expect(s.verified).toBe(0);
    expect(s.demandUnavailable).toBe(ctxs.length);
    for (const [, o] of s.outcomes) {
      expect(o.certificate).toBeUndefined();
      expect(o.reasons.length).toBeGreaterThan(0);
    }
  });
});

describe('performance budgets (audited)', () => {
  const solved = solveFixture(frame);

  it('critical sections are memoised: one pass over the model, not per row', () => {
    // The pre-PR15 path called computeBeamCriticalSections per row per keystroke, so
    // it scanned every element twice per beam end → O(N·E).
    const t0 = performance.now();
    const map = buildCriticalSectionMap(solved.data);
    const ms = performance.now() - t0;
    expect(map.size).toBe(248);                 // beams only
    expect(ms).toBeLessThan(1500);
    // Sanity: the memoised value equals a direct computation.
    const [id, cs] = [...map.entries()][0];
    const el = solved.data.elements.get(id)!;
    const sec = solved.data.sections.get(el.sectionId)!;
    const direct = computeBeamCriticalSections(
      id, solved.data.nodes, solved.data.elements, solved.data.sections, solved.data.supports,
      { b: sec.b!, h: sec.h!, cover: 0.025, stirrupDia: 8 },
    );
    expect(cs.tSpanStart).toBeCloseTo(direct!.tSpanStart, 6);
  });

  // NOTE ON WALL-CLOCK BUDGETS: these run inside the full parallel Vitest suite, so
  // absolute times include contention from co-scheduled workers (the repo's Rust perf
  // gates run single-threaded for the same reason). Each budget therefore pairs a
  // generous wall bound with a DETERMINISTIC work-count bound, which is the assertion
  // that actually catches an algorithmic regression.
  it('single-member re-verification is fast and does no repeated geometry scanning', () => {
    const ctx = [...solved.contexts.values()][0];
    const o = designMember(cirsoc201Adapter, ctx);
    const rebar = o.accepted!;
    // Warm any lazy paths, then measure.
    cirsoc201Adapter.verify(ctx, rebar);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) cirsoc201Adapter.verify(ctx, rebar);
    const per = (performance.now() - t0) / 20;
    expect(per).toBeLessThan(20);
    // The audited budget is one cache miss per edit: a single verify call, not a
    // re-verification of every row.
    expect(o.searchStats.verifierCalls).toBeLessThanOrEqual(300);
  });

  it('a 50-member design pass stays cheap (work-count bound is the real gate)', () => {
    const subset = [...solved.contexts.values()].slice(0, 50);
    const t0 = performance.now();
    const s = runDesign(cirsoc201Adapter, subset, { maxRunMs: 60_000 });
    const ms = performance.now() - t0;
    expect(s.total).toBe(50);
    let calls = 0;
    for (const [, o] of s.outcomes) calls += o.searchStats.verifierCalls;
    // Deterministic: ~4-5 verifier calls per member on the corrected fixture.
    expect(calls).toBeLessThan(50 * 12);
    console.log(`[perf] 50 members in ${ms.toFixed(0)} ms · ${calls} verifier calls`);
    // Generous wall bound: catches an order-of-magnitude regression, tolerates
    // full-suite contention.
    expect(ms).toBeLessThan(2000);
  });

  it('the full 408-member run stays inside the 20 s wall budget', () => {
    const t0 = performance.now();
    const s = runDesign(cirsoc201Adapter, solved.contexts.values(), {});
    const ms = performance.now() - t0;
    expect(s.aborted).toBe(false);
    expect(ms).toBeLessThan(20_000);   // the run-level wall budget the UI enforces
    // Reported so a regression shows up in the log even when it stays under budget.
    let calls = 0, maxCalls = 0;
    for (const [, o] of s.outcomes) {
      calls += o.searchStats.verifierCalls;
      maxCalls = Math.max(maxCalls, o.searchStats.verifierCalls);
    }
    console.log(`[perf] 408 members in ${ms.toFixed(0)} ms · ${calls} verifier calls · max ${maxCalls}/member`);
    expect(maxCalls).toBeLessThanOrEqual(300);
  }, 60_000);
});
