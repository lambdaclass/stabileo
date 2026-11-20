/**
 * Footings proposed over each other: first given the room between them, long side toward the free
 * side, while that stays within 2,5 : 1; past that, or with neighbours both ways, combined.
 */
import { describe, it, expect } from 'vitest';
import { layFootings } from '../footing-layout';
import type { FootingDemand, FootingRow } from '../footing-types';
import type { PlanCap } from '../footing-design';

const row = (n: number, x: number, y: number, B: number, L = B): FootingRow => ({
  key: `footing:n${n}`, name: `C${n}`, B, L, h: 0.5, ex: 0, ey: 0, isAdopted: false, status: 'ok', sizing: { mode: 'full', reached: true, from: 'loads' },
  demand: { key: `footing:n${n}`, name: `C${n}`, nodeId: n, at: { x, y, z: 0 } } as FootingDemand,
} as FootingRow);

/** A footing given room keeps its area: the capped side short, the other long. */
const capped = (area: Record<string, number>) => (d: FootingDemand, cap: PlanCap): FootingRow => {
  const a = area[d.key]!, s = cap.max, o = Math.ceil((a / s) * 20) / 20;
  const r = row(d.nodeId, d.at.x, d.at.y, cap.axis === 'x' ? s : o, cap.axis === 'x' ? o : s);
  return r;
};

describe('footings over each other', () => {
  it('grow along the free side when the room between them leaves a fair rectangle', () => {
    const rows = [row(1, 0, 0, 2.6), row(2, 2.5, 0, 2.6)];
    const out = layFootings(rows, { capped: capped({ 'footing:n1': 6.76, 'footing:n2': 6.76 }), combine: () => { throw new Error('combined'); } });
    expect(out.map((r) => [r.B, r.L])).toEqual([[2.4, 2.85], [2.4, 2.85]]);
  });

  it('share a combined footing when the room is too short for a fair rectangle', () => {
    const rows = [row(1, 0, 0, 2.6), row(2, 1.2, 0, 2.6), row(3, 9, 0, 2)];
    let pair: string[] = [];
    const out = layFootings(rows, { capped: capped({ 'footing:n1': 6.76, 'footing:n2': 6.76 }), combine: (a, b) => { pair = [a.key, b.key]; return { ...row(1, 0, 0, 4, 2.2), name: 'C1 + C2' }; } });
    expect(pair).toEqual(['footing:n1', 'footing:n2']);
    expect(out.map((r) => r.name)).toEqual(['C1 + C2', 'C3']);
  });

  it('leave footings the engineer adopted as they are', () => {
    const rows = [{ ...row(1, 0, 0, 2.6), isAdopted: true }, row(2, 1.2, 0, 2.6)];
    const out = layFootings(rows, { capped: capped({ 'footing:n2': 6.76 }), combine: () => { throw new Error('combined'); } });
    expect(out).toEqual(rows);
  });
});
