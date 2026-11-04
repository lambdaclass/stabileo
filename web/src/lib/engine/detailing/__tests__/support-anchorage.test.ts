/**
 * The one geometry and rule set a bar end in a column is read by, design and detailing alike
 * (`support-anchorage.ts`, `design/end-support-anchorage.ts`), against hand calculations.
 *
 * The column: 40×40 (face 0,20 m from the node), cover 25 mm, Ø8 ties, Ø16 longitudinal bars,
 * unless a case says otherwise. Lengths in m past the node unless "past the face".
 */
import { describe, it, expect } from 'vitest';
import {
  groupTopRow, inflectionAnchorage, planSupportEnd, supportPlanes, supportRows, topLayout, faceDevelopment,
  SUPPORT_EMBED_M, type SupportCage, type SupportBar,
} from '../support-anchorage';
import { endSupportPlan } from '../../design/end-support-anchorage';
import { deriveHookedDevelopment } from '../../../codes/cirsoc201/anchorage';

const cage = (o: Partial<SupportCage> = {}): SupportCage => ({
  face: 0.2, continues: false, cover: 0.025, tieDiaMm: 8, barDiaMm: 16, source: 'designedCage', ...o,
});
const bar = (o: Partial<SupportBar> = {}): SupportBar => ({
  diameterMm: 10, need: 'develop', hook: 'allowed', inboard: 0, ld: 0.6, ldh: 0.184, ldc: 0.2, stress: 'tension', ...o,
});
const r3 = (v: number) => Math.round(v * 1000) / 1000;

describe('the planes a bar may reach in the column', () => {
  it('straight inside the ties; a hook behind the column bars with §25.2.3\'s clear distance', () => {
    // ring = 0,20 − 0,025 − 0,008 − 0,001 = 0,166; hook plane = 0,166 + 0,001 − 0,016 − max(0,040; 1,5·0,016) = 0,111.
    expect(supportPlanes(cage())).toEqual({ straight: expect.closeTo(0.166, 9), hook: expect.closeTo(0.111, 9) });
    // A Ø32 cage keeps the hook 1,5·db = 48 mm behind it: 0,167 − 0,032 − 0,048 = 0,087.
    expect(supportPlanes(cage({ barDiaMm: 32 })).hook).toBeCloseTo(0.087, 9);
    // 30×30: 0,15 − 0,034 = 0,116; behind a Ø12: 0,117 − 0,012 − 0,040 = 0,065.
    expect(supportPlanes(cage({ face: 0.15, barDiaMm: 12 }))).toEqual({ straight: expect.closeTo(0.116, 9), hook: expect.closeTo(0.065, 9) });
  });
});

describe('a bar end in an end support', () => {
  it('a top Ø10 that does not develop straight hooks at the hook plane: 0,311 past the face against ldh 0,184', () => {
    const p = planSupportEnd(cage(), bar())!;
    // Outer edge at the hook plane, 0,111 past the node: 0,20 + 0,111 = 0,311 past the face.
    expect(r3(p.availableHooked)).toBe(0.311);
    expect([p.hook, p.cause, p.record.solution, p.record.rule, r3(p.record.required)]).toEqual([90, 'hookFits', 'hook', 'ldh', 0.184]);
    // The straight run stops a bend radius (6·db/2 + db/2 = 35 mm) and half a bar short of it.
    expect(r3(p.along)).toBe(0.071);
    // End cover: the face to the outer edge, 0,20 − 0,111.
    expect(r3(p.record.endCover!)).toBe(0.089);
  });

  it('straight where ld fits inside the ties: 0,366 past the face', () => {
    const p = planSupportEnd(cage(), bar({ ld: 0.3 }))!;
    expect([p.record.solution, p.record.rule, r3(p.record.available), r3(p.along)]).toEqual(['straight', 'ld', 0.366, 0.166]);
  });

  it('unresolved, with what it had and what it needed, where neither fits', () => {
    const p = planSupportEnd(cage(), bar({ diameterMm: 20, ldh: 0.368 }))!;
    // Ø20: the outer edge at 0,111 as well, 0,311 past the face against 0,368.
    expect([p.record.solution, p.cause, r3(p.record.available), r3(p.record.required)]).toEqual(['unresolved', 'noRoomStraightOrHooked', 0.311, 0.368]);
  });

  it('a nested row turns its hook inside the outer row: 0,311 − (db + 25 mm)', () => {
    const p = planSupportEnd(cage(), bar({ inboard: 0.010 + 0.025 }))!;
    expect(r3(p.availableHooked)).toBe(0.276);
  });

  it('the tail keeps clear of a crossing beam\'s corner bar: a Ø16 seat at 0,100 moves a Ø10 tail to 0,086', () => {
    // Tail centre at 0,111 − 0,005 = 0,106, within 0,008 + 0,005 + 0,001 of the seat: to 0,100 − 0,014.
    const p = planSupportEnd(cage({ crossing: [{ at: 0.1, diameterMm: 16 }] }), bar())!;
    expect(r3(p.availableHooked)).toBe(0.291);
  });

  it('positive steel owes the face §9.7.3.8\'s 150 mm and stops there, straight or hooked', () => {
    const straight = planSupportEnd(cage(), bar({ need: 'embed' }))!;
    // 0,15 past the face is 0,05 short of the node; the outer face is 0,25 beyond.
    expect([straight.record.solution, straight.record.rule, r3(straight.record.available), r3(straight.along), r3(straight.record.endCover!)])
      .toEqual(['straight', '9.7.3.8.2', SUPPORT_EMBED_M, -0.05, 0.25]);
    // Hooked where the design asks (its ldh is the region row's, from the span's critical section).
    const hooked = planSupportEnd(cage(), bar({ need: 'embed', hook: 'requested' }))!;
    expect([hooked.record.solution, hooked.record.rule, r3(hooked.record.required), r3(hooked.record.available)]).toEqual(['hook', '9.7.3.8.2', 0.15, 0.311]);
  });

  it('a bar in compression is straight and held to ldc (§25.4.1.2: no hook)', () => {
    const p = planSupportEnd(cage(), bar({ stress: 'compression', hook: 'forbidden', ldc: 0.4 }))!;
    expect([p.hook, p.record.solution, p.record.rule, r3(p.record.required)]).toEqual([undefined, 'unresolved', 'ld', 0.4]);
  });

  it('a support the line continues past leaves the end to the laps; no column, no plan', () => {
    const p = planSupportEnd(cage({ continues: true }), bar())!;
    expect([p.record.support, p.record.solution, r3(p.record.available), r3(p.record.required)]).toEqual(['interior', 'pending', 0.4, 0.6]);
    expect(planSupportEnd(cage({ face: 0, source: 'noColumn' }), bar())).toBeNull();
  });
});

describe('what each bar must develop', () => {
  it('ldh with √f\'c held at 8,3 MPa (§25.4.1.4): Ø20 at H-100 is 0,24·420/8,3·20 = 0,243 m, not 0,202', () => {
    const rebar = { regions: { bottomSpanLayers: [{ count: 2, diameter: 20, row: 0 }], bottomSpan: { count: 2, diameter: 20 } } } as never;
    const d = faceDevelopment(rebar, { b: 0.3, h: 0.6, cover: 0.025, stirrupDia: 8, fc: 100, fy: 420 }, 'bottom', 20);
    expect(d.ldh).toBeCloseTo(0.24 * 420 / 8.3 * 0.020, 6);
    expect(deriveHookedDevelopment({ diameterMm: 20, fy: 420, fc: 25, edition: '2025' }).ldhM).toBeCloseTo(0.24 * 420 / 5 * 0.020, 6);
  });
});

describe('the rows of bars at a support (§9.7.3.8)', () => {
  const rebar = (bottom: number, top: number) => ({
    regions: {
      bottomSpanLayers: [{ count: bottom, diameter: 16, row: 0 }], bottomSpan: { count: bottom, diameter: 16 },
      topStartLayers: [{ count: top, diameter: 12, row: 0 }], topStart: { count: top, diameter: 12 },
      topEndLayers: [{ count: 2, diameter: 12, row: 0 }], topEnd: { count: 2, diameter: 12 },
    },
  }) as never;

  it('a third of the positive steel into a simple support, a quarter into any other, at least two', () => {
    const bottom = (simple: boolean, n: number) => supportRows(rebar(n, 4), 'start', { simple, lateralSystem: false, bottomHookRequested: false, slots: n, layers: 1 })
      .find((r) => r.position === 'bottom')!;
    expect([bottom(true, 7).count, bottom(false, 7).count, bottom(false, 3).count]).toEqual([3, 2, 2]);
    expect([bottom(false, 7).need, bottom(false, 7).hook]).toEqual(['embed', 'allowed']);
  });

  it('a member of the lateral system develops fy at the face, hooked (§9.7.3.8.2)', () => {
    const b = supportRows(rebar(7, 4), 'start', { simple: false, lateralSystem: true, bottomHookRequested: false, slots: 7, layers: 1 })
      .find((r) => r.position === 'bottom')!;
    expect([b.need, b.hook]).toEqual(['develop', 'requested']);
  });

  it('the continuous pair at the larger support diameter, the rest of the group in every row it can hold', () => {
    const rows = supportRows(rebar(2, 8), 'start', { simple: false, lateralSystem: false, bottomHookRequested: false, slots: 8, layers: 2 })
      .filter((r) => r.position === 'top');
    // 8 slots in 2 layers, 4 to a layer: bars 1–8 reach row floor(7/4) = 1.
    expect(rows.map((r) => [r.row, r.count, r.diameterMm, !!r.continuousPair])).toEqual([[0, 2, 12, true], [0, 6, 12, false], [1, 6, 12, false]]);
    expect([groupTopRow(8, 8, 2), groupTopRow(3, 8, 2), groupTopRow(5, 8, 1)]).toEqual([1, 0, 0]);
  });

  it('the member\'s top slots: 7Ø12 in a 20 cm web, 26,7 mm clear (4/3 of 20 mm aggregate), fit 4 to a layer', () => {
    // Inside the stirrups 0,20 − 2·(0,025 + 0,006) = 0,138; pitch 0,012 + 0,0267: floor(0,126/0,0387) + 1 = 4.
    const r = rebar(2, 7);
    expect(topLayout(r, { b: 0.2, cover: 0.025, stirrupDiaMm: 6, edition: '2025', maxAggregateSizeMm: 20 })).toEqual({ slots: 7, fewest: 2 });
  });
});

describe('the extra layer the coordination may take', () => {
  const input = (top: number) => ({
    rebar: { regions: {
      bottomSpanLayers: [{ count: 2, diameter: 12, row: 0 }], bottomSpan: { count: 2, diameter: 12 },
      topStartLayers: [{ count: top, diameter: 12, row: 0 }], topStart: { count: top, diameter: 12 },
      topEndLayers: [{ count: top, diameter: 12, row: 0 }], topEnd: { count: top, diameter: 12 },
      stirrupsSupport: { diameter: 6, legs: 2, spacing: 0.1 }, stirrupsSpan: { diameter: 6, legs: 2, spacing: 0.15 },
    } } as never,
    section: { b: 0.2, h: 0.5, cover: 0.025, stirrupDia: 6, fc: 30, fy: 420 },
    cages: { start: cage({ face: 0.15, barDiaMm: 12 }), end: cage({ face: 0.15, barDiaMm: 12 }) },
    edition: '2025' as const, seat: { stirrupDiaMm: 6, maxAggregateSizeMm: 20 },
  });

  it('is allowed where every bar anchors in it, and held off where one would not', () => {
    // 30×30 behind Ø12: hook plane 0,065, a Ø12 hook 0,215 past the face, ldh(Ø12, H-30) = 0,221.
    const ldh12 = deriveHookedDevelopment({ diameterMm: 12, fy: 420, fc: 30, edition: '2025' }).ldhM;
    expect(ldh12).toBeCloseTo(0.24 * 420 / Math.sqrt(30) * 0.012, 6);
    const p = endSupportPlan(input(4));
    // 4 slots fit one layer; the second would not hold: the member is held to one, and its row
    // 0 is unresolved too (0,215 < 0,221), so the design refuses it.
    expect(p.maxTopLayers).toBe(1);
    expect(p.verdicts.filter((v) => v.position === 'top' && v.end === 'start').map((v) => [v.row, v.solution, r3(v.available)]))
      .toEqual([[0, 'unresolved', 0.215], [0, 'unresolved', 0.215]]);
  });

  it('a 40 cm column holds both layers: the extra one is allowed', () => {
    const i = { ...input(8), cages: { start: cage(), end: cage() } };
    const p = endSupportPlan(i);
    // 8 slots, 2 layers needed, 3 offered; row 2 at 0,311 − 2·0,037 = 0,237 ≥ 0,221.
    expect(p.maxTopLayers).toBe(3);
    expect(p.verdicts.filter((v) => v.position === 'top').every((v) => v.solution === 'hook')).toBe(true);
  });
});

describe('§9.7.3.8.3 at a point of inflection', () => {
  it('ld ≤ Mn/Vu + ℓa, Mn with the continuing bars at fy and ℓa = max(d, 12·db)', () => {
    // 2Ø16 = 4,02 cm²: a = 4,02e-4·420/(0,85·30·0,20) = 0,0331 m; Mn = 4,02e-4·420 000·(0,45 − 0,0166) = 73,2 kN·m.
    const as = 2 * Math.PI * 1.6 ** 2 / 4;
    const r = inflectionAnchorage({ ld: 0.7, asCm2: as, fy: 420, fc: 30, b: 0.2, d: 0.45, diameterMm: 16, vu: 60 });
    const a = as / 1e4 * 420 / (0.85 * 30 * 0.2);
    const mn = as / 1e4 * 420 * 1000 * (0.45 - a / 2);
    expect(r.mnKNm).toBeCloseTo(mn, 9);
    expect(r.mnKNm).toBeCloseTo(73.2, 1);
    expect(r.la).toBe(0.45);
    expect(r.limit).toBeCloseTo(mn / 60 + 0.45, 9);
    expect(r.holds).toBe(true);
    expect(inflectionAnchorage({ ld: 2.0, asCm2: as, fy: 420, fc: 30, b: 0.2, d: 0.45, diameterMm: 16, vu: 60 }).holds).toBe(false);
  });
});
