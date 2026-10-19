/**
 * A base plate by hand: HEB 240 (d 240, bf 240, tf 17), plate 400 × 400 × 25 F-24, H-25 with
 * A2/A1 = 4 (√ = 2), four Ø20 anchors F-24 (Fu 370) at 50 mm from the edges.
 *
 *   Compression only, Pu = 1500 kN: fp = 1,5e6/160000 = 9,375 MPa against
 *   fpmax = 0,6·0,85·25·2 = 25,5 MPa. m = (400 − 228)/2 = 86, n = (400 − 192)/2 = 104,
 *   λn' = √(240·240)/4 = 60 → l = 104; t = 104·√(2·1,5e6/(0,9·240·160000)) = 30,6 mm > 25.
 *   With 150 kN·m on 300 kN: e = 500 mm > ecrit = 200 − 300/(2·10,2) = 185,3; f = 150,
 *   Y = 350 − √(350² − 2·300·650/10,2) = 350 − 290,28 = 59,72 mm, T = 10,2·59,72 − 300 = 309,1 kN
 *   on two anchors.
 */
import { describe, it, expect } from 'vitest';
import { checkBasePlate } from '../base-plate';
import { pryingCapacity } from '../prying';

const base = { column: { d: 240, bf: 240, tf: 17 }, plate: { N: 400, B: 400, t: 25, Fy: 240 }, concrete: { fc: 25 }, anchors: { count: 4, diameter: 20, Fu: 370, edge: 50 } };

describe('a base plate', () => {
  it('bears on concrete and bends as a cantilever under compression', () => {
    const r = checkBasePlate({ ...base, Pu: 1500 });
    const j8 = r.checks.find((c) => c.key === 'J.8')!, pl = r.checks.find((c) => c.key === 'placa')!;
    expect(j8.demand).toBeCloseTo(9.375, 6);
    expect(j8.capacity).toBeCloseTo(25.5, 6);
    expect(pl.demand).toBeCloseTo(30.6, 1);
    expect(pl.ratio).toBeGreaterThan(1);
  });
  it('puts the anchors in tension under a large moment', () => {
    const r = checkBasePlate({ ...base, Pu: 300, Mu: 150 });
    expect(r.bearingLengthMm).toBeCloseTo(59.72, 1);
    expect(r.anchorTensionKN).toBeCloseTo(309.1, 0);
    const a = r.checks.find((c) => c.key === 'J.9 tracción')!;
    // 0,75·0,75·370·314,16 = 65,4 kN per anchor against 154,6.
    expect(a.capacity).toBeCloseTo(65.38, 1);
    expect(a.demand).toBeCloseTo(154.6, 0);
  });
});

describe('prying on a T-stub', () => {
  it('needs no reduction when the plate is thicker than tc', () => {
    // B = 120 kN, p = 80, b = 40, a = 40, Ø20 (hole 22), Fu 370: b' = 30, tc = √(4·120000·30/(0,9·80·370)) = 23,2 mm.
    const r = pryingCapacity({ B: 120, t: 25, p: 80, b: 40, a: 40, db: 20, dh: 22, Fu: 370 });
    expect(r.tc).toBeCloseTo(23.2, 1);
    expect(r.perBolt).toBe(120);
    expect(pryingCapacity({ B: 120, t: 16, p: 80, b: 40, a: 40, db: 20, dh: 22, Fu: 370 }).perBolt).toBeLessThan(120);
  });
});
