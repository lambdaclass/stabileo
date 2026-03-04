import { describe, it, expect } from 'vitest';
import {
  computeSectionProperties,
  generateSectionName,
  STEEL_SHAPES,
  CONCRETE_SHAPES,
  SECTION_SHAPES,
} from '../section-shapes';

const TOL = 1e-6;

function expectClose(actual: number, expected: number, tol = TOL) {
  expect(Math.abs(actual - expected)).toBeLessThan(tol);
}

// ─── Concrete section property calculations ──────────────────────────

describe('computeSectionProperties — concrete-square', () => {
  it('calculates A = a², Iz = a⁴/12', () => {
    const result = computeSectionProperties('concrete-square', { a: 0.30 });
    expect(result).not.toBeNull();
    expectClose(result!.a, 0.09);
    expectClose(result!.iz, 0.30 ** 4 / 12);
    expect(result!.shape).toBe('rect');
    expectClose(result!.b!, 0.30);
    expectClose(result!.h!, 0.30);
  });

  it('returns null for invalid dimensions', () => {
    expect(computeSectionProperties('concrete-square', { a: 0 })).toBeNull();
    expect(computeSectionProperties('concrete-square', { a: -0.1 })).toBeNull();
  });
});

describe('computeSectionProperties — concrete-rect', () => {
  it('calculates A = b*h, Iy = b*h³/12, Iz = h*b³/12', () => {
    const result = computeSectionProperties('concrete-rect', { b: 0.20, h: 0.40 });
    expect(result).not.toBeNull();
    expectClose(result!.a, 0.08);
    expectClose(result!.iy, 0.20 * 0.40 ** 3 / 12);  // about Y (horizontal): h³ term
    expectClose(result!.iz, 0.40 * 0.20 ** 3 / 12);  // about Z (vertical): b³ term
    expect(result!.shape).toBe('rect');
  });

  it('returns null for zero or negative dimensions', () => {
    expect(computeSectionProperties('concrete-rect', { b: 0, h: 0.4 })).toBeNull();
    expect(computeSectionProperties('concrete-rect', { b: 0.2, h: -0.1 })).toBeNull();
  });
});

describe('computeSectionProperties — concrete-circular', () => {
  it('calculates A = π*r², Iz = π*r⁴/4', () => {
    const d = 0.40;
    const r = d / 2;
    const result = computeSectionProperties('concrete-circular', { d });
    expect(result).not.toBeNull();
    expectClose(result!.a, Math.PI * r * r);
    expectClose(result!.iz, (Math.PI * r ** 4) / 4);
    expect(result!.shape).toBe('CHS');
    expectClose(result!.b!, d);
    expectClose(result!.h!, d);
  });
});

describe('computeSectionProperties — concrete-T', () => {
  const bw = 0.25, hw = 0.50, bf = 0.80, hf = 0.12;

  it('calculates correct area', () => {
    const result = computeSectionProperties('concrete-T', { bw, hw, bf, hf });
    expect(result).not.toBeNull();
    const expectedA = bw * hw + bf * hf; // 0.125 + 0.096 = 0.221
    expectClose(result!.a, expectedA);
  });

  it('calculates correct Iy via parallel axis theorem', () => {
    const result = computeSectionProperties('concrete-T', { bw, hw, bf, hf })!;
    const A = bw * hw + bf * hf;
    const yBar = (bw * hw * (hw / 2) + bf * hf * (hw + hf / 2)) / A;
    const IyWeb = (bw * hw ** 3) / 12 + bw * hw * (hw / 2 - yBar) ** 2;
    const IyFlange = (bf * hf ** 3) / 12 + bf * hf * (hw + hf / 2 - yBar) ** 2;
    expectClose(result.iy, IyWeb + IyFlange);  // about Y (horizontal): h-dominated
  });

  it('returns correct shape and dimensions', () => {
    const result = computeSectionProperties('concrete-T', { bw, hw, bf, hf })!;
    expect(result.shape).toBe('T');
    expectClose(result.h!, hw + hf);
    expectClose(result.b!, bf);
    expectClose(result.tw!, bw);
    expectClose(result.tf!, hf);
  });

  it('rejects bf < bw', () => {
    expect(computeSectionProperties('concrete-T', { bw: 0.50, hw: 0.50, bf: 0.30, hf: 0.12 })).toBeNull();
  });

  it('rejects zero or negative dimensions', () => {
    expect(computeSectionProperties('concrete-T', { bw: 0, hw: 0.50, bf: 0.80, hf: 0.12 })).toBeNull();
    expect(computeSectionProperties('concrete-T', { bw: 0.25, hw: -0.1, bf: 0.80, hf: 0.12 })).toBeNull();
  });

  it('accepts bf == bw (no overhang)', () => {
    const result = computeSectionProperties('concrete-T', { bw: 0.30, hw: 0.50, bf: 0.30, hf: 0.10 });
    expect(result).not.toBeNull();
    // When bf == bw, it's basically a rectangle
    const A = 0.30 * 0.60;
    expectClose(result!.a, A);
  });
});

describe('computeSectionProperties — concrete-invL', () => {
  const bw = 0.25, hw = 0.50, bf = 0.50, hf = 0.12;

  it('calculates correct area', () => {
    const result = computeSectionProperties('concrete-invL', { bw, hw, bf, hf });
    expect(result).not.toBeNull();
    expectClose(result!.a, bw * hw + bf * hf);
  });

  it('calculates correct Iy (same vertical formula as T)', () => {
    const result = computeSectionProperties('concrete-invL', { bw, hw, bf, hf })!;
    const A = bw * hw + bf * hf;
    const yBar = (bw * hw * (hw / 2) + bf * hf * (hw + hf / 2)) / A;
    const IyWeb = (bw * hw ** 3) / 12 + bw * hw * (hw / 2 - yBar) ** 2;
    const IyFlange = (bf * hf ** 3) / 12 + bf * hf * (hw + hf / 2 - yBar) ** 2;
    expectClose(result.iy, IyWeb + IyFlange);  // about Y (horizontal): h-dominated
  });

  it('returns shape invL', () => {
    const result = computeSectionProperties('concrete-invL', { bw, hw, bf, hf })!;
    expect(result.shape).toBe('invL');
    expectClose(result.tw!, bw);
    expectClose(result.tf!, hf);
  });

  it('rejects bf < bw', () => {
    expect(computeSectionProperties('concrete-invL', { bw: 0.50, hw: 0.50, bf: 0.30, hf: 0.12 })).toBeNull();
  });
});

// ─── Section name generation ────────────────────────────────────────

describe('generateSectionName — concrete shapes', () => {
  it('concrete-square', () => {
    const name = generateSectionName('concrete-square', { a: 0.30 });
    expect(name).toContain('H.A.');
    expect(name).toContain('30');
  });

  it('concrete-rect', () => {
    const name = generateSectionName('concrete-rect', { b: 0.20, h: 0.40 });
    expect(name).toContain('H.A.');
    expect(name).toContain('20');
    expect(name).toContain('40');
  });

  it('concrete-circular', () => {
    const name = generateSectionName('concrete-circular', { d: 0.40 });
    expect(name).toContain('H.A.');
    expect(name).toContain('40');
  });

  it('concrete-T', () => {
    const name = generateSectionName('concrete-T', { bw: 0.25, hw: 0.50, bf: 0.80, hf: 0.12 });
    expect(name).toContain('H.A. T');
    expect(name).toContain('bf=80');
  });

  it('concrete-invL', () => {
    const name = generateSectionName('concrete-invL', { bw: 0.25, hw: 0.50, bf: 0.50, hf: 0.12 });
    expect(name).toContain('H.A. L inv');
    expect(name).toContain('bf=50');
  });
});

// ─── Category filtering ─────────────────────────────────────────────

describe('Category filtering', () => {
  it('STEEL_SHAPES contains only steel shapes', () => {
    expect(STEEL_SHAPES.length).toBe(6);
    expect(STEEL_SHAPES.every(s => s.category === 'steel')).toBe(true);
  });

  it('CONCRETE_SHAPES contains only concrete shapes', () => {
    expect(CONCRETE_SHAPES.length).toBe(5);
    expect(CONCRETE_SHAPES.every(s => s.category === 'concrete')).toBe(true);
  });

  it('all shapes have a category', () => {
    expect(SECTION_SHAPES.every(s => s.category === 'steel' || s.category === 'concrete')).toBe(true);
  });

  it('total shapes = steel + concrete', () => {
    expect(SECTION_SHAPES.length).toBe(STEEL_SHAPES.length + CONCRETE_SHAPES.length);
  });
});

// ─── T-beam centroid verification ───────────────────────────────────

describe('T-beam centroid correctness', () => {
  it('centroid is above midheight for T-beam', () => {
    const bw = 0.25, hw = 0.50, bf = 0.80, hf = 0.12;
    const result = computeSectionProperties('concrete-T', { bw, hw, bf, hf })!;
    const h = hw + hf;
    const A = result.a;
    const yBar = (bw * hw * (hw / 2) + bf * hf * (hw + hf / 2)) / A;
    // Centroid should be above midheight because the flange (wide) is at the top
    expect(yBar).toBeGreaterThan(h / 2);
  });

  it('Iy of T-beam > Iy of rectangle with same dimensions', () => {
    const bw = 0.25, hw = 0.50, bf = 0.80, hf = 0.12;
    const tResult = computeSectionProperties('concrete-T', { bw, hw, bf, hf })!;
    // Rectangle of same width as web and same total height
    const rectIy = (bw * (hw + hf) ** 3) / 12;
    // T-beam should have larger Iy because the flange adds material far from centroid
    expect(tResult.iy).toBeGreaterThan(rectIy);
  });

  it('T-beam with bf=bw reduces to rectangle', () => {
    const bw = 0.30, hw = 0.50, bf = 0.30, hf = 0.10;
    const tResult = computeSectionProperties('concrete-T', { bw, hw, bf, hf })!;
    const h = hw + hf;
    // When bf == bw, the T-beam is actually a rectangle
    const rectA = bw * h;
    const rectIy = (bw * h ** 3) / 12;
    expectClose(tResult.a, rectA);
    expectClose(tResult.iy, rectIy, 1e-10);  // about Y (horizontal): h-dominated
  });
});

// ─── Existing steel shapes still work ───────────────────────────────

describe('Steel shapes backward compatibility', () => {
  it('rect still works', () => {
    const r = computeSectionProperties('rect', { b: 0.2, h: 0.4 });
    expect(r).not.toBeNull();
    expectClose(r!.a, 0.08);
    expect(r!.shape).toBe('rect');
  });

  it('I-custom still works', () => {
    const r = computeSectionProperties('I-custom', { h: 0.3, b: 0.15, tw: 0.007, tf: 0.011 });
    expect(r).not.toBeNull();
    expect(r!.shape).toBe('I');
    expect(r!.a).toBeGreaterThan(0);
    expect(r!.iz).toBeGreaterThan(0);
  });

  it('circular still works', () => {
    const r = computeSectionProperties('circular', { d: 0.3 });
    expect(r).not.toBeNull();
    expect(r!.shape).toBe('CHS');
  });
});
