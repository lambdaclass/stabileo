/**
 * Differential test: footing shear, TypeScript (`foundation-check.ts`, `punching-shear.ts`)
 * against the engine (`foundation_check.rs`, `check_spread_footings`).
 *
 * On centred, concentrically loaded isolated footings — the case the two describe alike — they
 * disagreed on every footing deeper than 250 mm, and the engine was the one wrong: it took
 * punching without the size factor λs (Tabla 22.6.5.2 with 22.5.5.1.3) and one-way shear with
 * 0,17·√f'c, row (a) of Tabla 22.5.5.1, which needs stirrups a footing does not have. Fixed in
 * Rust (row (c), λs, √f'c ≤ 8,3, ρw = 0,0018 when not stated). They now agree to 1e-9.
 *
 * Not compared, because the two do not model them alike: bearing (the engine takes Meyerhof's
 * effective area, the app a linear pressure), moments and eccentric columns, and the engine's
 * single axial force used for both service bearing and factored shear.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { criticalSection, punchingResistance, PHI_SHEAR } from '../../detailing/punching-shear';
import { checkOneWayShear } from '../../detailing/foundation-check';
import { checkSpreadFootings } from '../../wasm-solver';

describe('footing shear: app and engine agree on centred footings', () => {
  it('punching and one-way shear, both directions', () => {
    fc.assert(fc.property(
      fc.record({
        B: fc.double({ min: 1.2, max: 5, noNaN: true }),
        Lr: fc.double({ min: 0.6, max: 2, noNaN: true }),
        t: fc.double({ min: 0.35, max: 1.4, noNaN: true }),
        cB: fc.double({ min: 0.25, max: 0.8, noNaN: true }),
        cH: fc.double({ min: 0.25, max: 0.8, noNaN: true }),
        fc: fc.constantFrom(20, 25, 30, 35, 40, 80),
        Pu: fc.double({ min: 200, max: 6000, noNaN: true }),
      // The punching perimeter inside the footing: otherwise neither model describes it.
      }).filter((p) => p.B * p.Lr > p.cH + p.t && p.B > p.cB + p.t),
      (p) => {
        const L = p.B * p.Lr;
        const d = p.t - 0.075;
        const area = p.B * L;
        // Engine: length ↔ the app's L (along the column's H side), width ↔ B.
        const [r] = checkSpreadFootings({
          footings: [{ footingId: 1, length: L, width: p.B, thickness: p.t, depth: 1.0, qAllowable: 1e12,
            gammaSoil: 18000, fc: p.fc * 1e6, colLength: p.cH, colWidth: p.cB, d }],
          forces: [{ footingId: 1, p: p.Pu * 1e3 }],
        }) as Array<{ punchingShearRatio: number; onewayShearRatio: number }>;

        // Punching, app.
        const crit = criticalSection(p.cB, p.cH, d, 'interior');
        const vc = punchingResistance(p.fc, crit, 'interior').vc; // MPa
        const phiVcPunch = PHI_SHEAR * vc * crit.bo * d * 1000; // kN
        const VuPunch = p.Pu * (1 - crit.enclosedArea / area);
        expect(Math.abs(r.punchingShearRatio - VuPunch / phiVcPunch)).toBeLessThan(1e-9 * (VuPunch / phiVcPunch) + 1e-12);

        // One-way, app, both directions; the engine reports the governing one.
        const ow = checkOneWayShear({
          kind: 'isolated', B: p.B, L, thickness: p.t, d, columnB: p.cB, columnH: p.cH, fc: p.fc,
          allowableBearing: 1e9, serviceAxial: p.Pu, factoredAxial: p.Pu,
        }, p.Pu / area);
        if (ow.utilization > 0) {
          expect(Math.abs(r.onewayShearRatio - ow.utilization)).toBeLessThan(1e-9 * ow.utilization + 1e-12);
        }
      },
    ), { numRuns: 2000, seed: 2025 });
  });
});
