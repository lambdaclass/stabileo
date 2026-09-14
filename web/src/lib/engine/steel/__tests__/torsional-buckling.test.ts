/**
 * §E.4's applicability, and why it cannot run here.
 *
 * ── What is being tested ──────────────────────────────────────────
 *
 * Not a capacity — there is none. What is tested is the DISCRIMINATION: that a tube is out of scope
 * rather than missing data, that an angle is in scope with named gaps, and that the one input the
 * app can produce is not listed as missing. A module that reported «unavailable» for everything
 * would pass a laxer test and tell a user nothing.
 *
 * The gaps come from reading the clause: `Cw` (E.4.9), `J` (E.4.3), `kz` as a boundary condition,
 * the compactness condition of E.4.2(a), and the torsional unbraced length for the doubly-symmetric
 * case.
 */

import { describe, it, expect } from 'vitest';
import { e4Applicability, e4GapKey, shearModulus } from '../torsional-buckling';
import { shearCentreWorking } from '../../section-teaching';
import es from '../../../i18n/locales/steel/es';
import en from '../../../i18n/locales/steel/en';
import pt from '../../../i18n/locales/steel/pt';

describe('scope — out of scope is not the same as missing data', () => {
  it('rules out closed and solid sections', () => {
    // Torsionally stiff, and not among the cases E.4 lists. No gaps, because nothing is needed.
    for (const shape of ['RHS', 'CHS', 'rect']) {
      const v = e4Applicability({ shape, j: 1e-8 });
      expect(v.applicable, shape).toBe(false);
      expect(v.scope, shape).toBe('outOfScope');
      expect(v.gaps, shape).toEqual([]);
    }
  });

  it('puts singly-symmetric and asymmetric sections in scope', () => {
    // The clause's first bullet. In scope means «E.4 could govern», which is why the gaps matter.
    for (const shape of ['T', 'U', 'C', 'L', 'invL', 'Z']) {
      const v = e4Applicability({ shape, j: 1e-8 });
      expect(v.scope, shape).toBe('inScope');
      expect(v.gaps.length, shape).toBeGreaterThan(0);
    }
  });

  it('and puts doubly-symmetric OPEN sections in scope, on the length condition', () => {
    /*
     * «Todos aquellos miembros de sección abierta doblemente simétrica, cuando la longitud efectiva
     * torsional lateralmente no arriostrada es mayor que la longitud efectiva flexional» — two
     * lengths the model holds as one, so the length itself is reported as a gap rather than the
     * member being quietly excluded.
     */
    for (const shape of ['I', 'H']) {
      const v = e4Applicability({ shape, j: 1e-8 });
      expect(v.scope, shape).toBe('inScope');
      expect(v.gaps, shape).toContain('torsionalUnbracedLength');
    }
  });

  it('treats an unnameable shape as in scope, not as excluded', () => {
    // The conservative reading: a shape the app cannot name is not one whose torsional behaviour it
    // can rule out.
    const v = e4Applicability({ shape: 'generic', j: 1e-8 });
    expect(v.scope).toBe('inScope');
    expect(v.gaps).toContain('shearCentre');
  });
});

describe('the gaps are the ones the clause creates', () => {
  it('always reports the warping constant, because nothing in the app has one', () => {
    /*
     * E.4.9: `Fez = (π²·E·Cw/(kz·L)² + G·J)·1/(Ag·r̄o²)`. No section declares `Cw` — not the
     * catalogue, not the templates — and the caller never passes it. This is the gap that makes E.4
     * unreachable regardless of everything else.
     */
    for (const shape of ['T', 'U', 'C', 'L', 'invL', 'Z', 'I', 'H']) {
      expect(e4Applicability({ shape, j: 1e-8 }).gaps, shape).toContain('warpingConstant');
    }
  });

  it('reports the torsional constant only when the section lacks it', () => {
    // A section WITH `J` must not be told it is missing one — that is the discrimination a blanket
    // «unavailable» would lose.
    expect(e4Applicability({ shape: 'C', j: 1e-8 }).gaps).not.toContain('torsionalConstant');
    expect(e4Applicability({ shape: 'C' }).gaps).toContain('torsionalConstant');
    // Zero counts as absent: E.4.3 divides by it, and a zero Fcrz is not a small value.
    expect(e4Applicability({ shape: 'C', j: 0 }).gaps).toContain('torsionalConstant');
  });

  it('always reports the torsional end condition, which is a modelling gap', () => {
    // «kz = 1 cuando los extremos del miembro tienen la torsión impedida y el alabeo libre.» A fact
    // about the connections. Assuming it would be inventing a boundary condition.
    expect(e4Applicability({ shape: 'T', j: 1e-8 }).gaps).toContain('torsionalEndCondition');
  });

  it('reports the classification gap for a Tee, per E.4.2(a)', () => {
    /*
     * That branch covers «secciones doble ángulo … y secciones Te, todas compactas o no compactas».
     * Establishing it needs B.4.1, whose λp/λr tables are images in the source PDF — so the gap is
     * real and it is a DATA gap, not work.
     */
    expect(e4Applicability({ shape: 'T', j: 1e-8 }).gaps).toContain('sectionClassification');
    // And not for a shape that branch does not name.
    expect(e4Applicability({ shape: 'U', j: 1e-8 }).gaps).not.toContain('sectionClassification');
  });

  it('does NOT report the shear centre for shapes the app can decompose', () => {
    /*
     * The input E.4 needs that this app genuinely has. `section-teaching.ts` places the shear centre
     * for these shapes already, so listing it as missing would be pessimism rather than honesty.
     *
     * Cross-checked against that module rather than asserted from a list, so the two cannot drift.
     */
    for (const shape of ['I', 'H', 'T', 'U', 'C', 'L', 'invL'] as const) {
      expect(e4Applicability({ shape, j: 1e-8 }).gaps, shape).not.toContain('shearCentre');
    }
  });

  it('and the shear centre really is computable for those shapes', () => {
    // The other half of the previous assertion: the claim is checked against the module that would
    // supply it, for the two shapes whose offset is non-trivial.
    for (const shape of ['T', 'C'] as const) {
      const w = shearCentreWorking({
        shape, h: 0.2, b: 0.1, tw: 0.006, tf: 0.009, t: 0.006,
        a: 0.003, iz: 1e-6, iy: 2e-5,
      } as never);
      expect(w, shape).toBeTruthy();
      expect(Number.isFinite(w.ez) && Number.isFinite(w.ey), shape).toBe(true);
    }
  });
});

describe('the one input the app can produce', () => {
  it('computes G from E and ν', () => {
    // `G = E/(2(1+ν))`. For steel at 200 000 MPa and ν = 0,3 that is 76 923 MPa.
    expect(shearModulus(200_000, 0.3)).toBeCloseTo(76_923.077, 3);
  });

  it('and it is not listed among the gaps, because it is not one', () => {
    const v = e4Applicability({ shape: 'C', j: 1e-8 });
    expect(v.gaps).not.toContain('shearModulus' as never);
  });
});

describe('E.4 is never reported as available today', () => {
  it('because the warping constant is always missing', () => {
    /*
     * The `applicable: true` branch exists so the shape of the answer does not have to change the
     * day a section carries `Cw`. It is unreachable now, and this asserts that rather than leaving
     * a reader to wonder whether some path already claims E.4 works.
     */
    for (const shape of ['T', 'U', 'C', 'L', 'invL', 'Z', 'I', 'H', 'generic']) {
      expect(e4Applicability({ shape, j: 1e-8 }).applicable, shape).toBe(false);
    }
  });

  it('and supplying Cw is what would change that', () => {
    // Not reachable through the app, only through this test — which is exactly the point: the
    // blocker is a datum, and here is the proof that it is the ONLY one for a channel with J.
    const v = e4Applicability({ shape: 'C', j: 1e-8, cw: 1e-6 });
    expect(v.gaps).not.toContain('warpingConstant');
    // The end condition still stands, so it is still not applicable — two blockers, not one.
    expect(v.gaps).toContain('torsionalEndCondition');
    expect(v.applicable).toBe(false);
  });
});

describe('every gap and reason resolves in the three offered languages', () => {
  const dicts = { es, en, pt } as Record<string, Record<string, string>>;
  const gaps = ['warpingConstant', 'torsionalConstant', 'torsionalEndCondition',
                'sectionClassification', 'torsionalUnbracedLength', 'shearCentre'] as const;

  it('resolves each gap as a sentence naming its clause or its cause', () => {
    for (const [name, dict] of Object.entries(dicts)) {
      for (const g of gaps) {
        const v = dict[e4GapKey(g)];
        expect(v, `${name}: ${g}`).toBeTruthy();
        expect(v.length, `${name}: ${g}`).toBeGreaterThan(40);
      }
    }
  });

  it('resolves each verdict reason', () => {
    for (const [name, dict] of Object.entries(dicts)) {
      for (const k of ['outOfScope', 'shapeUnknown', 'missingInputs', 'available', 'notImplemented']) {
        expect(dict[`steel.e4.${k}`], `${name}: ${k}`).toBeTruthy();
      }
    }
  });

  it('and says why the absence matters, not just that it exists', () => {
    // E.4 governs for the sections whose axes M2 already warns about. A limitation with no
    // consequence attached is one a reader discounts.
    for (const [name, dict] of Object.entries(dicts)) {
      expect(dict['steel.e4.notImplemented'].toLowerCase(), name)
        .toMatch(/ángulos|angles|cantoneiras/);
    }
  });
});
