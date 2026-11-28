import { describe, it, expect } from 'vitest';
import { makeFmt } from '../../format';
import { stairRow } from '../../stair-row';
import { scheduleOf } from '../schedule';
import { stairPieces } from '../pieces';
import { concreteOf, orderText, purchaseOrder, stockBarKg } from '../order';
import { shapeWeight } from '../../shape';

const fmt = makeFmt('.');
const ctx = { fc: 25, fy: 420, cover: 0.025, diameters: [8, 10, 12, 16] };
const spec = { riser: 0.175, tread: 0.28, steps: 10, waist: 0.18, width: 1.2, landingBottom: 0.6, landingTop: 0.6, ends: 'monolithic' as const, finishes: 1, live: 5 };
const stair = (key: string, level: string) => stairRow({ key, name: key, level, source: 'desk', spec, place: null, quads: [], presumed: [] }, ctx, undefined, fmt, 'cirsoc201-2025');

describe('the purchase order', () => {
  const a = stair('E1', 'PB'), b = stair('E2', '1º');
  const s = scheduleOf([stairPieces(a), stairPieces(b)], { code: 'cirsoc201-2025', waste: 0.1, scope: 'element' });
  const rows = { line: [], column: [], slab: [], wall: [], stair: [a, b] };
  const o = purchaseOrder(rows, s, ['PB', '1º']);

  it('gives each level its concrete, its steel with the waste and the stock bars it takes, in the levels\' order', () => {
    expect(o.levels.map((l) => l.level)).toEqual(['PB', '1º']);
    const m3 = concreteOf(rows).find((c) => c.level === 'PB')!.m3;
    expect(o.levels[0]!.concrete).toBeCloseTo(m3, 9);
    const kg = a.bars.reduce((t, x) => t + shapeWeight(x.shape, x.count), 0);
    expect(o.levels[0]!.kg).toBeCloseTo(kg, 6);
    expect(o.levels[0]!.withWaste).toBeCloseTo(kg * 1.1, 6);
    for (const bar of o.levels[0]!.bars) expect(bar.stockBars).toBe(Math.ceil(bar.withWaste / stockBarKg(bar.dia) - 1e-9));
    expect(o.levels[0]!.ratio).toBeCloseTo(kg / m3, 6);
  });

  it('adds the levels up to the total, by family too', () => {
    expect(o.total.concrete).toBeCloseTo(o.levels[0]!.concrete + o.levels[1]!.concrete, 9);
    expect(o.total.kg).toBeCloseTo(s.total.kg, 6);
    expect(o.total.byFamily.stair!.kg).toBeCloseTo(s.total.kg, 6);
  });

  it('reads as a message to send, each level with its concrete and its bars', () => {
    const text = orderText(o, (k, p) => `${k}${p ? JSON.stringify(p) : ''}`, fmt);
    expect(text.split('\n')[0]).toMatch(/^PB: rcSheets\.order\.concreteLine/);
    expect(text).toContain('rcSheets.order.barsLine');
    expect(text).toContain('rcSheets.order.wasteNote');
  });
});
