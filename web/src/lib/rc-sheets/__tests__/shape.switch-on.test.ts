import { describe, it, expect } from 'vitest';
import { bendAngles, bentBar, closedHoop, crankedBar, crossTie, developedLength, hookLeg, hookedStraight, legLengths, planarLegs, shapeKey, shapeWeight, uBar, type BarShape } from '../shape';

describe('bar shapes', () => {
  it('a straight bar is as long as its two ends are apart', () => {
    const s = hookedStraight(0, 5, 0.04, 16, 0.096, [false, false], 1, 0.192);
    expect(developedLength(s)).toBeCloseTo(5, 9);
    expect(bendAngles(s)).toEqual([]);
  });

  it('a 90° hook adds its extension and the quarter arc, less the corner the arc rounds', () => {
    const dia = 16, mandrel = 0.096, ext = 0.192;
    const r = (mandrel + dia / 1000) / 2;
    const s = hookedStraight(0, 2, 0.5, dia, mandrel, [false, true], -1, ext);
    expect(legLengths(s)).toEqual([2, r + ext].map((x) => expect.closeTo(x, 9)));
    expect(bendAngles(s)[0]).toBeCloseTo(Math.PI / 2, 9);
    expect(developedLength(s)).toBeCloseTo((2 - r) + (Math.PI / 2) * r + ext, 9);
    expect(s.pts[s.pts.length - 1]![1]).toBeLessThan(0.5);
  });

  it('weighs 7850 kg/m³ of its developed length', () => {
    const s = hookedStraight(0, 10, 0, 20, 0.12, [false, false], 1, 0.24);
    expect(shapeWeight(s, 3)).toBeCloseTo(3 * Math.PI * 0.01 ** 2 * 10 * 7850, 6);
  });

  it('a bent-up bar rises at its angle over a run of the rise divided by its tangent', () => {
    const s = bentBar({ x0: 0, x1: 6, yLow: 0.05, yHigh: 0.55, riseAt: 2, angleDeg: 45, rising: true, dia: 16, mandrel: 0.096, hooks: [false, false], extension: 0.192 });
    expect(s.pts).toEqual([[0, 0.05], [2, 0.05], [expect.closeTo(2.5, 9), 0.55], [6, 0.55]]);
    expect(bendAngles(s).map((a) => a * 180 / Math.PI)).toEqual([expect.closeTo(45, 9), expect.closeTo(45, 9)]);
    expect(developedLength(s)).toBeLessThan(2 + 0.5 * Math.SQRT2 + 3.5);
  });

  const deg = (s: BarShape) => bendAngles(s).map((a) => Math.round((a * 180) / Math.PI));

  it('a closed hoop: three 90° corners and two 135° hooks, cut to the rounded perimeter plus two hook arcs and tails', () => {
    const w = 0.3, h = 0.5, dia = 8, mandrel = 0.032, ext = 0.075;
    const r = (mandrel + dia / 1000) / 2;
    const s = closedHoop(w, h, dia, mandrel, ext);
    expect(deg(s)).toEqual([135, 90, 90, 90, 135]);
    expect(developedLength(s)).toBeCloseTo(2 * (w + h) - 8 * r + 3 * Math.PI * r + 2 * ext, 9);
    // 30 × 50 cm by hand: 1.6 − 0.16 + 0.1885 + 0.15.
    expect(developedLength(s)).toBeCloseTo(1.7785, 4);
  });

  it('a 135° hook\'s leg runs r·tan 67.5° to its corner, then its tail', () => {
    expect(hookLeg(135, 10, 0.04, 0.075)).toBeCloseTo(0.025 * Math.tan((67.5 * Math.PI) / 180) + 0.075, 9);
    expect(hookLeg(90, 10, 0.04, 0.12)).toBeCloseTo(0.025 + 0.12, 9);
  });

  it('a cross tie: a straight body, a 135° hook and a 90° hook turned the same way', () => {
    const len = 0.4, dia = 8, mandrel = 0.032, r = 0.02;
    const s = crossTie(len, dia, mandrel, [135, 90], [0.075, 0.075]);
    expect(deg(s)).toEqual([135, 90]);
    expect(Math.sign(planarLegs(s)[0]!.w)).toBe(Math.sign(planarLegs(s)[1]!.w));
    const t135 = r * Math.tan((67.5 * Math.PI) / 180);
    expect(developedLength(s)).toBeCloseTo(len - t135 - r + (3 * Math.PI * r) / 4 + (Math.PI * r) / 2 + 0.15, 9);
  });

  it('a U-bar: its base and two legs less the two corners its bends round', () => {
    const s = uBar(0.15, 0.6, 10, 0.06);
    const r = 0.035;
    expect(deg(s)).toEqual([90, 90]);
    expect(developedLength(s)).toBeCloseTo(0.15 + 1.2 - 2 * (2 * r - (Math.PI / 2) * r), 9);
  });

  it('a cranked bar steps in by its offset over six times it, then runs on for the lap', () => {
    const s = crankedBar(3, 0.05, 0.6, 16, 0.096);
    expect(s.pts).toEqual([[0, 0], [expect.closeTo(2.7, 9), 0], [3, 0.05], [3.6, 0.05]]);
    const t = Math.atan(1 / 6), r = 0.056;
    expect(deg(s)).toEqual([9, 9]);
    expect(planarLegs(s)[0]!.w).toBeCloseTo(-planarLegs(s)[1]!.w, 9);
    expect(developedLength(s)).toBeCloseTo(2.7 + Math.hypot(0.3, 0.05) + 0.6 - 2 * (2 * r * Math.tan(t / 2) - r * t), 9);
  });

  it('a bar is the same piece whichever end comes first and whichever face is up, and another piece at another length or bend', () => {
    const a = hookedStraight(0, 4, 0, 16, 0.096, [true, false], 1, 0.192);
    const b = hookedStraight(10, 14, 0.5, 16, 0.096, [false, true], -1, 0.192);
    expect(shapeKey(a)).toBe(shapeKey(b));
    expect(shapeKey(a)).not.toBe(shapeKey(hookedStraight(0, 4.01, 0, 16, 0.096, [true, false], 1, 0.192)));
    expect(shapeKey(a)).not.toBe(shapeKey({ ...a, dia: 20 }));
    const u = { pts: [[0, 1], [0, 0], [3, 0], [3, 1]] as Array<[number, number]>, mandrel: 0.06, dia: 10 };
    const z = { pts: [[0, 1], [0, 0], [3, 0], [3, -1]] as Array<[number, number]>, mandrel: 0.06, dia: 10 };
    expect(shapeKey(u)).not.toBe(shapeKey(z));
  });
});
