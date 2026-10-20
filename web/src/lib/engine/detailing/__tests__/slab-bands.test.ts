/** Slab bands in any direction and shape, packages, moves, and averages, with hand values. */
import { describe, it, expect } from 'vitest';
import { bandAverage, bandBars, bandChords, bandShare, groupBands, lineAverage, moveBand, moveBandLabel, ungroupBands } from '../slab-bands';
import { providedAt, type PanelInput } from '../slab-panel';
import type { SlabBand, SlabPanelReinforcement } from '../../../design-contract/reinforcement';

const band = (o: Partial<SlabBand> = {}): SlabBand => ({ id: 'b1', face: 'bottom', dir: 'x', x0: 0, x1: 4, y0: 0, y1: 1, diameter: 10, spacing: 0.2, ...o });
const A10 = Math.PI * 0.005 ** 2;

describe('a band at an angle and with a free outline', () => {
  it('carries cos² of its area in x and sin² in y', () => {
    expect(bandShare(band({ angle: 30 }), 'x')).toBeCloseTo(0.75, 12);
    expect(bandShare(band({ angle: 30 }), 'y')).toBeCloseTo(0.25, 12);
    expect(bandShare(band(), 'y')).toBe(0);
    const r: SlabPanelReinforcement = { base: {}, bands: [band({ angle: 30 })] };
    expect(providedAt(r, 'bottomX', 1, 0.5)).toBeCloseTo((0.75 * A10) / 0.2, 12);
    expect(providedAt(r, 'bottomY', 1, 0.5)).toBeCloseTo((0.25 * A10) / 0.2, 12);
  });

  it('counts only where its outline is: a triangle', () => {
    const r: SlabPanelReinforcement = { base: {}, bands: [band({ outline: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 2 }] })] };
    expect(providedAt(r, 'bottomX', 0.5, 0.5)).toBeCloseTo(A10 / 0.2, 12);
    expect(providedAt(r, 'bottomX', 3.5, 1.5)).toBe(0);
  });

  it('its bars as laid: 1,0 m wide at 0,20 m is 5 bars (the first at 0,10 m), 4,0 m long plus 12 db per hook', () => {
    const b = bandBars(band({ hookStart: true }));
    expect(b.count).toBe(5);
    expect(b.length).toBeCloseTo(4 + 0.12, 9);
    expect(b.bar.map((p) => [+p.x.toFixed(9), +p.y.toFixed(9)])).toEqual([[0, 0.5], [4, 0.5]]);
    // Bars along y over the same rectangle: 4,0 m wide, 20 bars, 1,0 m long.
    expect(bandBars(band({ dir: 'y' }))).toMatchObject({ count: 20, length: expect.closeTo(1, 9) });
    // At 45° over a 2 × 2 m square: 2,83 m across, 5 bars at 0,25 + 0,5 i; the nearest to the
    // diagonal sits 1,414 − 1,25 = 0,164 m off it, so its chord is 2√2 − 2 · 0,164 = 2,50 m.
    const d = bandChords(band({ x1: 2, y1: 2, angle: 45, spacing: 0.5 }));
    expect(d.length).toBe(5);
    const len = d.map(([a, c]) => Math.hypot(c.x - a.x, c.y - a.y));
    expect(Math.max(...len)).toBeCloseTo(2 * Math.SQRT2 - 2 * (Math.SQRT2 - 1.25), 9);
    expect(len[0]).toBeLessThan(len[2]!);
  });
});

describe('packages, moves', () => {
  const r: SlabPanelReinforcement = { base: {}, bands: [band(), band({ id: 'b2', y0: 2, y1: 3 }), band({ id: 'b3', diameter: 12 })] };
  it('equal bands group under one mark; a different one does not; ungroup undoes it', () => {
    const g = groupBands(r, ['b1', 'b2'], 'g1')!;
    expect(g.bands.map((b) => b.group ?? null)).toEqual(['g1', 'g1', null]);
    expect(groupBands(r, ['b1', 'b3'], 'g2')).toBeNull();
    expect(ungroupBands(g, 'g1').bands.every((b) => b.group === undefined)).toBe(true);
  });
  it('a band moves with its outline and text; the text moves alone', () => {
    const m = moveBand(moveBandLabel(r, 'b1', { x: 2, y: 0.5 }), 'b1', 1, -0.5);
    expect(m.bands[0]).toMatchObject({ x0: 1, x1: 5, y0: -0.5, y1: 0.5, label: { x: 3, y: 0 } });
  });
});

describe('averages over a line and a band', () => {
  // Four 1 × 1 m elements in a row along x, sagging mx 10, 20, 30, 40 kN·m/m.
  const p: PanelInput = {
    panelId: 'P', x0: 0, x1: 4, y0: 0, y1: 1, thickness: 0.15, cover: 0.02, fy: 420,
    elements: [10, 20, 30, 40].map((m, i) => ({ id: i, cx: i + 0.5, cy: 0.5, sx: 1, sy: 1, thickness: 0.15, sets: [{ mx: m, my: 0, mxy: 0 }] })),
  };
  // As = M / (0,9 · 0,9 · d · fy), d = 0,15 − 0,02 − 0,006 = 0,124 m, cm²/m.
  const as = (m: number) => (m * 1000) / (0.81 * 0.124 * 420e6) * 1e4;
  it('along the line: the smallest, the largest and the mean of what it crosses', () => {
    const s = lineAverage(p, 'bottomX', { x: 0, y: 0.5 }, { x: 4, y: 0.5 }, 3)!;
    // Four samples at 0, 4/3, 8/3 and 4 m: elements 0, 1, 2 and 3.
    expect(s.min).toBeCloseTo(as(10), 9);
    expect(s.max).toBeCloseTo(as(40), 9);
    expect(s.avg).toBeCloseTo((as(10) + as(20) + as(30) + as(40)) / 4, 9);
  });
  it('over a band: the elements inside it, by area', () => {
    const s = bandAverage(p, 'bottomX', band({ x0: 2, x1: 4 }))!;
    expect(s.samples).toBe(2);
    expect(s.avg).toBeCloseTo((as(30) + as(40)) / 2, 9);
  });
});
