/**
 * The six states, and the distinctions that make them worth having.
 *
 * The temptation in a module like this is to test the switch statement, which proves nothing
 * — the switch IS the specification. What is worth pinning is the cases where two inputs
 * disagree, because those are the ones a future edit will collapse: a verified member with no
 * bars, a member with bars and a failing verification, and a member the design never reached
 * that still has concrete on screen.
 */

import { describe, expect, it } from 'vitest';
import {
  statusOf, reportElementStatus, ELEMENT_STATUS_ORDER, NOT_FOR_CONSTRUCTION_STATUSES,
  type DesignOutcomeSummary,
} from '../element-status';
import type { SceneModel, SceneSolid, SceneBar } from '../scene-model';

function solid(id: number, over: Partial<SceneSolid> = {}): SceneSolid {
  return {
    id: `member:${id}`, kind: 'beam', elementIds: [id],
    base: [
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
    ],
    extrude: { x: 0, y: 0, z: 1 },
    label: { key: 'detailing.scene.solid.member', params: { id } },
    reinforced: false,
    ...over,
  };
}

function barFor(id: number): SceneBar {
  return {
    barId: `b${id}`, diameterMm: 16, role: 'longitudinal', assemblyId: 'a', ownerScope: 'frame', piece: 'longitudinal',
    elementIds: [id], polyline: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
    cuttingLength: 1, conflicted: false,
  };
}

function scene(solids: SceneSolid[], bars: SceneBar[] = []): SceneModel {
  return {
    seriesId: 'S', revision: 1, readiness: 'ISSUED',
    bars, solids, conflicts: [],
    facets: { assemblies: [], families: [], roles: [], layers: [] },
    bounds: null, unresolvedMembers: [], unreinforcedMembers: [],
  provisionalMembers: [], lockedMembers: [],
    torsionUnevaluatedMembers: [],
  };
}

// ─── The distinctions ────────────────────────────────────────────

describe('the states a member can be in', () => {
  it('is MODELLED only when the design passed AND steel exists', () => {
    expect(statusOf(true, { outcome: 'VERIFIED' })).toBe('MODELLED');
  });

  it('separates "designed but not modelled" from "not designed"', () => {
    /**
     * The wall case, and the reason this state exists.
     *
     * A wall with no start/end geometry is fully checked — its capacity, its curtains, its
     * minimum steel are all real — and produces no bar. The checks stand; the despiece does
     * not exist. Calling that NOT_EVALUATED throws away a verification that was performed,
     * and calling it MODELLED promises a schedule that cannot be written.
     */
    expect(statusOf(false, { outcome: 'VERIFIED' })).toBe('DESIGNED_NOT_MODELLED');
    expect(statusOf(false, undefined)).toBe('NOT_EVALUATED');
  });

  it('keeps UNSUPPORTED apart from REFUSED, because the remedies differ', () => {
    // REFUSED: a bigger section may help. UNSUPPORTED: nothing you do to the section will,
    // because the check is not implemented. Collapsing them sends people to the wrong fix.
    expect(statusOf(false, { outcome: 'UNSUPPORTED' })).toBe('UNSUPPORTED');
    expect(statusOf(false, { outcome: 'SECTION_INADEQUATE' })).toBe('REFUSED');
    expect(statusOf(false, { outcome: 'SEARCH_EXHAUSTED' })).toBe('REFUSED');
  });

  it('treats absent demand as not evaluated rather than as a refusal', () => {
    expect(statusOf(false, { outcome: 'DEMAND_UNAVAILABLE' })).toBe('NOT_EVALUATED');
  });

  it('lets a FAILING verification outrank a stale VERIFIED outcome', () => {
    /**
     * The case that would otherwise show green.
     *
     * A member can carry steel and a VERIFIED outcome from an earlier run and still fail
     * verification now — editing the section or the loads does exactly that. Reading the
     * outcome first would report MODELLED for a member the app knows does not pass.
     */
    expect(statusOf(true, { outcome: 'VERIFIED', verificationStatus: 'fail' })).toBe('FAILED');
  });

  it('accepts family steel that has no per-member outcome', () => {
    // Footing, slab and wall steel comes from the floor run, which produces family records
    // rather than per-element outcomes. Calling that NOT_EVALUATED would be false.
    expect(statusOf(true, undefined)).toBe('MODELLED');
  });
});

// ─── The report ──────────────────────────────────────────────────

describe('the report covers what is on screen', () => {
  it('is driven by the SOLIDS, so a member with no outcome still gets a state', () => {
    /**
     * The original bug, in status form.
     *
     * Iterating the design outcomes would silently omit exactly the members that have none —
     * which are the ones that vanished from the view in the first place.
     */
    const r = reportElementStatus(
      scene([solid(1), solid(2)]),
      new Map<number, DesignOutcomeSummary>([[1, { outcome: 'VERIFIED' }]]),
    );
    expect(r.entries.map((e) => e.elementId)).toEqual([1, 2]);
    expect(r.entries[1].status).toBe('NOT_EVALUATED');
  });

  it('counts every state and offers only the ones present', () => {
    const r = reportElementStatus(
      scene(
        [solid(1, { reinforced: true }), solid(2), solid(3)],
        [barFor(1)],
      ),
      new Map<number, DesignOutcomeSummary>([
        [1, { outcome: 'VERIFIED' }],
        [2, { outcome: 'UNSUPPORTED', limiting: ['biaxial'] }],
      ]),
    );
    expect(r.counts.MODELLED).toBe(1);
    expect(r.counts.UNSUPPORTED).toBe(1);
    expect(r.counts.NOT_EVALUATED).toBe(1);
    expect(r.counts.REFUSED).toBe(0);
    expect(r.present).toEqual(['UNSUPPORTED', 'NOT_EVALUATED', 'MODELLED']);
  });

  it('orders the states by how much they need looking at', () => {
    // Not alphabetical: a list that buries the failures under the passes is a list nobody
    // scrolls to the end of.
    expect(ELEMENT_STATUS_ORDER[0]).toBe('FAILED');
    expect(ELEMENT_STATUS_ORDER[ELEMENT_STATUS_ORDER.length - 1]).toBe('MODELLED');
  });

  it('carries the limiting constraints through, so the reason can be shown', () => {
    const r = reportElementStatus(
      scene([solid(1)]),
      new Map<number, DesignOutcomeSummary>([[1, {
        outcome: 'UNSUPPORTED', limiting: ['biaxial'],
      }]]),
    );
    expect(r.entries[0].limiting).toEqual(['biaxial']);
  });

  it('does not count one member twice when two solids name it', () => {
    // A footing and its pedestal, or a member split across solids. The status list is per
    // MEMBER, and a duplicated row is a miscount in the panel's headline figures.
    const r = reportElementStatus(
      scene([solid(1), solid(1, { id: 'pedestal:1', kind: 'pedestal' })]),
      new Map(),
    );
    expect(r.entries).toHaveLength(1);
  });
});

/**
 * A proposal fails the verifier BY CONSTRUCTION, and that must not turn it into a failure.
 *
 * ── The gap this closes ────────────────────────────────────────────
 *
 * `statusOf` checks `verificationStatus === 'fail'` first, which is right: a member can carry
 * steel, hold a VERIFIED outcome from an earlier run, and fail now because the section moved.
 *
 * A PROVISIONAL_BIAXIAL member fails that check every time. The authoritative verifier pushes
 * the biaxial refusal for exactly these members — it is the same fact the outcome carries and
 * names far better — so the first rule swallowed every proposal into FAILED. The workspace
 * showed 117 failures where the design had produced 117 marked proposals, and the distinction
 * the whole state exists to make was gone from the one screen it was built for.
 *
 * It was invisible to the unit suite because the tests built their outcome maps WITHOUT a
 * verification status, which made the join easier than the app's. Only the browser saw it.
 */
describe('a provisional proposal against a failing verification', () => {
  const provisional = (over: Partial<DesignOutcomeSummary> = {}): DesignOutcomeSummary => ({
    outcome: 'PROVISIONAL_BIAXIAL',
    verificationStatus: 'fail',
    verificationLimiting: ['biaxial'],
    limiting: ['biaxial'],
    ...over,
  });

  it('stays PROVISIONAL when the only failing check is the biaxial refusal', () => {
    expect(statusOf(true, provisional())).toBe('PROVISIONAL');
  });

  it('becomes FAILED when something else fails alongside it', () => {
    // A proposal that ALSO fails on flexure is not a known limitation any more; there is
    // something wrong beyond it, and it must not inherit the proposal's calmer state.
    expect(statusOf(true, provisional({ verificationLimiting: ['biaxial', 'flexure'] })))
      .toBe('FAILED');
    expect(statusOf(true, provisional({ verificationLimiting: ['shear'] }))).toBe('FAILED');
  });

  it('becomes FAILED when the caller cannot say what failed', () => {
    // Absent is "no idea", not "nothing else". Reading silence as agreement is how a real
    // failure would come to wear the proposal's colour.
    expect(statusOf(true, provisional({ verificationLimiting: [] }))).toBe('FAILED');
    expect(statusOf(true, provisional({ verificationLimiting: undefined }))).toBe('FAILED');
  });

  it('never lets the exception reach a member that is not a proposal', () => {
    expect(statusOf(true, {
      outcome: 'VERIFIED', verificationStatus: 'fail', verificationLimiting: ['biaxial'],
    })).toBe('FAILED');
  });

  it('is UNSUPPORTED rather than PROVISIONAL when the proposal produced no steel', () => {
    expect(statusOf(false, provisional())).toBe('UNSUPPORTED');
  });
});

// ─── Top steel, beside the state rather than inside it ───────────

describe('what a member\'s top steel is', () => {
  const topBar = (id: number, over: Partial<SceneBar> = {}): SceneBar => ({
    ...barFor(id), barId: `t${id}`, layerId: `e${id}:topRun:0`, ...over,
  });
  const bottomBar = (id: number): SceneBar => ({
    ...barFor(id), barId: `bo${id}`, layerId: `e${id}:bottom:0`,
  });

  it('reads hangerProvisional off the bar the generator marked', () => {
    const r = reportElementStatus(
      scene([solid(1)], [bottomBar(1), topBar(1, { purpose: 'stirrupHanger' })]),
      new Map([[1, { outcome: 'PROVISIONAL_BIAXIAL' } as DesignOutcomeSummary]]));
    expect(r.entries[0].topSteel).toBe('hangerProvisional');
    expect(r.hangerTopMembers).toEqual([1]);
    // And it does NOT move the state. That is the whole point of the field.
    expect(r.entries[0].status).toBe('PROVISIONAL');
  });

  it('does not let bottom steel answer a question about the top face', () => {
    /**
     * Bottom bars are longitudinal and carry no `purpose` either, so a filter that asked only
     * "has this member unmarked longitudinal steel" would call every beam in the model
     * `resistant` — the question would be about the member's steel rather than its top steel.
     */
    const r = reportElementStatus(
      scene([solid(2)], [bottomBar(2)]),
      new Map([[2, { outcome: 'VERIFIED' } as DesignOutcomeSummary]]));
    expect(r.entries[0].topSteel).toBe('none');
    expect(r.hangerTopMembers).toEqual([]);
  });

  it('ignores the cage, including another member\'s joint ties', () => {
    /**
     * The shape of the original defect: 63 beams had 24 to 48 bars each, every one of them
     * transverse, and most of them the JOINT ties of the columns they frame into — which record
     * the incident beams as owners. A count of bars said those beams were reinforced.
     */
    const jointTie: SceneBar = {
      ...barFor(3), barId: 'j3', role: 'transverse', piece: 'jointTie', elementIds: [3, 99],
    };
    const r = reportElementStatus(
      scene([solid(3)], [jointTie]),
      new Map([[3, { outcome: 'PROVISIONAL_BIAXIAL' } as DesignOutcomeSummary]]));
    expect(r.entries[0].topSteel).toBe('none');
  });

  it('calls a member with both resistant, not hanger-provisional', () => {
    // A designed top group plus the continuous pair: the pair is part of that group, and
    // reporting the member as carrying assembly steel would understate the design.
    const r = reportElementStatus(
      scene([solid(4)], [topBar(4), topBar(4, { barId: 'x4', purpose: 'stirrupHanger' })]),
      new Map([[4, { outcome: 'VERIFIED' } as DesignOutcomeSummary]]));
    expect(r.entries[0].topSteel).toBe('resistant');
    expect(r.hangerTopMembers).toEqual([]);
  });
});

/**
 * A design refusal is not a reinforcement failure, and the rail must not say it is.
 *
 * ── What was wrong ─────────────────────────────────────────────────
 *
 * `FAILED` was tested first, unconditionally. A member whose design was REFUSED also fails
 * verification — the refusal happened precisely because nothing in the code-permitted envelope
 * verified — so `FAILED` won every time and `REFUSED` was unreachable. Measured in the browser
 * on a starved column: `SEARCH_EXHAUSTED` ×8 in the design table, `failed 5 · refused 0` in the
 * rail.
 *
 * The two mean different remedies, which is the whole reason they are two states. This module's
 * own header says so:
 *
 *     - the design was refused   → change the section, or design by hand
 *
 * Reporting a refusal as a failure sends the reader to change reinforcement that no reinforcement
 * can fix.
 *
 * ── What `FAILED` first was FOR, and still is ──────────────────────
 *
 * Its comment describes one case and only one: "a member can carry steel, have a VERIFIED design
 * outcome from an earlier run, and still fail verification now — an edit to the section or the
 * loads does exactly that." That case still preempts, because nothing else would name it: the
 * outcome says VERIFIED and the truth is that it is not.
 *
 * So the rule is: `FAILED` wins when the OUTCOME DOES NOT ALREADY EXPLAIN the failure.
 */
describe('a refusal outranks the failure it caused', () => {
  const failing = (outcome: DesignOutcomeSummary['outcome']): DesignOutcomeSummary => ({
    outcome, verificationStatus: 'fail',
  } as DesignOutcomeSummary);

  it('SEARCH_EXHAUSTED is REFUSED, even though verification also fails', () => {
    expect(statusOf(false, failing('SEARCH_EXHAUSTED'))).toBe('REFUSED');
    // With steel too: a refused member should not have any, but the state is the outcome's.
    expect(statusOf(true, failing('SEARCH_EXHAUSTED'))).toBe('REFUSED');
  });

  it('SECTION_INADEQUATE is REFUSED for the same reason', () => {
    expect(statusOf(false, failing('SECTION_INADEQUATE'))).toBe('REFUSED');
  });

  it('UNSUPPORTED keeps its own name rather than collapsing into FAILED', () => {
    // "A required check is not implemented for this member. No arrangement can pass." The
    // verification failing is a consequence of that, not new information.
    expect(statusOf(false, failing('UNSUPPORTED'))).toBe('UNSUPPORTED');
  });

  it('but a VERIFIED outcome that now fails is still FAILED — the case the guard exists for',
    () => {
      /*
       * The regression this pairs with. An edit to the section or the loads makes a member with a
       * VERIFIED design outcome fail verification now, and MODELLED there would show a green
       * member the app knows is not green.
       */
      expect(statusOf(true, failing('VERIFIED'))).toBe('FAILED');
      expect(statusOf(false, failing('VERIFIED'))).toBe('FAILED');
    });

  it('and so is a failing member with no design outcome at all', () => {
    // Nothing else can be said about it, so the verification is the whole answer.
    expect(statusOf(true, { verificationStatus: 'fail' } as DesignOutcomeSummary))
      .toBe('FAILED');
  });

  it('the biaxial exception is untouched', () => {
    /*
     * A PROVISIONAL_BIAXIAL member fails the authoritative verifier BY CONSTRUCTION, and the
     * narrow exception that keeps it out of FAILED predates this change and must survive it.
     */
    const provisional = {
      outcome: 'PROVISIONAL_BIAXIAL', verificationStatus: 'fail',
      verificationLimiting: ['biaxial'],
    } as unknown as DesignOutcomeSummary;
    expect(statusOf(true, provisional)).toBe('PROVISIONAL');
    // And a proposal that ALSO fails on something else is still FAILED — the exception is narrow.
    const alsoFlexure = {
      outcome: 'PROVISIONAL_BIAXIAL', verificationStatus: 'fail',
      verificationLimiting: ['biaxial', 'flexure'],
    } as unknown as DesignOutcomeSummary;
    expect(statusOf(true, alsoFlexure)).toBe('FAILED');
  });

  it('no path produces a state that could be read as finished work', () => {
    /*
     * The standing rule, checked across the change rather than at one call site: every state a
     * failing or refused member can reach is in `NOT_FOR_CONSTRUCTION_STATUSES`, which the
     * viewport legend, the sheets, the schedule and the report all consume.
     */
    const reached = [
      statusOf(false, failing('SEARCH_EXHAUSTED')),
      statusOf(false, failing('SECTION_INADEQUATE')),
      statusOf(false, failing('UNSUPPORTED')),
      statusOf(true, failing('VERIFIED')),
    ];
    for (const s of reached) {
      expect(NOT_FOR_CONSTRUCTION_STATUSES, `${s} must never read as finished`).toContain(s);
      expect(s).not.toBe('MODELLED');
    }
  });
});
