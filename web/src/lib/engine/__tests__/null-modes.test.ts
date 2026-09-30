/**
 * The mechanism (null) modes taken out of an eigenvalue result: a mode is one by its own value,
 * not by how it compares with the largest mode found, and the Rayleigh fit is refit on what is
 * kept, one mode or two.
 */
import { describe, it, expect } from 'vitest';
import { filterBuckling, filterModal } from '../wasm-solver';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = { modes: any[]; [k: string]: any };
const mode = (v: object) => ({ displacements: [{ nodeId: 1, ux: 1, uy: 0, rz: 0 }], ...v });

describe('null modes', () => {
  it('a huge spurious load factor does not make the real critical one a mechanism', () => {
    const r = filterBuckling({ modes: [mode({ loadFactor: 3.5 }), mode({ loadFactor: 1e12 }), mode({ loadFactor: 2e12 })] } as Result);
    expect(r.modes.map((m: { loadFactor: number }) => m.loadFactor)).toContain(3.5);
    expect(r.discardedModes).toEqual([]);
  });

  it('a zero load factor is still taken out', () => {
    const r = filterBuckling({ modes: [mode({ loadFactor: 1e-12 }), mode({ loadFactor: 3.5 })] } as Result);
    expect(r.modes.map((m: { loadFactor: number }) => m.loadFactor)).toEqual([3.5]);
    expect(r.discardedModes).toHaveLength(1);
  });

  it('a stiff local mode does not make a slow real vibration a mechanism', () => {
    // 0,1 Hz sway (a tall, slender mast) and a 20 000 Hz local mode of a stubby member: ω² 0,39
    // against 1,6e10, a ratio of 2,5e-11.
    const w = (f: number) => ({ frequency: f, omega: 2 * Math.PI * f });
    const r = filterModal({ modes: [mode(w(0.1)), mode(w(20000))] } as Result, ['X']);
    expect(r.modes).toHaveLength(2);
  });

  it('one vibration left after a null mode: the Rayleigh fit is on it, not on the discarded one', () => {
    const w = (f: number) => ({ frequency: f, omega: 2 * Math.PI * f });
    const real = 2 * Math.PI * 3;
    const r = filterModal({
      modes: [mode(w(2e-6)), mode(w(3))],
      rayleigh: { omega1: 2 * Math.PI * 2e-6, omega2: real, a0: 0, a1: 2 * 0.05 / real, dampingRatios: [0.05, 0.05] },
    } as Result, ['X']);
    expect(r.modes).toHaveLength(1);
    // With one mode the two-mode fit reduces to a0 = ξω, a1 = ξ/ω.
    expect(r.rayleigh.a0).toBeCloseTo(0.05 * real, 9);
    expect(r.rayleigh.a1).toBeCloseTo(0.05 / real, 12);
    expect(r.rayleigh.omega1).toBeCloseTo(real, 9);
  });
});
