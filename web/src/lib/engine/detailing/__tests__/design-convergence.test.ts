/**
 * Three claims that must never become one word, over a scope the user chose.
 *
 * ── The state this file exists to make unreachable ─────────────────
 *
 * `runDetailing` details `readiness.detailable` and nothing else, and `applicableMembers` is
 * `elementIds.length` — the members that were drawn. So on a frame where the design refused
 * eight columns and verified four, the four were coordinated, clash-free, reverified and
 * certificate-matched, all fifteen conditions passed, the assembly reached CONSTRUCTIBLE, the
 * review gate opened, and the project could issue drawings for construction of a building whose
 * columns have no design.
 *
 * Every statement in that chain was true of the drawing. None of them was about what was asked
 * for.
 *
 * ── And the denominator is the SCOPE, not the model ────────────────
 *
 * Designing beams and columns on a building that also has slabs is a legitimate, complete piece
 * of work. A global denominator would declare it permanently unconverged for slabs nobody asked
 * to design — and a gate that can never be satisfied is a gate people learn to route around.
 *
 * So convergence is measured over the selected families, and what keeps the passing claim honest
 * is that it NAMES them: `outOfScope` is why "design converged for beams and columns" can never
 * be read as "the building is ready".
 *
 * ── What is deliberately NOT asserted ──────────────────────────────
 *
 * That the Generate command is disabled. It is not, and must not be. Detailing a partly designed
 * frame is how an engineer sees what the refused members do to the rest of the cage;
 * `h1e-refused-state` asserts the button stays enabled with eight refused columns, and the last
 * group here asserts the same thing from the engine side. Taking the drawing away would not make
 * the design converge — it would remove the tool used to converge it. What is withheld is the
 * CLAIM.
 */

import { describe, expect, it } from 'vitest';
import qa8 from '../../../templates/fixtures/rc-design-qa-8.json';
import { solveFixture } from '../../design/__tests__/helpers';
import { runDesign } from '../../design/candidate-search';
import { cirsoc201Adapter } from '../../design/adapters/cirsoc201-adapter';
import { detailingReadiness } from '../run-detailing';
import {
  assessDesignConvergence, undetailedScopeCount, type ScopedMember,
} from '../design-convergence';
import type { MemberDesignOutcome } from '../../design/outcome';
import type { DesignFamily } from '../../design/design-families';

// ─── Pure unit: the scope rule, one property at a time ───────────

/**
 * An outcome carrying nothing but its verdict.
 *
 * Convergence reads exactly one field, so the rest is not built. A fuller literal would suggest
 * this function consults reinforcement or certificates, and the whole point of the split is that
 * it does not: `detailingReadiness` decides what is drawable, this measures what was left out of
 * the families that were asked for.
 */
const outcome = (id: number, kind: MemberDesignOutcome['outcome']) =>
  [id, { elementId: id, outcome: kind } as MemberDesignOutcome] as const;

const member = (elementId: number, family: DesignFamily): ScopedMember => ({ elementId, family });

/**
 * A frame under slabs: four beams, two columns, and shell panels the model holds.
 *
 * The slabs are `alsoPresent` rather than members, for the reason the caller supplies them that
 * way: a slab is not a `MemberContext` — the floor pass owns it — and a shell becomes a slab or a
 * wall only when that pass classifies it.
 */
const FRAME: ScopedMember[] = [
  member(1, 'column'), member(2, 'column'),
  member(3, 'beam'), member(4, 'beam'), member(5, 'beam'), member(6, 'beam'),
];
const ALL_VERIFIED = new Map(FRAME.map((m) => outcome(m.elementId, 'VERIFIED')));
const EVERY_ID = FRAME.map((m) => m.elementId);

describe('1 — a converged frame under undesigned slabs', () => {
  const c = assessDesignConvergence({
    members: FRAME,
    scope: ['column', 'beam'],
    detailedIds: EVERY_ID,
    outcomes: ALL_VERIFIED,
    alsoPresent: ['slab'],
  });

  it('converges: the slabs nobody selected do not block the frame', () => {
    /*
     * The whole reason the denominator is the scope. Under a global one this reads INCOMPLETE
     * forever, on a piece of work that is finished — and the engineer's only way forward is to
     * stop believing the gate.
     */
    expect(c.state).toBe('CONVERGED');
    expect(undetailedScopeCount(c)).toBe(0);
    expect(c.applicable).toBe(6);
    expect(c.detailed).toBe(6);
  });

  it('and says WHICH families it converged for, and which it does not cover', () => {
    // The half that keeps the passing claim honest. "Converged" and "converged for beams and
    // columns" are different sentences, and only the second is true of this building.
    expect(c.scope).toEqual(['column', 'beam']);
    expect(c.outOfScope).toEqual(['slab']);
  });
});

describe('2 — adding a family re-opens the state', () => {
  it('selecting slabs that nothing has designed makes the scope INCOMPLETE again', () => {
    /*
     * No bookkeeping and no reset: the answer is a function of the selection in force, so the
     * state re-opens by being measured again. A `converged` flag stored anywhere would be the
     * thing that had to be remembered to invalidate.
     */
    const before = assessDesignConvergence({
      members: FRAME, scope: ['column', 'beam'],
      detailedIds: EVERY_ID, outcomes: ALL_VERIFIED, alsoPresent: ['slab'],
    });
    expect(before.state).toBe('CONVERGED');

    const withSlabs = assessDesignConvergence({
      members: [...FRAME, member(7, 'slab'), member(8, 'slab')],
      scope: ['column', 'beam', 'slab'],
      detailedIds: EVERY_ID,
      outcomes: ALL_VERIFIED,
    });
    expect(withSlabs.state).toBe('INCOMPLETE');
    expect(withSlabs.applicable).toBe(8);
    expect(undetailedScopeCount(withSlabs)).toBe(2);
    // Named by family, so the reader knows WHICH addition re-opened it.
    expect(withSlabs.gaps.map((g) => g.family)).toEqual(['slab']);
    expect(withSlabs.gaps[0].kind).toBe('notDesigned');
    // And nothing is out of scope any more — the family moved from one side to the other.
    expect(withSlabs.outOfScope).toEqual([]);
  });
});

describe('3 — removing a family takes its members out of the denominator', () => {
  const members = [...FRAME, member(7, 'slab'), member(8, 'slab')];

  it('an undesigned slab blocks while selected and does not once dropped', () => {
    const selected = assessDesignConvergence({
      members, scope: ['column', 'beam', 'slab'],
      detailedIds: EVERY_ID, outcomes: ALL_VERIFIED,
    });
    expect(selected.state).toBe('INCOMPLETE');
    expect(selected.applicable).toBe(8);

    const dropped = assessDesignConvergence({
      members, scope: ['column', 'beam'],
      detailedIds: EVERY_ID, outcomes: ALL_VERIFIED,
    });
    expect(dropped.state).toBe('CONVERGED');
    // Out of the DENOMINATOR, not merely out of the gap list. Six of six, not six of eight.
    expect(dropped.applicable).toBe(6);
    expect(dropped.gaps).toEqual([]);
    // And out of the denominator is not out of sight: the claim still names them.
    expect(dropped.outOfScope).toEqual(['slab']);
  });

  it('dropping every family is EMPTY_SCOPE, and does not pass as converged', () => {
    /*
     * The vacuous pass. "Converged over no families" reads as success and means nothing was
     * done, and `undetailedScopeCount` reports one rather than zero so the constructibility
     * condition cannot be satisfied by asking for nothing.
     */
    const none = assessDesignConvergence({
      members, scope: [], detailedIds: EVERY_ID, outcomes: ALL_VERIFIED,
    });
    expect(none.state).toBe('EMPTY_SCOPE');
    expect(undetailedScopeCount(none)).toBe(1);
    expect(none.outOfScope).toEqual(['column', 'beam', 'slab']);
  });
});

describe('4 — a selected family the model does not have', () => {
  it('contributes nothing: absence is not a shortfall', () => {
    /*
     * Ticking `footing` on a building with no footings is the fabricated-zero shape one level
     * up, and it must not block. There is nothing to design, so there is nothing missing.
     */
    const c = assessDesignConvergence({
      members: FRAME,
      scope: ['column', 'beam', 'footing'],
      detailedIds: EVERY_ID,
      outcomes: ALL_VERIFIED,
    });
    expect(c.state).toBe('CONVERGED');
    expect(c.applicable).toBe(6);
    expect(c.gaps).toEqual([]);
    // Nor is it reported as out of scope: it WAS selected, and the model does not have it.
    expect(c.outOfScope).toEqual([]);
  });

  it('and a scope of nothing but absent families is EMPTY_SCOPE', () => {
    const c = assessDesignConvergence({
      members: FRAME, scope: ['footing'], detailedIds: EVERY_ID, outcomes: ALL_VERIFIED,
    });
    expect(c.state).toBe('EMPTY_SCOPE');
    expect(c.outOfScope).toEqual(['column', 'beam']);
  });
});

describe('5 — a selected family with refused members', () => {
  const outcomes = new Map([
    outcome(1, 'SEARCH_EXHAUSTED'), outcome(2, 'SECTION_INADEQUATE'),
    outcome(3, 'VERIFIED'), outcome(4, 'VERIFIED'),
    outcome(5, 'VERIFIED'), outcome(6, 'VERIFIED'),
  ]);
  const c = assessDesignConvergence({
    members: FRAME, scope: ['column', 'beam'], detailedIds: [3, 4, 5, 6], outcomes,
  });

  it('blocks, and the shortfall is counted', () => {
    expect(c.state).toBe('INCOMPLETE');
    expect(undetailedScopeCount(c)).toBe(2);
  });

  it('names the members and the remedy, which is the only thing that differs', () => {
    /*
     * Exhaustive and bounded refusals are one gap here and two claims upstream. The distinction
     * governs what may be concluded about FEASIBILITY — `candidate-search.ts` keeps it for
     * exactly that — and it does not change that neither member has a design or that the next
     * move is the section.
     */
    expect(c.gaps).toHaveLength(1);
    expect(c.gaps[0].kind).toBe('refused');
    expect(c.gaps[0].family).toBe('column');
    expect(c.gaps[0].elementIds).toEqual([1, 2]);
  });

  it('and a refused member of an UNSELECTED family does not block', () => {
    // The rule applied to its hardest case: a real refusal, on a family this run does not claim
    // to cover. It is out of scope, and out of scope means out of the claim, not hidden.
    const withRefusedSlab = assessDesignConvergence({
      members: [...FRAME, member(7, 'slab')],
      scope: ['column', 'beam'],
      detailedIds: EVERY_ID,
      outcomes: new Map([...ALL_VERIFIED, outcome(7, 'SEARCH_EXHAUSTED')]),
    });
    expect(withRefusedSlab.state).toBe('CONVERGED');
    expect(withRefusedSlab.outOfScope).toEqual(['slab']);
  });

  it('separates the remedies: unimplemented check, missing demand, never designed', () => {
    // One is a limit of this app that no edit changes; one is data the engineer can supply; one
    // is a pass nobody ran. Reporting them together would send two thirds of readers nowhere.
    const c2 = assessDesignConvergence({
      members: FRAME,
      scope: ['column', 'beam'],
      detailedIds: [],
      outcomes: new Map([outcome(1, 'UNSUPPORTED'), outcome(2, 'DEMAND_UNAVAILABLE')]),
    });
    expect(c2.gaps.map((g) => g.kind).sort())
      .toEqual(['demandUnavailable', 'notDesigned', 'unsupported']);
  });

  it('a designed member that could not be drawn is its own gap', () => {
    /*
     * `noStations` and `orientationSuspect` are the two ways this happens today: the design
     * succeeded and produced reinforcement, and the drawing still left the member out. Filing
     * it under `refused` would tell the engineer to change a section that verified.
     */
    const c2 = assessDesignConvergence({
      members: [member(1, 'beam')], scope: ['beam'],
      detailedIds: [], outcomes: new Map([outcome(1, 'VERIFIED')]),
    });
    expect(c2.gaps[0].kind).toBe('notDetailable');
  });
});

describe('6 — a selected family with provisional members', () => {
  const outcomes = new Map([
    ...ALL_VERIFIED, outcome(3, 'PROVISIONAL_BIAXIAL'),
  ]);
  const c = assessDesignConvergence({
    members: FRAME, scope: ['column', 'beam'], detailedIds: EVERY_ID, outcomes,
  });

  it('is PROPOSAL: the cage is complete and part of it is not certified', () => {
    /*
     * A provisional member IS in the drawing, which is why it cannot be counted as missing, and
     * it is not verified, which is why CONVERGED is out of reach. Two different shortfalls with
     * two different remedies, and merging them would tell the engineer to change a section on a
     * member whose section is fine.
     */
    expect(c.state).toBe('PROPOSAL');
    expect(c.provisional).toEqual([3]);
    expect(c.gaps).toEqual([]);
  });

  it('and it does NOT feed the scope condition', () => {
    // `certificatesMatchGeometry` is what refuses a provisional member its certificate.
    // Counting it here as well would report one shortfall under two names.
    expect(undetailedScopeCount(c)).toBe(0);
  });

  it('dropping the provisional member\'s family converges the rest', () => {
    const columnsOnly = assessDesignConvergence({
      members: FRAME, scope: ['column'], detailedIds: EVERY_ID, outcomes,
    });
    expect(columnsOnly.state).toBe('CONVERGED');
    expect(columnsOnly.outOfScope).toEqual(['beam']);
  });
});

describe('8 — an edit un-completes only the scope it touches', () => {
  it('a beam knocked back to refused leaves a columns-only scope converged', () => {
    /*
     * The property the whole rule turns on, stated on the case that would expose a shared
     * denominator: the SAME model and the SAME outcomes, measured over two scopes, gives two
     * answers — and the answer for columns does not move when a beam does.
     */
    const edited = new Map([...ALL_VERIFIED, outcome(3, 'SEARCH_EXHAUSTED')]);
    const drawn = EVERY_ID.filter((id) => id !== 3);

    const both = assessDesignConvergence({
      members: FRAME, scope: ['column', 'beam'], detailedIds: drawn, outcomes: edited,
    });
    expect(both.state).toBe('INCOMPLETE');
    expect(both.gaps.map((g) => g.family)).toEqual(['beam']);

    const columnsOnly = assessDesignConvergence({
      members: FRAME, scope: ['column'], detailedIds: drawn, outcomes: edited,
    });
    expect(columnsOnly.state).toBe('CONVERGED');
    expect(columnsOnly.applicable).toBe(2);
    expect(columnsOnly.outOfScope).toEqual(['beam']);
  });
});

// ─── The real engine, on the fixture that reaches REFUSED ────────

/**
 * The same production the `h1e-refused-state` journey drives, in the engine.
 *
 * `rc-design-qa-8` verifies everything as shipped. Starving the COLUMN section — `RC Col
 * 400×400`, which the fixture file carries as id 1 — down to 90 × 120 mm takes the columns past
 * what any code-permitted arrangement can carry, and the design refuses them on its own. Nothing
 * writes a state: the engine enumerates the envelope, finds nothing that verifies, and says so.
 *
 * The columns and not the beams, for the reason `h1e-refused-state` records in the other
 * direction: the mutation has to land on a section the designed members actually use, and it has
 * to leave OTHER members verifying, or the result is a broken model rather than a refused
 * member — and a model where everything is refused proves nothing about a partial drawing.
 */
const STARVED = { b: 0.09, h: 0.12 };

/**
 * Rectangular section properties, by the same formulae the fixture's own numbers follow.
 *
 * Checked against the file rather than assumed: `RC Col 400×400` carries `iy = iz = 0.4⁴/12` and
 * `RC Beam 300×550` carries `iy = b·h³/12` and `iz = h·b³/12`. Mutating `b` and `h` and leaving
 * the inertias behind would hand the solver a 90 × 120 column with a 400 × 400 stiffness, and
 * every force in the model would be wrong in a way no assertion here would notice.
 */
function rectSection(b: number, h: number) {
  const [long, short] = b >= h ? [b, h] : [h, b];
  const r = short / long;
  // Saint-Venant torsion constant for a rectangle, standard series approximation. Torsion does
  // not govern anything asserted below; it is computed rather than copied so the section is
  // internally consistent.
  const beta = (1 / 3) * (1 - 0.63 * r + 0.052 * r ** 5);
  return {
    b, h, a: b * h,
    iy: (b * h ** 3) / 12,
    iz: (h * b ** 3) / 12,
    j: beta * long * short ** 3,
  };
}

/** The section every designed column in this fixture uses. */
const COLUMN_SECTION_ID = 1;

function readinessFor(starve: boolean, scope: readonly DesignFamily[] = ['column', 'beam']) {
  const fixture = JSON.parse(JSON.stringify(qa8)) as {
    sections: Array<{ id: number; b: number; h: number }>;
  };
  if (starve) {
    const s = fixture.sections.find((x) => x.id === COLUMN_SECTION_ID)!;
    Object.assign(s, rectSection(STARVED.b, STARVED.h));
  }
  const solved = solveFixture(fixture as never);
  const summary = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 });
  return detailingReadiness({
    contexts: solved.contexts, outcomes: summary.outcomes, scope,
  });
}

describe('the fixture that converges, and the one the design refuses', () => {
  it('the untouched fixture converges over the frame scope', () => {
    const readiness = readinessFor(false);
    expect(readiness.ready).toBe(true);
    expect(readiness.convergence.state).toBe('CONVERGED');
    expect(undetailedScopeCount(readiness.convergence)).toBe(0);
    // Both halves. A run that detailed nothing would also report no gaps.
    expect(readiness.convergence.detailed).toBeGreaterThan(0);
    expect(readiness.convergence.detailed).toBe(readiness.convergence.applicable);
    expect(readiness.convergence.scope).toEqual(['column', 'beam']);
  });

  it('starving the columns leaves refused members outside the scope', () => {
    const readiness = readinessFor(true);
    expect(readiness.convergence.state).toBe('INCOMPLETE');
    expect(undetailedScopeCount(readiness.convergence)).toBeGreaterThan(0);
    expect(readiness.convergence.gaps.some((g) => g.kind === 'refused')).toBe(true);
    expect(readiness.convergence.gaps.every((g) => g.family === 'column')).toBe(true);
  });

  it('and a beams-only scope converges on that same starved model', () => {
    /*
     * The scope rule against the real engine. The columns are genuinely refused and the beams
     * are genuinely designed, so a run that claims only the beams is a complete, honest claim —
     * and it says so while naming the columns it does not cover.
     */
    const readiness = readinessFor(true, ['beam']);
    expect(readiness.convergence.state).toBe('CONVERGED');
    expect(readiness.convergence.outOfScope).toEqual(['column']);
  });

  it('the command that draws them stays available — this is the point', () => {
    /*
     * The measurement must not become a lock. `h1e-refused-state` asserts
     * `cmd-generate-detailing` is ENABLED on exactly this state, and it is right to: detailing a
     * partly designed frame is how the refused members' effect on the rest of the cage becomes
     * visible.
     *
     * `ready` and `convergence` therefore disagree here, and that disagreement is the contract:
     * the run may proceed, the result may not be called construction documentation.
     */
    const readiness = readinessFor(true);
    expect(readiness.ready).toBe(true);
    expect(readiness.detailable.length).toBeGreaterThan(0);
    expect(readiness.convergence.state).not.toBe('CONVERGED');
  });

  it('regenerating after the section is restored converges again', () => {
    /*
     * The state is not sticky. Convergence is measured from the outcomes and the selection in
     * hand, so a design that refused members and a design that no longer does produce different
     * answers from the same code path — there is nothing to reset and nothing that could go
     * stale.
     */
    const starved = readinessFor(true);
    expect(starved.convergence.state).toBe('INCOMPLETE');

    const restored = readinessFor(false);
    expect(restored.convergence.state).toBe('CONVERGED');
    expect(restored.convergence.gaps).toEqual([]);
    // The members the starved run refused are in the restored drawing, by id.
    const refused = starved.convergence.gaps
      .filter((g) => g.kind === 'refused').flatMap((g) => g.elementIds);
    expect(refused.length).toBeGreaterThan(0);
    for (const id of refused) {
      expect(restored.detailable, `member ${id} is drawn again`).toContain(id);
    }
  });

  it('the default scope is the frame pair, so callers that pass none are unchanged', () => {
    // Every existing caller of `detailingReadiness` omits `scope`, and this function has only
    // ever detailed beams and columns. A default of "everything" would have made those callers
    // report shortfalls for families the frame pass never covers.
    const readiness = detailingReadiness({
      contexts: new Map(), outcomes: new Map(),
    });
    expect(readiness.convergence.scope).toEqual(['column', 'beam']);
  });
});
