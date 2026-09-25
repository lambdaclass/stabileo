/**
 * CIRSOC 104-2005 roof snow against the regulation's own expressions and tables.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { GROUND_SNOW_TABLES } from '../ground-snow';
import { driftIndex, roofSnow, slopeFactor, snowDensity, type SnowInputs } from '../snow';

const base: SnowInputs = {
  pg: 1.5, terrain: 'C', exposure: 'partial', thermal: 'normal', category: 'II',
  roof: { kind: 'gable', slopeDeg: 20, W: 8, slippery: false },
};

describe('CIRSOC 104 roof snow', () => {
  it('(1) pf = 0,7 Ce Ct I pg, and ps = Cs pf (2)', () => {
    const r = roofSnow(base);
    expect(r.ce).toBe(1.0); expect(r.ct).toBe(1.0); expect(r.importance).toBe(1.0);
    expect(r.pfComputed).toBeCloseTo(0.7 * 1.5, 12);
    // 20° on a warm, non-slippery roof is under 30°: Cs = 1.
    expect(r.cs).toBe(1);
    expect(r.ps).toBeCloseTo(r.pf, 12);
  });

  it('§3.4: low-slope roofs are not below I·pg (pg ≤ 1) or I·1 kN/m²', () => {
    const low = { ...base, pg: 0.8, roof: { ...base.roof, kind: 'mono' as const, slopeDeg: 3 } };
    const r = roofSnow(low);
    expect(r.pfComputed).toBeCloseTo(0.7 * 0.8, 12);
    expect(r.pfMinimum).toBeCloseTo(0.8, 12);
    expect(r.pf).toBeCloseTo(0.8, 12);
    const high = roofSnow({ ...low, pg: 3, category: 'III' });
    expect(high.pfMinimum).toBeCloseTo(1.1, 12);
    // A steep single slope is not low-slope: no minimum.
    expect(roofSnow({ ...low, roof: { ...low.roof, slopeDeg: 20 } }).pfMinimum).toBeNull();
  });

  it('Figura 2: flat to the labelled angle, then straight to zero at 70°', () => {
    expect(slopeFactor(30, 1.0, false)).toBe(1);
    expect(slopeFactor(50, 1.0, false)).toBeCloseTo(20 / 40, 12);
    expect(slopeFactor(5, 1.0, true)).toBe(1);
    expect(slopeFactor(37.5, 1.0, true)).toBeCloseTo(0.5, 12);
    expect(slopeFactor(37.5, 1.1, false)).toBe(1);
    expect(slopeFactor(40, 1.1, true)).toBeCloseTo(0.5, 12);
    expect(slopeFactor(45, 1.2, false)).toBe(1);
    expect(slopeFactor(42.5, 1.2, true)).toBeCloseTo(0.5, 12);
    expect(slopeFactor(70, 1.0, false)).toBe(0);
    expect(slopeFactor(80, 0.85, true)).toBe(0);
  });

  it('Cap. 10: 0,25 kN/m² of rain on snow under 2,4°, less what the minimum already added', () => {
    const flat = { ...base, pg: 0.6, roof: { ...base.roof, kind: 'mono' as const, slopeDeg: 1 } };
    const r = roofSnow(flat);
    // pf by (1) = 0,42; minimum 0,6: the 0,18 it adds comes off the 0,25.
    expect(r.rainOnSnow).toBeCloseTo(0.25 - (0.6 - 0.42), 12);
    expect(r.ps).toBeCloseTo(0.6 + 0.07, 12);
    expect(roofSnow({ ...flat, pg: 1.5 }).rainOnSnow).toBe(0);
  });

  it('§6.1: unbalanced on a gable roof, by W', () => {
    const wide = roofSnow(base);
    // W = 8 > 6 m: 1,2 (1 + β/2) ps / Ce leeward, β by (3) for pg = 1,5; 0,3 ps windward.
    const beta = 1.5 - 0.5 * 1.5;
    expect(driftIndex(1.5)).toBeCloseTo(beta, 12);
    expect(wide.unbalanced!.leeward).toBeCloseTo((1.2 * (1 + beta / 2) * wide.ps) / 1.0, 12);
    expect(wide.unbalanced!.windward).toBeCloseTo(0.3 * wide.ps, 12);
    const narrow = roofSnow({ ...base, roof: { ...base.roof, W: 5 } });
    expect(narrow.unbalanced!.leeward).toBeCloseTo(1.5 * narrow.ps, 12);
    expect(narrow.unbalanced!.windward).toBe(0);
    // Under 21/W + 0,5 it is not needed: 21/8 + 0,5 = 3,1°.
    expect(roofSnow({ ...base, roof: { ...base.roof, slopeDeg: 3 } }).unbalanced).toBeNull();
  });

  it('(4) γ = 0,426 pg + 2,2 ≤ 4,70 kN/m³, and N/A in Tabla 2 is refused', () => {
    expect(snowDensity(1)).toBeCloseTo(2.626, 12);
    expect(snowDensity(10)).toBe(4.7);
    expect(roofSnow({ ...base, terrain: 'A', exposure: 'full' }).refused).toBe('snow.refused.exposureNA');
  });
});

describe('Tablas 1.1 a 1.15', () => {
  it('match the converted text row by row', () => {
    const md = readFileSync(new URL('../../../../../../docs/codes/CIRSOC/markdown/cirsoc-104-2005/tablas.md', import.meta.url), 'utf8');
    const rows = md.split('\n').filter((l) => /^\s*\d{1,3}\s{2,}\S/.test(l)).map((l) => l.trim().split(/\s{2,}/));
    const flat = GROUND_SNOW_TABLES.flatMap((t) => t.rows);
    expect(flat).toHaveLength(rows.length);
    rows.forEach(([n, loc, dist, h, pg], i) => {
      const r = flat[i]!;
      expect([r.n, r.locality, r.district, r.altitudeM, r.pg, !!r.estimated])
        .toEqual([Number(n), loc, dist, Number(h), Number(pg!.replace('*', '').replace(',', '.')), pg!.endsWith('*')]);
    });
    expect(GROUND_SNOW_TABLES).toHaveLength(15);
  });
});
