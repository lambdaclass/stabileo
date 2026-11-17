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
import { computeColumnLayout, columnShearSection, computeDirectionalShearCapacity } from '../../station-design-forces';
import { stirrupLegs } from '../../../design-contract/directional-stirrups';
import { columnShearSpacing, columnTieSpacing } from '../../../codes/cirsoc201/transverse-spacing';
import { generateColumnStack } from '../generate-column';
import type { MemberContext } from '../../design/member-context';

function designAndDetail(fixture: unknown) {
  const solved = solveFixture(fixture as never);
  const summary = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 });
  const result = runDetailing({
    contexts: solved.contexts,
    outcomes: summary.outcomes,
    nodes: solved.data.nodes as never,
    elements: solved.data.elements as never,
    edition: '2025',
    maxAggregateSizeMm: 19,
    verifierId: 'cirsoc201.provided.v2.2025',
    demandRevision: 1,
  } as never);
  return { solved, summary, result };
}

function detail(fixture: unknown): RunDetailingResult {
  return designAndDetail(fixture).result;
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
  unsupported?: string[]; fullyRestrained: boolean; clashFree: boolean; outcome: string; why?: string;
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
    //
    // Since the design check reads Tabla 25.4.2.3 (about 1,5 times the 2005 ld it used) the
    // search certifies a slightly different arrangement for beams 5–8 (u 0,899 → 0,896), and
    // with it the same missing bar line leaves the envelope partially exhausted instead of
    // assigned with the leg off a bar; §25.3.5(d) is still the clause it names.
    //
    // Since the support moments are taken at the column face (§9.4.2.1) the top steel over the
    // supports is lighter, and the coordinator assigns the envelope again, the leg still off a
    // bar and §25.3.5(d) still named: the outcome follows the certified arrangement, the
    // shortfall does not.
    //
    // Since the beam rows are laid threaded between the columns' bars per layer (`candidates.ts`)
    // and the crossties choose the side their hooks clear (`buildCrosstie`), every interior leg of the coordinated cage
    // lands on a bar line: every bend witnessed (before: fewer than required; after: 1 192 of
    // 1 192), nothing unsupported. It is not clash-free: 43 prohibited overlaps remain, the
    // crossties' 135° tails turned into the core against the top bars beside them and the
    // stirrup's top leg, reported.
    fullyRestrained: true, clashFree: false, outcome: 'ASSIGNMENT_FOUND',
    unsupported: [],
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
        expect(c.unsupported, 'unsupported').toEqual(f.unsupported ?? []);
        if (c.unsupported.length) expect(c.verdicts).not.toContain('CONSTRUCTIBLE');
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
      // Joint cages alternate on their own schedule; this assertion is about member zones.
      if ((b.zoneId ?? '').startsWith('joint-')) continue;
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

describe('§15.3.1.4 — joint tie spacing cap', () => {
  it('no joint tie spacing exceeds 200 mm on the flagship frame', () => {
    // Pre-fix the joint reused the §10.7.6.2 column-tie value (16·d_b long), which
    // reached 209,9 mm on this fixture — over the 200 mm §15.3.1.4 allows within the
    // depth of the deepest beam framing into the joint.
    const r = detail(rcFrame);
    const jointTies = r.assemblies.flatMap((a) => a.bars).filter((b) =>
      /**
       * §15.3.1.4 caps the JOINT's spacing at 200 mm. It does not cap a column's own ties,
       * which §10.7.6.2 governs and which legitimately reach 306 mm on this frame. Selecting
       * on `:ties` swept the column cage in and failed it against a clause about joints.
       */
      b.role === 'transverse' && (b.zoneId ?? '').startsWith('joint-')
      && !b.id.includes('crosstie'));
    expect(jointTies.length).toBeGreaterThan(0);
    const byZone = new Map<string, number[]>();
    for (const b of jointTies) {
      const zs = b.segments.map((s) => (s.start.z + s.end.z) / 2);
      const z = zs.reduce((x, y) => x + y, 0) / zs.length;
      byZone.set(b.zoneId!, [...(byZone.get(b.zoneId!) ?? []), z]);
    }
    for (const [zone, zs] of byZone) {
      zs.sort((a, b) => a - b);
      for (let i = 1; i < zs.length; i++) {
        expect(zs[i] - zs[i - 1], `${zone} spacing`).toBeLessThanOrEqual(0.2 + 1e-9);
      }
    }
  }, 120_000);
});

function expectOrdinaryColumnShear(ctx: MemberContext, cage: { diameter: number; legs: number; spacing: number }) {
  const { b, h } = ctx.section;
  const { fc, fy, cover } = ctx.material;
  const layout = computeColumnLayout(8, 20, b, h, cover, cage.diameter);
  const tuples = ctx.stations!.comboResults.flatMap(c => c.stations);
  expect(tuples).toHaveLength(44);
  for (const direction of ['primary', 'secondary'] as const) {
    const axis = direction === 'primary' ? ctx.axes.shear : ctx.axes.secondaryShear;
    const { d, asCm2 } = columnShearSection(layout, direction, b, h);
    for (const station of tuples) {
      const Vu = Math.abs(axis === 'Vy' ? station.vy : station.vz);
      const cap = computeDirectionalShearCapacity(direction, cage.diameter,
        stirrupLegs({ legs: cage.legs, secondaryLegs: cage.legs }, direction), cage.spacing,
        b, d, fc, fy, -station.n, { Ag: b * h, rhoW: asCm2 * 1e-4 / (b * d), h, edition: '2025' });
      expect(cap.evaluated).toBe(true);
      expect(cap.avBelowMin).toBe(false);
      expect(Vu).toBeLessThanOrEqual(0.5 * cap.phiVcUnrounded);
      expect(Vu).toBeLessThan(cap.phiVn);
      expect(columnShearSpacing('2025', {
        Vu, phiVc: cap.phiVcUnrounded, Vs: cap.VsProvUnrounded, bw: b, d, fc,
      })).toEqual({ kind: 'not-required' });
    }
  }
}

describe('row-2 column generation follows its declared cage', () => {
  it('the warning inventory agrees with all four selected and generated column cages', () => {
    const { solved, summary, result } = designAndDetail(row2);
    const bars = result.assemblies.flatMap(a => a.bars);
    expect([...solved.contexts.values()].filter(c => c.elementType === 'column').map(c => c.elementId)).toEqual([1, 2, 3, 4]);
    for (const id of [1, 2, 3, 4]) {
      const ctx = solved.contexts.get(id)!;
      const outcome = summary.outcomes.get(id)!;
      expect(outcome.outcome, `column ${id}`).toBe('VERIFIED');
      expect(outcome.accepted).toEqual({
        column: { cornerDia: 20, faceDia: 20, nBottom: 1, nTop: 1, nLeft: 1, nRight: 1 },
        longitudinal: { count: 8, diameter: 20 },
        stirrups: { diameter: 10, legs: 2, secondaryLegs: 2, spacing: 0.3 },
      });
      const verified = cirsoc201Adapter.verify(ctx, outcome.accepted!);
      expect(verified.overallStatus).toBe('ok');
      expect(verified.checks.every(c => c.status === 'ok')).toBe(true);
      expect(new Set(verified.checkedAxes)).toEqual(new Set(['N', 'My', 'Mz', 'Vy', 'Vz']));
      expectOrdinaryColumnShear(ctx, outcome.accepted!.stirrups!);
      const longitudinal = bars.filter(b => b.role === 'longitudinal' && b.ownerElementIds.includes(id));
      expect(longitudinal).toHaveLength(8);
      const ties = bars.filter(b => b.zoneId === `col-${id}:ties`);
      expect(ties).toHaveLength(33);
      const stations = [...new Set(ties.map(b => b.station!))].sort((a, b) => a - b);
      expect(stations).toHaveLength(11);
      const spacing = Math.max(...stations.slice(1).map((s, i) => s - stations[i]));
      expect(spacing).toBeLessThanOrEqual(Math.min(outcome.accepted!.stirrups!.spacing, columnTieSpacing('2025', 20, 10, 0.5).spacing));
      expectOrdinaryColumnShear(ctx, { diameter: 10, legs: 3, spacing });
      for (const station of stations) {
        const group = ties.filter(b => b.station === station);
        expect(group).toHaveLength(3);
        expect(group.every(b => b.diameterMm === 10)).toBe(true);
        const outer = group.filter(b => !b.id.includes('crosstie'));
        const cross = group.filter(b => b.id.includes('crosstie'));
        expect(outer).toHaveLength(1);
        expect(outer[0].restrainsBarIds).toHaveLength(4);
        expect(cross).toHaveLength(2);
        for (const tie of cross) {
          expect(tie.restrainsBarIds).toHaveLength(2);
          expect(tie.startTreatment.kind).toBe('hook');
          expect(tie.endTreatment.kind).toBe('hook');
          expect(tie.cuttingLength).toBeGreaterThan(0);
        }
        const shafts = cross.map(tie => [...tie.segments].filter(s => s.kind === 'straight').sort((a, b) => b.length - a.length)[0]);
        expect(shafts.filter(s => Math.abs(s.end.x - s.start.x) > Math.abs(s.end.y - s.start.y))).toHaveLength(1);
        expect(shafts.filter(s => Math.abs(s.end.y - s.start.y) > Math.abs(s.end.x - s.start.x))).toHaveLength(1);
        expect(new Set(group.flatMap(b => b.restrainsBarIds ?? []))).toEqual(new Set(longitudinal.map(b => b.id)));
      }
    }
    const coverage = coverageOf(result);
    expect(coverage.verdicts).toEqual(['CONFLICTED']);
    expect(coverage.prohibited).toBeGreaterThan(0);
    expect(coverage.unsupported).toEqual(FIXTURES.find(f => f.name === 'rc-design-qa-row2')!.unsupported ?? []);
  });

  for (const secondaryLegs of [2, 3, 4]) {
    it(`preserves the column generator refusal at ${secondaryLegs} declared secondary legs`, () => {
      const generated = generateColumnStack({
        stackId: 'column', edition: '2025', fc: 30, fy: 420, maxAggregateSizeMm: 19,
        lapSplice: () => 0, beamDepthAtTop: new Map(), roofTermination: false,
        lifts: [{ elementId: 1, baseZ: 0, topZ: 3.2, b: 0.5, h: 0.5, centre: { x: 0, y: 0 },
          bars: { count: 8, diameterMm: 20 }, tieDia: 8, cover: 0.025, secondaryLegs }],
      });
      expect(generated.bars).toHaveLength(8);
      expect(generated.unsupported).toEqual(secondaryLegs === 2 ? [] : [{
        key: 'detailing.generation.columnSecondaryLegs', params: { legs: secondaryLegs, element: 1 },
      }]);
    });
  }
});
