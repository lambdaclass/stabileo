/**
 * The CIRSOC 301 fillet weld against INTI-CIRSOC's published worked example.
 *
 * Source: G. Troglia, D. Troglia, J. Angulo Bocco, *Ejemplos de Aplicación del Reglamento
 * CIRSOC 301-2018*, INTI-CIRSOC, July 2018, Ejemplo 2 (Ej. 2-2 … 2-3): double angle
 * 2×(50,8×6,4) in tension, Tu = 220 kN, welded to a 6,4 mm gusset with four fillet runs.
 * Coverage table: `docs/verification/DESIGN_EXAMPLES.md`.
 */

import { describe, it, expect } from 'vitest';
import { designFilletWeld, minimumLegMm, maximumLegMm } from '../fillet-weld';

describe('INTI CIRSOC 301-2018, Ejemplo 2 — fillet weld in shear', () => {
  /**
   * Printed: FEXX = 480 MPa, Fnw = 0,60·FEXX = 288 MPa, φ = 0,60 (Tabla J.2-5);
   * leg dw = 4 mm, throat 0,707·dw; Tu/4 = 55 kN per run → L = 11,3 cm (Ej. 2-7);
   * L/dw = 29 < 100 → β = 1.
   */
  it('strength per run at the printed length equals the printed demand', () => {
    const r = designFilletWeld({
      legMm: 4, lengthMm: 113, runs: 1, fexxMPa: 480,
      thickerPartMm: 6.4, thinnerPartMm: 6.4, loading: 'endLoaded', demandKN: 55,
    });
    const strength = r.checks.find((c) => c.id === 'strength')!;
    // 3 significant figures: 11,3 cm is rounded up from 11,26 cm.
    expect(Math.abs((strength.limit as number) - 55) / 55).toBeLessThanOrEqual(0.005);
    expect(r.effectiveLengthMm).toBe(113);
  });

  /**
   * Printed: «Lado mínimo … De tabla J.2-4 dw = 5 mm», «lado máximo dw = 6,40 − 2 = 4,40 mm»,
   * «Se adopta menor al lado máximo dw = 4 mm».
   *
   * DISCREPANCY (example): the adopted 4 mm is below the 5 mm minimum the example itself reads
   * from Tabla J.2.4. CIRSOC 301-2018's table has no "need not exceed the thinner part"
   * exception (AISC's Table J2.4 has none either for this case), so for these 6,4 mm parts the
   * clause text leaves no admissible leg. stabileo reports exactly that: minimum exceeded, maximum
   * satisfied.
   */
  it('size limits — the example adopts a leg below its own Tabla J.2.4 minimum', () => {
    expect(minimumLegMm(6.4)).toBe(5);
    expect(maximumLegMm(6.4)).toBeCloseTo(4.4, 12);
    const r = designFilletWeld({
      legMm: 4, lengthMm: 120, runs: 4, fexxMPa: 480,
      thickerPartMm: 6.4, thinnerPartMm: 6.4, demandKN: 220,
    });
    expect(r.checks.find((c) => c.id === 'minimumSize')!.state).toBe('exceeded');
    expect(r.checks.find((c) => c.id === 'maximumSize')!.state).toBe('adequate');
  });
});
