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

  it('above 20 m, Fig. 5.4-1: qz for wall pressure, qh for suction, a no less than 1 m', () => {
    const r = claddingPressures({ qhNm2: 1200, qzNm2: 900, meanRoofHeight: 40, leastDimension: 30, roofSlopeDeg: 0, gcpi: 0.18, areaM2: 2 });
    expect(r.part).toBe(2);
    expect(r.aWalls).toBeCloseTo(3, 9);
    const w5 = r.rows.find((x) => x.surface === 'wall' && x.zone === '5')!;
    expect(w5.gcpNeg).toBeCloseTo(-1.8, 9);
    expect(w5.pPos).toBeCloseTo(0.9 * 0.9 + 1.2 * 0.18, 9);
    expect(w5.pNeg).toBeCloseTo(1.2 * -1.8 - 1.2 * 0.18, 9);
    const r3 = r.rows.find((x) => x.surface === 'roof' && x.zone === '3')!;
    expect(r3.gcpPos).toBeNull();
    // A = 2 m², between 1 and 50: −3,2 + 0,9·log(2)/log(50).
    expect(r3.gcpNeg).toBeCloseTo(-3.2 + 0.9 * Math.log10(2) / Math.log10(50), 9);
    // A parapet of 1 m: zone 3 as zone 2.
    const p = claddingPressures({ qhNm2: 1200, meanRoofHeight: 40, leastDimension: 30, roofSlopeDeg: 0, gcpi: 0.18, areaM2: 2, parapet: true });
    expect(p.rows.find((x) => x.zone === '3')!.gcpNeg).toBeCloseTo(p.rows.find((x) => x.surface === 'roof' && x.zone === '2')!.gcpNeg, 9);
    // 25 m tall and 30 m wide: §5.4 lets it take Parte 1.
    const low = claddingPressures({ qhNm2: 1000, meanRoofHeight: 25, leastDimension: 30, roofSlopeDeg: 5, gcpi: 0.18, areaM2: 1, lowRise: true });
    expect(low.lowRiseAllowed).toBe(true);
    expect(low.part).toBe(1);
  });

  it('hip, monoslope and sawtooth roofs', () => {
    const at = (roof: 'hip' | 'monoslope' | 'sawtooth', slope: number, zone: string, area = 1) =>
      claddingPressures({ qhNm2: 1000, meanRoofHeight: 8, leastDimension: 30, roofSlopeDeg: slope, gcpi: 0, areaM2: area, roof }).rows.find((x) => x.surface === 'roof' && x.zone === zone);
    // Tabla C 5.3-6, zone 1, A = 10 m²: −2,1010 + log 10.
    expect(at('hip', 15, '1', 10)!.gcpNeg).toBeCloseTo(-1.101, 3);
    expect(at('hip', 45, '3')!.gcpNeg).toBeCloseTo(-2.4, 9);
    expect(claddingPressures({ qhNm2: 1000, meanRoofHeight: 8, leastDimension: 30, roofSlopeDeg: 35, gcpi: 0, areaM2: 1, roof: 'hip' }).refused).toBe('slope');
    expect(at('monoslope', 8, "3'")!.gcpNeg).toBeCloseTo(-2.6, 9);
    expect(at('monoslope', 20, '3', 10)!.gcpNeg).toBeCloseTo(-2.0, 9);
    // Fig. 5.3-6, zone 3 of the first span: three corners.
    expect(at('sawtooth', 20, '3A', 10)!.gcpNeg).toBeCloseTo(-3.7, 9);
    expect(at('sawtooth', 20, '3A', 50)!.gcpNeg).toBeCloseTo(-2.1, 9);
    expect(at('sawtooth', 20, '2')!.gcpPos).toBeCloseTo(1.1, 9);
    expect(claddingPressures({ qhNm2: 1000, meanRoofHeight: 25, leastDimension: 20, roofSlopeDeg: 20, gcpi: 0, areaM2: 1, roof: 'sawtooth' }).refused).toBe('kind');
  });
});

describe('CIRSOC 102 Fig. 5.3-2A note 5: a parapet of 1 m or more, h ≤ 20 m', () => {
  const at = (r: ReturnType<typeof claddingPressures>, surface: 'wall' | 'roof', zone: string) => r.rows.find((x) => x.surface === surface && x.zone === zone)!;
  for (const [what, extra] of [['h ≤ 20 m', { meanRoofHeight: 8 }], ['the low-rise option above 20 m', { meanRoofHeight: 25, lowRise: true }]] as const) {
    it(`${what}: zone 3 negative as zone 2, zones 2 and 3 positive as wall zones 4 and 5`, () => {
      const i = { qhNm2: 1000, leastDimension: 30, roofSlopeDeg: 3, gcpi: 0.18, areaM2: 2, ...extra };
      const none = claddingPressures(i), p = claddingPressures({ ...i, parapet: true });
      expect(p.part).toBe(1);
      expect(at(none, 'roof', '3').gcpNeg).toBeLessThan(at(none, 'roof', '2').gcpNeg);
      expect(at(p, 'roof', '3').gcpNeg).toBeCloseTo(at(none, 'roof', '2').gcpNeg, 9);
      // Fig. 5.3-1 as printed (1,0 to 0,7), not its walls' 10 % reduction: A = 2 m².
      const wallPos = 1.0 - 0.3 * Math.log10(2) / Math.log10(50);
      expect(at(p, 'roof', '2').gcpPos).toBeCloseTo(wallPos, 9);
      expect(at(p, 'roof', '3').gcpPos).toBeCloseTo(wallPos, 9);
      expect(at(p, 'roof', '1').gcpPos).toBeCloseTo(at(none, 'roof', '1').gcpPos!, 9);
      expect(at(p, 'roof', '1').gcpNeg).toBeCloseTo(at(none, 'roof', '1').gcpNeg, 9);
      expect(p.aRoof).toBeNull();
    });
  }
  it('a steeper roof than Fig. 5.3-2A takes no note 5', () => {
    const i = { qhNm2: 1000, meanRoofHeight: 8, leastDimension: 30, roofSlopeDeg: 15, gcpi: 0.18, areaM2: 2 };
    expect(claddingPressures({ ...i, parapet: true }).rows).toEqual(claddingPressures(i).rows);
  });
});

describe('CIRSOC 102 other structures', () => {
  it('free roofs: Figuras 2.4-4 to 2.4-7 at their rows and between', () => {
    const close = (a: { cnw: number; cnl: number }, w: number, l: number) => { expect(a.cnw).toBeCloseTo(w, 9); expect(a.cnl).toBeCloseTo(l, 9); };
    // Up the slope (from the low edge) is γ = 180°, the top surface facing the wind; down it, 0°.
    close(freeRoofCn('monoslope', 15, 'A', false, true), 1.3, 1.6);
    close(freeRoofCn('monoslope', 15, 'A', false, false), -0.9, -1.3);
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
