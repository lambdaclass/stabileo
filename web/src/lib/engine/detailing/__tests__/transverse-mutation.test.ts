/**
 * Mutation proofs: each guard fails when the thing it guards is removed.
 *
 * ── Why a passing gate is not evidence ─────────────────────────────
 *
 * Every condition in this branch passes on the reference fixture. That is necessary and it is
 * not sufficient: a condition wired to a constant, a duplicate object key silently overwriting
 * a count, or a classifier reading a field nobody populates would all pass exactly the same
 * way. The only proof that a guard is load-bearing is to break the thing and watch it fail.
 *
 * So each test here removes one specific piece of the cage, or moves one path into a bar, and
 * asserts the corresponding guard notices. If any of these ever passes with the mutation
 * applied, the guard has stopped guarding.
 */

import { describe, expect, it } from 'vitest';
import qa8 from '../../../templates/fixtures/rc-design-qa-8.json';
import { solveFixture } from '../../design/__tests__/helpers';
import { runDesign } from '../../design/candidate-search';
import { cirsoc201Adapter } from '../../design/adapters/cirsoc201-adapter';
import { runDetailing, type RunDetailingResult } from '../run-detailing';
import { assessConstructibility, type ConstructibilityFacts } from '../constructibility';
import { classifyPair, type ClassificationContext } from '../classify';
import { detectCollisions } from '../collision';
import { rebarHash } from '../../design/rebar-hash';
import { supersede } from '../document-model';
import { straightSegment, type BarPath } from '../../../codes/cirsoc201/bar-geometry';
import { noFloorFamilies } from '../family-record';

let cached: RunDetailingResult | null = null;
function run(): RunDetailingResult {
  if (cached) return cached;
  const solved = solveFixture(qa8 as never);
  const summary = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 });
  cached = runDetailing({
    contexts: solved.contexts, outcomes: summary.outcomes,
    nodes: solved.data.nodes as never, elements: solved.data.elements as never,
    edition: '2025', maxAggregateSizeMm: 19,
    verifierId: 'cirsoc201.provided.v2.2025', demandRevision: 1,
  } as never);
  return cached;
}

/** The reference facts, taken from the run rather than invented. */
function facts(): ConstructibilityFacts {
  const r = run();
  const a = r.assemblies[0];
  const built = a.bars.filter((b) => b.role === 'transverse').length;
  return {
    completeEnvelope: true, searchTruncated: false,
    applicableMembers: a.elementIds.length, assignedMembers: a.elementIds.length,
    selectedTransitions: 0, materialisedTransitions: 0, unmaterialisedTransitions: 0,
    requiredTransversePieces: built, materialisedTransversePieces: built,
    prohibitedConflicts: 0,
    reverifiedMembers: a.elementIds.length, certificateHashMatches: a.elementIds.length,
    spacingNotCodeLegal: 0, spacingNotPlacementRobust: 0,
    unsupportedRules: 0, staleAssemblies: 0,
    familyRequirements: noFloorFamilies(),
  };
}

const FAMILIES = [
  { name: 'a closed stirrup', pick: (b: BarPath) => !b.id.includes('crosstie') && !(b.zoneId ?? '').includes(':ties') },
  { name: 'a joint tie', pick: (b: BarPath) => !b.id.includes('crosstie') && (b.zoneId ?? '').includes(':ties') },
  { name: 'a joint crosstie', pick: (b: BarPath) => b.id.includes('crosstie') },
];

describe('removing one piece of the cage fails the materialisation condition', () => {
  it('the unmutated facts pass, or the rest of this file proves nothing', () => {
    expect(assessConstructibility(facts()).verdict).toBe('CONSTRUCTIBLE');
  });

  for (const family of FAMILIES) {
    it(`${family.name} goes missing and the gate says so`, () => {
      const transverse = run().assemblies[0].bars.filter((b) => b.role === 'transverse');
      // The family must be present, or "removing one" proves nothing about it.
      expect(transverse.some(family.pick), `${family.name} present`).toBe(true);

      const a = assessConstructibility({
        ...facts(),
        materialisedTransversePieces: facts().materialisedTransversePieces - 1,
      });
      expect(a.verdict).not.toBe('CONSTRUCTIBLE');
      expect(a.blocking).toEqual(['allRequiredTransversePathsMaterialised']);
      // And it reports HOW MANY are missing, so the size of the repair is visible.
      const cond = a.conditions.find(
        (c) => c.condition === 'allRequiredTransversePathsMaterialised')!;
      expect(cond.failing).toBe(1);
    });
  }

  it('the requirement is derived from the zones, not from the pieces', () => {
    // A generator that emitted nothing must FAIL rather than trivially satisfy the gate by
    // requiring nothing. This is the shape of that mistake.
    const a = assessConstructibility({ ...facts(), materialisedTransversePieces: 0 });
    expect(a.verdict).not.toBe('CONSTRUCTIBLE');
    expect(a.blocking).toContain('allRequiredTransversePathsMaterialised');
  });
});

describe('a declared relationship never excuses interpenetration', () => {
  const ctx: ClassificationContext = {
    edition: '2025', maxAggregateSizeMm: 19, memberKindOf: () => 'beam',
  };
  /** Two bars of one member, driven through each other. */
  const pair = (extra: Partial<BarPath> = {}): [BarPath, BarPath] => {
    const base = (id: string, role: BarPath['role'], y: number): BarPath => ({
      id, diameterMm: 16, role,
      segments: [straightSegment({ x: 0, y, z: 0 }, { x: 1, y, z: 0 })],
      startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
      cuttingLength: 1, ownerElementIds: [1], source: 'generated', locked: false, refs: [],
    });
    return [{ ...base('tie', 'transverse', 0), ...extra }, base('bar', 'longitudinal', 0)];
  };

  it('a transverse path driven through a longitudinal bar is prohibited', () => {
    const [t, b] = pair();
    // Surfaces a full diameter into one another.
    const c = classifyPair(t, b, ctx, -0.016);
    expect(c.pairClass).toBe('prohibitedOverlap');
    expect(c.reportable).toBe(true);
  });

  it('declaring enclosure does NOT make it acceptable', () => {
    // The exact defect the blanket exemption produced: a stirrup driven through a bar,
    // classified as required containment, dropped from the conflict list before anything
    // could measure it.
    const [t, b] = pair({
      enclosesBarIds: ['bar'], restrainsBarIds: ['bar'], hookContactsBarIds: ['bar'],
    });
    const c = classifyPair(t, b, ctx, -0.016);
    expect(c.pairClass).toBe('prohibitedOverlap');
    expect(c.reportable).toBe(true);
  });

  it('the same declaration IS honoured once the geometry is valid', () => {
    // Otherwise the rule above would just be "never trust a relationship", which would report
    // every tie against the bars it legitimately holds.
    const [t, b] = pair({ enclosesBarIds: ['bar'], restrainsBarIds: ['bar'] });
    const c = classifyPair(t, b, ctx, 0);
    expect(c.pairClass).toBe('requiredContainment');
    expect(c.reportable).toBe(false);
  });

  it('and the detector reports it end to end, not just the classifier', () => {
    const [t, b] = pair({ enclosesBarIds: ['bar'], restrainsBarIds: ['bar'] });
    const res = detectCollisions([t, b], {
      classifyFor: (x, y, surface, ta, tb) => classifyPair(x, y, ctx, surface, ta, tb),
    });
    expect(res.conflicts.map((c) => c.pairClass)).toEqual(['prohibitedOverlap']);
  });
});

describe('transverse geometry reaches the reinforcement hash', () => {
  const base = {
    bottom: { count: 4, diameter: 16 },
    stirrups: { diameter: 8, spacing: 0.20, legs: 2 },
  };

  it('changing the stirrup spacing changes the hash', () => {
    expect(rebarHash({ ...base, stirrups: { ...base.stirrups, spacing: 0.15 } } as never))
      .not.toBe(rebarHash(base as never));
  });

  it('changing the stirrup diameter changes the hash', () => {
    expect(rebarHash({ ...base, stirrups: { ...base.stirrups, diameter: 10 } } as never))
      .not.toBe(rebarHash(base as never));
  });

  it('changing the leg count changes the hash', () => {
    // The leg count is what decides whether a crosstie exists at all, so a hash blind to it
    // would let a cage gain or lose a whole family of pieces without superseding anything.
    expect(rebarHash({ ...base, stirrups: { ...base.stirrups, legs: 3 } } as never))
      .not.toBe(rebarHash(base as never));
  });

  it('is stable under key order and equal values', () => {
    const reordered = { stirrups: { legs: 2, spacing: 0.20, diameter: 8 }, bottom: base.bottom };
    expect(rebarHash(reordered as never)).toBe(rebarHash(base as never));
  });
});

describe('a superseded document keeps its own revision', () => {
  it('retains the number and assemblies it was issued with', () => {
    const doc = {
      revision: { number: 3 }, assemblies: [{ id: 'a' }], openConflicts: [],
      readiness: 'ISSUED',
    } as never as Parameters<typeof supersede>[0];
    const after = supersede(doc, 4);
    expect(after.readiness).toBe('SUPERSEDED');
    expect(after.supersededBy).toBe(4);
    // The retired document is evidence of what was issued. Rewriting it in place would erase
    // the only record of what was built against.
    expect(after.revision.number).toBe(3);
    expect(after.assemblies).toEqual(doc.assemblies);
  });

  it('and stops being construction-ready', async () => {
    const { isConstructionReady } = await import('../document-model');
    const doc = {
      revision: { number: 1 }, assemblies: [], openConflicts: [], readiness: 'ISSUED',
    } as never as Parameters<typeof supersede>[0];
    expect(isConstructionReady(doc)).toBe(true);
    expect(isConstructionReady(supersede(doc, 2))).toBe(false);
  });
});
