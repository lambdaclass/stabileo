import { describe, it, expect } from 'vitest';
import { presizeFooting } from '../presize';
import { pileCapacity, pileCentres, capPlan } from '../piles';

describe('pre-sizing a footing', () => {
  it('a centred footing carries its load at the allowable less its own weight, square round a square column', () => {
    const r = presizeFooting({ kind: 'isolated', loads: [{ x: 0, y: 0, axial: 800 }], allowableKPa: 200, thickness: 0.5, column: { x: 0.4, y: 0.4 } });
    if ('refused' in r) throw new Error(r.refused);
    // 800 / (200 − 12.5) = 4.267 m² → 2.07 → 2.10 m.
    expect(r).toMatchObject({ B: 2.1, L: 2.1, eccentricityB: 0, eccentricityL: 0 });
    expect(r.pressure).toBeLessThanOrEqual(200);
  });

  it('keeps an even overhang round a rectangular column', () => {
    const r = presizeFooting({ kind: 'isolated', loads: [{ x: 0, y: 0, axial: 800 }], allowableKPa: 200, thickness: 0.5, column: { x: 0.3, y: 0.8 } });
    if ('refused' in r) throw new Error(r.refused);
    expect(r.L - r.B).toBeCloseTo(0.5, 1);
    expect(r.B * r.L).toBeGreaterThanOrEqual(800 / 187.5);
  });

  it('at a property line the column sits at the edge and a strap beam is assumed', () => {
    const r = presizeFooting({ kind: 'isolated', loads: [{ x: 0, y: 0, axial: 800 }], allowableKPa: 200, thickness: 0.5, column: { x: 0.4, y: 0.4 }, anchor: [-1, 0] });
    if ('refused' in r) throw new Error(r.refused);
    expect(r.notes).toContain('strap');
    expect(r.L).toBeGreaterThan(r.B);
    // The column's −X face on the footing's −X edge.
    expect(r.eccentricityB).toBeCloseTo(r.B / 2 - 0.2, 9);
  });

  it('a combined footing is centred on the resultant of its two columns', () => {
    const r = presizeFooting({ kind: 'combined', loads: [{ x: 0, y: 0, axial: 600 }, { x: 4, y: 0, axial: 1200 }], allowableKPa: 200, thickness: 0.6, column: { x: 0.4, y: 0.4 } });
    if ('refused' in r) throw new Error(r.refused);
    expect(r.eccentricityB).toBeCloseTo((1200 * 4) / 1800, 9);
    expect(r.B).toBeGreaterThanOrEqual(2 * (r.eccentricityB + 0.5) - 1e-9);
    expect(r.notes).toContain('resultant');
  });

  it('a strip runs the wall\'s length, as wide as its load per metre needs', () => {
    const r = presizeFooting({ kind: 'strip', loads: [0, 2, 4, 6].map((x) => ({ x, y: 5, axial: 150 })), allowableKPa: 150, thickness: 0.4 });
    if ('refused' in r) throw new Error(r.refused);
    expect(r.B).toBeCloseTo(7, 9);
    expect(r.L).toBeCloseTo(0.65, 9); // 600 / (7 × 140) = 0.61 → 0.65
    expect(r.eccentricityB).toBeCloseTo(3, 9);
  });

  it('a pile cap takes the piles its load and its own weight need', () => {
    const cap = pileCapacity([{ name: 'arcilla', thickness: 8, shaftFrictionKPa: 30, tipResistanceKPa: 0 }, { name: 'arena', thickness: 10, shaftFrictionKPa: 60, tipResistanceKPa: 3000 }], 0.5, 12);
    // Shaft π·0.5·(30·8 + 60·4) = 754 kN; tip 3000 · π·0.25² = 589 kN.
    expect(cap.shaft).toBeCloseTo(Math.PI * 0.5 * 480, 6);
    expect(cap.tip).toBeCloseTo(3000 * Math.PI * 0.0625, 6);
    expect(cap.tipStratum).toBe('arena');
    const r = presizeFooting({ kind: 'pileCap', loads: [{ x: 0, y: 0, axial: 2500 }], allowableKPa: 0, thickness: 0.8, pile: { capacity: cap.total, diameter: 0.5, length: 12 } });
    if ('refused' in r) throw new Error(r.refused);
    expect(r.piles!.count).toBe(2);
    expect(pileCentres({ count: 3, spacing: 1.5 })).toHaveLength(3);
    expect(capPlan({ count: 4, diameter: 0.5, length: 12, spacing: 1.5 })).toEqual({ B: 2.5, L: 2.5 });
  });

  it('a pile longer than the strata stated gets no tip', () => {
    expect(pileCapacity([{ name: 'a', thickness: 5, shaftFrictionKPa: 20, tipResistanceKPa: 1000 }], 0.4, 8)).toMatchObject({ tip: 0, beyondStrata: true });
  });
});
