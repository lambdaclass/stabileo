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
import audit from '../../../../../../docs/results-changes/2198-round22-lateral-audit.json';
import priorClosure from '../../../../../../docs/results-changes/2198-rc-baseline-closure.json';
import { jointThreading } from '../joint-threading-check';
import { supportInputOf } from '../end-support-anchorage';
import type { MemberContext } from '../member-context';
import type { ProvidedReinforcement } from '../../../design-contract/reinforcement';
import evidence from '../../../../../../docs/results-changes/2198-round6-undeclared.json';
import { REBAR_DB } from '../../codes/argentina/cirsoc201';
import { describe, it, expect } from 'vitest';
import qa8 from '../../../templates/fixtures/rc-design-qa-8.json';
import frame from '../../../templates/fixtures/rc-design-frame.json';
import { runDesign } from '../candidate-search';
import { cirsoc201Adapter } from '../adapters/cirsoc201-adapter';
import { solveFixture } from './helpers';
import type { LateralSystemData } from '../../../model/lateral-system';

function run(fixture: unknown, lateral: LateralSystemData | null) {
  const solved = solveFixture(fixture as never, { lateral });
  const contexts = new Map<number, MemberContext>();
  const adapter: typeof cirsoc201Adapter = { ...cirsoc201Adapter, verify(ctx, rebar) {
    contexts.set(ctx.elementId, ctx);
    return cirsoc201Adapter.verify(ctx, rebar);
  } };
  return { solved, contexts, s: runDesign(adapter, solved.contexts.values(), { maxRunMs: 180_000 }) };
}
const counts = (s: Pick<ReturnType<typeof run>['s'], 'verified' | 'searchExhausted' | 'provisionalBiaxial' | 'sectionInadequate'>) => ({ verified: s.verified, searchExhausted: s.searchExhausted, provisionalBiaxial: s.provisionalBiaxial, sectionInadequate: s.sectionInadequate });
const gravityCounts = counts(evidence.declaredGravity.counts);
const digest = (s: ReturnType<typeof run>['s']) => [...s.outcomes.values()]
  .sort((a, b) => a.elementId - b.elementId)
  .map(o => `${o.elementId}|${o.outcome}|${[...o.limiting].sort().join(',')}|${o.certificate?.worstUtilization.toFixed(4) ?? '—'}`);
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

  /*
   * Not declared, the 6 m beams (5, 6) were refused on their anchorage until the verifier took the
   * axial force acting with each moment (main's concrete in the engine): the compression they carry
   * lifts their φMn enough for 7Ø10, whose ends anchor. With that check off they are refused again.
   */
  it('outside the system 8 of 8; not declared 8 of 8 too', () => {
    expect(counts(gravity.s)).toEqual({ verified: 8, searchExhausted: 0, provisionalBiaxial: 0, sectionInadequate: 0 });
    expect(counts(undeclared.s)).toEqual({ verified: 8, searchExhausted: 0, provisionalBiaxial: 0, sectionInadequate: 0 });
    expect(lost(gravity.s, undeclared.s)).toEqual({ ids: [], by: {} });
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

  it('keeps the stated gravity counts equal to the audited per-member digest', () => {
    const tally = (kind: string) => evidence.declaredGravity.members.filter(line => line.split('|')[1] === kind).length;
    expect(gravityCounts).toEqual({ verified: tally('VERIFIED'), searchExhausted: tally('SEARCH_EXHAUSTED'),
      provisionalBiaxial: tally('PROVISIONAL_BIAXIAL'), sectionInadequate: tally('SECTION_INADEQUATE') });
  });

  it('outside the system 372 designed; not declared 350, with exact member digests and refusal reasons', () => {
    expect(counts(gravity.s)).toEqual(gravityCounts);
    expect(counts(undeclared.s)).toEqual(audit.undeclared.counts);
    expect(digest(gravity.s)).toEqual(evidence.declaredGravity.members);
    expect(digest(undeclared.s)).toEqual(audit.undeclared.members);
    const l = lost(gravity.s, undeclared.s);
    expect(l.ids).toHaveLength(24);
    expect(l.ids).toEqual(audit.lost.ids);
    expect(l.by).toEqual(audit.lost.by);
    expect(Object.values(l.by).reduce((sum, n) => sum + n, 0)).toBe(l.ids.length);
    expect(lost(undeclared.s, gravity.s)).toEqual(audit.reverse);
    expect(audit.reverse.ids).toHaveLength(2);
    for (const held of audit.gravityAdditionalRefusals) {
      const outcome = gravity.s.outcomes.get(held.id)!;
      expect(outcome.outcome, `e${held.id}`).toBe('SEARCH_EXHAUSTED');
      expect(outcome.limiting).toEqual(held.limiting);
      expect(outcome.accepted).toBeUndefined();
      expect(outcome.certificate).toBeUndefined();
      expect(outcome.exhaustion?.scope).toBe('implementedAlternatives');
      const previous = priorClosure.members.find(m => m.id === held.id)!.before.accepted! as ProvidedReinforcement;
      const ctx = gravity.contexts.get(held.id)!;
      const support = supportInputOf(ctx, previous);
      expect(support).not.toBeNull();
      expect(jointThreading(ctx, previous, support!)).toEqual(held.previousThreading);
      expect(cirsoc201Adapter.verify(ctx, previous).overallStatus).toBe('fail');
    }
  });

  it('checks every previously verified undeclared member and independently checks the two former recovered cages', () => {
    expect(audit.undeclared.previouslyVerifiedNowRefused.map(o => o.id)).toEqual([177, 178, 179, 180, 181, 186, 187, 189, 190, 191]);
    for (const id of evidence.previousVerifiedIds) {
      const outcome = undeclared.s.outcomes.get(id)!;
      const held = audit.undeclared.previouslyVerifiedNowRefused.find(o => o.id === id);
      expect(outcome.outcome, `e${id}`).toBe(held ? 'SEARCH_EXHAUSTED' : 'VERIFIED');
      if (held) {
        expect(outcome.limiting).toEqual(held.limiting);
        expect(outcome.accepted).toBeUndefined();
        expect(outcome.certificate).toBeUndefined();
        expect(outcome.exhaustion?.scope).toBe('implementedAlternatives');
        const ctx = undeclared.contexts.get(id)!;
        const candidate = outcome.provisional!.candidate;
        const support = supportInputOf(ctx, candidate);
        expect(support).not.toBeNull();
        expect(jointThreading(ctx, candidate, support!)).toEqual(held.threading);
      } else {
        expect(outcome.certificate).toBeDefined();
        expect(cirsoc201Adapter.verify(undeclared.contexts.get(id)!, outcome.accepted!).overallStatus).not.toBe('fail');
      }
    }
    expect(evidence.changes.map(c => c.id)).toEqual([204, 207]);
    for (const id of [204, 207]) {
      const ctx = undeclared.solved.contexts.get(id)!;
      const outcome = undeclared.s.outcomes.get(id)!;
      expect(outcome.outcome).toBe('SEARCH_EXHAUSTED');
      expect(outcome.certificate).toBeUndefined();
      expect(outcome.accepted).toBeUndefined();
      expect(outcome.limiting).toEqual(['anchorage', 'congestion']);
      expect(outcome.exhaustion?.scope).toBe('implementedAlternatives');
      const recorded = evidence.changes.find(c => c.id === id)!;
      const finalCtx = undeclared.contexts.get(id)!;
      const support = supportInputOf(finalCtx, recorded.accepted);
      expect(support).not.toBeNull();
      expect(jointThreading(finalCtx, recorded.accepted, support!)).toEqual(audit.undeclared.formerRecoveries.find(o => o.id === id)!.threading);
      expect(cirsoc201Adapter.verify(finalCtx, recorded.accepted).checks.filter(c => c.status === 'fail').map(c => c.limiting)).toEqual(['congestion']);
      const cage = recorded.accepted.regions.stirrupsSupport;
      expect(cage).toEqual({ diameter: 6, legs: 3, secondaryLegs: 3, spacing: 0.15 });
      const { b, h } = ctx.section, { fc, fy, cover } = ctx.material;
      const depth = b - cover - cage.diameter / 1000 - 12 / 2000;
      expect(depth).toBe(0.31299999999999994);
      const Av = cage.secondaryLegs! * REBAR_DB.find(r => r.diameter === cage.diameter)!.area * 1e-4;
      const sq = Math.sqrt(fc);
      const Vs = Math.min(Av * fy * 1000 * depth / cage.spacing, 0.66 * sq * h * depth * 1000);
      for (const c of ctx.stations!.comboResults) for (const station of c.stations) {
        const Vu = Math.abs(station.vy);
        const vcStress = Math.max(0, Math.min(0.17 * sq - station.n / (6 * b * h * 1000), 0.42 * sq));
        const Vc = vcStress * h * depth * 1000;
        expect(Vu / (0.75 * (Vc + Vs))).toBeLessThan(1);
        const row2 = Math.max(0, Vu / 0.75 - Vc) > 0.33 * sq * h * depth * 1000;
        const along = Math.min(depth / (row2 ? 4 : 2), row2 ? 0.2 : 0.4);
        const across = Math.min(depth / (row2 ? 2 : 1), row2 ? 0.2 : 0.4);
        expect(cage.spacing).toBeLessThanOrEqual(along);
        expect((h - 2 * cover - cage.diameter / 1000) / (cage.secondaryLegs! - 1)).toBeLessThanOrEqual(across);
      }
    }
  });

});
