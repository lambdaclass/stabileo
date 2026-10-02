/**
 * Channels (UPN): the warping constant, F.2's c and the weak-axis modulus to the flange tip.
 *
 * Without Cw a UPN took the simplified lateral-torsional branch (a UPN 120 read 941 %), and its
 * weak-axis modulus was I/(b/2), as if the centroid sat mid-flange: φMn 41–43 % high. Hand
 * values below are for a UPN 200 with parallel flanges: h 200, b 75, tw 8.5, tf 11.5 mm,
 * I_weak 148 cm⁴.
 */
import { describe, it, expect } from 'vitest';
import { steelSectionConstants } from '../section-constants';
import { checkSteelFlexure, type SteelDesignParams } from '../../codes/argentina/cirsoc301';

const UPN200 = { id: 9, name: 'UPN 200', shape: 'U', a: 32.2e-4, iy: 1910e-8, iz: 148e-8, h: 0.200, b: 0.075, tw: 0.0085, tf: 0.0115 };

describe('UPN constants', () => {
  const k = steelSectionConstants(UPN200 as never);

  it('has a warping constant from the thin-walled formula', () => {
    // h0 = 188.5, b' = 70.75 mm: tf·b'³·h0²/12 = 1.206e10; × (5645.4/6484) = 1.050e10 mm⁶.
    expect(k.Cw! * 1e18).toBeCloseTo(1.050e10, -8);
    // c = (h0/2)·√(I/Cw) = 94.25·√(1.48e6/1.050e10) = 1.119
    expect(k.c!).toBeCloseTo(1.119, 2);
  });

  it('measures the weak-axis modulus to the flange tip', () => {
    // x̄ = (2·75·11.5·37.5 + 177·8.5·4.25)/3229.5 = 22.0 mm; Sy = 1.48e6/(75 − 22.0) = 27 925 mm³.
    expect(k.Sy! * 1e9).toBeCloseTo(27925, -2);
    expect(k.Sy! * 1e9).toBeLessThan(1.48e6 / 37.5 * 0.75);
  });

  it('and the weak-axis capacity uses it', () => {
    const p: SteelDesignParams = {
      Fy: 235, Fu: 360, E: 200000, A: UPN200.a, Iz: UPN200.iy, Iy: UPN200.iz,
      h: UPN200.h, b: UPN200.b, tw: UPN200.tw, tf: UPN200.tf, L: 3, Lb: 3,
      ...(k.Zy !== undefined ? { Zy: k.Zy } : {}), Sy: k.Sy,
    };
    const withSy = checkSteelFlexure(p, 1, 'weak');
    const without = checkSteelFlexure({ ...p, Sy: undefined }, 1, 'weak');
    expect(withSy.phiMn).toBeLessThanOrEqual(without.phiMn);
    expect(withSy.phiMn).toBeCloseTo(Math.min(0.9 * 235 * (k.Zy ?? Infinity) * 1e9 / 1e6, 0.9 * 1.5 * 235 * k.Sy! * 1e9 / 1e6), 6);
  });
});

describe('F.2-2 applies Cb between Lp and Lr', () => {
  it('multiplies the inelastic capacity by Cb, up to Mp', () => {
    const IPE300: SteelDesignParams = {
      Fy: 235, Fu: 360, E: 200000, A: 53.8e-4, Iz: 8356e-8, Iy: 604e-8,
      h: 0.300, b: 0.150, tw: 0.0071, tf: 0.0107, L: 3, Lb: 3, J: 20.1e-8, Cw: 604e-8 * (0.300 - 0.0107) ** 2 / 4,
    };
    const one = checkSteelFlexure(IPE300, 1, 'strong');
    const cb = checkSteelFlexure({ ...IPE300, Cb: 1.14 }, 1, 'strong');
    expect(one.steps.join('\n')).toMatch(/inelastico/);
    const mp = 0.9 * 235 * 628e3 / 1e6 * 1.2;   // a ceiling well above
    expect(cb.phiMn).toBeGreaterThan(one.phiMn * 1.1);
    expect(cb.phiMn).toBeLessThan(mp);
  });
});
