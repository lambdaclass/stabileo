import { describe, it, expect } from 'vitest';
import {
  barsPerRow, minClearBetweenLayers, minClearSpacingColumn, minClearSpacingFor,
  minClearSpacingInLayer,
} from '../spacing';

const AGG20 = { maxAggregateSizeMm: 20 };

describe('CIRSOC 201-2025 §25.2.1 — bars in a layer', () => {
  it('is governed by the 25 mm floor for small bars and small aggregate', () => {
    const r = minClearSpacingInLayer('2025', { barDiameterMm: 12, maxAggregateSizeMm: 12 });
    expect(r.minClear).toBeCloseTo(0.025, 6);
    expect(r.governedBy).toBe('absoluteFloor');
  });

  it('is governed by the bar diameter for large bars', () => {
    const r = minClearSpacingInLayer('2025', { barDiameterMm: 32, ...AGG20 });
    // max(25, 32, 26.67) = 32
    expect(r.minClear).toBeCloseTo(0.032, 6);
    expect(r.governedBy).toBe('barDiameter');
  });

  it('is governed by the aggregate term when the aggregate is large', () => {
    // (4/3) * 25 = 33.33 mm beats both the 25 mm floor and a Ø16 bar.
    const r = minClearSpacingInLayer('2025', { barDiameterMm: 16, maxAggregateSizeMm: 25 });
    expect(r.minClear).toBeCloseTo(0.03333, 4);
    expect(r.governedBy).toBe('aggregate');
    expect(r.refs[0].clause).toBe('25.2.1');
    expect(r.refs[0].edition).toBe('2025');
  });

  it('reports every term so the memo can show the comparison', () => {
    const r = minClearSpacingInLayer('2025', { barDiameterMm: 20, maxAggregateSizeMm: 19 });
    expect(r.terms).toEqual({ floorMm: 25, barTermMm: 20, aggregateTermMm: (4 / 3) * 19 });
  });
});

describe('CIRSOC 201-2025 §25.2.3 — column longitudinal bars', () => {
  it('applies the 40 mm floor', () => {
    const r = minClearSpacingColumn('2025', { barDiameterMm: 16, maxAggregateSizeMm: 16 });
    expect(r.minClear).toBeCloseTo(0.040, 6);
    expect(r.governedBy).toBe('absoluteFloor');
  });

  it('applies 1.5 d_b, which governs from Ø28 up', () => {
    // The bug this module exists to fix: the previous inline rule was
    // max(d_b, 25, 40) and would have returned 40 mm here instead of 48 mm.
    const r = minClearSpacingColumn('2025', { barDiameterMm: 32, ...AGG20 });
    expect(r.minClear).toBeCloseTo(0.048, 6);
    expect(r.governedBy).toBe('barDiameter');
  });

  it('finds the crossover at Ø26.67, where 1.5 d_b reaches 40 mm', () => {
    expect(minClearSpacingColumn('2025', { barDiameterMm: 25, ...AGG20 }).governedBy)
      .toBe('absoluteFloor');
    expect(minClearSpacingColumn('2025', { barDiameterMm: 28, ...AGG20 }).governedBy)
      .toBe('barDiameter');
  });

  it('lets the aggregate term govern for very large aggregate', () => {
    const r = minClearSpacingColumn('2025', { barDiameterMm: 12, maxAggregateSizeMm: 38 });
    expect(r.minClear).toBeCloseTo(0.05067, 4);
    expect(r.governedBy).toBe('aggregate');
  });
});

describe('edition isolation', () => {
  it('omits the aggregate term entirely under 2005', () => {
    // 2005 does not carry (4/3)d_agg in its spacing clause. Applying it would be using
    // a 2025 rule on a project the user asked to be designed to 2005.
    const r = minClearSpacingInLayer('2005', { barDiameterMm: 16, maxAggregateSizeMm: 40 });
    expect(r.minClear).toBeCloseTo(0.025, 6);
    expect(r.terms.aggregateTermMm).toBeNull();
    expect(r.refs[0].clause).toBe('7.6.1');
    expect(r.refs[0].edition).toBe('2005');
  });

  it('keeps 1.5 d_b for 2005 columns', () => {
    const r = minClearSpacingColumn('2005', { barDiameterMm: 32, maxAggregateSizeMm: 40 });
    expect(r.minClear).toBeCloseTo(0.048, 6);
    expect(r.refs[0].clause).toBe('7.6.3');
  });

  it('never cites a 2025 clause under 2005, or the reverse', () => {
    for (const dia of [8, 12, 16, 20, 25, 32]) {
      for (const agg of [10, 20, 40]) {
        const i = { barDiameterMm: dia, maxAggregateSizeMm: agg };
        for (const type of ['beam', 'column'] as const) {
          expect(minClearSpacingFor('2005', type, i).refs.every((r) => r.edition === '2005')).toBe(true);
          expect(minClearSpacingFor('2025', type, i).refs.every((r) => r.edition === '2025')).toBe(true);
        }
      }
    }
  });

  it('gives the same 25 mm between layers in both editions, with the right citation', () => {
    expect(minClearBetweenLayers('2005').minClear).toBeCloseTo(0.025, 6);
    expect(minClearBetweenLayers('2005').refs[0].clause).toBe('7.6.2');
    expect(minClearBetweenLayers('2025').refs[0].clause).toBe('25.2.2');
  });
});

describe('dispatch and fit', () => {
  it('routes columns to the column rule and everything else to the layer rule', () => {
    const i = { barDiameterMm: 20, ...AGG20 };
    expect(minClearSpacingFor('2025', 'column', i).minClear)
      .toBeCloseTo(minClearSpacingColumn('2025', i).minClear, 9);
    for (const t of ['beam', 'slab', 'wall'] as const) {
      expect(minClearSpacingFor('2025', t, i).minClear)
        .toBeCloseTo(minClearSpacingInLayer('2025', i).minClear, 9);
    }
  });

  it('fits fewer bars per row as the aggregate grows', () => {
    const width = 0.30;
    const small = minClearSpacingInLayer('2025', { barDiameterMm: 16, maxAggregateSizeMm: 10 });
    const large = minClearSpacingInLayer('2025', { barDiameterMm: 16, maxAggregateSizeMm: 38 });
    const nSmall = barsPerRow(width, 16, small, 12);
    const nLarge = barsPerRow(width, 16, large, 12);
    expect(nSmall).toBeGreaterThan(nLarge);
    // Concrete check: 300 mm, Ø16, 25 mm gap -> floor((300+25)/(16+25)) = 7
    expect(nSmall).toBe(7);
    // 300 mm, Ø16, 50.67 mm gap -> floor((300+50.67)/(16+50.67)) = 5
    expect(nLarge).toBe(5);
  });

  it('returns zero when even one bar does not fit', () => {
    expect(barsPerRow(0.010, 16, minClearSpacingInLayer('2025', { barDiameterMm: 16, ...AGG20 }), 12)).toBe(0);
  });

  it('respects the hard cap', () => {
    const s = minClearSpacingInLayer('2025', { barDiameterMm: 8, maxAggregateSizeMm: 6 });
    expect(barsPerRow(5.0, 8, s, 12)).toBe(12);
  });
});
