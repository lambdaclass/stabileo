import { describe, it, expect } from 'vitest';
import { rulesFor } from '../codes';
import { makeFmt } from '../format';
import type { FootingContext, FootingDemand } from '../footing-types';

const fmt = makeFmt('.');
const footingRow = rulesFor('cirsoc201-2025').footingRow;
const ctx: FootingContext = { fc: 25, fy: 420, cover: 0.05, sizing: 'full', diameters: [10, 12, 16, 20, 25], preferred: { x: 12, y: 12 }, columnBars: { count: 4, dia: 16, tension: false }, second: { columnBars: { count: 4, dia: 16, tension: false } } };
const col = (key: string, name: string, x: number, N: number, pulls: Array<{ combo: string; N: number }> = []): FootingDemand => ({
  key, name, nodeId: Number(key.slice(9)), at: { x, y: 0, z: 0 }, column: { b: 0.3, h: 0.3 },
  service: { combo: 'D + L', N, Mx: 0, My: 0, Vx: 0, Vy: 0 }, lateralLeftOut: 0,
  combos: [{ combo: 'U', N: 1.4 * N, Mx: 0, My: 0, Vx: 0, Vy: 0 }, ...pulls.map((p) => ({ ...p, Mx: 0, My: 0, Vx: 0, Vy: 0 }))],
  soil: { name: '', allowable: 150, presumed: true },
});
const uplift = (r: ReturnType<typeof footingRow>) => r.verifications.find((v) => v.label === 'rcSheets.v.footUplift');

describe('a footing a combination pulls up', () => {
  it('fails when the pull outweighs 0,9 of the footing and the fill over it, and names the combination', () => {
    const r = footingRow(col('footing:n1', 'C1', 0, 300, [{ combo: '0,9 D + 1,6 W', N: -900 }]), ctx, undefined, fmt);
    const v = uplift(r)!;
    expect(v.ok).toBe(false);
    expect(v.demand).toContain('900 kN');
    expect(v.demand).toContain('0,9 D + 1,6 W');
    expect(v.ratio).toBeGreaterThan(1);
    expect(v.capacity).toMatch(/^0.9 G = /);
    expect(r.status).not.toBe('ok');
  });

  it('holds a pull its weight outweighs', () => {
    const r = footingRow(col('footing:n1', 'C1', 0, 300, [{ combo: '0,9 D + 1,6 W', N: -5 }]), ctx, undefined, fmt);
    expect(uplift(r)!.ok).toBe(true);
  });

  it('never passes a combination whose axial force is missing', () => {
    const r = footingRow(col('footing:n1', 'C1', 0, 300, [{ combo: 'W', N: NaN }]), ctx, undefined, fmt);
    expect(uplift(r)!.ok).toBe(false);
    expect(uplift(r)!.demand).toContain('W');
  });

  it('says nothing of uplift where every combination presses the footing', () => {
    expect(uplift(footingRow(col('footing:n1', 'C1', 0, 300), ctx, undefined, fmt))).toBeUndefined();
  });
});

describe('a combined footing one of whose columns pulls up', () => {
  const pair = (pull: number) => ({ ...col('footing:n1', 'C1', 0, 400, [{ combo: 'W', N: 900 }]), carried: col('footing:n2', 'C2', 3, 600, [{ combo: 'W', N: pull }]) });

  it('is still designed for that combination while the two together press it', () => {
    const r = footingRow(pair(-200), ctx, undefined, fmt);
    expect(r.combined).toBeDefined();
    expect(r.combos?.rows.some((x) => x.combo === 'W')).toBe(true);
    expect(uplift(r)).toBeUndefined();
  });

  it('fails when the two together pull it up beyond its weight', () => {
    const r = footingRow(pair(-3000), ctx, undefined, fmt);
    expect(uplift(r)!.ok).toBe(false);
    expect(uplift(r)!.demand).toMatch(/^2[.,]?100 kN/);
  });
});
