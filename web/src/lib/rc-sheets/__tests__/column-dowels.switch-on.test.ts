/**
 * The bars that join a column storey to what is below it: the lap is designed (§25.5.5.1 in
 * compression, a third longer under 21 MPa; a class B tension lap where a bar is in tension,
 * never shorter than the compression one; tension under chapter 18), the bottom storey laps with
 * its footing's dowels as any storey with the one below, and the bars from below and the dowels
 * are cranked in at 1:6 by one bar's diameter so they lap beside the bars above, which stand
 * straight at the faces.
 */
import { describe, it, expect } from 'vitest';
import { columnRow, columnSplice, tensionLap, type ColumnDemand, type ColumnRow } from '../column-row';
import { CRANK_SLOPE, inwardOf, lapOffset } from '../column-stack';
import { columnBarPieces, columnStorey, lapStart, storeyBars, storeyRun } from '../column-run';
import { compressionLapMm } from '../../codes/cirsoc201/anchorage';
import { footingDemands, type FootingDemandInput } from '../footing-demands';
import { footingDetail } from '../footing-detail';
import { scheduleElements } from '../schedule/pieces';
import { rulesFor } from '../codes';
import { makeFmt } from '../format';
import { developedLength } from '../shape';
import type { FootingContext } from '../footing-types';

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

  it('of the bottom storey on a footing is its lap with the dowels, checked as any storey\'s', () => {
    const own = { corner: 16, nx: 1, dx: 16, ny: 1, dy: 16, tieDia: 8, tieSpacing: 0.15 };
    const bottom = columnRow(storey(0, 0.4, 1500, 5), ctx, own, f, { fromBelow: true, onFooting: true });
    expect(bottom.onFooting).toBe(true);
    expect(bottom.lap!.length).toBeCloseTo(columnSplice(ctx, 16, false).length, 9);
    expect(bottom.verifications.map((v) => v.label)).toContain('rcSheets.v.colSpliceC');
    expect(columnRow(storey(0, 0.4, 1500, 5), ctx, own, f).lap).toBeUndefined();
  });
});

describe('the crank of the bars from below', () => {
  const own = { corner: 20, nx: 1, dx: 16, ny: 1, dy: 16, tieDia: 8, tieSpacing: 0.15 };
  const low = columnRow(storey(0, 0.4, 1500, 5), ctx, own, f, { fromBelow: true, onFooting: true });
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

  it('starts the bottom storey\'s bars at the footing\'s top, where the dowels\' lap starts, under chapter 18 at the middle half', () => {
    expect(lapStart(low, 'cirsoc201-2025')).toBe(0);
    const confined = { ...low, confinement: { lo: 0.5, so: 0.1 } };
    expect(lapStart(confined, 'aci318-19')).toBeCloseTo(2.5 / 2 - low.lap!.length / 2, 9);
  });
});

describe('a footing\'s dowels', () => {
  const reaction = (nodeId: number, fz: number) => ({ nodeId, fx: 0, fy: 0, fz, mx: 0, my: 0, mz: 0 });
  const input: FootingDemandInput = {
    supportNodes: [1], nodes: new Map([[1, { x: 0, y: 0, z: 0 }]]), footings: [],
    columnAt: () => ({ b: 0.4, h: 0.4, name: 'C1' }), soilOf: () => ({ name: 'S', allowable: 200 }),
    sets: [{ name: 'U', result: { reactions: [reaction(1, 900)] } }],
    cases: [{ type: 'D', result: { reactions: [reaction(1, 400)] } }, { type: 'L', result: { reactions: [reaction(1, 200)] } }],
  };
  const fctx = (bars: FootingContext['columnBars']): FootingContext => ({ fc: 25, fy: 420, cover: 0.05, sizing: 'full', diameters: [10, 12, 16], columnBars: bars });
  const row = (bars: FootingContext['columnBars']) => rulesFor('cirsoc201-2025').footingRow(footingDemands(input)[0]!, fctx(bars), undefined, f);

  it('lap with the column\'s bars over the column\'s own lap, starting where it starts', () => {
    const r = row({ count: 8, dia: 16, tension: false, lap: 0.55, lapFrom: 0.3 });
    expect(r.dowels).toMatchObject({ lap: 0.55, above: 0.3, offset: 0.016 });
    const plain = row({ count: 8, dia: 16, tension: false });
    expect(plain.dowels!.lap).toBeCloseTo(compressionLapMm(420, 16, 25) / 1000, 9);
    expect(row({ count: 8, dia: 16, tension: true }).dowels!.lap).toBeGreaterThanOrEqual(plain.dowels!.lap - 1e-9);
  });

  it('hook at the bottom mat, rise through the footing, crank in one bar\'s diameter at 1:6 to end at its top and stand the lap over it', () => {
    const r = row({ count: 8, dia: 16, tension: false, lap: 0.48, lapFrom: 0 });
    const det = footingDetail(r, R), dw = det.dowels!;
    const [foot, heel, bend, crank, top] = dw.shape.pts;
    expect(foot![0]).toBe(dw.foot);
    expect(heel).toEqual([0, 0]);
    expect(crank![1]).toBeCloseTo(r.h - dw.z, 9);
    expect(-crank![0]).toBeCloseTo(0.016, 9);
    expect((crank![1] - bend![1]) * CRANK_SLOPE).toBeCloseTo(Math.abs(crank![0] - bend![0]), 9);
    expect(top![1] - crank![1]).toBeCloseTo(0.48, 9);
    expect(top![0]).toBe(crank![0]);
    expect(dw.z + top![1]).toBeCloseTo(r.h + 0.48, 9);
    const el = scheduleElements({ line: [], column: [], slab: [], wall: [], footing: [r] }, { code: 'cirsoc201-2025', slabCover: 0.02 });
    const piece = el[0]!.pieces.find((p) => p.kind === 'dowel')!;
    expect(piece.count).toBe(8);
    expect(developedLength(piece.shape)).toBeCloseTo(developedLength(dw.shape), 9);
    expect(developedLength(piece.shape)).toBeGreaterThan(r.h - dw.z + 0.48);
  });
});
