/**
 * Three claims that must never become one word.
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
 * Every statement in that chain was true of the drawing. None of them was about the structure.
 *
 * ── What is asserted here, and what is deliberately NOT ────────────
 *
 * The remedy is a measurement and a sixteenth condition, not a lock on the Generate command.
 * Detailing a partly designed frame is how an engineer sees what the refused members do to the
 * rest of the cage; `h1e-refused-state` asserts the command stays enabled with eight refused
 * columns, and the last group here asserts the same thing from the engine side. Taking the
 * drawing away would not make the design converge — it would remove the tool used to converge
 * it. What is withheld is the CLAIM.
 */

import { describe, expect, it } from 'vitest';
import qa8 from '../../../templates/fixtures/rc-design-qa-8.json';
import { solveFixture } from '../../design/__tests__/helpers';
import { runDesign } from '../../design/candidate-search';
import { cirsoc201Adapter } from '../../design/adapters/cirsoc201-adapter';
import { detailingReadiness } from '../run-detailing';
import { assessDesignConvergence, undetailedMemberCount } from '../design-convergence';
import type { MemberDesignOutcome } from '../../design/outcome';

// ─── Pure unit: the three states, one at a time ──────────────────

/**
 * An outcome carrying nothing but its verdict.
 *
 * Convergence reads exactly one field, so the rest is not built. A fuller literal would suggest
 * this function consults reinforcement or certificates, and the whole point of the split is that
 * it does not: `detailingReadiness` decides what is drawable, this measures what was left out.
 */
const outcome = (id: number, kind: MemberDesignOutcome['outcome']) =>
  [id, { elementId: id, outcome: kind } as MemberDesignOutcome] as const;

describe('the three claims a detailing run can make', () => {
  it('CONVERGED: every applicable member drawn, every one verified', () => {
    const c = assessDesignConvergence({
      applicableIds: [1, 2, 3],
      detailedIds: [1, 2, 3],
      outcomes: new Map([outcome(1, 'VERIFIED'), outcome(2, 'VERIFIED'), outcome(3, 'VERIFIED')]),
    });
    expect(c.state).toBe('CONVERGED');
    expect(c.gaps).toEqual([]);
    expect(c.provisional).toEqual([]);
    expect(undetailedMemberCount(c)).toBe(0);
  });

  it('PROPOSAL: the cage is complete and part of it is not certified', () => {
    /*
     * A provisional member IS in the drawing, which is why it cannot be counted as missing, and
     * it is not verified, which is why CONVERGED is out of reach. Two different shortfalls with
     * two different remedies, and merging them would tell the engineer to change a section on a
     * member whose section is fine.
     */
    const c = assessDesignConvergence({
      applicableIds: [1, 2],
      detailedIds: [1, 2],
      outcomes: new Map([outcome(1, 'VERIFIED'), outcome(2, 'PROVISIONAL_BIAXIAL')]),
    });
    expect(c.state).toBe('PROPOSAL');
    expect(c.provisional).toEqual([2]);
    expect(c.gaps).toEqual([]);
    // And it does NOT contribute to the sixteenth condition. `certificatesMatchGeometry` is
    // what refuses a provisional member its certificate; counting it here as well would report
    // one shortfall under two names.
    expect(undetailedMemberCount(c)).toBe(0);
  });

  it('INCOMPLETE: a member of the model is outside the drawing', () => {
    const c = assessDesignConvergence({
      applicableIds: [1, 2, 3],
      detailedIds: [1],
      outcomes: new Map([
        outcome(1, 'VERIFIED'), outcome(2, 'SEARCH_EXHAUSTED'), outcome(3, 'SECTION_INADEQUATE'),
      ]),
    });
    expect(c.state).toBe('INCOMPLETE');
    expect(c.applicable).toBe(3);
    expect(c.detailed).toBe(1);
    expect(undetailedMemberCount(c)).toBe(2);
  });
});

describe('a gap names its remedy, because that is the only thing that differs', () => {
  it('refused members are named together: change the section', () => {
    const c = assessDesignConvergence({
      applicableIds: [1, 2, 3],
      detailedIds: [3],
      outcomes: new Map([
        outcome(1, 'SEARCH_EXHAUSTED'), outcome(2, 'SECTION_INADEQUATE'), outcome(3, 'VERIFIED'),
      ]),
    });
    /*
     * Exhaustive and bounded refusals are one gap here and two claims upstream. The distinction
     * governs what may be concluded about FEASIBILITY — `candidate-search.ts` keeps it for
     * exactly that — and it does not change that neither member has a design or that the next
     * move is the section.
     */
    expect(c.gaps).toHaveLength(1);
    expect(c.gaps[0].kind).toBe('refused');
    expect(c.gaps[0].elementIds).toEqual([1, 2]);
    expect(c.gaps[0].count).toBe(2);
  });

  it('a member nobody designed is not a member the design refused', () => {
    const c = assessDesignConvergence({
      applicableIds: [1, 2],
      detailedIds: [],
      outcomes: new Map([outcome(1, 'SEARCH_EXHAUSTED')]),
    });
    const kinds = c.gaps.map((g) => g.kind).sort();
    expect(kinds).toEqual(['notDesigned', 'refused']);
    expect(c.gaps.find((g) => g.kind === 'notDesigned')!.elementIds).toEqual([2]);
  });

  it('an unimplemented check and a missing demand are separate answers', () => {
    // One is a limit of this app and no edit to the model changes it; the other is data the
    // engineer can supply. Reporting them together would send half the readers nowhere.
    const c = assessDesignConvergence({
      applicableIds: [1, 2],
      detailedIds: [],
      outcomes: new Map([outcome(1, 'UNSUPPORTED'), outcome(2, 'DEMAND_UNAVAILABLE')]),
    });
    expect(c.gaps.map((g) => g.kind).sort()).toEqual(['demandUnavailable', 'unsupported']);
  });

  it('a designed member that could not be drawn is its own gap', () => {
    /*
     * `noStations` and `orientationSuspect` are the two ways this happens today: the design
     * succeeded and produced reinforcement, and the drawing still left the member out. Filing
     * it under `refused` would tell the engineer to change a section that verified.
     */
    const c = assessDesignConvergence({
      applicableIds: [1],
      detailedIds: [],
      outcomes: new Map([outcome(1, 'VERIFIED')]),
    });
    expect(c.gaps).toHaveLength(1);
    expect(c.gaps[0].kind).toBe('notDetailable');
  });

  it('every gap names its members, so the shortfall is auditable', () => {
    const c = assessDesignConvergence({
      applicableIds: [7, 3, 11],
      detailedIds: [],
      outcomes: new Map([
        outcome(7, 'SEARCH_EXHAUSTED'), outcome(3, 'SEARCH_EXHAUSTED'),
        outcome(11, 'SEARCH_EXHAUSTED'),
      ]),
    });
    // Sorted, so two runs over the same model name the members the same way round.
    expect(c.gaps[0].elementIds).toEqual([3, 7, 11]);
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

function readinessFor(starve: boolean) {
  const fixture = JSON.parse(JSON.stringify(qa8)) as {
    sections: Array<{ id: number; b: number; h: number }>;
  };
  if (starve) {
    const s = fixture.sections.find((x) => x.id === COLUMN_SECTION_ID)!;
    Object.assign(s, rectSection(STARVED.b, STARVED.h));
  }
  const solved = solveFixture(fixture as never);
  const summary = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 });
  return {
    readiness: detailingReadiness({ contexts: solved.contexts, outcomes: summary.outcomes }),
    outcomes: summary.outcomes,
  };
}

describe('the fixture that converges, and the one the design refuses', () => {
  it('the untouched fixture converges: nothing is left outside the drawing', () => {
    const { readiness } = readinessFor(false);
    expect(readiness.ready).toBe(true);
    expect(readiness.convergence.state).toBe('CONVERGED');
    expect(undetailedMemberCount(readiness.convergence)).toBe(0);
    // Both halves. A run that detailed nothing would also report no gaps.
    expect(readiness.convergence.detailed).toBeGreaterThan(0);
    expect(readiness.convergence.detailed).toBe(readiness.convergence.applicable);
  });

  it('starving a section leaves refused members outside it', () => {
    const { readiness } = readinessFor(true);
    expect(readiness.convergence.state).toBe('INCOMPLETE');
    expect(undetailedMemberCount(readiness.convergence)).toBeGreaterThan(0);
    expect(readiness.convergence.gaps.some((g) => g.kind === 'refused')).toBe(true);
  });

  it('and the command that draws them stays available — this is the point', () => {
    /*
     * The measurement must not become a lock. `h1e-refused-state` asserts `cmd-generate-detailing`
     * is ENABLED on exactly this state, and it is right to: detailing a partly designed frame is
     * how the refused members' effect on the rest of the cage becomes visible.
     *
     * `ready` and `convergence` therefore disagree here, and that disagreement is the contract:
     * the run may proceed, the result may not be called construction documentation.
     */
    const { readiness } = readinessFor(true);
    expect(readiness.ready).toBe(true);
    expect(readiness.detailable.length).toBeGreaterThan(0);
    expect(readiness.convergence.state).not.toBe('CONVERGED');
  });

  it('regenerating after the section is restored converges again', () => {
    /*
     * The state is not sticky. Convergence is measured from the outcomes of the run in hand, so
     * a design that refused members and a design that no longer does produce different answers
     * from the same code path — there is nothing to reset and nothing that could go stale.
     */
    const starved = readinessFor(true);
    expect(starved.readiness.convergence.state).toBe('INCOMPLETE');

    const restored = readinessFor(false);
    expect(restored.readiness.convergence.state).toBe('CONVERGED');
    expect(restored.readiness.convergence.gaps).toEqual([]);
    // The members the starved run refused are in the restored drawing, by id.
    const refused = starved.readiness.convergence.gaps
      .filter((g) => g.kind === 'refused').flatMap((g) => g.elementIds);
    expect(refused.length).toBeGreaterThan(0);
    for (const id of refused) {
      expect(restored.readiness.detailable, `member ${id} is drawn again`).toContain(id);
    }
  });
});
