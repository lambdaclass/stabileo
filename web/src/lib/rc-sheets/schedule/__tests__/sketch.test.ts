import { describe, it, expect } from 'vitest';
import { closedHoop, developedLength, hookedStraight } from '../../shape';
import { fitSketch, labelledLegs, sketchOf } from '../sketch';

describe('a schedule sketch of a bar shape', () => {
  it('its legs run between the corners; their straight runs and the arcs make up the cut length', () => {
    const s = hookedStraight(0, 3, 0, 16, 0.096, [true, true], 1, 0.192);
    const d = sketchOf(s);
    expect(d.legs.map((l) => l.lengthM)).toEqual([expect.closeTo(0.248, 9), 3, expect.closeTo(0.248, 9)]);
    expect(d.legs.map((l) => l.horizontal)).toEqual([false, true, false]);
    expect(d.straightM + d.bendsM).toBeCloseTo(developedLength(s), 9);
  });

  it('a hoop writes each of its sides once, and the sketch fits its box', () => {
    const d = sketchOf(closedHoop(0.3, 0.3, 8, 0.032, 0.075));
    expect(labelledLegs(d).filter((l) => Math.round(l.lengthM * 1000) === 300)).toHaveLength(2);
    const fit = fitSketch(d, { w: 100, h: 50, pad: 5 });
    const xy = [...fit.d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(xy.every(([x, y]) => x! >= 5 - 1e-6 && x! <= 95 + 1e-6 && y! >= 5 - 1e-6 && y! <= 45 + 1e-6)).toBe(true);
  });

  it('with its labels\' size, writes each on the side away from the bar and stretches a hoop to read', () => {
    const d = sketchOf(closedHoop(0.23, 0.61, 8, 0.032, 0.075));
    const fit = fitSketch(d, { w: 190, h: 50, pad: 3, text: { h: 11, char: 6.6 } });
    const xy = [...fit.d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
    const w = Math.max(...xy.map((p) => p[0])) - Math.min(...xy.map((p) => p[0])), h = Math.max(...xy.map((p) => p[1])) - Math.min(...xy.map((p) => p[1]));
    expect(w / h).toBeGreaterThan((0.23 / 0.61) * 1.2);
    expect(h).toBeGreaterThan(14);
    for (const l of fit.legs) expect(['above', 'below', 'left', 'right']).toContain(l.side);
    expect(fit.legs.every((l) => (l.horizontal ? l.side === 'above' || l.side === 'below' : l.side === 'left' || l.side === 'right'))).toBe(true);
    const straight = fitSketch(sketchOf(hookedStraight(0, 10, 0, 16, 0.096, [true, true], 1, 0.192)), { w: 190, h: 50, pad: 3, text: { h: 11, char: 6.6 } });
    const ys = [...straight.d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((m) => Number(m[2]));
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(5);
  });
});
