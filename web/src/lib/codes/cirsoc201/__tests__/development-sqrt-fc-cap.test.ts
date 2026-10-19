/**
 * CIRSOC 201-2025 §25.4.1.4 (docs/codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-25-detalles-de-armado.md:452-454):
 * «Los valores de √f´c usados para calcular la longitud de anclaje no deben exceder de 8,3 MPa.»
 * It sits in §25.4.1 (general), so it governs every development length of §25.4: ld in tension (§25.4.2),
 * ldh with a standard hook (§25.4.3), ldc in compression (§25.4.9); and the laps of §25.5, which are
 * multiples of ld (Tabla 25.5.2.1). Headed bars (§25.4.4) are not implemented here.
 *
 * H-80 (√80 = 8,944 > 8,3), ADN 420 (ψg = 1), Ø20 (db > 16 mm), ψt = ψe = λ = 1:
 *   ld, «otros casos»  = 420/(1,1·8,3)·20 = 920,04 mm   (with √80: 853,77)
 *   ld, first row      = 420/(1,7·8,3)·20 = 595,32 mm   (with √80: 552,44)
 *   ldh (a)            = 0,24·420/8,3·20  = 242,89 mm > 8·db = 160 mm, 150 mm   (with √80: 225,40)
 *   lap, Class B       = 1,3·920,04       = 1196,06 mm  (with √80: 1109,90)
 */
import { describe, it, expect } from 'vitest';
import { deriveDevelopment, deriveHookedDevelopment, deriveLap } from '../anchorage';
import { requiredLdh } from '../../../engine/station-design-forces';
import { verifyElement } from '../../../engine/codes/argentina/cirsoc201';

const base = { diameterMm: 20, fy: 420, fc: 80, edition: '2025' as const };

describe('√f\'c ≤ 8,3 MPa in every development length (§25.4.1.4)', () => {
  it('ld by Tabla 25.4.2.3, both rows, and the Class B lap that follows from it', () => {
    const other = deriveDevelopment({ ...base, favourableSpacing: false });
    expect(other.ldM * 1000).toBeCloseTo(920.04, 1);
    expect(other.refs.map((r) => r.clause)).toContain('25.4.1.4');
    expect(deriveDevelopment({ ...base, favourableSpacing: true }).ldM * 1000).toBeCloseTo(595.32, 1);
    expect(deriveLap(other, { edition: '2025' }).lapM * 1000).toBeCloseTo(1196.06, 1);
  });

  it('ldh by §25.4.3.1, in the code module and in the verifier', () => {
    expect(deriveHookedDevelopment(base).ldhM * 1000).toBeCloseTo(242.89, 1);
    expect(requiredLdh(20, 80, 420) * 1000).toBeCloseTo(242.89, 1);
  });

  it('the report\'s detailing table reads the same ldh', () => {
    const v = verifyElement({ elementId: 1, elementType: 'beam', Mu: 150, Vu: 80, Nu: 0, fc: 80, fy: 420, cover: 0.025, b: 0.3, h: 0.5, stirrupDia: 8 });
    for (const bar of v.detailing!.bars) {
      const hand = Math.max((0.24 * 420 / 8.3) * bar.diameter, 8 * bar.diameter, 150) / 1000;
      expect(bar.ldh).toBeCloseTo(Math.round(hand * 100) / 100, 9);
    }
  });

  it('below the limit nothing changes: H-25 reads √25 = 5', () => {
    expect(deriveHookedDevelopment({ ...base, fc: 25 }).ldhM * 1000).toBeCloseTo(0.24 * 420 / 5 * 20, 6);
    expect(deriveDevelopment({ ...base, fc: 25, favourableSpacing: false }).refs.map((r) => r.clause)).not.toContain('25.4.1.4');
  });
});
