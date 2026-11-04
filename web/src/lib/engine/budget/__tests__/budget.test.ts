/**
 * The budget by hand: items of one code added with their levels, priced with a location factor,
 * an item without a price left without an amount, the summary coefficient, a price CSV with
 * decimal commas and points, and the two exchange formats.
 */
import { describe, expect, it } from 'vitest';
import { budgetBc3, budgetCsv, mergeItems, parsePriceCsv, priceBudget, summaryCoefficient, type WorkItem } from '../budget';

const it_ = (code: string, chapter: WorkItem['chapter'], unit: WorkItem['unit'], quantity: number, level: string): WorkItem => ({ code, chapter, unit, desc: { key: code }, quantity, byLevel: { [level]: quantity } });
const items = [it_('HOR.BEAM', 'concrete', 'm3', 10, 'P1'), it_('HOR.BEAM', 'concrete', 'm3', 5, 'P2'), it_('ACE.D12', 'rebar', 'kg', 800, 'P1'), it_('ENC.BEAM', 'formwork', 'm2', 60, 'P1')];
const base = { id: 'b', name: 'Base', location: 'Rosario', currency: 'ARS', date: '2026-10-01', locationFactor: 1.1, prices: { 'HOR.BEAM': 100, 'ACE.D12': 2 } };

describe('budget', () => {
  it('merges one code with its levels, in chapter order', () => {
    const m = mergeItems(items);
    expect(m.map((i) => i.code)).toEqual(['HOR.BEAM', 'ENC.BEAM', 'ACE.D12']);
    expect(m[0]!.quantity).toBe(15);
    expect(m[0]!.byLevel).toEqual({ P1: 10, P2: 5 });
  });

  it('prices with the location factor, leaves a missing price without amount, applies the coefficient', () => {
    const shares = { overheads: 0.15, financial: 0.03, profit: 0.1, tax: 0.21 };
    const b = priceBudget(items, base, shares);
    expect(b.chapters.map((c) => c.chapter)).toEqual(['concrete', 'formwork', 'rebar']);
    expect(b.chapters[0]!.lines[0]!.unitPrice).toBeCloseTo(110, 9);
    expect(b.chapters[0]!.subtotal).toBeCloseTo(1650, 9);
    expect(b.chapters[1]!.lines[0]!.amount).toBeNull();
    expect(b.missing).toEqual(['ENC.BEAM']);
    expect(b.directCost).toBeCloseTo(1650 + 1760, 9);
    expect(summaryCoefficient(shares)).toBeCloseTo(1.15 * 1.03 * 1.1 * 1.21, 12);
    expect(b.total).toBeCloseTo(3410 * 1.15 * 1.03 * 1.1 * 1.21, 6);
  });

  it('reads prices with decimal commas and points, and skips what does not read', () => {
    const r = parsePriceCsv('HOR.BEAM;12.345,67\nACE.D12,1500.5\nENC.BEAM\t250\nMET.PLATE;7.5\nnot a price line\n\n');
    expect(r.prices).toEqual({ 'HOR.BEAM': 12345.67, 'ACE.D12': 1500.5, 'ENC.BEAM': 250, 'MET.PLATE': 7.5 });
    expect(r.skipped).toBe(1);
  });

  it('writes a CSV in the locale and a FIEBDC-3 file with root, chapters, items and measurements', () => {
    const b = priceBudget(items, base);
    const csv = budgetCsv(b, (i) => i.code, (c) => c, { head: ['c', 'code', 'item', 'u', 'q', 'p', 'a'], direct: 'D', coefficient: 'K', total: 'T' }, 'es');
    expect(csv.split('\n')[1]).toBe('concrete;HOR.BEAM;HOR.BEAM;m3;15,000;110,00;1650,00');
    const bc3 = budgetBc3(b, (i) => i.code, (c) => c, { title: 'Obra', program: 'Stabileo' }).split('\r\n');
    expect(bc3[0]).toMatch(/^~V\|Stabileo\|FIEBDC-3\/2016\|/);
    expect(bc3).toContain('~D|STRUCT##|CONCRETE#\\1\\1\\FORMWORK#\\1\\1\\REBAR#\\1\\1\\|');
    expect(bc3).toContain('~C|HOR.BEAM|m3|HOR.BEAM|110|01102026|0|');
    expect(bc3).toContain('~M|CONCRETE#\\HOR.BEAM|||15|\\P1\\1\\10\\\\\\\\P2\\1\\5\\\\\\|');
  });
});
