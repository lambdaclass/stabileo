/**
 * A strap pair by hand: the edge column at x = 0 on a footing whose centre is 0,60 m inward, the
 * inner column at x = 5. L = 5, e = 0,60, R1/P1 = 5/4,4 = 1,13636, the relief e/(L − e) = 0,13636.
 * With P1 = 500 kN and P2 = 800 kN: R1 = 568,18, R2 = 800 − 68,18 = 731,82, M = 300 kN·m, V = 68,18 kN.
 */
import { describe, it, expect } from 'vitest';
import { strapAdjust } from '../strap-footing';
import { newFooting } from '../../../model/footing';
import type { NodeReactions } from '../../detailing/run-footing-design';

const pair = (ecc: number) => [
  { ...newFooting(1, 10, 'Z1', { cover: 0.05, foundingElevation: -1.2, soilProfileId: 1 }), B: 1.6, L: 2.4, thickness: 0.6, eccentricityB: ecc, straps: [{ toFootingId: 2 }] },
  { ...newFooting(2, 20, 'Z2', { cover: 0.05, foundingElevation: -1.2, soilProfileId: 1 }), B: 2.4, L: 2.4, thickness: 0.6 },
];
const nodes = new Map([[10, { x: 0, y: 0 }], [20, { x: 5, y: 0 }]]);
const r = (fz: number, d: number, mx = 0, my = 0): NodeReactions => ({
  factored: [{ combinationId: 1, combinationName: '1.2D + 1.6L', fz, mx, my }],
  cases: [{ caseId: 1, caseType: 'D', fz: d, mx: 0, my: 0 }],
});

describe('a footing balanced by a strap beam', () => {
  it('is centred under R1 = P1·L/(L − e), and its partner relieved by P1·e/(L − e)', () => {
    const a = strapAdjust(pair(0.6), nodes, new Map([[10, r(-500, -300)], [20, r(-800, -500)]]));
    expect(a.refused).toEqual([]);
    const s = a.straps[0]!;
    expect(s.factor).toBeCloseTo(5 / 4.4, 9);
    expect(s.M).toBeCloseTo(300, 6); expect(s.V).toBeCloseTo(68.1818, 3);
    expect(a.reactions.get(10)!.factored[0]!.fz).toBeCloseTo(-568.18, 2);
    expect(a.reactions.get(20)!.factored[0]!.fz).toBeCloseTo(-731.82, 2);
    // Case by case too: the service load the bearing check reads.
    expect(a.reactions.get(10)!.cases![0]!.fz).toBeCloseTo(-340.91, 2);
    expect(a.reactions.get(20)!.cases![0]!.fz).toBeCloseTo(-459.09, 2);
    expect(a.footings[0]!.eccentricityB).toBeCloseTo(0, 9);
    expect(a.straps[0]).toMatchObject({ bothWays: false });
    expect(a.straps[0]!.relief).toBeCloseTo(68.1818, 3);
  });

  it('takes a centred footing\'s column moments into straps both ways, the footing then centred', () => {
    // Z1 centred at the origin; straps to Z2 at x = 5 and Z3 at y = 4. The column brings
    // mx = 40 and my = −60 kN·m down with 500 kN. Along x, |w| = 60: V = 60/5 = 12; along y,
    // |w| = 40: V = 40/4 = 10. R1 = 522 kN, each partner loaded by its V (no offset to relieve it).
    const fs = [
      { ...newFooting(1, 10, 'Z1', { cover: 0.05, foundingElevation: -1.2, soilProfileId: 1 }), B: 2, L: 2, thickness: 0.6, straps: [{ toFootingId: 2 }, { toFootingId: 3 }] },
      { ...newFooting(2, 20, 'Z2', { cover: 0.05, foundingElevation: -1.2, soilProfileId: 1 }), B: 2, L: 2, thickness: 0.6 },
      { ...newFooting(3, 30, 'Z3', { cover: 0.05, foundingElevation: -1.2, soilProfileId: 1 }), B: 2, L: 2, thickness: 0.6 },
    ];
    const ns = new Map([[10, { x: 0, y: 0 }], [20, { x: 5, y: 0 }], [30, { x: 0, y: 4 }]]);
    const a = strapAdjust(fs, ns, new Map([[10, r(-500, -300, 40, -60)], [20, r(-800, -500)], [30, r(-800, -500)]]));
    const c = a.reactions.get(10)!.factored[0]!;
    expect(c.fz).toBeCloseTo(-522, 9);
    expect(c.mx).toBeCloseTo(0, 9); expect(c.my).toBeCloseTo(0, 9);
    expect(a.reactions.get(20)!.factored[0]!.fz).toBeCloseTo(-812, 9);
    expect(a.reactions.get(30)!.factored[0]!.fz).toBeCloseTo(-810, 9);
    expect(a.straps.map((x) => [x.partnerId, x.M, x.V, x.bothWays])).toEqual([[2, 60, 12, true], [3, 40, 10, true]]);
  });

  it('reaches a strip at the node the strap lands on, not at the strip\'s own', () => {
    const fs = [
      { ...newFooting(1, 10, 'Z1', { cover: 0.05, foundingElevation: -1.2, soilProfileId: 1 }), B: 2, L: 2, thickness: 0.6, straps: [{ toFootingId: 2, nodeId: 21 }] },
      { ...newFooting(2, 20, 'M1', { cover: 0.05, foundingElevation: -1.2, soilProfileId: 1 }), kind: 'strip' as const, B: 6, L: 0.8, thickness: 0.6, rotationDeg: 90, supportedNodeIds: [21] },
    ];
    const ns = new Map([[10, { x: 0, y: 0 }], [20, { x: 4, y: -3 }], [21, { x: 4, y: 0 }]]);
    const a = strapAdjust(fs, ns, new Map([[10, r(-500, -300, 0, 80)], [20, r(-100, -60)], [21, r(-100, -60)]]));
    expect(a.straps[0]).toMatchObject({ partnerNodeId: 21, L: 4, V: 20 });
    expect(a.reactions.get(21)!.factored[0]!.fz).toBeCloseTo(-120, 9);
    expect(a.reactions.get(20)!.factored[0]!.fz).toBe(-100);
  });

  it('is not read when its offset points away from the partner', () => {
    const a = strapAdjust(pair(-0.6), nodes, new Map([[10, r(-500, -300)], [20, r(-800, -500)]]));
    expect(a.refused).toEqual([{ footingId: 1, reason: 'offsetNotTowardPartner' }]);
    expect(a.reactions.get(10)!.factored[0]!.fz).toBe(-500);
  });

  it('centres a strip whose offset across the structure balances, and states the couple per metre', () => {
    const strip = { ...newFooting(3, 30, 'M1', { cover: 0.05, foundingElevation: -3.3, soilProfileId: 1 }), kind: 'strip' as const, B: 5, L: 0.85, thickness: 0.8, eccentricityL: 0.27, supportedNodeIds: [31], balanced: { by: 'structure' as const, height: 2.5 } };
    const a = strapAdjust([strip], new Map([[30, { x: 0, y: 0 }], [31, { x: 5, y: 0 }]]), new Map([[30, r(-500, -300)], [31, r(-500, -300)]]));
    expect(a.footings[0]!.eccentricityL).toBe(0);
    // 1000 kN over 5 m with 0,27 m of offset: 54 kN·m/m at the foot, 21,6 kN/m at the floor 2,5 m up.
    expect(a.balanced[0]).toMatchObject({ footingId: 3, e: 0.27, length: 5 });
    expect(a.balanced[0]!.m).toBeCloseTo(54, 9); expect(a.balanced[0]!.h).toBeCloseTo(21.6, 9);
  });

  it('takes the wall foot\'s moment across into the couple, and leaves the moment along it', () => {
    // The strip along x: across is y, so mx (a shift along y) is the wall's, my stays the soil's.
    const strip = { ...newFooting(3, 30, 'M1', { cover: 0.05, foundingElevation: -3.3, soilProfileId: 1 }), kind: 'strip' as const, B: 5, L: 0.85, thickness: 0.8, eccentricityL: 0.27, supportedNodeIds: [31], balanced: { by: 'structure' as const } };
    const a = strapAdjust([strip], new Map([[30, { x: 0, y: 0 }], [31, { x: 5, y: 0 }]]), new Map([[30, r(-500, -300, 20, 7)], [31, r(-500, -300, -20, 0)]]));
    const c = a.reactions.get(30)!.factored[0]!;
    expect(c.mx).toBeCloseTo(0, 9); expect(c.my).toBe(7);
    // (1000 · 0,27 + 20 + 20) / 5 = 62 kN·m/m.
    expect(a.balanced[0]!.m).toBeCloseTo(62, 9);
  });
});
