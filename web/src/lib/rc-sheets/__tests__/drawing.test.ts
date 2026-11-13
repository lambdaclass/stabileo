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

  it('draws a column\'s bars on its faces and the crossties §25.7.2.3 asks for', () => {
    const d = columnSection(0.5, 0.5, 0.03, { corner: 16, nx: 2, dx: 16, ny: 2, dy: 16, tieDia: 6, tieSpacing: 0.15 });
    expect(d.bars).toHaveLength(12);
    expect(d.bars.every((b) => b.x > 0 && b.x < 0.5 && b.y > 0 && b.y < 0.5)).toBe(true);
    expect(d.ties).toHaveLength(4);
    expect(columnSection(0.5, 0.5, 0.03, { corner: 16, nx: 2, dx: 16, ny: 2, dy: 16, tieDia: 10, tieSpacing: 0.15 }).ties).toHaveLength(0);
  });
});
