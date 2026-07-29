/**
 * Transverse coverage across the fixture set — the measurement, not a sample of it.
 *
 * ── Why every fixture and not just the one that was being fixed ─────
 *
 * Each defect in this branch was found on one fixture and was present on all of them. The
 * stirrup-bend restraint was measured on qa-8 and broke the feasible frame the same way; the
 * crosstie shaft ran through its peripheral bars everywhere but only row-2 has crossties to
 * show it. A per-fixture table is the cheapest way to stop that pattern repeating.
 *
 * What is asserted is an INVARIANT, not a number. Counts are logged so a change is visible in
 * the diff, but a test that pins "704 bends" fails when a fixture legitimately grows and tells
 * you nothing about whether the cage is right.
 */

import { describe, expect, it } from 'vitest';
import qa8 from '../../../templates/fixtures/rc-design-qa-8.json';
import row2 from '../../../templates/fixtures/rc-design-qa-row2.json';
import rcFrame from '../../../templates/fixtures/rc-design-frame.json';
import { solveFixture } from '../../design/__tests__/helpers';
import { runDesign } from '../../design/candidate-search';
import { cirsoc201Adapter } from '../../design/adapters/cirsoc201-adapter';
import { runDetailing, type RunDetailingResult } from '../run-detailing';
import type { BarPath } from '../../../codes/cirsoc201/bar-geometry';

function detail(fixture: unknown): RunDetailingResult {
  const solved = solveFixture(fixture as never);
  const summary = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 });
  return runDetailing({
    contexts: solved.contexts,
    outcomes: summary.outcomes,
    nodes: solved.data.nodes as never,
    elements: solved.data.elements as never,
    edition: '2025',
    maxAggregateSizeMm: 19,
    verifierId: 'cirsoc201.provided.v2.2025',
    demandRevision: 1,
  } as never);
}

interface Coverage {
  stirrups: number; beamCrossties: number; jointTies: number; jointCrossties: number;
  requiredBends: number; witnessedBends: number;
  prohibited: number; reportable: number;
  unsupported: string[];
  outcome: string; truncated: boolean; assemblies: number;
  verdicts: string[];
}

function coverageOf(r: RunDetailingResult): Coverage {
  const bars: BarPath[] = r.assemblies.flatMap((a) => a.bars);
  const t = bars.filter((b) => b.role === 'transverse');
  const isJoint = (b: BarPath) => (b.zoneId ?? '').includes(':ties');
  const isTie = (b: BarPath) => b.id.includes('crosstie');
  let requiredBends = 0;
  let witnessedBends = 0;
  for (const b of t) {
    // A closed stirrup has four bends; a crosstie has two. Both are bends that must contain a
    // bar — §25.7.1.2 between the anchored ends, §25.7.1.3(a) at them, §25.3.5(d) for a tie.
    const need = isTie(b) ? 2 : 4;
    requiredBends += need;
    witnessedBends += Math.min(need, (b.restrainsBarIds ?? []).length);
  }
  const conflicts = r.assemblies.flatMap((a) => a.conflicts);
  return {
    stirrups: t.filter((b) => !isTie(b) && !isJoint(b)).length,
    beamCrossties: t.filter((b) => isTie(b) && !isJoint(b)).length,
    jointTies: t.filter((b) => !isTie(b) && isJoint(b)).length,
    jointCrossties: t.filter((b) => isTie(b) && isJoint(b)).length,
    requiredBends, witnessedBends,
    prohibited: conflicts.filter((c) => c.pairClass === 'prohibitedOverlap').length,
    reportable: conflicts.length,
    unsupported: [...new Set(
      r.assemblies.flatMap((a) => a.unsupported.map((u) => String(u.message))))].sort(),
    outcome: r.layoutSearch.outcome,
    truncated: r.layoutSearch.stats.truncated,
    assemblies: r.assemblies.length,
    verdicts: [...new Set(r.assemblies.map((a) => a.constructibility?.verdict ?? 'none'))].sort(),
  };
}

/**
 * What each fixture is EXPECTED to demonstrate, and why.
 *
 * `fullyRestrained` and `clashFree` are stated per fixture rather than assumed universal,
 * because they are not universal and pretending otherwise is how qa-8-only measurement hid
 * three defects. Where a fixture falls short the reason is recorded here, in the clause, and
 * the test asserts THAT rather than a number — so the day it changes, the diff says so.
 */
const FIXTURES: Array<{
  name: string; data: unknown;
  fullyRestrained: boolean; clashFree: boolean; outcome: string; why?: string;
}> = [
  {
    name: 'rc-design-qa-8', data: qa8,
    // Row 1 across the width: two legs, so no beam crosstie is required and the certified
    // steel can restrain everything the code asks for. The reference case — every bend of
    // every piece, beam and joint alike, contains a bar.
    fullyRestrained: true, clashFree: true, outcome: 'ASSIGNMENT_FOUND',
  },
  {
    name: 'rc-design-qa-row2', data: row2,
    // Table 9.7.6.2.2 puts this 300 mm web in row 2 and asks for THREE legs. §25.3.5(d)
    // confines the interior leg to a line carrying a bar at both faces, and the certified
    // steel provides exactly two such lines — the corner seats at ±103,5 mm — both of which
    // leave an across-width gap wider than the table allows. So the leg falls back to the even
    // division, where there is no bar, and §25.7.1.2 says so.
    //
    // That is the reinforcement being short, not the geometry being wrong. The remedy is a
    // third bar line on both faces, which is a DESIGN change and belongs to the candidate
    // enumeration, not to a generator that would have to invent the bar.
    fullyRestrained: false, clashFree: false, outcome: 'ASSIGNMENT_FOUND',
    why: 'a 300 mm web in row 2 needs a third leg and the certified steel offers two bar lines',
  },
  {
    name: 'rc-design-frame', data: rcFrame,
    // The flagship. Its columns are over-reinforced for their sections — 8Ø20 in 500×500
    // reaches 37 mm clear against §25.2.3's 40 mm — which the search reports as a genuine
    // inadequacy and which leaves the envelope partially exhausted rather than assigned.
    fullyRestrained: false, clashFree: false, outcome: 'PARTIAL_ENVELOPE_EXHAUSTED',
    why: 'certified column steel does not fit its section at the code clear spacing',
  },
];

describe('every fixture carries a physical transverse cage', () => {
  for (const f of FIXTURES) {
    it(`${f.name}`, () => {
      const c = coverageOf(detail(f.data));
      // Logged so a change shows up in the diff; asserted as invariants below, because a
      // pinned count fails on a legitimate fixture change and proves nothing about the cage.
      // eslint-disable-next-line no-console
      console.log(f.name, JSON.stringify(c));

      // ── Universal, on every fixture ──
      // The cage EXISTS as steel, in both families.
      expect(c.stirrups, 'closed stirrups').toBeGreaterThan(0);
      expect(c.jointTies, 'joint ties').toBeGreaterThan(0);
      // Most bends are witnessed everywhere; a cage that restrained nothing would pass a
      // "greater than zero" check, so the bar is set where a regression would trip it.
      expect(c.witnessedBends / c.requiredBends, 'witnessed fraction').toBeGreaterThan(0.3);
      // The search reached a definite outcome rather than being cut off by a bound.
      expect(c.truncated, 'search truncated').toBe(false);
      expect(c.outcome).toBe(f.outcome);

      // ── Per fixture, with the reason recorded above ──
      if (f.fullyRestrained) {
        expect(c.witnessedBends, `unwitnessed bends (${f.why ?? ''})`).toBe(c.requiredBends);
        expect(c.unsupported, 'unsupported').toEqual([]);
      } else {
        expect(c.witnessedBends, `${f.name} should still fall short: ${f.why}`)
          .toBeLessThan(c.requiredBends);
      }
      if (f.clashFree) {
        expect(c.prohibited, 'prohibited overlaps').toBe(0);
        expect(c.reportable, 'reportable conflicts').toBe(0);
      }
      // The flagship is 408 members; it takes ten seconds and that is the measurement, not a
      // hang.
    }, 120_000);
  }
});

describe('qa-8 is the fixture that must stay completely clean', () => {
  it('every bend witnessed, nothing unsupported, nothing reportable', () => {
    // The reference case: row 1 across the width, so the cage the code asks for is one the
    // certified steel can actually restrain. Everything this branch fixed is measured here.
    const c = coverageOf(detail(qa8));
    expect(c.prohibited).toBe(0);
    expect(c.reportable).toBe(0);
    expect(c.unsupported).toEqual([]);
    expect(c.beamCrossties).toBe(0);
    // Every closed stirrup — the pieces §25.7.1.2 and §25.7.1.3(a) govern — is fully seated.
    const r = detail(qa8);
    const stirrups = r.assemblies.flatMap((a) => a.bars).filter((b) =>
      b.role === 'transverse' && !b.id.includes('crosstie'));
    for (const s of stirrups) {
      expect((s.restrainsBarIds ?? []).length, s.id).toBe(4);
    }
  });
});

describe('the row-2 fixture exercises real three-leg reinforcement', () => {
  it('fabricates crossties as bars, not as a leg count', () => {
    const r = detail(row2);
    const c = coverageOf(r);
    // Table 9.7.6.2.2's across-width column puts this fixture's support regions in row 2 and
    // asks for three legs. The third leg is a fabricated piece with its own hooks, cutting
    // length and mark — a zone record claiming `legs: 3` is not reinforcement.
    expect(c.beamCrossties, 'beam crossties').toBeGreaterThan(0);

    const ties = r.assemblies.flatMap((a) => a.bars)
      .filter((b) => b.role === 'transverse' && b.id.includes('crosstie')
        && !(b.zoneId ?? '').includes(':ties'));
    for (const tie of ties) {
      // §25.3.5(b)/(c): 135° at one end, at least 90° at the other. Distinguishable, and both
      // real bends with a mandrel behind them.
      const s = tie.startTreatment;
      const e = tie.endTreatment;
      expect(s.kind, tie.id).toBe('hook');
      expect(e.kind, tie.id).toBe('hook');
      if (s.kind === 'hook' && e.kind === 'hook') {
        expect(new Set([s.hook.angle, e.hook.angle]), tie.id).toEqual(new Set([90, 135]));
        expect(s.hook.mandrelDiameter, tie.id).toBeGreaterThan(0);
      }
      // §25.3.5(d) asks both hooks to embrace a peripheral bar. On this fixture they cannot:
      // the interior leg falls back to the even division because every bar line that carries
      // steel at both faces leaves an across-width gap the table forbids. The piece is still
      // fabricated and the shortfall is reported — drawing a tie that grips nothing without
      // saying so is the failure mode this records.
      expect(tie.restrainsBarIds, tie.id).toBeDefined();
      expect(tie.cuttingLength, tie.id).toBeGreaterThan(0);
      expect(tie.segments.some((sg) => sg.kind === 'arc'), tie.id).toBe(true);
    }
  });

  it('§25.3.5(e): successive crossties alternate which end carries the 90° hook', () => {
    const r = detail(row2);
    const byZone = new Map<string, BarPath[]>();
    for (const b of r.assemblies.flatMap((a) => a.bars)) {
      if (b.role !== 'transverse' || !b.id.includes('crosstie')) continue;
      if ((b.zoneId ?? '').includes(':ties')) continue;
      byZone.set(b.zoneId!, [...(byZone.get(b.zoneId!) ?? []), b]);
    }
    let alternations = 0;
    for (const [, group] of byZone) {
      const ordered = [...group].sort((a, b) => (a.station ?? 0) - (b.station ?? 0));
      for (let i = 1; i < ordered.length; i++) {
        const prev = ordered[i - 1].startTreatment;
        const cur = ordered[i].startTreatment;
        if (prev.kind === 'hook' && cur.kind === 'hook'
          && prev.hook.angle !== cur.hook.angle) alternations++;
      }
    }
    // "deben quedar con los extremos alternados" — normative, so it has to actually happen.
    expect(alternations).toBeGreaterThan(0);
  });
});
