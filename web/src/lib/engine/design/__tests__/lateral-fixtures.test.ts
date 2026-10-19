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
import { solveFixture } from './helpers';
import type { LateralSystemData } from '../../../model/lateral-system';

function run(fixture: unknown, lateral: LateralSystemData | null) {
  const solved = solveFixture(fixture as never, { lateral });
  return { solved, s: runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 }) };
}
const counts = (s: ReturnType<typeof run>['s']) => ({ verified: s.verified, searchExhausted: s.searchExhausted, provisionalBiaxial: s.provisionalBiaxial, sectionInadequate: s.sectionInadequate });
/** The members one reading designs and the other does not, by what limits them under the second. */
function lost(a: ReturnType<typeof run>['s'], b: ReturnType<typeof run>['s']) {
  const by: Record<string, number> = {}, ids: number[] = [];
  for (const [id, o] of a.outcomes) {
    const x = b.outcomes.get(id)!;
    if (o.outcome !== 'VERIFIED' || x.outcome === 'VERIFIED') continue;
    ids.push(id);
    const k = `${x.outcome} ${[...x.limiting].sort().join(',')}`;
    by[k] = (by[k] ?? 0) + 1;
  }
  return { ids: ids.sort((p, q) => p - q), by };
}

describe('rc-design-qa-8', () => {
  const gravity = run(qa8, { beams: 'gravity' }), undeclared = run(qa8, null), lateral = run(qa8, { beams: 'lateral' });

  it('outside the system 8 of 8; not declared 6 of 8, the 6 m beams refused on their anchorage', () => {
    expect(counts(gravity.s)).toEqual({ verified: 8, searchExhausted: 0, provisionalBiaxial: 0, sectionInadequate: 0 });
    expect(counts(undeclared.s)).toEqual({ verified: 6, searchExhausted: 2, provisionalBiaxial: 0, sectionInadequate: 0 });
    expect(lost(gravity.s, undeclared.s)).toEqual({ ids: [5, 6], by: { 'SEARCH_EXHAUSTED anchorage': 2 } });
    expect(lost(undeclared.s, gravity.s).ids).toEqual([]);
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

  it('outside the system 383 designed; not declared 360, the 23 it loses refusing on their anchorage or congestion', () => {
    expect(counts(gravity.s)).toEqual({ verified: 383, searchExhausted: 12, provisionalBiaxial: 13, sectionInadequate: 0 });
    expect(counts(undeclared.s)).toEqual({ verified: 360, searchExhausted: 35, provisionalBiaxial: 13, sectionInadequate: 0 });
    const l = lost(gravity.s, undeclared.s);
    expect(l.ids).toHaveLength(23);
    expect(l.by).toEqual({ 'SEARCH_EXHAUSTED anchorage': 7, 'SEARCH_EXHAUSTED anchorage,congestion': 2, 'SEARCH_EXHAUSTED anchorage,congestion,shear': 1, 'SEARCH_EXHAUSTED congestion': 13 });
    expect(lost(undeclared.s, gravity.s).ids).toEqual([]);
  });
});
