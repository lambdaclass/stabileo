import { describe, it, expect } from 'vitest';
import { hookedStraight, type BarShape } from '../../shape';
import { slabRow } from '../../slab-row';
import { makeFmt } from '../../format';
import { scheduleElements, spread } from '../pieces';
import { buildSchedule } from '../stock';
import { scheduleOf } from '../schedule';

const f = makeFmt('.');
const bar = (len: number, dia = 16, laps?: { count: number; length: number }): BarShape => ({ ...hookedStraight(0, len, 0, dia, 0.096, [false, false], 1, 0), ...(laps ? { laps } : {}) });

describe('bars spread over a length', () => {
  it('never leave a gap wider than the spacing: 1 m at 0.30 m takes five bars, not four', () => {
    expect(spread(1, 0.3)).toBe(5);
    expect(spread(0.9, 0.3)).toBe(4);
    expect(spread(4, 0.2)).toBe(21);
  });
});

describe('a level with a slab plan', () => {
  it('still schedules the panels the plan does not lay out', () => {
    const m = (v: number) => ({ bottomX: { value: v }, bottomY: { value: v }, topX: { value: v }, topY: { value: v } });
    const c = { mat: { fc: 30, fy: 420 }, cover: 0.02, diameters: [8, 10, 12] };
    const inPlan = slabRow({ key: 'slab:1', name: 'L1', level: 'N1', lx: 5, ly: 4, h: 0.15, m: m(8) }, c, undefined, f);
    const outside = slabRow({ key: 'slab:2', name: 'L2', level: 'N1', lx: 5, ly: 4, h: 0.15, m: m(8) }, c, undefined, f);
    const plan = { level: 'N1', panels: [{ key: 'slab:1' }], packages: [{ mark: '1', layer: 'top', count: 10, shape: bar(9.4, 10) }] } as never;
    const els = scheduleElements({ line: [], column: [], slab: [inPlan, outside], wall: [], slabPlan: [plan] }, { code: 'cirsoc201-2025', slabCover: 0.02 });
    expect(els.map((e) => e.key)).toEqual(['slabplan:N1', 'slab:2']);
  });
});

describe('the stock a schedule orders', () => {
  it('leaves the offcut of the bars it cuts, the last one only partly used', () => {
    const s = buildSchedule([{ mark: 'A', diameterMm: 16, cuttingLength: 5, quantity: 1, shape: 's', massKg: 8 }], 12);
    expect(s.rows[0]!.stockBars).toBe(1);
    expect(s.rows[0]!.offcutM).toBeCloseTo(7, 9);
    const three = buildSchedule([{ mark: 'A', diameterMm: 16, cuttingLength: 5, quantity: 3, shape: 's', massKg: 24 }], 12);
    expect(three.rows[0]!.stockBars).toBe(2);
    expect(three.rows[0]!.offcutM).toBeCloseTo(24 - 15, 9);
  });

  it('counts a lapped bar as the stock bars its pieces are cut from, and says so with a key, not in one language', () => {
    const s = buildSchedule([{ mark: 'A', diameterMm: 16, cuttingLength: 20, quantity: 2, shape: 's', massKg: 60, pieces: 3 }], 12);
    expect(s.rows[0]!.stockBars).toBe(6);
    expect(s.notes).toEqual([]);
    expect(s.spliced).toEqual([{ mark: 'A', length: 20, stock: 12 }]);
    const sched = scheduleOf([{ key: 'V1', name: 'V1', family: 'beam', pieces: [{ kind: 'continuous', count: 2, shape: bar(19.2, 16, { count: 2, length: 0.8 }) }] }], { code: 'cirsoc201-2025' });
    expect(sched.byDiameter[0]!.stockBars).toBe(6);
  });
});

describe('bars longer than a stock bar with no lap of their own', () => {
  it('are lapped into as few pieces as fit a 12 m bar: a wall\'s horizontals and a slab plan\'s packages', async () => {
    const { lapped } = await import('../pieces');
    const long = lapped(bar(20), 0.6);
    expect(long.laps).toEqual({ count: 1, length: 0.6 });
    expect(lapped(bar(23.6), 0.6).laps!.count).toBe(2);
    expect(lapped(bar(9), 0.6).laps).toBeUndefined();
    const plan = { level: 'N1', panels: [], anchorage: [{ dia: 10, ld: 0.4, ldTop: 0.5, ldh: 0.2, lap: 0.55 }], packages: [{ mark: '1', layer: 'bottom', count: 30, shape: bar(16, 10), bars: { dia: 10, spacing: 0.2 } }] } as never;
    const [e] = scheduleElements({ line: [], column: [], slab: [], wall: [], slabPlan: [plan] }, { code: 'cirsoc201-2025', slabCover: 0.02 });
    expect(e!.pieces[0]!.shape.laps).toEqual({ count: 1, length: 0.55 });
    const s = scheduleOf([e!], { code: 'cirsoc201-2025' });
    expect(s.byDiameter[0]!.stockBars).toBe(60);
  });
});
