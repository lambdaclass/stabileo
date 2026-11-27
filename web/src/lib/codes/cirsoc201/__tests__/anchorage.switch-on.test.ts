import { describe, it, expect } from 'vitest';
import { confinementOf, deriveDevelopment, deriveHookedDevelopment, favourableRow, sizeFactor } from '../anchorage';

describe('§25.4.3.1 — hooked development length', () => {
  it('the formula term governs for a typical bar: ldh = 0,24·fy/√f\'c·db', () => {
    // Ø20, fy 420, f'c 25: 0.24·420/5·20 = 403,2 mm > 8db = 160 > 150.
    const r = deriveHookedDevelopment({ diameterMm: 20, fy: 420, fc: 25, edition: '2025' });
    expect(r.ldhM).toBeCloseTo(0.4032, 6);
    expect(r.governedBy).toBe('formula');
  });

  it('floors at 150 mm for small bars and low grades', () => {
    // Ø10, fy 250, f'c 25: 0.24·250/5·10 = 120 mm < 150 → (c) governs.
    const r = deriveHookedDevelopment({ diameterMm: 10, fy: 250, fc: 25, edition: '2025' });
    expect(r.ldhM).toBeCloseTo(0.150, 9);
    expect(r.governedBy).toBe('150mm');
  });

  it('floors at 8·db where that exceeds both the formula and 150 mm', () => {
    // Ø25, fy 250, f'c 40: 0.24·250/√40·25 = 237 mm < 8·25 = 200? No — 237 > 200.
    // Ø14, fy 250, f'c 40: 0.24·250/√40·14 = 132,8 → max(132.8, 112, 150) = 150.
    // Need 8db > formula AND 8db > 150: Ø20+ with low fy/high fc.
    // Ø20, fy 250, f'c 60: 0.24·250/√60·20 = 154,9 < 160 = 8db → (b) governs.
    const r = deriveHookedDevelopment({ diameterMm: 20, fy: 250, fc: 60, edition: '2025' });
    expect(r.ldhM).toBeCloseTo(0.160, 6);
    expect(r.governedBy).toBe('8db');
  });

  it('grows with the lightweight factor λ', () => {
    const normal = deriveHookedDevelopment({ diameterMm: 20, fy: 420, fc: 25, edition: '2025' });
    const light = deriveHookedDevelopment({ diameterMm: 20, fy: 420, fc: 25, lambda: 0.75, edition: '2025' });
    expect(light.ldhM).toBeCloseTo(normal.ldhM / 0.75, 6);
  });

  it('cites §25.4.3.1', () => {
    const r = deriveHookedDevelopment({ diameterMm: 20, fy: 420, fc: 25, edition: '2025' });
    expect(r.refs.some((c) => c.clause === '25.4.3.1')).toBe(true);
  });
});

describe('§25.4.2.4 — general development length', () => {
  const base = { fy: 420, fc: 25, favourableSpacing: false, edition: '2025' as const };

  it('Ø20 at f\'c 25: 153 cm by the "other cases" row, 61 cm with (cb + Ktr)/db at its 2,5 cap', () => {
    expect(deriveDevelopment({ ...base, diameterMm: 20 }).ldM).toBeCloseTo(420 / (1.1 * 5) * 0.02, 9);
    const g = deriveDevelopment({ ...base, diameterMm: 20, confinement: { cbMm: 80 } });
    expect(g.confinementTerm).toBe(2.5);
    expect(g.tableRow).toBe('general');
    expect(g.ldM).toBeCloseTo(420 / (1.1 * 5 * 2.5) * 0.02, 9);
    expect(g.refs.map((r) => r.clause)).toEqual(expect.arrayContaining(['25.4.2.4', 'Tabla 25.4.2.5']));
    expect(g.derivation.key).toBe('codes.cirsoc201.anchorage.developmentGeneral');
  });

  it('takes ψs = 0,8 at Ø16 and below, 1,0 above, and the real cb below the cap', () => {
    expect([12, 16, 20].map(sizeFactor)).toEqual([0.8, 0.8, 1.0]);
    const r = deriveDevelopment({ ...base, diameterMm: 16, confinement: { cbMm: 24 } });
    expect(r.confinementTerm).toBeCloseTo(1.5, 12);
    expect(r.ldM).toBeCloseTo(420 * 0.8 / (1.1 * 5 * 1.5) * 0.016, 9);
    expect(deriveDevelopment({ ...base, diameterMm: 16, confinement: { cbMm: 24, ktrMm: 16 } }).confinementTerm).toBe(2.5);
  });

  it('grades ψg 1,15 for ADN 500 and floors at 300 mm', () => {
    const a = deriveDevelopment({ ...base, fy: 500, diameterMm: 25, confinement: { cbMm: 40 } });
    expect(a.ldM).toBeCloseTo(500 * 1.15 / (1.1 * 5 * 1.6) * 0.025, 9);
    const small = deriveDevelopment({ ...base, diameterMm: 8, confinement: { cbMm: 40 } });
    expect(small.ldM).toBe(0.3);
    expect(small.derivation.key).toBe('codes.cirsoc201.anchorage.developmentGeneralMinimum');
  });

  it('cb is the lesser of the cover to the bar centre and half the spacing; the table\'s first row only where its conditions hold', () => {
    expect(confinementOf(10, 25, 150).cbMm).toBe(30);
    expect(confinementOf(16, 40, 50).cbMm).toBe(25);
    expect(favourableRow({ diameterMm: 20, clearSpacingMm: 25, clearCoverMm: 33, minimumStirrups: true })).toBe(true);
    expect(favourableRow({ diameterMm: 20, clearSpacingMm: 25, clearCoverMm: 33, minimumStirrups: false })).toBe(false);
    expect(favourableRow({ diameterMm: 25, clearSpacingMm: 50, clearCoverMm: 20, minimumStirrups: true })).toBe(false);
    expect(favourableRow({ diameterMm: 10, clearSpacingMm: 140, clearCoverMm: 25, minimumStirrups: false })).toBe(true);
  });
});

it.skip('known wrong result: #1928 the sheet development explanation states the transverse index actually used', () => {
  const bars = { diameterMm: 20, fy: 420, fc: 25, favourableSpacing: false, edition: '2025' as const };
  for (const ktrMm of [0, 7]) {
    const r = deriveDevelopment({ ...bars, confinement: { cbMm: 24, ktrMm } });
    expect(r.derivation.params?.ktr).toBe(ktrMm);
  }
});
