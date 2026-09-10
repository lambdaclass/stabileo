import { describe, it, expect } from 'vitest';
import { plateForLayout, plateAreaM2, plateMassKg } from '../plate-geometry';
import type { BoltLayoutChoice } from '../bolted-joint';

const layout = (o: Partial<BoltLayoutChoice> = {}): BoltLayoutChoice => ({
  diameterMm: 20, grade: 'A325', threads: 'included', count: 6, rows: 2,
  spacingMm: 70, edgeDistanceMm: 40, ...o,
});
const at = { x: 1, y: 2, z: 3 };
const ok = (o = {}) => plateForLayout({
  layout: layout(), thicknessMm: 10, holeDiameterMm: 22, originM: at, ...o,
});

describe('the plate follows from the layout', () => {
  it('is as long as the holes plus their margins', () => {
    const r = ok();
    expect(r.state).toBe('available');
    if (r.state !== 'available') throw new Error('unreachable');
    // 3 per row: (3−1)·70 + 2·40 = 220 mm. 2 rows: (2−1)·70 + 2·40 = 150 mm.
    expect(r.plate.lengthM).toBeCloseTo(0.220, 9);
    expect(r.plate.widthM).toBeCloseTo(0.150, 9);
  });

  it('has exactly as many holes as the design has bolts', () => {
    const r = ok();
    if (r.state !== 'available') throw new Error('unreachable');
    expect(r.plate.holesM).toHaveLength(6);
  });

  /*
   * The holes are what a 3-D view draws and a drawing dimensions. Centred, so the plate's own
   * frame has no preferred corner and a consumer places it from the joint alone.
   */
  it('centres them on the plate', () => {
    const r = ok();
    if (r.state !== 'available') throw new Error('unreachable');
    const us = r.plate.holesM.map((h) => h.u);
    const vs = r.plate.holesM.map((h) => h.v);
    expect(Math.min(...us) + Math.max(...us)).toBeCloseTo(0, 9);
    expect(Math.min(...vs) + Math.max(...vs)).toBeCloseTo(0, 9);
  });

  it('every hole sits at least the edge distance from the boundary', () => {
    const r = ok();
    if (r.state !== 'available') throw new Error('unreachable');
    const { lengthM, widthM, holesM } = r.plate;
    for (const h of holesM) {
      expect(lengthM / 2 - Math.abs(h.u)).toBeGreaterThanOrEqual(0.040 - 1e-9);
      expect(widthM / 2 - Math.abs(h.v)).toBeGreaterThanOrEqual(0.040 - 1e-9);
    }
  });

  it('sits at the joint', () => {
    const r = ok();
    if (r.state !== 'available') throw new Error('unreachable');
    expect(r.plate.originM).toEqual(at);
  });

  it('grows with the spacing, and with the bolt count', () => {
    const a = ok();
    const wider = ok({ layout: layout({ spacingMm: 100 }) });
    const more = ok({ layout: layout({ count: 8, rows: 2 }) });
    if (a.state !== 'available' || wider.state !== 'available' || more.state !== 'available') {
      throw new Error('unreachable');
    }
    expect(wider.plate.lengthM).toBeGreaterThan(a.plate.lengthM);
    expect(more.plate.lengthM).toBeGreaterThan(a.plate.lengthM);
  });
});

describe('the thickness is supplied, never chosen', () => {
  /*
   * The one dimension this module does not derive. A plate whose thickness it picked would be a
   * fabricated dimension with a plausible value — the worst kind, because it looks checked. It
   * is the same `t` §J.3.10 checks bearing against.
   */
  it('is exactly what the caller gave', () => {
    const r = ok({ thicknessMm: 12 });
    if (r.state !== 'available') throw new Error('unreachable');
    expect(r.plate.thicknessM).toBeCloseTo(0.012, 9);
  });

  it('and without it there is no plate at all', () => {
    const r = plateForLayout({ layout: layout(), holeDiameterMm: 22, originM: at });
    expect(r.state).toBe('GEOMETRY_UNAVAILABLE');
    if (r.state === 'available') throw new Error('unreachable');
    expect(r.missingKeys).toContain('plate.missing.thickness');
  });
});

describe('what it refuses to draw', () => {
  it('no layout, no plate', () => {
    const r = plateForLayout({ layout: null, thicknessMm: 10, holeDiameterMm: 22, originM: at });
    expect(r.state).toBe('GEOMETRY_UNAVAILABLE');
    if (r.state === 'available') throw new Error('unreachable');
    expect(r.missingKeys).toContain('plate.missing.layout');
  });

  it('no hole size, no plate — the holes are the point', () => {
    const r = plateForLayout({ layout: layout(), thicknessMm: 10, holeDiameterMm: null, originM: at });
    expect(r.state).toBe('GEOMETRY_UNAVAILABLE');
    if (r.state === 'available') throw new Error('unreachable');
    expect(r.missingKeys).toContain('plate.missing.holeDiameter');
  });

  /*
   * A count that is not a whole multiple of the rows describes a layout nobody can fabricate.
   * Rounding it would draw a plate for a DIFFERENT bolt group than the one that was checked.
   */
  it('refuses a count that does not divide into the rows, rather than rounding', () => {
    const r = ok({ layout: layout({ count: 7, rows: 2 }) });
    expect(r.state).toBe('GEOMETRY_UNAVAILABLE');
    if (r.state === 'available') throw new Error('unreachable');
    expect(r.missingKeys).toContain('plate.missing.countNotDivisibleByRows');
  });

  it('names every missing input at once, not one at a time', () => {
    const r = plateForLayout({ layout: null });
    if (r.state === 'available') throw new Error('unreachable');
    expect(r.missingKeys.length).toBeGreaterThan(1);
  });
});

describe('the quantities a document would list', () => {
  it('come from the same geometry the view draws', () => {
    const r = ok();
    if (r.state !== 'available') throw new Error('unreachable');
    expect(plateAreaM2(r.plate)).toBeCloseTo(0.220 * 0.150, 9);
    expect(plateMassKg(r.plate)).toBeCloseTo(0.220 * 0.150 * 0.010 * 7850, 6);
  });
});
