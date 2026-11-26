/**
 * A twelve-column building held at all four property lines on a soil too weak for the plan the
 * lines allow: its mat is designed through and says the pressure it needs, and its strips too,
 * each in a few seconds at most; a sizing loop that cannot reach the soil must not keep redesigning.
 */
import { describe, it, expect } from 'vitest';
import { rulesFor } from '../codes';
import { groupDemand } from '../footing-choice';
import type { FootingAction, FootingContext, FootingDemand, FootingGroup } from '../footing-types';

const fmt = (v: number, d = 2) => v.toFixed(d);
const ctx: FootingContext = { fc: 30, fy: 420, cover: 0.055, sizing: 'minimum', diameters: [10, 12, 16, 20, 25] };
const xs = [0, 5.3, 10.7, 16], ys = [0, 5, 10];
const BUDGET_MS = 10_000;

const combos = (N: number, i: number): FootingAction[] => Array.from({ length: 17 }, (_, k) => ({
  combo: `U${k}`, N: N * (1.2 + 0.02 * (k % 5)), Mx: ((k * 7 + i) % 11) * 8 - 40, My: ((k * 5 + i) % 9) * 9 - 36, Vx: (k % 3) * 6 - 6, Vy: (k % 4) * 5 - 7,
}));

function columns(allowable: number): FootingDemand[] {
  let n = 0;
  return ys.flatMap((y, j) => xs.map((x, i) => {
    n++;
    const edge = i === 0 || i === xs.length - 1 || j === 0 || j === ys.length - 1;
    const N = edge ? (i === 0 || i === xs.length - 1) && (j === 0 || j === ys.length - 1) ? 700 : 1100 : 1850;
    const anchor: [number, number] = [i === 0 ? -1 : i === xs.length - 1 ? 1 : 0, j === 0 ? -1 : j === ys.length - 1 ? 1 : 0];
    return {
      key: `footing:n${n}`, name: `C${n}`, nodeId: n, at: { x, y, z: 0 }, column: { b: 0.4, h: 0.4, storey: 3 },
      service: { combo: 'D + L', N, Mx: 0, My: 0, Vx: 0, Vy: 0 }, lateralLeftOut: 0, combos: combos(N, n),
      soil: { name: '', allowable, presumed: true as const },
      ...(anchor[0] || anchor[1] ? { edge: { anchor, source: 'lines' as const, balance: 'strap' as const, partners: [] } } : {}),
    };
  }));
}

const timed = <T>(f: () => T): { value: T; ms: number } => { const t = performance.now(); const value = f(); return { value, ms: performance.now() - t }; };

describe('a weak soil under a building held at four property lines', () => {
  const row = rulesFor('cirsoc201-2025').footingRow;

  it('designs the mat through and says the allowable pressure it needs, in a few seconds', () => {
    const g: FootingGroup = { kind: 'mat', members: columns(60), reason: 'project' };
    const { value: mat, ms } = timed(() => row(groupDemand(g), ctx, undefined, fmt));
    expect(mat.group?.kind).toBe('mat');
    expect(mat.sizing.needs).toBeGreaterThan(60);
    expect(mat.verifications.some((v) => v.label === 'rcSheets.v.footNeedsSoil')).toBe(true);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('designs a strip along a line, held by its ties, as wide as the soil asks, in a few seconds', () => {
    const line = columns(60).filter((c) => c.at.y === 0);
    const g: FootingGroup = { kind: 'strip', members: line, axis: 'x', reason: 'project' };
    const { value: strip, ms } = timed(() => row(groupDemand(g), ctx, undefined, fmt));
    expect(strip.group?.kind).toBe('strip');
    expect(strip.bearing!.ok || (strip.sizing.needs ?? 0) > 60).toBe(true);
    expect(ms).toBeLessThan(BUDGET_MS);
  });
});
