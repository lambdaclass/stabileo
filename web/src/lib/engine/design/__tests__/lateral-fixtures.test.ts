/**
 * What the reading of the beams' role in the lateral-force-resisting system does to the two
 * design fixtures (§9.7.3.8.2, `model/lateral-system.ts`), through the production design run.
 *
 * Before the role could be declared, nothing set it and every beam was read outside the system:
 * that is `{ beams: 'gravity' }` here, and the numbers the fixture suites pin (`SUITE_LATERAL`).
 * A project that declares nothing is now designed as part of the system, fy developed at the
 * face, exactly as one that declares its beams part of it.
 *
 *   rc-design-qa-8 (a one-bay wind frame, 40×40 columns, 30×55 beams): 8 of 8 designed outside
 *   the system; 6 of 8 not declared, the two 6 m beams (5 and 6) refused on their anchorage at the
 *   corner columns, where no bottom bar that carries their moment hooks to ℓdh behind the cage.
 *   rc-design-frame (408 members): 383 designed outside the system; 360 not declared. The 23
 *   beams it loses refuse on their anchorage (7), congestion (13), anchorage and congestion (2)
 *   and anchorage, congestion and shear (1); none it designs is designed by the other reading
 *   alone.
 *
 * 379 and 356 (373 and 331 before) since the verifier checks the ductility of a flexural member
 * (CIRSOC 201-2025 §9.3.3.1): over-reinforced candidates are rejected for maxSteel before the
 * joint and anchorage stages, and the search reaches arrangements that pass every check, the
 * column cages and the anchorage included. Measured by switching off only that check: 373/22 and
 * 331/64 with the 42 lost by the same causes come back. A check added, not one relaxed.
 *
 * 383 and 360 (379/16 and 356/39 before) since the verifier checks the minimum shear
 * reinforcement of CIRSOC 201-2025 §9.6.3.1 on beams deeper than 250 mm and the generator stops
 * offering stirrups under Av,min: with those options out of the first ones per region the search
 * reaches arrangements that thread the cages for 165–168 outside the system and for four more
 * not declared. The 23 lost now refuse on congestion (13), anchorage (7), anchorage and
 * congestion (2), and anchorage, congestion and shear (1).
 */
import { describe, it, expect } from 'vitest';
import qa8 from '../../../templates/fixtures/rc-design-qa-8.json';
import frame from '../../../templates/fixtures/rc-design-frame.json';
import { runDesign } from '../candidate-search';
import { cirsoc201Adapter } from '../adapters/cirsoc201-adapter';
import { assertRealSolver, FLAGSHIP_GRAVITY_SHEAR_DEPTH_REFUSALS, solveFixture } from './helpers';
import type { DesignOutcomeKind, DesignRunSummary } from '../outcome';
import type { LateralSystemData } from '../../../model/lateral-system';

function run(fixture: unknown, lateral: LateralSystemData | null) {
  const solved = solveFixture(fixture as never, { lateral });
  return { solved, s: runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 }) };
}
const counts = (s: DesignRunSummary) => ({
  verified: s.verified,
  searchExhausted: s.searchExhausted,
  provisionalBiaxial: s.provisionalBiaxial,
  sectionInadequate: s.sectionInadequate,
  unsupported: s.unsupported,
});

function changedFrom(a: DesignRunSummary, b: DesignRunSummary, from: DesignOutcomeKind = 'VERIFIED') {
  const by: Record<string, number> = {}, ids: number[] = [];
  for (const [id, o] of a.outcomes) {
    const x = b.outcomes.get(id)!;
    if (o.outcome !== from || x.outcome === from) continue;
    ids.push(id);
    const k = `${x.outcome} ${[...x.limiting].sort().join(',')}`;
    by[k] = (by[k] ?? 0) + 1;
  }
  return { ids: ids.sort((p, q) => p - q), by };
}

function expectRefusals(s: DesignRunSummary, shearDepth: readonly number[], congestion: readonly number[] = []) {
  const refused = [...s.outcomes.values()].filter((outcome) => outcome.outcome === 'UNSUPPORTED');
  expect(refused.map((outcome) => outcome.elementId).sort((a, b) => a - b))
    .toEqual([...shearDepth, ...congestion].sort((a, b) => a - b));
  for (const outcome of refused) {
    const member = `member ${outcome.elementId}`;
    expect(outcome.elementType, member).toBe('beam');
    expect(outcome.certificate, member).toBeUndefined();
    expect(outcome.accepted, member).toBeUndefined();
    if (congestion.includes(outcome.elementId)) {
      expect(outcome.limiting, member).toEqual(['congestion']);
      expect(outcome.reasons, member).toContainEqual(expect.objectContaining({
        key: 'design.reason.bestCandidateFails',
        params: expect.objectContaining({ governing: 'congestion' }),
      }));
      expect(outcome.provisional?.verdict.checks, member).toContainEqual(expect.objectContaining({
        limiting: 'congestion', status: 'fail',
      }));
    } else {
      expect(outcome.limiting, member).toContain('unsupportedCheck');
      expect(outcome.reasons, member).toContainEqual({ key: 'diag.rcShearDepth' });
      expect(outcome.provisional?.verdict.worstUtilization, member).toBe(Infinity);
      expect(outcome.provisional?.verdict.checks, member).toContainEqual(expect.objectContaining({
        description: 'diag.rcShearDepth', status: 'fail',
      }));
    }
  }
}

describe('rc-design-qa-8', () => {
  const gravity = run(qa8, { beams: 'gravity' }), undeclared = run(qa8, null), lateral = run(qa8, { beams: 'lateral' });

  /*
   * Not declared, the 6 m beams (5, 6) were refused on their anchorage until the verifier took the
   * axial force acting with each moment (main's concrete in the engine): the compression they carry
   * lifts their φMn enough for 7Ø10, whose ends anchor. With that check off they are refused again.
   */
  it('outside the system 8 of 8; not declared 8 of 8 too', () => {
    expect(counts(gravity.s)).toEqual({ verified: 8, searchExhausted: 0, provisionalBiaxial: 0, sectionInadequate: 0, unsupported: 0 });
    expect(counts(undeclared.s)).toEqual({ verified: 8, searchExhausted: 0, provisionalBiaxial: 0, sectionInadequate: 0, unsupported: 0 });
    expect(changedFrom(gravity.s, undeclared.s)).toEqual({ ids: [], by: {} });
    expect(changedFrom(undeclared.s, gravity.s).ids).toEqual([]);
  });

  it('not declared designs exactly as declared part of the system: same outcomes, same bars', () => {
    for (const [id, o] of undeclared.s.outcomes) {
      const x = lateral.s.outcomes.get(id)!;
      expect([x.outcome, JSON.stringify(x.accepted ?? null)], `e${id}`).toEqual([o.outcome, JSON.stringify(o.accepted ?? null)]);
    }
    for (const c of undeclared.solved.contexts.values()) if (c.elementType === 'beam') expect(c.lateral).toEqual({ role: 'undeclared' });
  });
});

describe('rc-design-frame, 408 members', () => {
  const gravity = run(frame, { beams: 'gravity' }), undeclared = run(frame, null);

  it('certifies supported flagship beams and reports each role’s refusals', () => {
    assertRealSolver();
    expect(counts(gravity.s)).toEqual({
      verified: 286, searchExhausted: 27, provisionalBiaxial: 13, sectionInadequate: 0, unsupported: 82,
    });
    expect(counts(undeclared.s)).toEqual({
      verified: 276, searchExhausted: 42, provisionalBiaxial: 13, sectionInadequate: 0, unsupported: 77,
    });

    const exhausted = [173, 174, 175, 176, 192, 193, 194, 195, 200, 203, 226, 258, 261, 324, 327];
    const additionalShearDepth = [177, 179, 189, 191, 212, 214, 218];
    const congestion = [178, 190, 215];
    expectRefusals(gravity.s, FLAGSHIP_GRAVITY_SHEAR_DEPTH_REFUSALS);
    expectRefusals(undeclared.s, [
      ...FLAGSHIP_GRAVITY_SHEAR_DEPTH_REFUSALS.filter((id) => !exhausted.includes(id)),
      ...additionalShearDepth,
    ], congestion);

    expect(changedFrom(gravity.s, undeclared.s, 'UNSUPPORTED')).toEqual({
      ids: exhausted,
      by: { 'SEARCH_EXHAUSTED anchorage': 6, 'SEARCH_EXHAUSTED congestion': 7, 'SEARCH_EXHAUSTED flexure': 2 },
    });
    expect(changedFrom(gravity.s, undeclared.s)).toEqual({
      ids: [...additionalShearDepth, ...congestion].sort((a, b) => a - b),
      by: { 'UNSUPPORTED unsupportedCheck': 5, 'UNSUPPORTED congestion': 3, 'UNSUPPORTED congestion,unsupportedCheck': 2 },
    });
    expect(changedFrom(undeclared.s, gravity.s).ids).toEqual([]);
  });
});
