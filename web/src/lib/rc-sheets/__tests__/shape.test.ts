import { describe, it, expect } from 'vitest';
import { bendAngles, bentBar, developedLength, hookedStraight, legLengths, shapeWeight } from '../shape';

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
});
