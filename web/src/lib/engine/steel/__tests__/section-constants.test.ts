/**
 * J and Cw for a rolled I, against the tabulated IPE 300.
 *
 * Tables list It = 20.1 cm⁴ and Iw = 125.9·10³ cm⁶. The thin-walled J leaves out the root
 * fillets, so it reads below the table (conservative for lateral-torsional buckling); Cw from
 * I_weak·h₀²/4 matches to the table's rounding.
 */
import { describe, it, expect } from 'vitest';
import { steelSectionConstants } from '../section-constants';

const IPE300 = { shape: 'I', a: 53.8e-4, iy: 8356e-8, iz: 603.8e-8, h: 0.3, b: 0.15, tw: 0.0071, tf: 0.0107 };

describe('section constants for the CIRSOC 301 checker', () => {
  it('a rolled I without a stated J gets the thin-walled one, below the table', () => {
    const k = steelSectionConstants(IPE300 as never);
    expect(k.jBasis).toBe('thinWalled');
    const jCm4 = k.J * 1e8;
    expect(jCm4).toBeGreaterThan(15);
    expect(jCm4).toBeLessThan(20.1);
  });

  it('and its warping constant, to the table', () => {
    const k = steelSectionConstants(IPE300 as never);
    expect((k.Cw! * 1e12) / 125.9e3).toBeCloseTo(1, 2);
  });

  it('a stated J is used as stated', () => {
    expect(steelSectionConstants({ ...IPE300, j: 20.1e-8 } as never)).toMatchObject({ J: 20.1e-8, jBasis: 'declared' });
  });

  it('a tube gets no I-shape warping constant', () => {
    expect(steelSectionConstants({ shape: 'RHS', a: 1e-3, iy: 1e-6, iz: 1e-6, h: 0.1, b: 0.1, tw: 0.005, tf: 0.005 } as never).Cw)
      .toBeUndefined();
  });
});
