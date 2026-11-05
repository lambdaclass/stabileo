import { describe, expect, it } from 'vitest';
import { shortestPeriodShown, SHOWN_MODES } from '../mdof-build';

const mode = (T: number, phiAt: number) => ({ T, omega: (2 * Math.PI) / T, phi: [phiAt] });
const harmonic = (X: number, resonant = false) => ({ X: resonant ? Infinity : X, beta: 0.5, resonant });

describe('the shortest period the plots draw', () => {
  const T = [1, 0.5, 0.3, 0.2, 0.1, 0.01];
  const ex = { kind: 'harmonic', Omega: 2 * Math.PI } as never;

  it('a resonant mode does not hide the higher modes that still move the plotted degree of freedom', () => {
    const sol = { modes: T.map((t) => mode(t, 1)) } as never;
    const resp = { harmonics: [harmonic(0, true), harmonic(1), harmonic(1), harmonic(1), harmonic(1), harmonic(0.5)] } as never;
    expect(SHOWN_MODES).toBeLessThan(T.length);
    expect(shortestPeriodShown(sol, resp, 0, ex)).toBe(0.01);
  });

  it('a resonant mode with no motion at the plotted degree of freedom leaves the filter working', () => {
    const sol = { modes: T.map((t, i) => mode(t, i === 0 ? 0 : 1)) } as never;
    const resp = { harmonics: [harmonic(0, true), harmonic(1), harmonic(1), harmonic(1), harmonic(1), harmonic(1e-6)] } as never;
    expect(shortestPeriodShown(sol, resp, 0, ex)).toBe(0.1);
  });
});
