import { describe, it, expect } from 'vitest';
import { summed, type Placed } from '../footing-group';
import { upliftHolds, upliftOf } from '../footing-mechanics';
import { dowelArea } from '../footing-design';
import { barArea } from '../bars';
import type { FootingDemand } from '../footing-types';

const placed = (x: number, y: number, act: { N: number; Mx: number; My: number; Vx: number; Vy: number }): Placed => ({
  demand: { key: `f${x}`, service: { combo: 'D', ...act } } as unknown as FootingDemand, x, y, b: 0.4, h: 0.4, anchor: [0, 0],
});

describe('a strip held across by ties', () => {
  it('leaves the shear across, which the ties take with the moment, out of what the soil sees', () => {
    const cols = [placed(0, 0.3, { N: 500, Mx: 10, My: 20, Vx: 30, Vy: 40 }), placed(4, 0.3, { N: 600, Mx: 5, My: 8, Vx: 12, Vy: 16 })];
    const across = summed(cols, (d) => d.service, 'D', 'y')!;
    expect(across.Vy).toBe(0);
    expect(across.Mx).toBe(0);
    expect(across.Vx).toBe(42);
    const free = summed(cols, (d) => d.service, 'D')!;
    expect(free.Vy).toBe(56);
  });
});

describe('a footing some combination pulls up', () => {
  it('never passes once one combination has no axial force, whatever pulls come after it', () => {
    const u = upliftOf([{ combo: 'W', N: NaN }, { combo: 'X', N: -5 }], 100)!;
    expect(u.combo).toBe('W');
    expect(upliftHolds(u)).toBe(false);
  });
});

describe('a group\'s dowels', () => {
  it('count each dowel under its own bar where a pier mixes diameters', () => {
    const bars = { count: 10, dia: 16, tension: false, area: 4 * barArea(16) + 6 * barArea(12), at: [] as never[] };
    bars.at = Array.from({ length: 10 }, () => ({})) as never;
    expect(dowelArea(bars as never, { count: 10, dia: 16 })).toBeCloseTo(4 * barArea(16) + 6 * barArea(12), 9);
    expect(dowelArea(bars as never, { count: 10, dia: 16 })).toBeLessThan(10 * barArea(16));
  });
});
