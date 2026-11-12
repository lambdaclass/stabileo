/**
 * TS 498:1997 (Kasım 1997), as printed in https://web.itu.edu.tr/mdaskiran/wp-content/uploads/2014/09/TS498.pdf:
 * Çizelge 3, 4, 5, 6, 7 and 8, with hand calculations.
 */
import { describe, it, expect } from 'vitest';
import { meanPressure, storeyWind, velocityPressure, C_GENERAL } from '../ts498-wind';
import { groundSnow, slopeFactor } from '../ts498-snow';
import { findTrOccupancy, ts498Reduce, TS498_OCCUPANCIES } from '../ts498-loads';

describe('wind, Çizelge 5 and 6', () => {
  it('q by height band', () => {
    expect(velocityPressure(5)).toBe(0.5);
    expect(velocityPressure(8)).toBe(0.5);
    expect(velocityPressure(12)).toBe(0.8);
    expect(velocityPressure(50)).toBe(1.1);
    expect(velocityPressure(120)).toBe(1.3);
    expect(velocityPressure(5, true)).toBe(1.1);
  });
  it('a band across 8 m averages the two pressures by height', () => {
    expect(meanPressure(7.5, 10.5)).toBeCloseTo((0.5 * 0.5 + 0.8 * 2.5) / 3, 12);
  });
  it('W = C·q·A per storey: 4 storeys of 3 m, 10 m across, C = 1,2', () => {
    const levels = [0, 3, 6, 9, 12].map((z) => ({ elevation: z, nodeIds: [] }));
    const s = storeyWind(levels, 0, C_GENERAL, 10);
    expect(s.map((x) => [x.z0, x.z1])).toEqual([[1.5, 4.5], [4.5, 7.5], [7.5, 10.5], [10.5, 12]]);
    expect(s[0]!.force).toBeCloseTo(1.2 * 0.5 * 10 * 3, 12);
    expect(s[1]!.force).toBeCloseTo(18, 12);
    expect(s[2]!.force).toBeCloseTo(1.2 * (0.5 * 0.5 + 0.8 * 2.5) * 10, 12);
    expect(s[3]!.force).toBeCloseTo(1.2 * 0.8 * 10 * 1.5, 12);
  });
});

describe('snow, Çizelge 3 and 4', () => {
  it('Pk0 by zone and altitude, the next row up between rows', () => {
    expect(groundSnow('I', 150).pk0).toBe(0.75);
    expect(groundSnow('II', 1000).pk0).toBe(1.05);
    expect(groundSnow('III', 750).pk0).toBe(1.25);
    expect(groundSnow('IV', 900).pk0).toBe(1.5);
    expect(groundSnow('IV', 1200).pk0).toBeCloseTo(1.6 * 1.1, 12);
    expect(groundSnow('III', 1800).pk0).toBeCloseTo(1.35 * 1.15, 12);
  });
  it('m by roof slope, as Çizelge 3 prints it', () => {
    expect(slopeFactor(25)).toBe(1);
    expect(slopeFactor(31)).toBe(0.97);
    expect(slopeFactor(35)).toBe(0.87);
    expect(slopeFactor(45)).toBe(0.62);
    expect(slopeFactor(60)).toBe(0.25);
    expect(slopeFactor(69)).toBe(0.02);
    expect(slopeFactor(75)).toBe(0);
    expect(slopeFactor(45, true)).toBe(1);
  });
});

describe('live loads, Çizelge 7 and 8', () => {
  it('reads the table', () => {
    expect(findTrOccupancy('tr_residential')?.uniformKNm2).toBe(2.0);
    expect(findTrOccupancy('tr_classroom')?.uniformKNm2).toBe(3.5);
    expect(findTrOccupancy('tr_stairs_public')?.uniformKNm2).toBe(5.0);
    expect(findTrOccupancy('tr_stand_unfixed')?.uniformKNm2).toBe(7.5);
    expect(TS498_OCCUPANCIES.every((o) => o.labelKey.startsWith('loads.tr.occ.'))).toBe(true);
  });
  it('Çizelge 8 (a) for dwellings and offices, down to β = 0,6 (40 %)', () => {
    const r = (floorsSupported: number, occupancyKey = 'tr_residential') => ts498Reduce({ loKNm2: 2, elementKind: 'interiorColumn', floorsSupported, noReduction: false, occupancyKey }).lKNm2;
    expect(r(3)).toBe(2);
    expect(r(4)).toBeCloseTo(2 * 0.95, 12);
    expect(r(7)).toBeCloseTo(2 * 0.71, 12);
    expect(r(9)).toBeCloseTo(1.2, 12);
    expect(r(20, 'tr_office')).toBeCloseTo(1.2, 12);
  });
  it('reduces a column over more than three floors by β of Çizelge 8 (b) in shops and workshops, never a beam or a school', () => {
    const r = (floorsSupported: number, elementKind: 'interiorColumn' | 'interiorBeam' = 'interiorColumn', noReduction = false) =>
      ts498Reduce({ loKNm2: 2, elementKind, floorsSupported, noReduction, occupancyKey: 'tr_store' }).lKNm2;
    expect(r(3)).toBe(2);
    expect(r(5)).toBeCloseTo(2 * 0.94, 12);
    expect(r(9)).toBeCloseTo(1.6, 12);
    expect(r(20)).toBeCloseTo(1.6, 12);
    expect(r(6, 'interiorBeam')).toBe(2);
    expect(r(6, 'interiorColumn', true)).toBe(2);
    expect(findTrOccupancy('tr_classroom')?.noReduction).toBe(true);
  });
});
