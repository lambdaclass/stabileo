/**
 * The bars that join a column storey to what is below it: the lap is designed (§25.5.5.1 in
 * compression, a third longer under 21 MPa; a class B tension lap where a bar is in tension,
 * never shorter than the compression one; tension under chapter 18), the bottom storey stands on
 * its support with nothing lapped, and the bars from below are cranked in at 1:6 by one bar's
 * diameter so they lap beside the bars above, which stand straight at the faces.
 */
import { describe, it, expect } from 'vitest';
import { columnRow, columnSplice, tensionLap, type ColumnDemand, type ColumnRow } from '../column-row';
import { CRANK_SLOPE, inwardOf, lapOffset } from '../column-stack';
import { columnBarPieces, columnStorey, lapStart, storeyBars, storeyRun } from '../column-run';
import { compressionLapMm } from '../../codes/cirsoc201/anchorage';
import { rulesFor } from '../codes';
import { makeFmt } from '../format';

const f = makeFmt('.');
const ctx = { mat: { fc: 25, fy: 420 }, cover: 0.025, tieDia: 8, diameters: [12, 16, 20, 25] };
const R = rulesFor('cirsoc201-2025').bends;
const storey = (k: number, b: number, pu: number, m: number): ColumnDemand => ({
  key: `column:1:${k}`, name: 'C1', level: `N${k}`, b, h: b, length: 3, lu: 2.5, psiTop: 1, psiBot: 1,
  cases: [{ combo: 'U', pu, puMin: pu * 0.95, mxTop: m, mxBot: -m, myTop: m / 4, myBot: -m / 4, vx: 10, vy: 5 }],
  joints: { bottom: k === 0 ? 0 : 0.5, top: 0.5 },
});

describe('the lap of a column\'s bars', () => {
  it('in compression is §25.5.5.1\'s, a third longer under 21 MPa', () => {
    expect(compressionLapMm(420, 16)).toBeCloseTo(0.071 * 420 * 16, 9);
    expect(compressionLapMm(420, 16, 20)).toBeCloseTo((4 / 3) * 0.071 * 420 * 16, 9);
    expect(compressionLapMm(420, 8)).toBe(300);
    expect(columnSplice(ctx, 16, false)).toEqual({ length: expect.closeTo(0.47712, 9), tension: false });
    expect(columnSplice({ ...ctx, mat: { fc: 20, fy: 420 } }, 16, false).length).toBeCloseTo(0.63616, 9);
  });

  it('in tension is a class B lap, never shorter than the compression lap the other combinations ask', () => {
    const t = columnSplice(ctx, 16, true), c = columnSplice(ctx, 16, false);
    expect(t.tension).toBe(true);
    expect(t.length).toBeCloseTo(Math.max(tensionLap(ctx.mat, 16), c.length), 9);
    expect(columnSplice(ctx, 25, true).length).toBeCloseTo(tensionLap(ctx.mat, 25), 9);
    expect(columnSplice(ctx, 25, true).length).toBeGreaterThan(columnSplice(ctx, 25, false).length);
  });

  it('is designed from what the storey\'s bars take: compression where every bar stays compressed, tension where one pulls, and tension under chapter 18', () => {
    const own = { corner: 16, nx: 1, dx: 16, ny: 1, dy: 16, tieDia: 8, tieSpacing: 0.15 };
    const squeezed = columnRow(storey(1, 0.4, 1500, 5), ctx, own, f, { fromBelow: true });
    const bent = columnRow(storey(1, 0.4, 100, 120), ctx, own, f, { fromBelow: true });
    expect(squeezed.lap).toEqual({ length: expect.closeTo(columnSplice(ctx, 16, false).length, 9), tension: false });
    expect(bent.lap!.tension).toBe(true);
    expect(bent.verifications.find((v) => v.label === 'rcSheets.v.colSpliceT')!.clause).toBe('§25.5.2');
    const seismic = columnRow(storey(1, 0.4, 1500, 5), { ...ctx, seismic: { overstrength: 1 } } as never, own, f, { fromBelow: true });
    expect(seismic.lap!.tension).toBe(true);
  });

  it('of the bottom storey is none: it stands on its support with nothing lapped', () => {
    const own = { corner: 16, nx: 1, dx: 16, ny: 1, dy: 16, tieDia: 8, tieSpacing: 0.15 };
    const bottom = columnRow(storey(0, 0.4, 1500, 5), ctx, own, f);
    expect(bottom.lap).toBeUndefined();
    expect(bottom.verifications.map((v) => v.label)).not.toContain('rcSheets.v.colSpliceC');
  });
});

describe('the crank of the bars from below', () => {
  const own = { corner: 20, nx: 1, dx: 16, ny: 1, dy: 16, tieDia: 8, tieSpacing: 0.15 };
  const low = columnRow(storey(0, 0.4, 1500, 5), ctx, own, f);
  const high = (b: number): ColumnRow => columnRow(storey(1, b, 1000, 5), ctx, own, f, { fromBelow: true, offset: (0.4 - b) / 2, belowDia: 20 });

  it('turns a corner along its diagonal, a face bar square to its face, by the larger bar\'s diameter', () => {
    expect(lapOffset(16, 20)).toBe(0.02);
    expect(inwardOf({ x: 0.15, y: -0.15, row: 'corner' }, { b: 0.4, h: 0.4 })).toEqual([expect.closeTo(-Math.SQRT1_2, 9), expect.closeTo(Math.SQRT1_2, 9)]);
    expect(inwardOf({ x: 0, y: 0.15, row: 'b' }, { b: 0.4, h: 0.4 })).toEqual([0, -1]);
    expect(inwardOf({ x: -0.15, y: 0.02, row: 'h' }, { b: 0.4, h: 0.4 })).toEqual([1, 0]);
  });

  it('runs a storey of the same section from its lap start up through the joint, cranked in at 1:6 to end where the lap above starts, then that lap on', () => {
    const up = high(0.4), rows = [low, up], s = columnStorey(rows, low);
    expect(s).toMatchObject({ cranked: true, hooked: false, dowels: false });
    const run = storeyRun(low, s, 'cirsoc201-2025');
    expect(run.from).toBe(0);
    expect(run.crankAt).toBeCloseTo(3 + 0.25, 9);
    expect(run.top).toBeCloseTo(3 + 0.25 + up.lap!.length, 9);
    const bars = storeyBars(low, s);
    for (const { bar, e, toward } of bars) {
      expect(e).toBeCloseTo(lapOffset(bar.dia, bar.dia), 3);
      const n = inwardOf(bar, low);
      expect(toward[0] * n[0] + toward[1] * n[1]).toBeCloseTo(1, 6);
      const [pc] = columnBarPieces(run, bar.dia, e, R);
      expect(pc!.kind).toBe('cranked');
      const [a, b, c, d] = pc!.shape.pts;
      expect(a).toEqual([0, 0]);
      expect((c![0] - b![0]) * CRANK_SLOPE).toBeCloseTo(c![1] - b![1], 9);
      expect(c![0]).toBeCloseTo(run.crankAt! - run.from, 9);
      expect(d![0] - c![0]).toBeCloseTo(up.lap!.length, 9);
    }
  });

  it('takes the step of the faces as well, ending at the joint\'s face; from 75 mm on the bars hook and dowels lap in', () => {
    const up = high(0.35), s = columnStorey([low, up], low);
    const corner = storeyBars(low, s).find((x) => x.bar.row === 'corner')!;
    expect(corner.e).toBeCloseTo(Math.hypot(0.025, 0.025) + 0.02, 3);
    expect(storeyRun(low, s, 'cirsoc201-2025').crankAt).toBeCloseTo(3 + 0.25, 9);
    const far = high(0.25), t = columnStorey([low, far], low);
    expect(t).toMatchObject({ cranked: false, hooked: true });
    expect(columnStorey([low, far], far).dowels).toBe(true);
  });

  it('starts the bottom storey\'s bars at its node, and a storey\'s above at its lap, under chapter 18 at the middle half', () => {
    expect(lapStart(low, 'cirsoc201-2025')).toBe(0);
    const up = high(0.4), confined = { ...up, confinement: { lo: 0.5, so: 0.1 } };
    expect(lapStart(confined, 'aci318-19')).toBeCloseTo(0.5 / 2 + 2.5 / 2 - up.lap!.length / 2, 9);
  });
});
