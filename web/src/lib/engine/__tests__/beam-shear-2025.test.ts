/**
 * Beam shear per CIRSOC 201-2025: the section limit of §22.5.1.2, Av,min (9.6.3.4) and row (c)
 * of Tabla 22.5.5.1 when the stirrups are below it.
 */
import { describe, it, expect } from 'vitest';
import { computeShearCapacity } from '../station-design-forces';

describe('beam shear, 2025', () => {
  it('caps the stirrups at 0,66·√f\'c·bw·d', () => {
    // 20×40, d = 0.36, H-20, Ø12 4 legs c/5: Vs = 1367 kN uncapped; the section takes
    // Vs ≤ 0.66·√20·200·360 = 212.5 kN, and Vc = 0.17·√20·200·360 = 54.7 kN.
    const r = computeShearCapacity(12, 4, 0.05, 0.20, 0.36, 20, 420, 0, { Ag: 0.2 * 0.4, rhoW: 0.01 });
    expect(r.capped).toBe(true);
    expect(r.phiVn).toBeCloseTo(0.75 * (54.74 + 212.5), 0);
    expect(r.phiVn).toBeLessThan(700);
  });

  it('reads row (c) with λs and ρw when the stirrups are below Av,min', () => {
    // 30×60, d = 0.55, H-30, Ø6 2 legs c/25: Av = 0.565 cm² < Av,min = 0.35·300·250/420 = 0.625 cm².
    // ρw = 6.03/(30·55) = 0.003655; λs = √(2/3.2) = 0.7906;
    // vc = 0.66·0.7906·0.1541·√30 = 0.4403 MPa → Vc = 72.6 kN; Vs = 0.565/0.25·420·0.55/10 = 52.3 kN.
    const r = computeShearCapacity(6, 2, 0.25, 0.30, 0.55, 30, 420, 0, { Ag: 0.3 * 0.6, rhoW: 6.03 / (30 * 55) });
    expect(r.avBelowMin).toBe(true);
    expect(r.phiVn).toBeCloseTo(0.75 * (72.6 + 52.3), 0);
    // It read 0,17·√f'c (row a) regardless: Vc = 153.6 kN, and the beam passed.
    expect(r.phiVn).toBeLessThan(0.75 * (153.6 + 52.3));
  });

  it('keeps row (a) with enough stirrups', () => {
    const r = computeShearCapacity(8, 2, 0.15, 0.30, 0.55, 30, 420, 0, { Ag: 0.18, rhoW: 0.004 });
    expect(r.avBelowMin).toBe(false);
    expect(r.phiVc).toBeCloseTo(0.75 * 0.17 * Math.sqrt(30) * 300 * 550 / 1000, 1);
  });
});
