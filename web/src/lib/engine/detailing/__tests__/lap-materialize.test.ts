/**
 * Lap materialisation: schedules must become steel.
 *
 * The gate these tests exist for is the one the whole PR17 diagnosis kept tripping over:
 * a mechanism that is built, imported, typechecked and never actually invoked reads exactly
 * like a working mechanism from the outside. Channel-aware generation and the chain DP were
 * both dead for three sessions. So the last group here does not test geometry at all — it
 * tests that the geometry REACHES the consumers, and fails if the count is zero.
 */

import { describe, expect, it } from 'vitest';
import {
  materialiseLaps, lapIndex, lapBetween,
  type PlannedTransition,
} from '../lap-materialize';
import { buildStraightBarWithHooks, type BarPath } from '../../../codes/cirsoc201/bar-geometry';
import { planSplice } from '../splice';
import { deriveDevelopment } from '../../../codes/cirsoc201/anchorage';
import { classifyPair } from '../classify';

const X = { x: 1, y: 0, z: 0 };
const Y = { x: 0, y: 1, z: 0 };
const UP = { x: 0, y: 0, z: 1 };

/** One straight longitudinal bar running along x at a given transverse offset and level. */
function bar(
  id: string, owner: number, x0: number, x1: number, across: number, z = 0.05,
  opts: { startHook?: true; endHook?: true } = {},
): BarPath {
  return buildStraightBarWithHooks({
    id, diameterMm: 16, role: 'longitudinal',
    start: { x: x0, y: across, z }, end: { x: x1, y: across, z },
    axis: X, hookNormal: UP,
    startHook: opts.startHook ? 90 : undefined,
    endHook: opts.endHook ? 90 : undefined,
    ownerElementIds: [owner],
  });
}

const development = deriveDevelopment({
  diameterMm: 16, fy: 420, fc: 25, favourableSpacing: true, edition: '2025',
});

function schedule(from: number[], to: number[], available = 20) {
  const attempt = planSplice({
    from, to, diameterMm: 16, development, areaRatio: 1.0, groups: 1,
    availableLength: available, edition: '2025', maxAggregateSizeMm: 19,
  });
  if (!attempt.ok || !attempt.schedule) throw new Error(`no schedule: ${attempt.rejection}`);
  return attempt.schedule;
}

function transition(from: number[], to: number[], jointX = 5): PlannedTransition {
  return {
    jointId: 'n1', fromElementId: 1, toElementId: 2,
    jointPoint: { x: jointX, y: 0, z: 0 },
    axis: X, across: Y,
    schedule: schedule(from, to),
  };
}

describe('materialiseLaps — the continuous case', () => {
  it('fuses two bars on the same line into ONE bar owned by both members', () => {
    const t = transition([0], [0]);
    const r = materialiseLaps({
      barsByMember: new Map([
        [1, [bar('a', 1, 0, 5, 0, 0.05, { startHook: true })]],
        [2, [bar('b', 2, 5, 10, 0, 0.05, { endHook: true })]],
      ]),
      transitions: [t],
    });

    expect(r.fused).toHaveLength(1);
    expect(r.laps).toHaveLength(0);
    // Member 2's bar is gone; member 1 holds the through bar.
    expect(r.barsByMember.get(2)).toHaveLength(0);
    const through = r.barsByMember.get(1)![0];
    expect(through.ownerElementIds).toEqual([1, 2]);
  });

  it('the fused bar spans both members end to end', () => {
    const r = materialiseLaps({
      barsByMember: new Map([
        [1, [bar('a', 1, 0, 5, 0)]],
        [2, [bar('b', 2, 5, 10, 0)]],
      ]),
      transitions: [transition([0], [0])],
    });
    const through = r.barsByMember.get(1)![0];
    const xs = through.segments.flatMap((s) => [s.start.x, s.end.x]);
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeCloseTo(10, 6);
  });

  it('the fused bar keeps the OUTER hooks and drops the joint-side ones', () => {
    const r = materialiseLaps({
      barsByMember: new Map([
        [1, [bar('a', 1, 0, 5, 0, 0.05, { startHook: true, endHook: true })]],
        [2, [bar('b', 2, 5, 10, 0, 0.05, { startHook: true, endHook: true })]],
      ]),
      transitions: [transition([0], [0])],
    });
    const through = r.barsByMember.get(1)![0];
    expect(through.startTreatment.kind).toBe('hook');
    expect(through.endTreatment.kind).toBe('hook');
    // Exactly one hook at each end: two straights + two arcs, plus the body.
    expect(through.segments.filter((s) => s.kind === 'arc')).toHaveLength(2);
  });

  it('the fused bar is one cutting length, not two', () => {
    const r = materialiseLaps({
      barsByMember: new Map([
        [1, [bar('a', 1, 0, 5, 0)]],
        [2, [bar('b', 2, 5, 10, 0)]],
      ]),
      transitions: [transition([0], [0])],
    });
    expect(r.barsByMember.get(1)![0].cuttingLength).toBeCloseTo(10, 6);
  });

  it('a fusion invents no steel: total length is unchanged', () => {
    const before = [bar('a', 1, 0, 5, 0), bar('b', 2, 5, 10, 0)]
      .reduce((s, b) => s + b.cuttingLength, 0);
    const r = materialiseLaps({
      barsByMember: new Map([[1, [bar('a', 1, 0, 5, 0)]], [2, [bar('b', 2, 5, 10, 0)]]]),
      transitions: [transition([0], [0])],
    });
    const after = [...r.barsByMember.values()].flat()
      .reduce((s, b) => s + b.cuttingLength, 0);
    expect(after).toBeCloseTo(before, 6);
  });
});

describe('materialiseLaps — real laps', () => {
  const OFFSET = 0.06;   // 60 mm apart: a non-contact lap, well inside the pitch limit

  it('produces a lap interval, not a fusion, when the bars are offset', () => {
    const r = materialiseLaps({
      barsByMember: new Map([
        [1, [bar('a', 1, 0, 5, 0)]],
        [2, [bar('b', 2, 5, 10, OFFSET)]],
      ]),
      transitions: [transition([0], [OFFSET])],
    });
    expect(r.fused).toHaveLength(0);
    expect(r.laps).toHaveLength(1);
    expect(r.laps[0].kind).toBe('nonContactLap');
  });

  it('extends the incoming bar PAST the joint by the lap', () => {
    const t = transition([0], [OFFSET]);
    const r = materialiseLaps({
      barsByMember: new Map([
        [1, [bar('a', 1, 0, 5, 0)]],
        [2, [bar('b', 2, 5, 10, OFFSET)]],
      ]),
      transitions: [t],
    });
    const a = r.barsByMember.get(1)![0];
    const maxX = Math.max(...a.segments.flatMap((s) => [s.start.x, s.end.x]));
    expect(maxX).toBeCloseTo(5 + t.schedule.pairs[0].overlapTo, 6);
    expect(maxX).toBeGreaterThan(5);
  });

  it('pulls the outgoing bar back to the near end of the interval', () => {
    const t = transition([0], [OFFSET]);
    const r = materialiseLaps({
      barsByMember: new Map([
        [1, [bar('a', 1, 0, 5, 0)]],
        [2, [bar('b', 2, 5, 10, OFFSET)]],
      ]),
      transitions: [t],
    });
    const b = r.barsByMember.get(2)![0];
    const minX = Math.min(...b.segments.flatMap((s) => [s.start.x, s.end.x]));
    expect(minX).toBeCloseTo(5 + t.schedule.pairs[0].overlapFrom, 6);
  });

  it('the shared stretch is exactly the lap length the class earned', () => {
    const t = transition([0], [OFFSET]);
    const r = materialiseLaps({
      barsByMember: new Map([
        [1, [bar('a', 1, 0, 5, 0)]],
        [2, [bar('b', 2, 5, 10, OFFSET)]],
      ]),
      transitions: [t],
    });
    expect(r.laps[0].lapLength).toBeCloseTo(t.schedule.lapLength, 9);

    // And the geometry agrees with the record: both bars really do coexist there.
    const a = r.barsByMember.get(1)![0];
    const b = r.barsByMember.get(2)![0];
    const aMax = Math.max(...a.segments.flatMap((s) => [s.start.x, s.end.x]));
    const bMin = Math.min(...b.segments.flatMap((s) => [s.start.x, s.end.x]));
    expect(aMax - bMin).toBeCloseTo(t.schedule.lapLength, 6);
  });

  it('a spliced bar is not anchored into the joint, so the joint-side hook goes', () => {
    const r = materialiseLaps({
      barsByMember: new Map([
        [1, [bar('a', 1, 0, 5, 0, 0.05, { endHook: true })]],
        [2, [bar('b', 2, 5, 10, OFFSET, 0.05, { startHook: true })]],
      ]),
      transitions: [transition([0], [OFFSET])],
    });
    expect(r.barsByMember.get(1)![0].endTreatment.kind).toBe('straight');
    expect(r.barsByMember.get(2)![0].startTreatment.kind).toBe('straight');
  });

  it('classifies a lap under one bar diameter of offset as a CONTACT lap', () => {
    const r = materialiseLaps({
      barsByMember: new Map([
        [1, [bar('a', 1, 0, 5, 0)]],
        [2, [bar('b', 2, 5, 10, 0.014)]],   // 14 mm < db = 16 mm
      ]),
      transitions: [transition([0], [0.014])],
    });
    expect(r.laps[0].kind).toBe('contactLap');
    expect(r.laps[0].maxOffset).toBe(Number.POSITIVE_INFINITY);
  });

  it('records the §25.5.1.3 pitch limit on a non-contact lap', () => {
    const r = materialiseLaps({
      barsByMember: new Map([
        [1, [bar('a', 1, 0, 5, 0)]],
        [2, [bar('b', 2, 5, 10, OFFSET)]],
      ]),
      transitions: [transition([0], [OFFSET])],
    });
    const lap = r.laps[0];
    expect(lap.maxOffset).toBeCloseTo(Math.min(lap.lapLength / 5, 0.150), 9);
    expect(lap.offset).toBeLessThanOrEqual(lap.maxOffset + 1e-9);
  });

  it('carries the clause provenance from the schedule', () => {
    const r = materialiseLaps({
      barsByMember: new Map([
        [1, [bar('a', 1, 0, 5, 0)]],
        [2, [bar('b', 2, 5, 10, OFFSET)]],
      ]),
      transitions: [transition([0], [OFFSET])],
    });
    const arts = r.laps[0].refs.map((x) => x.clause);
    expect(arts).toContain('25.5.1.2');
    expect(arts).toContain('25.5.1.3');
  });
});

describe('materialiseLaps — what it refuses to do', () => {
  it('never laps a top bar to a bottom bar', () => {
    const r = materialiseLaps({
      barsByMember: new Map([
        [1, [bar('a', 1, 0, 5, 0, 0.05)]],
        [2, [bar('b', 2, 5, 10, 0, 0.60)]],   // a top bar, 550 mm higher
      ]),
      transitions: [transition([0], [0])],
    });
    expect(r.laps).toHaveLength(0);
    expect(r.fused).toHaveLength(0);
    expect(r.unmaterialised).toHaveLength(1);
  });

  it('leaves a locked bar exactly where the user pinned it', () => {
    const locked = { ...bar('a', 1, 0, 5, 0), locked: true };
    const r = materialiseLaps({
      barsByMember: new Map([[1, [locked]], [2, [bar('b', 2, 5, 10, 0)]]]),
      transitions: [transition([0], [0])],
    });
    expect(r.barsByMember.get(1)![0]).toEqual(locked);
    expect(r.fused).toHaveLength(0);
  });

  it('reports a transition it could not build instead of dropping it', () => {
    const r = materialiseLaps({
      barsByMember: new Map([[1, [bar('a', 1, 0, 5, 0)]]]),   // member 2 has no bars
      transitions: [transition([0], [0])],
    });
    expect(r.unmaterialised).toHaveLength(1);
    expect(r.unmaterialised[0].reason.key).toBe('detailing.lap.noBars');
  });

  it('does not mutate the input bar set', () => {
    const original = bar('a', 1, 0, 5, 0);
    const snapshot = JSON.stringify(original);
    materialiseLaps({
      barsByMember: new Map([[1, [original]], [2, [bar('b', 2, 5, 10, 0)]]]),
      transitions: [transition([0], [0])],
    });
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('marks everything it touched as coordinated, for the provenance trail', () => {
    const r = materialiseLaps({
      barsByMember: new Map([[1, [bar('a', 1, 0, 5, 0)]], [2, [bar('b', 2, 5, 10, 0.06)]]]),
      transitions: [transition([0], [0.06])],
    });
    expect(r.barsByMember.get(1)![0].source).toBe('coordinated');
    expect(r.barsByMember.get(2)![0].source).toBe('coordinated');
  });
});

describe('the lap index reaches the classifier', () => {
  const ctxBase = {
    edition: '2025' as const,
    maxAggregateSizeMm: 19,
    memberKindOf: () => 'beam' as const,
  };

  it('finds a lap in either bar order', () => {
    const index = lapIndex([{
      jointId: 'n1', fromBarId: 'a', toBarId: 'b',
      from: { x: 0, y: 0, z: 0 }, to: { x: 1, y: 0, z: 0 },
      lapLength: 1, kind: 'contactLap', spliceClass: 'B', offset: 0.01,
      maxOffset: Number.POSITIVE_INFINITY, refs: [],
    }]);
    expect(lapBetween(index, 'a', 'b')).toBeDefined();
    expect(lapBetween(index, 'b', 'a')).toBeDefined();
    expect(lapBetween(index, 'a', 'c')).toBeUndefined();
  });

  it('a lapped pair is a detail, not a spacing violation', () => {
    const a = bar('a', 1, 0, 5, 0);
    const b = bar('b', 2, 4, 10, 0.02);
    // 20 mm centre to centre, 4 mm clear — under §25.2.1 and a perfectly legal contact lap.
    const asSpacing = classifyPair(a, b, ctxBase, 0.004);
    expect(asSpacing.pairClass).toBe('crossMemberSpacing');
    expect(asSpacing.reportable).toBe(true);

    const asLap = classifyPair(a, b, { ...ctxBase, isLapPair: () => 'contact' }, 0.004);
    expect(asLap.pairClass).toBe('spliceLap');
    expect(asLap.reportable).toBe(false);
    expect(asLap.refs.map((r) => r.clause)).toContain('25.5.1.2');
  });

  it('a lap still may not have its two halves drawn on top of one another', () => {
    const a = bar('a', 1, 0, 5, 0);
    const b = bar('b', 2, 4, 10, 0);
    const overlapping = classifyPair(
      a, b, { ...ctxBase, isLapPair: () => 'contact' }, -0.016,
    );
    expect(overlapping.reportable).toBe(true);
    expect(overlapping.labelKey).toBe('detailing.pairClass.prohibitedOverlap');
  });

  it('nothing is a lap before materialisation', () => {
    const a = bar('a', 1, 0, 5, 0);
    const b = bar('b', 2, 4, 10, 0.02);
    // No isLapPair supplied: the schedule may exist, but no steel has moved.
    expect(classifyPair(a, b, ctxBase, 0.004).pairClass).not.toBe('spliceLap');
  });
});

describe('liveness — the mechanism must actually run', () => {
  /**
   * Channel-aware generation and the chain DP were each built, imported, typechecked and
   * dead for three sessions. A zero here means the same thing happened again.
   */
  it('a multi-span line materialises a non-zero number of transitions', () => {
    const r = materialiseLaps({
      barsByMember: new Map([
        [1, [bar('a', 1, 0, 5, 0), bar('a2', 1, 0, 5, 0.06)]],
        [2, [bar('b', 2, 5, 10, 0.03), bar('b2', 2, 5, 10, 0.09)]],
      ]),
      transitions: [transition([0, 0.06], [0.03, 0.09])],
    });
    expect(r.laps.length + r.fused.length).toBeGreaterThan(0);
  });

  it('every materialised lap names two bars that exist in the returned set', () => {
    const r = materialiseLaps({
      barsByMember: new Map([
        [1, [bar('a', 1, 0, 5, 0)]],
        [2, [bar('b', 2, 5, 10, 0.06)]],
      ]),
      transitions: [transition([0], [0.06])],
    });
    const ids = new Set([...r.barsByMember.values()].flat().map((x) => x.id));
    for (const lap of r.laps) {
      expect(ids.has(lap.fromBarId)).toBe(true);
      expect(ids.has(lap.toBarId)).toBe(true);
    }
  });

  it('every fusion removes exactly one bar from the model', () => {
    const before = 2;
    const r = materialiseLaps({
      barsByMember: new Map([[1, [bar('a', 1, 0, 5, 0)]], [2, [bar('b', 2, 5, 10, 0)]]]),
      transitions: [transition([0], [0])],
    });
    const after = [...r.barsByMember.values()].flat().length;
    expect(before - after).toBe(r.fused.length);
  });
});

describe('layer identity is physical, not diametral', () => {
  /**
   * The 405 parallel cross-member overlaps.
   *
   * Layers were keyed on `round(level / 20 mm)`. A fixed grid has boundaries, and a Ø32
   * top bar sits 6 mm lower than a Ø20 one — the centre is half a diameter below the face
   * — so at a support where the two members carried different sizes the two bars landed in
   * different buckets, were never paired, and their steel simply coexisted along the
   * member.
   *
   * That 6 mm was never a layer difference. Diameter is bar geometry.
   */
  const OFFSET = 0.06;

  it('laps a Ø32 top bar to a Ø20 top bar across a support', () => {
    const big = buildStraightBarWithHooks({
      id: 'a', diameterMm: 32, role: 'longitudinal',
      start: { x: 0, y: 0, z: 0.634 }, end: { x: 5, y: 0, z: 0.634 },
      axis: X, hookNormal: UP, ownerElementIds: [1],
    });
    const small = buildStraightBarWithHooks({
      id: 'b', diameterMm: 20, role: 'longitudinal',
      start: { x: 5, y: OFFSET, z: 0.640 }, end: { x: 10, y: OFFSET, z: 0.640 },
      axis: X, hookNormal: UP, ownerElementIds: [2],
    });
    const r = materialiseLaps({
      barsByMember: new Map([[1, [big]], [2, [small]]]),
      transitions: [transition([0], [OFFSET])],
    });
    expect(r.unmaterialised).toEqual([]);
    expect(r.laps.length + r.fused.length).toBe(1);
  });

  it('a 6 mm difference never splits a layer, wherever it falls on the old grid', () => {
    // Sweep the pair across a whole 20 mm grid cell. Under fixed rounding some offsets
    // straddled a boundary and some did not, which is exactly why the bug was intermittent.
    for (let k = 0; k < 20; k++) {
      const z = 0.600 + k * 0.001;
      const a = buildStraightBarWithHooks({
        id: 'a', diameterMm: 32, role: 'longitudinal',
        start: { x: 0, y: 0, z }, end: { x: 5, y: 0, z },
        axis: X, hookNormal: UP, ownerElementIds: [1],
      });
      const b = buildStraightBarWithHooks({
        id: 'b', diameterMm: 20, role: 'longitudinal',
        start: { x: 5, y: OFFSET, z: z + 0.006 }, end: { x: 10, y: OFFSET, z: z + 0.006 },
        axis: X, hookNormal: UP, ownerElementIds: [2],
      });
      const r = materialiseLaps({
        barsByMember: new Map([[1, [a]], [2, [b]]]),
        transitions: [transition([0], [OFFSET])],
      });
      expect(r.laps.length + r.fused.length, `z = ${z.toFixed(3)}`).toBe(1);
    }
  });

  it('still refuses to lap a top bar to a bottom bar', () => {
    // The clustering must not have made layering permissive. Half a metre apart is a
    // different mat, not a different diameter.
    const bottom = bar('a', 1, 0, 5, 0, 0.05);
    const top = bar('b', 2, 5, 10, 0, 0.60);
    const r = materialiseLaps({
      barsByMember: new Map([[1, [bottom]], [2, [top]]]),
      transitions: [transition([0], [0])],
    });
    expect(r.laps).toHaveLength(0);
    expect(r.fused).toHaveLength(0);
  });

  it('pairs bottom with bottom and top with top when both are present', () => {
    const r = materialiseLaps({
      barsByMember: new Map([
        [1, [bar('a-bot', 1, 0, 5, 0, 0.05), bar('a-top', 1, 0, 5, 0, 0.60)]],
        [2, [bar('b-bot', 2, 5, 10, OFFSET, 0.05), bar('b-top', 2, 5, 10, OFFSET, 0.60)]],
      ]),
      transitions: [transition([0], [OFFSET])],
    });
    expect(r.laps).toHaveLength(2);
    for (const lap of r.laps) {
      const bottomPair = lap.fromBarId.includes('bot');
      expect(lap.toBarId.includes('bot')).toBe(bottomPair);
    }
  });
});

describe('a layer has a bounded span, not just pairwise proximity', () => {
  /**
   * Single linkage is transitive and therefore chains. Elevations 0, 15 and 30 mm all join
   * one cluster at a 20 mm threshold even though the outer two are 30 mm apart — and
   * §25.2.2 puts 25 mm between layers, so a graded chain of three is exactly what a real
   * two-layer mat looks like.
   */
  function levelsOf(zs: number[]) {
    const bars = zs.map((z, i) => bar(`b${i}`, 1, 0, 5, i * 0.05, z));
    const other = zs.map((z, i) => bar(`c${i}`, 2, 5, 10, i * 0.05, z));
    return materialiseLaps({
      barsByMember: new Map([[1, bars], [2, other]]),
      transitions: [transition(zs.map((_, i) => i * 0.05), zs.map((_, i) => i * 0.05))],
    });
  }

  it('the 0 / 15 / 30 mm chain does not become one layer', () => {
    // If all three merged, the outermost pair would be lapped to each other across a
    // 30 mm elevation difference — two layers treated as one.
    const r = levelsOf([0.600, 0.615, 0.630]);
    // Each bar fuses with its own counterpart and nothing is left unmatched.
    expect(r.fused.length + r.laps.length).toBe(3);
  });

  it('mixed diameters within one physical layer still cluster together', () => {
    const big = buildStraightBarWithHooks({
      id: 'a', diameterMm: 32, role: 'longitudinal',
      start: { x: 0, y: 0, z: 0.634 }, end: { x: 5, y: 0, z: 0.634 },
      axis: X, hookNormal: UP, ownerElementIds: [1],
    });
    const small = buildStraightBarWithHooks({
      id: 'b', diameterMm: 20, role: 'longitudinal',
      start: { x: 5, y: 0, z: 0.640 }, end: { x: 10, y: 0, z: 0.640 },
      axis: X, hookNormal: UP, ownerElementIds: [2],
    });
    const r = materialiseLaps({
      barsByMember: new Map([[1, [big]], [2, [small]]]),
      transitions: [transition([0], [0])],
    });
    expect(r.fused.length + r.laps.length).toBe(1);
  });

  it('two genuinely separate layers are never merged', () => {
    const r = materialiseLaps({
      barsByMember: new Map([
        [1, [bar('a0', 1, 0, 5, 0, 0.600), bar('a1', 1, 0, 5, 0, 0.660)]],
        [2, [bar('b0', 2, 5, 10, 0, 0.600), bar('b1', 2, 5, 10, 0, 0.660)]],
      ]),
      transitions: [transition([0, 0], [0, 0])],
    });
    // Two layers, two fusions — not one layer of four bars.
    expect(r.fused).toHaveLength(2);
  });

  it('is stable under an arbitrary coordinate offset', () => {
    // A fixed grid gives different answers depending where the model sits in space. A
    // span-bounded cluster gives the same answer everywhere.
    const shape = (dz: number) => {
      const r = materialiseLaps({
        barsByMember: new Map([
          [1, [bar('a0', 1, 0, 5, 0, 0.600 + dz), bar('a1', 1, 0, 5, 0, 0.660 + dz)]],
          [2, [bar('b0', 2, 5, 10, 0, 0.600 + dz), bar('b1', 2, 5, 10, 0, 0.660 + dz)]],
        ]),
        transitions: [transition([0, 0], [0, 0])],
      });
      return `${r.fused.length}/${r.laps.length}`;
    };
    const base = shape(0);
    for (const dz of [0.003, 0.007, 0.011, 0.017, 1.234, -2.5]) {
      expect(shape(dz), `offset ${dz}`).toBe(base);
    }
  });

  it('fusion preserves the layer the bars were in', () => {
    const r = materialiseLaps({
      barsByMember: new Map([
        [1, [bar('a-bot', 1, 0, 5, 0, 0.05), bar('a-top', 1, 0, 5, 0, 0.60)]],
        [2, [bar('b-bot', 2, 5, 10, 0, 0.05), bar('b-top', 2, 5, 10, 0, 0.60)]],
      ]),
      transitions: [transition([0, 0], [0, 0])],
    });
    expect(r.fused).toHaveLength(2);
    for (const f of r.fused) {
      const bottom = f.keptBarId.includes('bot');
      expect(f.removedBarId.includes('bot')).toBe(bottom);
    }
  });
});
