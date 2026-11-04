/**
 * The laps as built, against §25.5 — every check with its hand value.
 *
 * Each block states the clause, the numbers worked by hand, and what the check must say. A check
 * that cannot be settled must say so (an open condition); none may pass a lap it did not measure.
 */
import { describe, expect, it } from 'vitest';
import { buildStraightBarWithHooks, type BarPath } from '../../../codes/cirsoc201/bar-geometry';
import { anchorageFunctions, deriveDevelopment } from '../../../codes/cirsoc201/anchorage';
import { materialiseLaps, lapIndex, lapBetween, type PlannedTransition } from '../lap-materialize';
import { planSplice } from '../splice';
import { generateColumnStack } from '../generate-column';
import {
  checkColumnLapSection, checkIntegritySplice, checkLapPair, isPerimeterBeam, lapGeometry,
  lineLapDevelopment, requiredLapLength, type LapMember, type SectionBar,
} from '../splice-checks';

const X = { x: 1, y: 0, z: 0 };
const Y = { x: 0, y: 1, z: 0 };
const UP = { x: 0, y: 0, z: 1 };

function bar(id: string, owner: number, x0: number, x1: number, y: number, z: number, dia: number, layerId?: string): BarPath {
  return {
    ...buildStraightBarWithHooks({
      id, diameterMm: dia, role: 'longitudinal',
      start: { x: x0, y, z }, end: { x: x1, y, z }, axis: X, hookNormal: UP, ownerElementIds: [owner],
    }),
    ...(layerId ? { layerId } : {}),
  };
}
function column(id: string, owner: number, x: number, y: number, z0: number, z1: number, dia: number): BarPath {
  return buildStraightBarWithHooks({
    id, diameterMm: dia, role: 'longitudinal',
    start: { x, y, z: z0 }, end: { x, y, z: z1 }, axis: UP, hookNormal: X, ownerElementIds: [owner],
  });
}

const BEAM: LapMember = { h: 0.5, fc: 30, fy: 420, cover: 0.025, stirrupDiaMm: 8 };
const ctx = { edition: '2025' as const, seismic: false };

function transition(jointId: string, from: number, to: number, jointX: number, dia: number): PlannedTransition {
  const development = deriveDevelopment({ diameterMm: dia, fy: 420, fc: 30, favourableSpacing: true, edition: '2025', psiT: 1.3 });
  const attempt = planSplice({
    from: [0], to: [0], diameterMm: dia, development, areaRatio: 1.0, groups: 1,
    availableLength: 20, edition: '2025', maxAggregateSizeMm: 19,
  });
  return {
    jointId, fromElementId: from, toElementId: to, jointPoint: { x: jointX, y: 0, z: 0 },
    axis: X, across: Y, schedule: attempt.schedule!,
  };
}

describe('a lap keeps its identity when its bar is later fused at the next joint', () => {
  // Line of three members along x. At n1 a Ø16 meets a Ø12 at the same slot: lapped (two sizes
  // are never fused). At n2 the Ø12 meets another Ø12 on the same line: fused into `b+c`.
  // Before: the lap still named `b`, a bar that no longer exists — [['n1', 'a', 'b']].
  it('the lap at n1 names the bar that exists after n2, so the classifier finds the pair', () => {
    const r = materialiseLaps({
      barsByMember: new Map([
        [1, [bar('a', 1, 0, 5, 0, 0, 16)]],
        [2, [bar('b', 2, 5, 10, 0, 0, 12)]],
        [3, [bar('c', 3, 10, 15, 0, 0, 12)]],
      ]),
      transitions: [transition('n1', 1, 2, 5, 16), transition('n2', 2, 3, 10, 12)],
    });
    const ids = [...r.barsByMember.values()].flat().map((b) => b.id).sort();
    expect(ids).toEqual(['a', 'b+c']);
    expect(r.laps.map((l) => [l.jointId, l.fromBarId, l.toBarId])).toEqual([['n1', 'a', 'b+c']]);
    expect(r.laps.map((l) => [l.fromElementId, l.toElementId])).toEqual([[1, 2]]);
    expect(lapBetween(lapIndex(r.laps), 'a', 'b+c')?.jointId).toBe('n1');
  });
});

describe('§25.5.2.1 / §25.5.2.2 — the lap length, by hand', () => {
  it('Class B on the larger bar: Ø16 top bar in a 50 cm beam, H-30, ADN 420', () => {
    // concrete below = 0,5 − 0,025 − 0,008 − 0,016 = 0,451 m > 0,30 → ψt = 1,3 (§25.4.2.5).
    // ℓd = 420·1,3 / (2,1·√30)·16 = 759,5 mm (Table 25.4.2.3, favourable row, db ≤ 16).
    // ℓst = 1,3·759,5 = 987,4 mm.
    const r = requiredLapLength({ diameterMm: 16, members: [BEAM], face: 'top', edition: '2025' });
    expect([r.psiT, Math.round(r.ld * 1000 * 10) / 10, Math.round(r.lap * 1000 * 10) / 10]).toEqual([1.3, 759.5, 987.4]);
  });
  it('a bottom bar takes ψt = 1,0: Ø20 → ℓd = 420/(1,7·√30)·20 = 902,1 mm, ℓst = 1172,8 mm', () => {
    const r = requiredLapLength({ diameterMm: 20, members: [BEAM], face: 'bottom', edition: '2025' });
    expect([r.psiT, Math.round(r.ld * 10000) / 10, Math.round(r.lap * 10000) / 10]).toEqual([1, 902.1, 1172.8]);
  });
  it('the line\'s lap development reads BOTH members: a 30 cm beam into a 50 cm one takes ψt = 1,3', () => {
    // Before: ψt from the incoming member alone, h = 0,30 → 1,0: ℓd(Ø12) = 420/(2,1·√30)·12 = 438,2 mm.
    // After: the outgoing member, where the lap lies, is 0,50 → 1,3; and f'c the lower of the two,
    // √25 = 5 → ℓd = 420·1,3/(2,1·5)·12 = 624,0 mm.
    const shallow = { h: 0.3, fc: 30, fy: 420 }, deep = { h: 0.5, fc: 25, fy: 420 };
    expect(Math.round(lineLapDevelopment(shallow, deep, 12, '2025').ldM * 10000) / 10).toBe(624);
    expect(Math.round(lineLapDevelopment(shallow, undefined, 12, '2025').ldM * 10000) / 10).toBe(438.2);
  });
  it('a lap shorter than required is held open with its numbers', () => {
    // Ø16 bottom bars overlapping 0,80 m; required 1,3·ℓd(ψt 1) = 1,3·584,2 = 759,5 mm → passes.
    const a = bar('a', 1, 0, 5.8, 0, 0, 16, 'e1:bottom:0'), b = bar('b', 2, 5, 10, 0.016, 0, 16, 'e2:bottom:0');
    expect(checkLapPair({ kind: 'beam', joint: 'n1', a, b, elementIds: [1, 2], members: [BEAM, BEAM], ctx }).map((c) => c.key)).toEqual([]);
    // The same as top bars: required 987,4 mm against 800 → short.
    const at = bar('a', 1, 0, 5.8, 0, 0, 16, 'e1:topI:0'), bt = bar('b', 2, 5, 10, 0.016, 0, 16, 'e2:topI:0');
    const c = checkLapPair({ kind: 'beam', joint: 'n1', a: at, b: bt, elementIds: [1, 2], members: [BEAM, BEAM], ctx });
    expect(c.map((x) => [x.key, x.params?.overlap, x.params?.required])).toEqual([['detailing.lapCheck.short', 800, 987.4]]);
  });
});

describe('§25.5.2.2 in a column stack — the lap is set by the larger bar of the two lifts', () => {
  // Before: the lower Ø16 bars ran up their own ℓst, 759,5 mm, against the 902,1 mm of ℓd(Ø20).
  it('Ø16 below, Ø20 above: the lower bars run up at least max(ℓd Ø20, ℓst Ø16)', () => {
    const anchor = anchorageFunctions({ fy: 420, fc: 30, favourableSpacing: true, psiT: 1.0, edition: '2025' } as never);
    const lift = (i: number, dia: number) => ({
      elementId: 100 + i, baseZ: i * 3, topZ: (i + 1) * 3, b: 0.4, h: 0.4, centre: { x: 0, y: 0 },
      bars: { count: 8, diameterMm: dia }, tieDia: 8, cover: 0.025,
    });
    const g = generateColumnStack({
      stackId: 'S', lifts: [lift(0, 16), lift(1, 20)], fc: 30, fy: 420, maxAggregateSizeMm: 19, edition: '2025',
      lapSplice: anchor.lapSplice, beamDepthAtTop: new Map([[0, 0.5], [1, 0.5]]), roofTermination: false,
    });
    const zs = (b: BarPath) => b.segments.flatMap((s) => [s.start.z, s.end.z]);
    const lower = g.bars.filter((b) => b.id.includes('-L0-')), upper = g.bars.filter((b) => b.id.includes('-L1-'));
    const overlap = Math.round((Math.max(...zs(lower[0]!)) - Math.min(...zs(upper[0]!))) * 10000) / 10;
    // ℓd(Ø20) = 420/(1,7·√30)·20 = 902,1 mm; ℓst(Ø16) = 1,3·584,2 = 759,5 mm → §25.5.2.2: 902,1 mm.
    // The detailing laps Class B on the larger bar, 1,3·902,1 = 1172,8 mm, which covers it: from
    // the end of the lower bar's crank (§10.7.4.1), where the upper bar starts, to its top.
    expect(overlap).toBeGreaterThanOrEqual(902.1);
    expect(overlap).toBe(1172.8);
    // The two stand side by side through it, in contact: (16 + 20)/2 = 18 mm apart.
    const top = lower[0]!.segments.at(-1)!, foot = upper[0]!.segments[0]!;
    expect(Math.round(Math.hypot(top.end.x - foot.start.x, top.end.y - foot.start.y) * 10000) / 10).toBeGreaterThanOrEqual(17.9);
  });
});

describe('§25.5.1.2 — a contact pair is two bars side by side, not two bars in one place', () => {
  it('Ø16 + Ø12 on one centreline: offset 0 < (16+12)/2 = 14 mm → unarranged', () => {
    const a = bar('a', 1, 0, 6, 0, 0, 16, 'e1:bottom:0'), b = bar('b', 2, 5, 10, 0, 0, 12, 'e2:bottom:0');
    const c = checkLapPair({ kind: 'beam', joint: 'n1', a, b, elementIds: [1, 2], members: [BEAM, BEAM], ctx });
    expect(c.map((x) => [x.key, x.params?.offset, x.params?.contact])).toEqual([['detailing.lapCheck.unarranged', 0, 14]]);
  });
  it('the same pair 14 mm apart (in contact) passes', () => {
    const a = bar('a', 1, 0, 6.2, 0, 0, 16, 'e1:bottom:0'), b = bar('b', 2, 5, 10, 0.014, 0, 12, 'e2:bottom:0');
    expect(checkLapPair({ kind: 'beam', joint: 'n1', a, b, elementIds: [1, 2], members: [BEAM, BEAM], ctx })).toEqual([]);
  });
});

describe('§25.5.1.3 — a non-contact pair: centre to centre ≤ min(ℓst/5, 150 mm)', () => {
  it('Ø12 bottom bars: ℓst = 1,3·438,2 = 569,6 mm → limit 113,9 mm; 100 mm passes, 120 mm is open', () => {
    const geo = (dy: number) => checkLapPair({
      kind: 'beam', joint: 'n1', a: bar('a', 1, 0, 6, 0, 0, 12, 'e1:bottom:0'), b: bar('b', 2, 5, 10, dy, 0, 12, 'e2:bottom:0'),
      elementIds: [1, 2], members: [BEAM, BEAM], ctx,
    });
    expect(geo(0.1)).toEqual([]);
    expect(geo(0.12).map((x) => [x.key, x.params?.offset, x.params?.limit])).toEqual([['detailing.lapCheck.pitch', 120, 113.9]]);
  });
  it('the offset is measured in the section plane, so a layer apart counts', () => {
    const g = lapGeometry(bar('a', 1, 0, 6, 0, 0, 12), bar('b', 2, 5, 10, 0.03, 0.04, 12))!;
    expect([Math.round(g.overlap * 1000), Math.round(g.minOffset * 1000)]).toEqual([1000, 50]);
  });
});

describe('§25.5.1.1, §25.5.1.5 and INPRES-CIRSOC 103-II — what is held open', () => {
  const pair = (dia: number, fy = 420, seismic = false) => checkLapPair({
    kind: 'beam', joint: 'n1', a: bar('a', 1, 0, 7, 0, 0, dia, 'e1:bottom:0'), b: bar('b', 2, 5, 10, dia / 1000, 0, dia, 'e2:bottom:0'),
    elementIds: [1, 2], members: [{ ...BEAM, fy }, { ...BEAM, fy }], ctx: { edition: '2025', seismic },
  }).map((x) => x.key);
  it('Ø32 laps; a bar above 32 mm does not', () => {
    expect(pair(32)).toEqual([]);
    expect(pair(40)).toContain('detailing.lapCheck.barTooLarge');
  });
  it('fy 520 MPa > 500: Ktr ≥ 0,5 db is not computed, so the lap is open', () => {
    expect(pair(16, 520)).toContain('detailing.lapCheck.ktr');
  });
  it('a project bound to seismic design holds every lap at a support open', () => {
    expect(pair(16, 420, true)).toEqual(['detailing.lapCheck.seismic']);
  });
});

describe('a column floor: the lapped section, as one plan', () => {
  const s = (id: string, x: number, y: number, z0: number, z1: number, el: number, d = 16): SectionBar => ({ id, x, y, diameterMm: d, zMin: z0, zMax: z1, elementId: el });
  it('the lower and upper lifts on the same plan points: every pair found, and every pair unarranged', () => {
    const bars = [s('L0-0', -0.157, -0.157, 0, 4.01, 1), s('L0-1', 0.157, -0.157, 0, 4.01, 1), s('L1-0', -0.157, -0.157, 3.25, 6.2, 2), s('L1-1', 0.157, -0.157, 3.25, 6.2, 2)];
    const r = checkColumnLapSection({ floorZ: 3.25, bars, maxAggregateSizeMm: 19, ctx });
    expect(r.pairs.map((p) => `${p.upper.id}~${p.lower.id}`)).toEqual(['L1-0~L0-0', 'L1-1~L0-1']);
    // §25.2.3 between the pairs: 314 mm centre to centre, 298 mm clear ≥ 40 mm: no spacing condition.
    expect(r.conditions).toEqual([]);
    const lapped = r.pairs.flatMap((p) => checkLapPair({
      kind: 'column', joint: 'z3.25', a: column(p.lower.id, 1, p.lower.x, p.lower.y, p.lower.zMin, p.lower.zMax, 16),
      b: column(p.upper.id, 2, p.upper.x, p.upper.y, p.upper.zMin, p.upper.zMax, 16), elementIds: [2],
      members: [{ ...BEAM, h: 0.4 }], ctx,
    }));
    // Overlap 4,01 − 3,25 = 0,76 m ≥ ℓst = 1,3·584,2 = 759,5 mm (ψt 1,0, vertical); offset 0 < 16 mm.
    expect(lapped.map((c) => [c.key, c.params?.offset, c.params?.overlap])).toEqual([
      ['detailing.lapCheck.unarranged', 0, 760], ['detailing.lapCheck.unarranged', 0, 760],
    ]);
  });
  it('a pair 30 mm clear of a neighbour is below §25.2.3\'s 40 mm', () => {
    // The upper bar beside its partner (in contact, 16 mm between centres), and a third bar 46 mm
    // beyond the upper one: 46 − 16 = 30 mm clear.
    const bars = [s('lo', 0, 0, 0, 4, 1), s('up', 0.016, 0, 3.25, 6, 2), s('nb', 0.016 + 0.046, 0, 0, 4, 1)];
    const r = checkColumnLapSection({ floorZ: 3.25, bars, maxAggregateSizeMm: 19, ctx });
    expect(r.conditions.map((c) => [c.key, c.params?.bar, c.params?.barB, c.params?.clear, c.params?.required])).toEqual([
      ['detailing.lapCheck.spacing', 'up', 'nb', 30, 40],
    ]);
  });
  it('an upper bar with nothing below to lap with is open', () => {
    const r = checkColumnLapSection({ floorZ: 3.25, bars: [s('up', 0, 0, 3.25, 6, 2)], maxAggregateSizeMm: 19, ctx });
    expect(r.conditions.map((c) => c.key)).toEqual(['detailing.lapCheck.noPartner']);
  });
});

describe('§9.7.7.5(b) — integrity steel of a perimeter beam does not splice at the support', () => {
  const plan = [
    { id: 1, a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, z: 3 }, { id: 2, a: { x: 6, y: 0 }, b: { x: 12, y: 0 }, z: 3 },
    { id: 3, a: { x: 0, y: 5 }, b: { x: 6, y: 5 }, z: 3 }, { id: 4, a: { x: 0, y: 10 }, b: { x: 6, y: 10 }, z: 3 },
    { id: 5, a: { x: 0, y: 0 }, b: { x: 0, y: 10 }, z: 3 },
  ];
  it('the edge beams are perimeter, the beam framed on both sides is not', () => {
    expect(plan.map((b) => isPerimeterBeam(b, plan))).toEqual([true, true, false, true, true]);
  });
  it('a top lap at the support with two Ø12 continuous of 4Ø12 + 2Ø16 passes; with one, it is open', () => {
    const bars = (ds: number[]) => ds.map((d) => ({ diameterMm: d }));
    // Side A brings 4Ø12 + 2Ø16 = 854,5 mm², side B 4Ø12 = 452,4 mm²: the larger governs.
    const sides = [bars([12, 12, 12, 12, 16, 16]), bars([12, 12, 12, 12])];
    const run = (cont: number[], top = sides) => checkIntegritySplice({
      joint: 'n2', elementIds: [1, 2], perimeter: true, topLaps: 2,
      continuousTop: bars(cont), topAtSupport: top, edition: '2025',
    }).map((c) => [c.key, c.params?.continuous, c.params?.continuousArea, c.params?.supportArea]);
    // 2Ø12 = 226 mm² ≥ 854,5/6 = 142,4 mm².
    expect(run([12, 12])).toEqual([]);
    // One bar: fewer than two (§9.7.7.1(b)).
    expect(run([12])).toEqual([['detailing.lapCheck.integrity', 1, 113, 855]]);
    // Two Ø10 = 157 mm² of 8Ø16 = 1608 mm² (a sixth: 268 mm²): two bars, not a sixth.
    expect(run([10, 10], [bars([16, 16, 16, 16, 16, 16, 16, 16]), []])).toEqual([['detailing.lapCheck.integrity', 2, 157, 1608]]);
    expect(checkIntegritySplice({ joint: 'n2', elementIds: [3], perimeter: false, topLaps: 2, continuousTop: [], topAtSupport: sides, edition: '2025' })).toEqual([]);
  });
});
