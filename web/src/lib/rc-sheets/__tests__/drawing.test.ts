import { describe, it, expect } from 'vitest';
import { beamSection, columnSection } from '../drawing';
import { faceLayout } from '../bars';

describe('section drawings', () => {
  it('places a beam\'s bars inside the stirrup, layer by layer, at the depths the design uses', () => {
    const top = [{ count: 3, dia: 16 }], bottom = [{ count: 4, dia: 20 }, { count: 2, dia: 20 }];
    const d = beamSection(0.3, 0.6, 0.025, top, bottom, { dia: 8, legs: 4, spacing: 0.15 });
    expect(d.bars).toHaveLength(9);
    const bot = d.bars.filter((b) => b.y < 0.3), area = (b: { dia: number }) => b.dia ** 2;
    const centroid = bot.reduce((s, b) => s + area(b) * b.y, 0) / bot.reduce((s, b) => s + area(b), 0);
    expect(centroid).toBeCloseTo(faceLayout(bottom, 0.3, 0.025, 8).centroidFromFace, 6);
    expect(Math.min(...d.bars.map((b) => b.x - b.dia / 2000))).toBeCloseTo(0.025 + 0.008, 6);
    expect(Math.max(...d.bars.map((b) => b.y + b.dia / 2000))).toBeCloseTo(0.6 - 0.033, 6);
    expect(d.ties).toHaveLength(2);
  });

  it('draws a column\'s bars on its faces and the crossties §25.7.2.3 asks for, one per pair of facing bars held', () => {
    const d = columnSection(0.5, 0.5, 0.03, { corner: 16, nx: 2, dx: 16, ny: 2, dy: 16, tieDia: 6, tieSpacing: 0.15 });
    expect(d.bars).toHaveLength(12);
    expect(d.bars.every((b) => b.x > 0 && b.x < 0.5 && b.y > 0 && b.y < 0.5)).toBe(true);
    expect(d.crossties).toHaveLength(4);
    expect(columnSection(0.5, 0.5, 0.03, { corner: 16, nx: 3, dx: 16, ny: 3, dy: 16, tieDia: 10, tieSpacing: 0.15 }).crossties).toHaveLength(2);
  });

  it('holds every corner and alternate bar whatever the tie (§25.7.2.3(a)): a thicker tie does not take crossties away', () => {
    const at = (n: number, tie: number) => columnSection(0.5, 0.5, 0.03, { corner: 16, nx: n, dx: 16, ny: n, dy: 16, tieDia: tie, tieSpacing: 0.15 }).crossties!.length;
    expect([at(3, 6), at(3, 10)]).toEqual([2, 2]);
    expect([at(2, 6), at(2, 10)]).toEqual([4, 4]);
    expect([at(5, 6), at(5, 10)].every((x) => x >= 4)).toBe(true);
  });

  it('draws the hoop closed by two 135° hooks into the core at one corner, and each crosstie between the bars it engages with a 135° and a 90° hook alternating', () => {
    const d = columnSection(0.5, 0.5, 0.03, { corner: 16, nx: 5, dx: 16, ny: 5, dy: 16, tieDia: 8, tieSpacing: 0.1 });
    const hoop = d.hoop!;
    expect(hoop.pts).toHaveLength(7);
    const inCore = ([x, y]: [number, number]) => x > 0.03 + 0.008 && x < 0.5 - 0.038 && y > 0.038 && y < 0.5 - 0.038;
    expect(inCore(hoop.pts[0]!) && inCore(hoop.pts[6]!)).toBe(true);
    expect(hoop.w).toBeCloseTo(0.5 - 0.06 - 0.008, 9);
    const across = d.crossties!.filter((t) => t.across === 'h');
    expect(across.map((t) => t.hooks)).toEqual([[135, 90], [90, 135]]);
    const xs = across.map((t) => t.pts[1]![0]);
    expect(xs[0]! + xs[1]!).toBeCloseTo(0.5, 9);
    for (const t of across) {
      const engaged = d.bars.filter((b) => Math.abs(b.x - t.pts[1]![0]) < 1e-9);
      expect(engaged.map((b) => b.y).sort()).toHaveLength(2);
      expect(t.pts[1]![1]).toBeLessThan(Math.min(...engaged.map((b) => b.y)));
      expect(t.pts[2]![1]).toBeGreaterThan(Math.max(...engaged.map((b) => b.y)));
    }
  });
});
