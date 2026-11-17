import { describe, it, expect } from 'vitest';
import { columnRow, type ColumnDemand } from '../column-row';
import { makeFmt } from '../format';
import type { ColumnAdopted } from '../types';

const fmt = makeFmt('.');
const ctx = { mat: { fc: 25, fy: 420 }, cover: 0.025, tieDia: 6, diameters: [12, 16, 20, 25] };
const bars: ColumnAdopted = { corner: 16, nx: 1, dx: 16, ny: 1, dy: 16, tieDia: 6, tieSpacing: 0.15 };
const slender = (puMin: number): ColumnDemand => ({
  key: 'column:1:0', name: 'C1', b: 0.3, h: 0.3, length: 6, lu: 6, psiTop: 1, psiBot: 1,
  cases: [{ combo: 'U', pu: 200, puMin, mxTop: 40, mxBot: 40, myTop: 0, myBot: 0, vx: 5, vy: 0 }],
});

describe('a slender column', () => {
  it('is checked at the lower axial force of its ends as well, where the magnified moment finds less capacity', () => {
    const both = columnRow(slender(200), ctx, bars, fmt);
    const low = columnRow(slender(0), ctx, bars, fmt);
    expect(both.steps.some((g) => g.steps.some((s) => s.formula === '(Pu, δ·Mx, δ·My)'))).toBe(true);
    expect(low.checks.ratio).toBeGreaterThan(both.checks.ratio + 0.05);
  });
});

describe('a slender TS 500 column', () => {
  it('is checked at the lower axial force of its ends as well', async () => {
    const { columnRow: ts500Column } = await import('../ts500/column');
    const both = ts500Column(slender(200), ctx, bars, fmt);
    const low = ts500Column(slender(0), ctx, bars, fmt);
    expect(low.checks.ratio).toBeGreaterThan(both.checks.ratio + 0.05);
  });
});
