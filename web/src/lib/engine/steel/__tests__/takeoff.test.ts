import { describe, it, expect } from 'vitest';
import { steelTakeoff } from '../takeoff';

describe('steel takeoff', () => {
  it('weighs each profile from its area and the unit weight', () => {
    // IPE 200: 28,5 cm² · 77 kN/m³ / g = 22,38 kg/m; three of 6 m = 402,8 kg.
    const r = steelTakeoff({ members: [1, 2, 3].map((id) => ({ id, L: 6, sectionName: 'IPE 200', area: 28.5e-4 })).concat([{ id: 4, L: 4, sectionName: 'HEB 200', area: 78.1e-4 }]) });
    const ipe = r.rows.find((x) => x.profile === 'IPE 200')!;
    expect(ipe.kgPerM).toBeCloseTo(22.38, 2);
    expect(ipe.kg).toBeCloseTo(402.8, 1);
    expect(ipe.members).toBe(3);
    expect(r.totalLength).toBe(22);
    expect(r.rows[0]!.profile).toBe('IPE 200');
  });
});
