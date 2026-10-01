import { describe, it, expect } from 'vitest';
import { claddingPressures, gcpOf } from '../cladding';
import { freeRoofCn, freeRoofCnAlong, solidSignCf, openSignCf, towerCf, chimneyCf } from '../other-structures';

describe('CIRSOC 102 Cap. 5, components and cladding', () => {
  it('the zone curves meet the commentary equations', () => {
    // Tabla C 5.3-1, zone 5 negative, A = 10 m²: −1,4 + 0,3532·log 10.
    expect(gcpOf([1, -1.4, 50, -0.8], 10)).toBeCloseTo(-1.4 + 0.3532, 3);
    // Tabla C 5.3-3, zone 1 negative, A = 10 m²: −2,3839 + 1,2754·log 10.
    expect(gcpOf([2, -2.0, 30, -0.5], 10)).toBeCloseTo(-2.3839 + 1.2754, 3);
  });

  it('p = qh[(GCp) ∓ (GCpi)], never under 0,80 kN/m², walls reduced 10 % on a flat roof', () => {
    const r = claddingPressures({ qhNm2: 1000, meanRoofHeight: 8, leastDimension: 30, roofSlopeDeg: 5, gcpi: 0.18, areaM2: 1 });
    const z5 = r.rows.find((x) => x.surface === 'wall' && x.zone === '5')!;
    expect(z5.gcpNeg).toBeCloseTo(-1.4 * 0.9, 9);
    expect(z5.pNeg).toBeCloseTo(-(1.26 + 0.18), 9);
    const roof1p = r.rows.find((x) => x.surface === 'roof' && x.zone === "1'")!;
    expect(roof1p.pPos).toBeCloseTo(0.8, 9);   // 0,48 kN/m² raised to the minimum
    expect(r.aWalls).toBeCloseTo(3, 9);        // min(3, 3,2) ≥ max(1,2, 1)
    expect(r.aRoof).toBeNull();
  });

  it('refuses above 20 m', () => {
    expect(claddingPressures({ qhNm2: 1000, meanRoofHeight: 25, leastDimension: 30, roofSlopeDeg: 5, gcpi: 0.18, areaM2: 1 }).refused).toBe('height');
  });
});

describe('CIRSOC 102 other structures', () => {
  it('free roofs: Figuras 2.4-4 to 2.4-7 at their rows and between', () => {
    const close = (a: { cnw: number; cnl: number }, w: number, l: number) => { expect(a.cnw).toBeCloseTo(w, 9); expect(a.cnl).toBeCloseTo(l, 9); };
    close(freeRoofCn('monoslope', 15, 'A', false, true), -0.9, -1.3);
    close(freeRoofCn('monoslope', 15, 'A', false, false), 1.3, 1.6);
    close(freeRoofCn('pitched', 30, 'B', true), -0.2, -1.1);
    const mid = freeRoofCn('troughed', 18.75, 'A', false);
    expect(mid.cnw).toBeCloseTo(-1.1, 9);
    expect(mid.cnl).toBeCloseTo((0.4 - 0.1) / 2, 9);
    // Below 7,5° a pitched roof takes the monoslope's 0° row.
    close(freeRoofCn('pitched', 5, 'A', false), 1.2, 0.3);
    expect(freeRoofCnAlong(1.5, 'A', true)).toBe(-0.9);
  });

  it('signs, lattices, towers and chimneys', () => {
    expect(solidSignCf(1, 1)).toBeCloseTo(1.45, 9);
    // Between B/s 1 and 2 and s/h 0,9 and 0,7: (1,525 + 1,625) / 2.
    expect(solidSignCf(1.5, 0.8)).toBeCloseTo(1.575, 9);
    expect(openSignCf(0.2, 'flat')).toBe(1.8);
    const e = 0.2;
    expect(towerCf(e, 'square', false)).toBeCloseTo(4 * e * e - 5.9 * e + 4, 9);
    expect(towerCf(e, 'square', false, true)).toBeCloseTo((4 * e * e - 5.9 * e + 4) * 1.15, 9);
    expect(chimneyCf('squareNormal', 7, 10)).toBeCloseTo(1.4, 9);
    expect(chimneyCf('roundSmooth', 25, 3)).toBeCloseTo(1.2, 9);   // D√qz ≤ 5,3: the last row
  });
});
