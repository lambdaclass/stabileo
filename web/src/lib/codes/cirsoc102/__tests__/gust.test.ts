/**
 * CIRSOC 102-2025 §1.9: the gust effect factor against the commentary's worked example (Tabla
 * C 1.9-1) and hand calculations.
 */
import { describe, it, expect } from 'vitest';
import {
  gustEffectFactor, approximateFrequency, effectiveLength, flexibleEccentricity, sizeReduction,
  resonantResponse, dynamicSensitivity,
} from '../gust';

const rel = (a: number, b: number) => Math.abs(a / b - 1);

describe('gust effect factor', () => {
  it('reproduces Tabla C 1.9-1: G 0,818 and G_f 1,162', () => {
    const r = gustEffectFactor({ exposure: 'B', V: 51.4, h: 182.88, B: 30.48, L: 30.48, n1: 0.2, beta: 0.01, rigidG: 'calculated' });
    expect(r.kind).toBe('flexible');
    const s = r.steps, x = s.resonant!;
    expect(rel(s.iz, 0.201)).toBeLessThan(0.01);
    expect(rel(s.lz, 217.8)).toBeLessThan(0.01);
    expect(rel(s.q ** 2, 0.616)).toBeLessThan(0.01);
    expect(s.gCalculated).toBeCloseTo(0.818, 3);
    expect(rel(x.vBar, 41.15)).toBeLessThan(0.01);
    expect(rel(x.n1Reduced, 1.053)).toBeLessThan(0.01);
    expect(rel(x.rn, 0.128)).toBeLessThan(0.01);
    expect(rel(x.etaH, 4.094)).toBeLessThan(0.01);
    expect(rel(x.rh, 0.214)).toBeLessThan(0.01);
    expect(rel(x.rb, 0.666)).toBeLessThan(0.01);
    expect(rel(x.rl, 0.343)).toBeLessThan(0.01);
    expect(rel(x.r ** 2, 1.261)).toBeLessThan(0.01);
    expect(rel(x.gR, 3.787)).toBeLessThan(0.01);
    expect(Math.abs(r.value.value - 1.162)).toBeLessThan(0.003);
  });

  it('a 60 m concrete frame, exposure C, V 45 m/s, β 2 %: G_f 0,978 with the wind along Y and 0,999 along X', () => {
    const na = approximateFrequency('concreteMomentFrame', 60, 30);
    expect('na' in na && na.na).toBeCloseTo(0.3747, 4);
    const n1 = 'na' in na ? na.na : 0;
    const y = gustEffectFactor({ exposure: 'C', V: 45, h: 60, B: 30, L: 20, n1, beta: 0.02, rigidG: 'default' });
    expect(y.steps.zBar).toBeCloseTo(36, 9);
    expect(y.steps.iz).toBeCloseTo(0.1616, 4);
    expect(y.steps.lz).toBeCloseTo(196.38, 1);
    expect(y.steps.q).toBeCloseTo(0.8496, 3);
    expect(y.steps.gCalculated).toBeCloseTo(0.858, 3);
    expect(y.steps.resonant!.vBar).toBeCloseTo(36.28, 1);
    expect(y.steps.resonant!.r).toBeCloseTo(0.6273, 3);
    expect(y.steps.resonant!.gR).toBeCloseTo(3.949, 3);
    expect(y.value.value).toBeCloseTo(0.978, 3);
    const x = gustEffectFactor({ exposure: 'C', V: 45, h: 60, B: 20, L: 30, n1, beta: 0.02, rigidG: 'default' });
    expect(x.value.value).toBeCloseTo(0.999, 3);
    // Less damping, more response; as n₁ rises G_f falls toward the calculated G, from above.
    expect(gustEffectFactor({ exposure: 'C', V: 45, h: 60, B: 30, L: 20, n1, beta: 0.01, rigidG: 'default' }).value.value).toBeCloseTo(1.075, 3);
    const at = (f: number) => gustEffectFactor({ exposure: 'C', V: 45, h: 60, B: 30, L: 20, n1: f, beta: 0.02, rigidG: 'default' });
    expect(at(0.99).value.value).toBeGreaterThan(y.steps.gCalculated);
    // At 1 Hz it is rigid.
    expect(at(1).kind).toBe('rigidDefault');
    // The service speed recomputes it.
    expect(gustEffectFactor({ exposure: 'C', V: 37.8, h: 60, B: 30, L: 20, n1, beta: 0.02, rigidG: 'default' }).value.value).toBeCloseTo(0.944, 3);
  });

  it('rigid: 0,85 by default, Eq. (1.9-6) when asked; a low-rise building needs no frequency', () => {
    const base = { exposure: 'C' as const, V: 45, h: 20, B: 30, L: 20, beta: 0.02 };
    expect(gustEffectFactor({ ...base, n1: 1.4, rigidG: 'default' }).value.value).toBe(0.85);
    expect(gustEffectFactor({ ...base, n1: 1.4, rigidG: 'calculated' }).value.value).toBeCloseTo(0.864, 3);
    expect(gustEffectFactor({ ...base, n1: 0.5, lowRise: true, rigidG: 'default' }).kind).toBe('rigidDefault');
  });

  it('a steel chimney 40 m tall, 2 m across, n₁ 0,8 Hz, β 0,5 %: G_f 1,299', () => {
    expect(gustEffectFactor({ exposure: 'C', V: 45, h: 40, B: 2, L: 2, n1: 0.8, beta: 0.005, rigidG: 'default' }).value.value).toBeCloseTo(1.299, 3);
  });

  it('the approximate frequencies and their limits (§1.9.2.1, §1.9.3)', () => {
    const f = (s: Parameters<typeof approximateFrequency>[0]) => { const r = approximateFrequency(s, 60, 30); return 'na' in r ? r.na : NaN; };
    expect(f('steelMomentFrame')).toBeCloseTo(0.3243, 4);
    expect(f('otherSteelOrConcrete')).toBeCloseTo(0.3810, 4);
    expect('refused' in approximateFrequency('steelMomentFrame', 90, 40)).toBe(true);
    expect('refused' in approximateFrequency('steelMomentFrame', 60, 15)).toBe(true);
    expect(effectiveLength([{ h: 3, L: 30 }, { h: 6, L: 20 }])).toBeCloseTo((3 * 30 + 6 * 20) / 9, 12);
  });

  it('the flexible eccentricity, Eq. (2.4-5)', () => {
    const y = gustEffectFactor({ exposure: 'C', V: 45, h: 60, B: 30, L: 20, n1: 0.37469, beta: 0.02, rigidG: 'default' });
    const s = y.steps, x = s.resonant!;
    expect(flexibleEccentricity({ eQ: 4.5, eR: 1.5, iz: s.iz, q: s.q, r: x.r, gR: x.gR }).value).toBeCloseTo(4.016, 2);
    expect(flexibleEccentricity({ eQ: 4.5, eR: 0, iz: s.iz, q: s.q, r: x.r, gR: x.gR }).value).toBeCloseTo(3.946, 2);
  });

  it('guards: η = 0, a frequency below 1/3600 Hz or no damping; the sensitivity warnings', () => {
    expect(sizeReduction(0)).toBe(1);
    expect(resonantResponse({ n1: 1 / 4000, beta: 0.02, B: 1, L: 1, h: 1, vBar: 30, lz: 100 })).toBeNull();
    expect(gustEffectFactor({ exposure: 'C', V: 45, h: 60, B: 30, L: 20, n1: 0.4, beta: 0, rigidG: 'default' }).kind).toBe('unsupported');
    expect(dynamicSensitivity({ h: 130, bMin: 20, n1: 0.2, vBar: 40 }).map((m) => m.key.split('.').pop())).toEqual(['tall', 'slender', 'lowFrequency', 'reducedSpeed']);
  });
});
