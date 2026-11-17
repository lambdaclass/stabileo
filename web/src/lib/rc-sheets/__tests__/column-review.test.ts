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

describe('a column\'s splice and shear', () => {
  const short = (cases: ColumnDemand['cases']): ColumnDemand => ({ key: 'column:1:1', name: 'C1', b: 0.4, h: 0.4, length: 3, lu: 2.5, psiTop: 1, psiBot: 1, cases });

  it('takes a tension splice where bending pulls a bar, however much the column is compressed', () => {
    const squeezed = columnRow(short([{ combo: 'U', pu: 900, puMin: 880, mxTop: 5, mxBot: 5, myTop: 0, myBot: 0 }]), ctx, bars, fmt, { fromBelow: true });
    expect(squeezed.lap!.tension).toBe(false);
    const bent = columnRow(short([{ combo: 'U', pu: 900, puMin: 880, mxTop: 150, mxBot: 150, myTop: 0, myBot: 0 }]), ctx, bars, fmt, { fromBelow: true });
    expect(bent.lap!.tension).toBe(true);
  });

  it('reads its concrete\'s shear strength with the axial tension of an uplift combination', () => {
    const at = (puMin: number) => columnRow(short([{ combo: 'U', pu: puMin, puMin, mxTop: 5, mxBot: 5, myTop: 0, myBot: 0, vx: 60, vy: 0 }]), ctx, bars, fmt);
    expect(at(-200).checks.shearX).toBeGreaterThan(at(0).checks.shearX + 1e-3);
  });

  it('fails a lap longer than the room its code gives it in the storey, without shortening it', async () => {
    const { withLapFit, columnTieLayout } = await import('../column-ties');
    const row = columnRow(short([{ combo: 'U', pu: 400, puMin: 380, mxTop: 20, mxBot: 20, myTop: 0, myBot: 0 }]), ctx, bars, fmt, { fromBelow: true });
    const tight = { ...row, demand: { ...row.demand, lu: row.lap!.length * 0.8 } };
    const r = withLapFit(tight, 'cirsoc201-2025', fmt);
    expect(r.verifications.at(-1)).toMatchObject({ label: 'rcSheets.v.colLapFit', ok: false });
    expect(r.status).toBe('fail');
    expect(columnTieLayout(tight, 'cirsoc201-2025').lap!.fits).toBe(false);
    expect(withLapFit(row, 'cirsoc201-2025', fmt).verifications.at(-1)!.ok).toBe(true);
  });
});
