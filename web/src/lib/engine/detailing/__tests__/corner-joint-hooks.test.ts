/**
 * The hooks two beams ending at one corner turn into the column, as the design reads them and
 * the detailing places them.
 *
 * A beam not declared outside the lateral system develops its positive steel at the face
 * (§9.7.3.8.2), so its bottom bars hook up in the column too. At a corner the bottom tails of the
 * two beams stand side by side as the top ones do, the upper mat's bends sweep over the lower
 * mat's corner bars, and the joint's crossties run through the band the tails stand in. Each case
 * states the geometry it measured before the fix and the one it builds after.
 *
 * The column: 40×40 (face 0,20 m from the node), cover 25 mm, Ø8 ties, Ø16 longitudinal bars.
 */
import { describe, it, expect } from 'vitest';
import { bottomHookInboard, planSupportEnd, type SupportBar, type SupportCage } from '../support-anchorage';
import { crossingSeatsOf } from '../../design/end-support-anchorage';
import { allocateLayers, type LineForLayering } from '../joint-layers';
import { besideTailPosts, crossingTailPosts, crosstieCentreSides, crosstieShafts, postsMeet, tailPost } from '../joint-threading';
import { buildColumnTieSet, type StirrupSetInput } from '../../../codes/cirsoc201/transverse-cage';

const cage = (o: Partial<SupportCage> = {}): SupportCage => ({
  face: 0.2, continues: false, cover: 0.025, tieDiaMm: 8, barDiaMm: 16, source: 'designedCage', ...o,
});
const r4 = (v: number) => Math.round(v * 10000) / 10000;

describe('the bottom tails of two beams ending at a corner', () => {
  // A Ø10 bottom bar hooked up inside one top row of Ø16 (16 mm + 25 mm in from the hook plane),
  // its corner bar 70 mm across its axis; the crossing beam's Ø10 bottom corner bar 69 mm past
  // the node, where that beam ends too and hooks it up: the two tails stand parallel.
  const bar: SupportBar = {
    diameterMm: 10, need: 'develop', hook: 'requested', position: 'bottom', outerAcross: 0.07,
    inboard: bottomHookInboard(1, 16, 0.025), ld: 0.6, ldh: 0.184, ldc: 0.2, stress: 'tension',
  };

  it('keep the clear distance between parallel bars: the tail goes 35 mm inside the crossing corner, not 11', () => {
    // Hook plane 0,111, tail centre 0,106; nested 0,041 in, 0,065, within the corner's reach.
    // Before: the crossing beam's tail was read as beside this one only where this beam's corner
    // came within the clear of THE HOOK PLANE (0,106 here, 0,07 + 0,035 short of it), where its
    // bottom tails never stand, so it kept 1 mm of contact: the tail at 0,069 − 0,011 = 0,058,
    // 1 mm clear of the crossing tail (availableHooked 0,263). Measured on the span fixture at
    // 40×40, undeclared: 6,7 mm short of the clear at each corner, 4 clashes the coordination
    // left unresolved. After: 0,069 − (0,005 + 0,005 + 0,025) = 0,034.
    const p = planSupportEnd(cage({ crossing: [{ at: 0.069, diameterMm: 10, face: 'bottom', clear: 0.025 }] }), bar)!;
    expect(r4(p.availableHooked)).toBe(0.239);
  });

  it('a crossing corner that does not hook here is only crossed, in contact', () => {
    const p = planSupportEnd(cage({ crossing: [{ at: 0.069, diameterMm: 10, face: 'bottom' }] }), bar)!;
    expect(r4(p.availableHooked)).toBe(0.263);
  });

  it('the design owes the clear to the crossing beam\'s bottom corner as to its top one', () => {
    // Before: only the top seats carried it, and the design verified a tail the detailing could
    // not lay beside the other's.
    const seats = crossingSeatsOf(7, { b: 0.25, h: 0.5 }, {
      cover: 0.025, tieDiaMm: 8,
      beamCorners: new Map([[7, { cornerDiasMm: [16, 10], topDiasMm: [16], bottomDiasMm: [10], stirrupDiaMm: 8 }]]),
    }, { clear: 0.025 });
    expect(seats.map((s) => [s.face, s.diameterMm, s.clear])).toEqual([['top', 16, 0.025], ['bottom', 10, 0.025]]);
  });

  it('a first bottom row of two stands on its corners: the slots are not kept off the other\'s plane for it', () => {
    // The crossing beam's bottom tail 24,3 mm past the node, this beam's 60 mm. Before: the pair
    // barred this beam's layer-0 slots within 30 mm of that plane, its middle slots, which carry
    // top bars there: no layout through the joint (six corner joints of the half-metre mesh).
    const posts = (count?: number) => crossingTailPosts({
      theirs: [{ at: 0.0243, diameterMm: 10, row: 0, position: 'bottom' }], k: -1, theirSeat: 0.0619,
      ours: [{ at: 0.06, diameterMm: 10, row: 0, position: 'bottom', ...(count !== undefined ? { count } : {}) }], ourSeat: 0.0619,
      gives: false, clear: 0.025, placement: 0, clearedAtMm: 10, ourTopMm: 10,
    }).map((k) => [r4(k.at), r4(k.halfWidth), k.layers ?? '*']);
    // The tail crossing this beam's bars, in contact, stays.
    expect(posts(2)).toEqual([[-0.0243, 0.005, '*']]);
    // A third bar stands inside the corners, on a slot the keep-out moves: it is kept.
    expect(posts(3)).toEqual([[-0.0243, 0.005, '*'], [-0.0243, 0.03, [0]]]);
  });
});

describe('the lower mat under the upper mat\'s hook bends', () => {
  const seated = (id: string, dx: number, dy: number, topMm: number): LineForLayering => ({
    lineId: id, elementIds: [Number(id.slice(-1))], direction: { x: dx, y: dy }, maxBarMm: topMm, maxTopMm: topMm, maxBottomMm: topMm,
    topZ: { hi: 0.2, lo: 0.2 }, bottomZ: { hi: -0.2, lo: -0.2 },
  });
  const crossings = [{ a: 'line-000001', b: 'line-000002', jointId: 'n1' }];

  it('drops by what the bend asks beyond contact', () => {
    const lines = [seated('line-000001', 1, 0, 16), seated('line-000002', 0, 1, 16)];
    // Before: contact alone, (16 + 16)/2 = 16 mm. Measured on the span fixture at 40×40,
    // undeclared: the corner bar 13 mm under the upper run went through its Ø16 bend by 2,9 mm.
    expect(r4(allocateLayers({ lines, crossings, edition: '2025' }).byLine.get('line-000002')!.topLower)).toBe(0.016);
    const a = allocateLayers({ lines, crossings, edition: '2025', bendClearance: (l, o) => l === 'line-000002' && o === 'line-000001' ? { drop: 0.0029, raise: 0 } : undefined });
    expect(r4(a.byLine.get('line-000002')!.topLower)).toBe(0.0189);
    expect(r4(a.byLine.get('line-000002')!.bottomRaise)).toBe(0.016);
  });

  it('stays at contact where the deeper seat lands on the upper beam\'s second layer', () => {
    // A Ø12 line under a Ø10 one with a second top layer 35 mm down (10 mm + 25 mm): contact puts
    // it 11 mm down, between the two. The Ø12 bend asks 17,6 mm more, 28,6 mm: 6,4 mm from the
    // second layer's centre where 11 mm are due. Before: taken, and on the 408-member frame the
    // crossing clashes rose from 1249 to 2031 (gravity reading).
    const lines = [seated('line-000001', 1, 0, 10), seated('line-000002', 0, 1, 12)];
    const bendClearance = () => ({ drop: 0.0176, raise: 0 });
    const inner = (depth: number) => () => ({ top: [{ depth, diaMm: 10 }], bottom: [] });
    expect(r4(allocateLayers({ lines, crossings, edition: '2025', bendClearance }).byLine.get('line-000002')!.topLower)).toBe(0.0286);
    expect(r4(allocateLayers({ lines, crossings, edition: '2025', bendClearance, innerLayers: inner(0.035) }).byLine.get('line-000002')!.topLower)).toBe(0.011);
    // A second layer deep enough to pass over leaves the bend's seat as it is.
    expect(r4(allocateLayers({ lines, crossings, edition: '2025', bendClearance, innerLayers: inner(0.06) }).byLine.get('line-000002')!.topLower)).toBe(0.0286);
  });
});

describe('the joint\'s centreline crossties', () => {
  const input: StirrupSetInput = {
    elementId: 9, zoneId: 'j', station: 0,
    b: 0.4, h: 0.4, cover: 0.025, stirrupDiaMm: 8, legs: 2,
    longitudinalBars: [
      { id: 'c0', across: -0.159, up: -0.159, diameterMm: 16 }, { id: 'c1', across: 0.159, up: -0.159, diameterMm: 16 },
      { id: 'c2', across: 0.159, up: 0.159, diameterMm: 16 }, { id: 'c3', across: -0.159, up: 0.159, diameterMm: 16 },
      { id: 'c4', across: 0, up: -0.159, diameterMm: 16 }, { id: 'c5', across: 0, up: 0.159, diameterMm: 16 },
      { id: 'c6', across: -0.159, up: 0, diameterMm: 16 }, { id: 'c7', across: 0.159, up: 0, diameterMm: 16 },
    ],
    origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 },
    up: { x: 1, y: 0, z: 0 }, across: { x: 0, y: 1, z: 0 },
    hookOrientation: 'a', maxAggregateSizeMm: 19,
  };
  /** Each crosstie's shaft (its longest straight run) in plan: the coordinate it stands at. */
  const shafts = (o: Partial<StirrupSetInput> = {}) => buildColumnTieSet({ ...input, ...o }).pieces.slice(1).map((p) => {
    const s = [...p.path.segments].filter((g) => g.kind === 'straight')
      .sort((a, b) => Math.hypot(b.end.x - b.start.x, b.end.y - b.start.y) - Math.hypot(a.end.x - a.start.x, a.end.y - a.start.y))[0]!;
    return Math.abs(s.end.x - s.start.x) > Math.abs(s.end.y - s.start.y) ? ['along x', r4(s.start.y)] : ['along y', r4(s.start.x)];
  });

  it('pass a bend radius beside the centre bars, on the positive side unless the joint states the other', () => {
    // r = 4·8/2 + 8/2 = 20 mm. The joint takes the other side where the positive one runs through
    // a beam's hook tail (`run-detailing`): measured on the span fixture at 40×40, undeclared, the
    // end beams' bottom tails 22 mm past the node and the shaft at 20 mm, 5,7 mm into each.
    expect(shafts()).toEqual([['along x', 0.02], ['along y', 0.02]]);
    expect(shafts({ centreSides: { across: -1 } })).toEqual([['along x', -0.02], ['along y', 0.02]]);
    expect(shafts({ centreSides: { up: -1 } })).toEqual([['along x', 0.02], ['along y', -0.02]]);
  });
});

describe('the side the joint passes its centreline crossties on', () => {
  // The 40×40 cage of 8Ø16 about the node: corners and face-centre bars, Ø8 ties.
  const plan = [
    [-0.159, -0.159], [0.159, -0.159], [0.159, 0.159], [-0.159, 0.159],
    [0, -0.159], [0, 0.159], [-0.159, 0], [0.159, 0],
  ].map(([x, y]) => ({ x: x!, y: y!, diameterMm: 16 }));
  // A beam along y ending here with its bottom tails 17 mm past the node: the yielding beam's
  // bottom bars pushed in past the crossing corner (the span fixture's 40×40 corners with ψcc, tried and withdrawn).
  const tails = (outY: 1 | -1) => [{ out: { x: 0, y: outY }, rows: [
    { at: 0.105, diameterMm: 12, row: 0, position: 'top' as const, count: 3 },
    { at: 0.0172, diameterMm: 16, row: 0, position: 'bottom' as const, count: 2 },
  ] }];

  it('reads the centreline crossties a bend radius beside the centre bars, as the tie set lays them', () => {
    expect(crosstieShafts(plan, true, 8, 1).map((s) => [r4(s.shaft), s.centre])).toEqual([[0.02, true]]);
    expect(crosstieShafts(plan, true, 8, -1).map((s) => [r4(s.shaft), s.centre])).toEqual([[-0.02, true]]);
  });

  it('takes the side away from the tails that stand across it', () => {
    // No tail across either: the positive side, the tie set's default.
    expect(crosstieCentreSides({ plan, tieDiaMm: 8, tails: [] })).toEqual({ alongX: 1, alongY: 1 });
    // Ending toward −y, its tails stand at y = −0,017: the positive side is clear.
    expect(crosstieCentreSides({ plan, tieDiaMm: 8, tails: tails(-1) })).toEqual({ alongX: 1, alongY: 1 });
    // Toward +y they stand at +0,017, 3 mm from the positive shaft. Before: the coordination read
    // the crosstie there and laid the crossing beam's middle top bar on the negative side, and the
    // tie set, finding the positive side through these tails, took the negative one onto that bar.
    expect(crosstieCentreSides({ plan, tieDiaMm: 8, tails: tails(1) })).toEqual({ alongX: -1, alongY: 1 });
  });
});

describe('the tails of two crossing beams, in height', () => {
  it('two tails stand beside each other unless one stops short of the other by the clear', () => {
    // Ø16 tails reach 56 + 192 mm from the bar: in a 50 cm beam a top and a bottom one overlap 78 mm.
    expect(postsMeet(tailPost(0.2, 16, 'top'), tailPost(-0.2, 16, 'bottom'), 0.025)).toBe(true);
    expect(postsMeet({ lo: 0.1, hi: 0.3 }, { lo: -0.2, hi: 0.076 }, 0.025)).toBe(true);
    expect(postsMeet({ lo: 0.1, hi: 0.3 }, { lo: -0.2, hi: 0.075 }, 0.025)).toBe(false);
  });

  it('a crossing bottom tail bars no slot of a beam whose bottom bars stand on their seats alone', () => {
    const o = {
      theirs: [{ at: 0.105, diameterMm: 12, row: 0, position: 'top' as const }, { at: 0.0172, diameterMm: 16, row: 0, position: 'bottom' as const }],
      k: 1, theirSeat: 0.0612, ourSeat: 0.0598, gives: false, clear: 0.025, placement: 0, clearedAtMm: 16, ourTopMm: 16,
    };
    // Before, with ψcc (tried and withdrawn): a keep-out of every layer, 17 mm across this beam: with the column's centre bar and
    // the crosstie it left the middle top bar of a 20 cm beam no slot (the span fixture, 1 m mesh).
    expect(crossingTailPosts(o).map((k) => r4(k.at))).toEqual([0.105, 0.0172]);
    // Read later, with the mats' ranks, against the top layers it reaches (`run-detailing`).
    expect(crossingTailPosts({ ...o, ourBottomSeated: true }).map((k) => r4(k.at))).toEqual([0.105]);
  });

  it('a top tail beside a crossing bottom one keeps the clear, each read at its own corner seat', () => {
    // The span fixture at 40×40, 2 m mesh, with ψcc (tried and withdrawn): this beam's second top row of Ø10 turned down 45,8 mm
    // past the node; the crossing beam's Ø16 bottom row turned up 46,2 mm past it, its corners at
    // 59,8 mm. Before: no pair of a top and a bottom row was read, and the two tails stood 12 mm
    // clear, 29 mm side by side in height, where 25 mm of clear are due.
    const posts = besideTailPosts({
      theirs: [{ at: 0.0462, diameterMm: 16, row: 0, position: 'bottom', count: 2 }], k: -1, theirSeat: 0.0619,
      ours: [{ at: 0.0458, diameterMm: 10, row: 1, position: 'top' }], ourSeat: 0.0619, gives: true,
      clear: 0.025, placement: 0, clearedAtMm: 12,
      seatOf: { ours: () => 0.0619, theirs: () => 0.0598 },
      beside: (r, t) => r.position !== t.position,
    }).map((k) => [r4(k.at), r4(k.halfWidth), k.layers]);
    // The second row keeps off the other's plane by both radii and the clear: 5 + 8 + 25 − 6 mm.
    expect(posts).toEqual([[-0.0462, 0.032, [1]]]);
  });
});

