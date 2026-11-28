import { describe, it, expect } from 'vitest';
import { countInput, editorDiameters, layerPositions, legsInput, localizeDecimals, ringPath, spacingInput } from '../view-helpers';

describe('what the sheets draw', () => {
  it('rounds the control perimeter about the column corners, outward', () => {
    const k = 100, X = (x: number) => 200 + x * k, Y = (y: number) => 200 - y * k;
    const path = ringPath({ bx: 0.2, by: 0.2, off: 0.3, rounded: true, free: new Set(), X, Y, k });
    const arcs = [...path.matchAll(/M ([\d.-]+) ([\d.-]+) A ([\d.]+) [\d.]+ 0 (\d) (\d) ([\d.-]+) ([\d.-]+)/g)];
    expect(arcs).toHaveLength(4);
    const corners = [[X(0.2), Y(-0.2)], [X(0.2), Y(0.2)], [X(-0.2), Y(0.2)], [X(-0.2), Y(-0.2)]];
    arcs.forEach((m, i) => {
      const [x1, y1, , large, sweep, x2, y2] = m.slice(1).map(Number) as number[];
      const [cx, cy] = corners[i]!;
      // In screen axes a small arc about C runs with sweep 1 when (P0 − C) × (P1 − C) > 0: only then is the corner its centre.
      const cross = (x1! - cx!) * (y2! - cy!) - (y1! - cy!) * (x2! - cx!);
      expect(large).toBe(0);
      expect(sweep === 1).toBe(cross > 0);
    });
  });

  it('places a slab layer\'s outer bars at the cover and half the bar from the edges, not at a fixed 50 mm', () => {
    const p = layerPositions(4, 0.2, 0.08 + 0.006);
    expect(p.at[0]).toBeGreaterThanOrEqual(0.086 - 1e-9);
    expect(p.n).toBe(Math.floor((4 - 2 * 0.086) / 0.2 + 1e-9) + 1);
    expect(4 - p.at[p.at.length - 1]!).toBeGreaterThanOrEqual(0.086 - 1e-9);
  });

  it('thins a slab layer by a gap on the drawing, the same for equal spacings over any span', () => {
    const long = layerPositions(10, 0.1, 0.03, Infinity, 0.28), short = layerPositions(2, 0.1, 0.03, Infinity, 0.28);
    expect(long.every).toBe(3);
    expect(short.every).toBe(long.every);
    expect(long.at[1]! - long.at[0]!).toBeCloseTo(short.at[1]! - short.at[0]!, 9);
    expect(layerPositions(10, 0.3, 0.03, Infinity, 0.28).every).toBe(1);
    expect(layerPositions(4, 0.2, 0.086, 5).every).toBe(Math.ceil(layerPositions(4, 0.2, 0.086).n / 5));
  });

  it('writes values in the locale\'s decimal mark as well as formulas, clauses left alone', () => {
    expect(localizeDecimals('φMn = 12.35 kN·m (§9.7.3.5)', true)).toBe('φMn = 12,35 kN·m (§9.7.3.5)');
    expect(localizeDecimals('0.85 · 1.05', false)).toBe('0.85 · 1.05');
  });

  it('accepts whole counts and an even number of legs only', () => {
    expect(countInput('2.5', 0, 12)).toBe(3);
    expect(countInput('', 2, 12)).toBe(2);
    expect(countInput('40', 0, 12)).toBe(12);
    expect(legsInput('3')).toBe(4);
    expect(legsInput('1')).toBe(2);
    expect(legsInput('9')).toBe(8);
    expect(spacingInput('12.5', 5, 40)).toBeCloseTo(0.125, 9);
  });

  it('offers the design data\'s diameters, each family its range, the bar set before kept', () => {
    const dd = { longDiametersMm: [8, 10, 12, 16, 20, 25, 32], stirrupDiametersMm: [6, 8], slabDiametersMm: [8, 10, 12] };
    expect(editorDiameters(dd, 'beam')).toEqual([10, 12, 16, 20, 25]);
    expect(editorDiameters(dd, 'column')).toEqual([12, 16, 20, 25, 32]);
    expect(editorDiameters(dd, 'tie')).toEqual([6, 8]);
    expect(editorDiameters(dd, 'slab')).toEqual([8, 10, 12]);
    expect(editorDiameters(dd, 'tie', [10])).toEqual([6, 8, 10]);
  });
});

describe('a line\'s sections', () => {
  it('name the bars that cross each cut where it is drawn, at the support face, not at the axis', async () => {
    const { lineSections } = await import('../line-geometry');
    const { makeFmt } = await import('../format');
    const g = { count: 2, dia: 16 };
    const sa = { top: [g], bottom: [g], stirrups: { dia: 8, legs: 2, spacing: 0.15 }, at: { start: { top: [g], bottom: [g] }, span: { top: [g], bottom: [g] }, end: { top: [g], bottom: [g] } } };
    const bar = (mark: string, face: 'top' | 'bottom', from: number, to: number) => ({ mark, face, kind: 'span', bars: g, from, to, hooks: [false, false], runs: [{ face, from, to }] });
    const line = {
      spans: [{ name: 'V1', x0: 0, x1: 5, b: 0.3, h: 0.6 }], supportWidths: [0.4, 0.4], cover: 0.025, spanAdopted: [sa],
      bars: [bar('A', 'bottom', -0.2, 5.2), bar('B', 'bottom', 0.1, 4.9), bar('C', 'top', -0.2, 0.15)],
    } as never;
    const spans = [{ demand: { start: { x: 0 }, span: { x: 2.5 }, end: { x: 5 } } }] as never;
    const s = lineSections(line, spans, makeFmt('.'), true).find((x) => x.tags.some((t) => t.endsWith('· i')))!;
    expect(s.at[0]).toBeCloseTo(0.2, 9);
    expect(s.marks.bottom).toEqual(['A', 'B']);
    expect(s.marks.top).toEqual([]);
  });
});
