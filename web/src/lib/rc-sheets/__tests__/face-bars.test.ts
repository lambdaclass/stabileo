import { describe, it, expect } from 'vitest';
import { faceBars, faceLayout } from '../bars';

describe('bars of a beam face', () => {
  it('puts the support bars in the first row beside the corner bars when they fit, symmetric about the middle', () => {
    const bars = faceBars([{ count: 2, dia: 12 }, { count: 3, dia: 16 }], 0.3, 0.025, 8);
    expect(new Set(bars.map((b) => b.row))).toEqual(new Set([0]));
    expect(bars.map((b) => b.dia)).toEqual([12, 16, 16, 16, 12]);
    const xs = bars.map((b) => b.x);
    xs.forEach((x, i) => expect(x + xs[xs.length - 1 - i]!).toBeCloseTo(0.3, 9));
    expect(faceLayout([{ count: 2, dia: 12 }, { count: 3, dia: 16 }], 0.3, 0.025, 8).fits).toBe(true);
  });

  it('only what does not fit goes to a second row, the largest bars kept in the first', () => {
    const bars = faceBars([{ count: 2, dia: 16 }, { count: 6, dia: 20 }], 0.25, 0.025, 8);
    const first = bars.filter((b) => b.row === 0), second = bars.filter((b) => b.row === 1);
    expect(first.length).toBeGreaterThan(2);
    expect(second.length).toBeGreaterThan(0);
    expect(first.length + second.length).toBe(8);
    expect(first[0]!.dia).toBe(16);
    expect(first.slice(1, -1).every((b) => b.dia === 20)).toBe(true);
    expect(Math.max(...first.map((b) => b.depth))).toBeLessThan(Math.min(...second.map((b) => b.depth)));
    expect(faceLayout([{ count: 2, dia: 16 }, { count: 6, dia: 20 }], 0.25, 0.025, 8).fits).toBe(true);
  });

  it('sits the steel nearer the face than one row per group did', () => {
    const one = faceLayout([{ count: 2, dia: 12 }, { count: 3, dia: 16 }], 0.3, 0.025, 8).centroidFromFace;
    expect(one).toBeCloseTo(0.025 + 0.008 + 0.016 / 2, 9);
  });
});
