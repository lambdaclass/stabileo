import { describe, it, expect } from 'vitest';
import {
  checkBearing, checkFooting, checkOneWayShear, type FootingInput,
} from '../foundation-check';
import { footingCentroidActions, planPressure } from '../footing-actions';

const footing = (over: Partial<FootingInput> = {}): FootingInput => ({
  kind: 'isolated',
  B: 2.5, L: 2.5, thickness: 0.60, d: 0.52,
  columnB: 0.40, columnH: 0.40,
  fc: 25, allowableBearing: 250,
  serviceAxial: 900, factoredAxial: 1250,
  position: 'interior',
  ...over,
});

describe('bearing pressure', () => {
  it('gives a uniform pressure for a concentric load', () => {
    const r = checkBearing(footing({ serviceAxial: 625 }));
    // 625 / 6.25 m² = 100 kPa
    expect(r.qMax).toBeCloseTo(100, 6);
    expect(r.qMin).toBeCloseTo(100, 6);
    expect(r.status).toBe('OK');
  });

  it('produces a trapezoid under eccentric load', () => {
    // e = 200/900 = 0.2222 m, within B/6 = 0.4167.
    const r = checkBearing(footing({ serviceMomentB: 200 }));
    expect(r.eB).toBeCloseTo(0.2222, 4);
    expect(r.qMax).toBeGreaterThan(r.qMin);
    expect(r.uplift).toBe(false);
  });

  it('fails when the peak exceeds the allowable', () => {
    expect(checkBearing(footing({ serviceAxial: 2000 })).status).toBe('FAIL');
  });

  it('refuses rather than under-reporting when the base lifts off', () => {
    // e = 500/900 = 0.5556 m > B/6 = 0.4167. The linear distribution stops being valid
    // and reporting its q_max would UNDER-state the real peak — the wrong direction.
    const r = checkBearing(footing({ serviceMomentB: 500 }));
    expect(r.status).toBe('UNSUPPORTED');
    expect(r.uplift).toBe(true);
    expect(r.memo.join(' ')).toMatch(/subestimaría la presión real/);
  });

  it('detects the kern boundary on either axis', () => {
    expect(checkBearing(footing({ serviceMomentL: 500 })).uplift).toBe(true);
    // Well inside the rhombus: eB = eL = 135/900 = 0,15 m, so 6e/B + 6e/L = 0,72 < 1.
    const inside = checkBearing(footing({ serviceMomentB: 135, serviceMomentL: 135 }));
    expect(inside.uplift).toBe(false);
    expect(inside.qMin).toBeGreaterThan(0);
  });

  it('applies the BIAXIAL full-contact boundary, not the two per-axis limits separately', () => {
    // eB = eL = 200/900 = 0,2222 m. Each is inside its own kern (B/6 = 0,4167), and the
    // PAIR is not: 6·0,2222/2,5 twice sums to 1,067, so q_min = 144·(1 − 1,067) = −9,6 kPa.
    //
    // The previous test was `|eB| > B/6 || |eL| > L/6`, which passed this footing, and the
    // check then reported a NEGATIVE bearing pressure as a valid OK result. Soil does not
    // pull. The full-contact region of a rectangle is the kern RHOMBUS, whose corners are the
    // per-axis limits, so a resultant can clear both axes and still lift a corner.
    const r = checkBearing(footing({ serviceMomentB: 200, serviceMomentL: 200 }));
    expect(r.qMin).toBeLessThan(0);
    expect(r.uplift).toBe(true);
    expect(r.status).toBe('UNSUPPORTED');
    // Neither axis alone is outside, so the memo says which condition was actually violated.
    expect(r.memo.join(' ')).toMatch(/combinación biaxial/);
  });

  it('reports UNSUPPORTED for a nonsensical input rather than dividing by zero', () => {
    expect(checkBearing(footing({ B: 0 })).status).toBe('UNSUPPORTED');
    expect(checkBearing(footing({ serviceAxial: 0 })).status).toBe('UNSUPPORTED');
  });
});

describe('one-way shear', () => {
  it('takes the critical section at d from the column face', () => {
    // a = (2.5 - 0.4)/2 - 0.52 = 0.53 m
    const q = 1250 / 6.25;
    const r = checkOneWayShear(footing(), q);
    expect(r.Vu).toBeCloseTo(q * 0.53 * 2.5, 6);
    expect(r.memo[0]).toMatch(/a = 0\.530/);
  });

  it('does not govern when the critical section falls outside the base', () => {
    // A deep, small footing: (1.0 - 0.4)/2 = 0.30 < d = 0.52, in both directions. (With L
    // left at 2,5 m the strips along L reach 0,53 m past d, and they are checked now.)
    const r = checkOneWayShear(footing({ B: 1.0, L: 1.0 }), 200);
    expect(r.status).toBe('OK');
    expect(r.Vu).toBe(0);
    expect(r.memo[0]).toMatch(/cae fuera de la zapata/);
  });

  it('fails a thin footing under heavy pressure', () => {
    const r = checkOneWayShear(footing({ d: 0.15, B: 4.0 }), 600);
    expect(r.status).toBe('FAIL');
    expect(r.utilization).toBeGreaterThan(1);
  });

  it('computes Vc per Table 22.5.5.1 row (c), not the 0.17 row (a)', () => {
    // Row (c) for Av < Av,min: 0,66·λs·λ·(ρw)^⅓·√f'c·bw·d, ρw at the 0,0018
    // floor (footing steel is designed after this check). Pre-fix used row (a)'s
    // 0,17 — ~2× the (c) value, and the comment wrongly claimed conservative.
    const r = checkOneWayShear(footing(), 200);
    const lambdaS = Math.min(1, Math.sqrt(2 / (1 + 0.004 * 520)));
    const expectedVc = 0.66 * lambdaS * Math.cbrt(0.0018) * 5 * 2.5 * 0.52 * 1000;
    expect(r.phiVc).toBeCloseTo(0.75 * expectedVc, 6);
  });
});

describe('the complete isolated footing', () => {
  it('passes an adequately sized footing', () => {
    const r = checkFooting(footing());
    expect(r.status).toBe('OK');
    expect(r.bearing.status).toBe('OK');
    expect(r.punching?.status).toBe('OK');
    expect(r.worstUtilization).toBeLessThan(1);
  });

  it('derives punching demand from the support reaction, less the soil inside the perimeter', () => {
    // Same equilibrium argument as a slab-column joint: the soil pressure acting inside
    // the critical perimeter never crosses the critical section.
    const r = checkFooting(footing());
    expect(r.punching?.demand.outcome).toBe('DERIVED');
    expect(r.punching?.demand.conservative).toBe(false);
    const q = 1250 / 6.25;
    const inside = q * (r.punching!.critical.enclosedArea);
    expect(r.punching?.demand.Vu).toBeCloseTo(1250 - inside, 4);
  });

  it('fails a footing too thin to punch', () => {
    const r = checkFooting(footing({ d: 0.15, thickness: 0.20, factoredAxial: 2500 }));
    expect(r.status).toBe('FAIL');
  });

  it('rolls an unsupported constituent up to UNSUPPORTED, not OK', () => {
    // Bearing is unsupported because the base lifts; everything else passes. Reporting
    // the footing as OK would be a false completeness claim.
    const r = checkFooting(footing({ serviceMomentB: 500 }));
    expect(r.status).toBe('UNSUPPORTED');
    expect(r.unsupported.join(' ')).toMatch(/núcleo central/);
    expect(r.status).not.toBe('OK');
  });

  it('computes the flexural demand at the column face', () => {
    const r = checkFooting(footing());
    const q = 1250 / 6.25;
    const a = (2.5 - 0.4) / 2;
    expect(r.Mu).toBeCloseTo(q * 2.5 * a * a / 2, 6);
  });

  it('is harder to satisfy at a corner than in the interior', () => {
    const interior = checkFooting(footing({ factoredAxial: 2000 }));
    const corner = checkFooting(footing({ factoredAxial: 2000, position: 'corner' }));
    expect(corner.punching!.utilization).toBeGreaterThan(interior.punching!.utilization);
  });

  it('cites the foundation clauses it applied', () => {
    const cl = checkFooting(footing()).refs.map((x) => x.clause);
    expect(cl).toContain('13.2');
    expect(cl).toContain('13.2.7');
    expect(cl).toContain('22.5');
    expect(cl).toContain('22.6.4.1');
  });

  it('is deterministic', () => {
    const run = () => checkFooting(footing({ serviceAxial: 873.2, factoredAxial: 1211.5 }));
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});

describe('foundation types that are NOT implemented', () => {
  it.each(['combined', 'strip', 'mat', 'pileCap'] as const)(
    'declares %s unsupported rather than treating it as isolated', (kind) => {
      const r = checkFooting(footing({ kind }));
      expect(r.status).toBe('UNSUPPORTED');
      expect(r.unsupported).toHaveLength(1);
      expect(r.memo.join(' ')).toMatch(/apariencia de correcto/);
      // Critically, no numbers are produced that could be mistaken for a check.
      expect(r.worstUtilization).toBe(0);
      expect(r.punching).toBeNull();
    });
});

describe('factored moments — trapezoidal pressure in strength checks', () => {
  it('integrates the strip with the trapezoid on the heavy side, not the uniform Nu/A', () => {
    // Same footing, same axial: adding a factored moment must RAISE the one-way
    // shear demand on the heavy side — the uniform distribution was under-stating it.
    const uniform = checkOneWayShear(footing(), 200);
    const r = checkOneWayShear(footing({ factoredMomentB: 125 }), 200);
    // eB = 125/1250 = 0.1; k = 0.24; qSec = 200·(1+0.24·0.576) = 227.6; qEdge = 248.
    const expected = (200 * (1 + 0.24 * (2 * 1.97 / 2.5 - 1)) + 200 * 1.24) / 2 * 0.53 * 2.5;
    expect(r.Vu).toBeCloseTo(expected, 6);
    expect(r.Vu).toBeGreaterThan(uniform.Vu);
    expect(r.memo.join(' ')).toMatch(/trapezoidal/);
  });

  it('computes the column-face moment with the trapezoid, larger than the uniform value', () => {
    const withMoment = checkFooting(footing({ factoredMomentB: 125 }));
    const uniform = checkFooting(footing());
    expect(withMoment.Mu).toBeGreaterThan(uniform.Mu);
    // Mu = L·c²·(2·qFace + qEdge)/6 = 2.5·1.05²·(2·207.68 + 248)/6.
    expect(withMoment.Mu).toBeCloseTo(2.5 * 1.05 ** 2 * (2 * 200 * 1.0384 + 200 * 1.24) / 6, 4);
  });

  it('refuses strength checks when the factored resultant leaves the kern', () => {
    // eB = 600/1250 = 0.48 > B/6 = 0.4167 — the base lifts under the governing
    // combination and the linear distribution would under-state the peak.
    const r = checkFooting(footing({ factoredMomentB: 600 }));
    expect(r.status).toBe('UNSUPPORTED');
    expect(r.oneWayShear).toBeNull();
    expect(r.punching).toBeNull();
    expect(r.unsupported.join(' ')).toMatch(/fuera del núcleo/);
  });

  it('leaves the punching deduction at Nu/A even with moment (centred enclosed area)', () => {
    // The bilinear pressure averages to Nu/A over the centred critical perimeter:
    // punching demand is unaffected by the factored moment.
    const uniform = checkFooting(footing());
    const withMoment = checkFooting(footing({ factoredMomentB: 125 }));
    expect(withMoment.punching!.utilization).toBeCloseTo(uniform.punching!.utilization, 9);
  });
});

/**
 * The eccentric-footing correction.
 *
 * `checkBearing` derived its eccentricity from `serviceMomentB / N` alone. That is the applied
 * moment's eccentricity about the SUPPORTED NODE, and `model/footing.ts` separately carries
 * `eccentricityB`/`eccentricityL` — the plan offset of the footing CENTROID from that node —
 * whose own doc comment says the resulting moment "is part of its bearing check". It was not.
 * The `N · e` term was never formed, and a deliberately eccentric footing was checked, sized
 * for shear and reinforced as if its column stood at its centre.
 *
 * The reference footing below is 3,00 × 2,00 m with its centroid offset 0,30 m from the node,
 * which is an ordinary property-line footing rather than a pathological one.
 */
const ecc = (over: Partial<FootingInput> = {}): FootingInput => ({
  kind: 'isolated',
  B: 3.0, L: 2.0, thickness: 0.60, d: 0.52,
  columnB: 0.40, columnH: 0.40,
  fc: 25, allowableBearing: 250,
  serviceAxial: 900, factoredAxial: 1250,
  eccentricityB: 0.30,
  position: 'interior',
  ...over,
});

describe('eccentric footings — the N·e correction', () => {
  it('is bit-identical on a centred footing, stated and absent eccentricity alike', () => {
    const absent = checkFooting(footing());
    const explicitZero = checkFooting(footing({ eccentricityB: 0, eccentricityL: 0 }));
    expect(JSON.stringify(explicitZero)).toBe(JSON.stringify(absent));
    // And the pre-fix closed forms still hold exactly, which is what makes the whole change
    // safe to land: nothing about a centred footing moved.
    const q = 1250 / 6.25;
    expect(absent.Mu).toBeCloseTo(q * 2.5 * 1.05 ** 2 / 2, 9);
    expect(absent.bearing.qMax).toBeCloseTo(900 / 6.25, 9);
    expect(absent.bearing.eB).toBe(0);
    expect(absent.punchingLoadInsidePerimeter).toBeCloseTo(q, 12);
  });

  it('forms N·e in the SERVICE bearing pressure — 150 kPa becomes 240', () => {
    // q0 = 900/6 = 150 kPa. e = −0,30 m, so k = 6·0,30/3,00 = 0,60 and the peak is 1,6·q0.
    // The pre-fix answer was the uniform 150 kPa: a 60 % under-statement of the peak bearing
    // pressure on an ordinary eccentric footing, in the unsafe direction.
    const r = checkBearing(ecc());
    expect(r.eB).toBeCloseTo(-0.30, 12);
    expect(r.geometricOffsetB).toBeCloseTo(-0.30, 12);
    expect(r.momentEccentricityB).toBe(0);
    expect(r.qMax).toBeCloseTo(240, 9);
    expect(r.qMin).toBeCloseTo(60, 9);
    expect(r.status).toBe('OK');   // 240 ≤ 250
    // The old behaviour, for the record: no eccentricity at all.
    expect(checkBearing(ecc({ eccentricityB: 0 })).qMax).toBeCloseTo(150, 9);
  });

  it('is symmetric under the sign of the offset', () => {
    const pos = checkBearing(ecc({ eccentricityB: 0.30 }));
    const neg = checkBearing(ecc({ eccentricityB: -0.30 }));
    expect(neg.qMax).toBeCloseTo(pos.qMax, 9);
    expect(neg.eB).toBeCloseTo(-pos.eB, 12);
  });

  it('forms N·e on the L axis alone, and on both axes together', () => {
    const lOnly = checkBearing(ecc({ eccentricityB: 0, eccentricityL: 0.20 }));
    // k_L = 6·0,20/2,00 = 0,60 — the same 1,6·q0 peak, on the other axis.
    expect(lOnly.eL).toBeCloseTo(-0.20, 12);
    expect(lOnly.qMax).toBeCloseTo(240, 9);
    expect(lOnly.eB).toBe(0);

    // Both: k_B = 6·0,15/3 = 0,30 and k_L = 6·0,10/2 = 0,30, so the peak is 1,6·q0 again and
    // q_min = 0,4·q0 — inside the rhombus, so this is checked rather than refused.
    const both = checkBearing(ecc({ eccentricityB: 0.15, eccentricityL: 0.10 }));
    expect(both.qMax).toBeCloseTo(240, 9);
    expect(both.qMin).toBeCloseTo(60, 9);
    expect(both.uplift).toBe(false);
  });

  it('lets an applied moment REINFORCE N·e, and does not let it cancel it away', () => {
    // e_geom = −0,30 m; M/N = 90/900 = 0,10 m. The two orientations give −0,40 and −0,20, and
    // the envelope must take −0,40: k = 0,80, peak 1,8·q0 = 270 kPa, which now FAILS the
    // 250 kPa allowable that the same footing without the moment passed.
    const reinforcing = checkBearing(ecc({ serviceMomentB: 90 }));
    expect(reinforcing.eB).toBeCloseTo(-0.40, 9);
    expect(reinforcing.momentEccentricityB).toBeCloseTo(0.10, 12);
    expect(reinforcing.qMax).toBeCloseTo(270, 6);
    expect(reinforcing.status).toBe('FAIL');

    // The sign of the reaction moment is not resolvable onto a footing-local axis, so flipping
    // it cannot change the answer: the envelope covers both, and the OPPOSING orientation is
    // never the one reported.
    expect(checkBearing(ecc({ serviceMomentB: -90 })).qMax).toBeCloseTo(270, 6);

    // Concretely: the answer is NOT the opposing orientation's 0,20 m → 210 kPa.
    expect(reinforcing.qMax).not.toBeCloseTo(210, 1);
  });

  it('picks the governing one-way-shear side by DEMAND, not by the longer cantilever', () => {
    // The column sits at −0,30 m, so the two cantilevers past the critical section are
    //   low:  3/2 − 0,30 − 0,20 − 0,52 = 0,48 m   under q from 293,33 to 333,33 kPa
    //   high: 3/2 + 0,30 − 0,20 − 0,52 = 1,08 m   under q from 173,33 to  83,33 kPa
    // and the SHORT cantilever governs, 300,8 kN against 277,2 kN, because it carries the
    // heavy end of the trapezoid. A check that took only the longer arm would miss it.
    const q0 = 1250 / 6;
    const r = checkOneWayShear(ecc(), q0);
    expect(r.governingSide).toBe('low');
    expect(r.cantilever).toBeCloseTo(0.48, 12);
    expect(r.qSection).toBeCloseTo(q0 * 1.408, 9);
    expect(r.qEdge).toBeCloseTo(q0 * 1.6, 9);
    expect(r.Vu).toBeCloseTo(300.8, 6);
    // The high side, for comparison — computed here from statics, not from the module.
    const vHigh = (q0 * 0.832 + q0 * 0.4) / 2 * 1.08 * 2.0;
    expect(vHigh).toBeCloseTo(277.2, 6);
    expect(r.Vu).toBeGreaterThan(vHigh);
  });

  it('takes Mu on the LONG cantilever, which is the other side from the shear', () => {
    // The two are genuinely different questions: shear weights the cantilever linearly and
    // moment weights it by c², so the heavy-pressure short arm wins the first and the long arm
    // wins the second. Mu_high = 440,89 kN·m against Mu_low = 277,78.
    const r = checkFooting(ecc());
    expect(r.MuSide).toBe('high');
    expect(r.MuCantilever).toBeCloseTo(1.60, 12);
    expect(r.Mu).toBeCloseTo(440.888889, 5);
    // The pre-fix value used the symmetric cantilever (3 − 0,4)/2 = 1,30 m and a uniform
    // pressure: 352,08 kN·m, an under-statement of the flexural demand by 20 %.
    const preFix = 2.0 * 1.3 ** 2 * (3 * (1250 / 6)) / 6;
    expect(preFix).toBeCloseTo(352.083333, 5);
    expect(r.Mu).toBeGreaterThan(preFix);
  });

  it('deducts the punching pressure at the COLUMN axis, not at the footing centroid', () => {
    // The critical perimeter is centred on the column, and the mean of a linear field over a
    // region is its value at that region's centroid. At u = −0,30 the field is 1,12·q0.
    const q0 = 1250 / 6;
    const r = checkFooting(ecc());
    expect(r.punchingLoadInsidePerimeter).toBeCloseTo(q0 * 1.12, 9);
    expect(r.punching!.demand.Vu)
      .toBeCloseTo(1250 - q0 * 1.12 * r.punching!.critical.enclosedArea, 6);
    // On a centred footing the column axis IS the centroid, so the deduction stays q0 exactly
    // — which is why the previous constant was correct there and only there.
    const centred = checkFooting(ecc({ eccentricityB: 0 }));
    expect(centred.punchingLoadInsidePerimeter).toBeCloseTo(q0, 12);
  });

  it('refuses the strength checks when N·e alone lifts the base', () => {
    // e = −0,55 m on a 3,00 m base: |e| > B/6 = 0,50, so the linear distribution stops being
    // valid. Pre-fix this footing had eB = 0 and every strength check was issued for it.
    const r = checkFooting(ecc({ eccentricityB: 0.55 }));
    expect(r.status).toBe('UNSUPPORTED');
    expect(r.bearing.uplift).toBe(true);
    expect(r.oneWayShear).toBeNull();
    expect(r.punching).toBeNull();
    expect(r.unsupported.join(' ')).toMatch(/núcleo/);
    // The reason names the geometric share, so the engineer knows which input to change.
    expect(r.unsupported.join(' ')).toMatch(/geométricos/);
  });

  it('uses ONE pressure field for bearing, shear, flexure and punching', () => {
    // Everything below is checked against a field built INDEPENDENTLY here from the same
    // inputs — the property that a footing cannot be verified against one distribution and
    // reinforced for another.
    const f = ecc({ factoredMomentB: 62.5 });   // M/N = 0,05 m
    const r = checkFooting(f);
    const act = footingCentroidActions({
      B: f.B, L: f.L, axial: f.factoredAxial,
      momentB: f.factoredMomentB, eccentricityB: f.eccentricityB,
    });
    const uCol = act.b.columnOffset;
    const fields = act.b.resultantOffsets.map(
      (uR) => (u: number) => planPressure(act.q0, f.B, f.L, uR, 0)(u, 0));

    // ── Flexure ──────────────────────────────────────────────────
    //
    // Enumerated here over both orientations and both faces, independently of the module.
    //
    // The winner is NOT the reinforcing orientation. `N · e` puts the resultant at −0,30 and
    // the moment moves it to −0,35 or −0,25; the LARGER Mu comes from −0,25, because the
    // governing cantilever is the 1,60 m one on the far side and pushing the resultant back
    // toward it raises the pressure over its whole length. The reinforcing orientation gives
    // the worse BEARING peak and the milder moment. That is precisely why every consumer must
    // enumerate rather than take a single worst-case eccentricity — and why the previous
    // `Math.abs`-then-assume-the-heavy-edge form could not have got this right.
    const cLow = f.B / 2 + uCol - f.columnB / 2;
    const cHigh = f.B / 2 - uCol - f.columnB / 2;
    let best = { Mu: -Infinity, qFace: 0, qEdge: 0, side: '' as 'low' | 'high' };
    for (const q of fields) {
      for (const side of ['low', 'high'] as const) {
        const c = side === 'low' ? cLow : cHigh;
        const edgeU = side === 'low' ? -f.B / 2 : f.B / 2;
        const faceU = side === 'low' ? edgeU + c : edgeU - c;
        const Mu = f.L * c * c * (2 * q(faceU) + q(edgeU)) / 6;
        if (Mu > best.Mu) best = { Mu, qFace: q(faceU), qEdge: q(edgeU), side };
      }
    }
    expect(r.MuSide).toBe(best.side);
    expect(r.Mu).toBeCloseTo(best.Mu, 9);
    expect(r.MuQFace).toBeCloseTo(best.qFace, 9);
    expect(r.MuQEdge).toBeCloseTo(best.qEdge, 9);

    // ── One-way shear ────────────────────────────────────────────
    const aLow = cLow - f.d;
    const aHigh = cHigh - f.d;
    let worstV = { Vu: -Infinity, qEdge: 0, qSec: 0, side: '' as 'low' | 'high', a: 0 };
    for (const q of fields) {
      for (const side of ['low', 'high'] as const) {
        const a = side === 'low' ? aLow : aHigh;
        if (!(a > 0)) continue;
        const edgeU = side === 'low' ? -f.B / 2 : f.B / 2;
        const secU = side === 'low' ? edgeU + a : edgeU - a;
        const Vu = (q(secU) + q(edgeU)) / 2 * a * f.L;
        if (Vu > worstV.Vu) worstV = { Vu, qEdge: q(edgeU), qSec: q(secU), side, a };
      }
    }
    const s = r.oneWayShear!;
    expect(s.governingSide).toBe(worstV.side);
    expect(s.Vu).toBeCloseTo(worstV.Vu, 9);
    expect(s.qEdge).toBeCloseTo(worstV.qEdge, 9);
    expect(s.qSection).toBeCloseTo(worstV.qSec, 9);

    // ── Punching ─────────────────────────────────────────────────
    //
    // The LEAST value at the column axis, because a smaller deduction is a larger V_u.
    expect(r.punchingLoadInsidePerimeter)
      .toBeCloseTo(Math.min(...fields.map((q) => q(uCol))), 9);
    // The service bearing eccentricity is the service field's own resultant offset.
    expect(r.bearing.eB).toBeCloseTo(
      footingCentroidActions({
        B: f.B, L: f.L, axial: f.serviceAxial, eccentricityB: f.eccentricityB,
      }).b.worstResultantOffset, 12);
  });

  it('is deterministic under eccentricity', () => {
    const run = () => checkFooting(ecc({
      eccentricityB: 0.213, eccentricityL: -0.117,
      serviceMomentB: 41.7, factoredMomentL: -18.3,
      serviceAxial: 873.2, factoredAxial: 1211.5,
    }));
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});

/**
 * The unbalanced moment at the column–footing connection.
 *
 * ── The defect these pin ───────────────────────────────────────
 *
 * `checkFooting` called `checkPunchingShear` with a demand carrying the support reaction and
 * the enclosed pressure and NOTHING about the moment. So `M_sc` was `hypot(0, 0)` for every
 * footing the app has ever checked, the §8.4.4.2 refusal inside the punching engine was
 * unreachable, and a footing whose flexural steel was being sized for a 125 kN·m factored
 * moment was reported as a direct-shear punching PASS.
 *
 * Every expectation below is derived here from the free body, not read back off the module.
 */
describe('punching moment transfer', () => {
  /** `∫∫ q·s dA` over the enclosed rectangle, from the field, integrated independently. */
  const enclosedMoment = (
    q0: number, S: number, uR: number, span: number, width: number,
  ): number => {
    // Midpoint rule on a fine grid over the enclosed rectangle, about its own centre. A
    // NUMERICAL integral on purpose: it agrees with the closed form only if the closed form
    // is the integral of the same field, which is the property under test.
    const n = 400;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const s = -span / 2 + (i + 0.5) * (span / n);
      // The `v` direction integrates to `width` for the constant and `s`-linear terms and to
      // zero for the `v`-linear one, so one dimension suffices for this axis's first moment.
      sum += q0 * (1 + 12 * uR * s / (S * S)) * s * (span / n) * width;
    }
    return sum;
  };

  it('leaves a centred footing with no applied moment numerically unchanged', () => {
    const r = checkFooting(footing());
    expect(r.punching!.momentTransfer.status).toBe('NONE');
    expect(r.punching!.momentTransfer.Msc).toBe(0);
    expect(r.punching!.status).toBe('OK');
    expect(r.status).toBe('OK');
  });

  it('reaches checkPunchingShear with the free-body moment when one is applied', () => {
    const f = footing({ factoredMomentB: 125 });
    const r = checkFooting(f);
    const mt = r.punching!.momentTransfer;

    // Independently: q0 = 1250/6.25 = 200 kPa; the enclosed rectangle is
    // (0.40 + 0.52) = 0.92 m square; u_R = ±125/1250 = ±0.10 m about a centred column.
    const q0 = 1250 / (2.5 * 2.5);
    const worst = Math.max(
      ...[1, -1].map((o) => Math.abs(
        o * 125 - enclosedMoment(q0, 2.5, o * 0.1, 0.92, 0.92))),
    );
    expect(mt.MscY).toBeCloseTo(worst, 4);
    expect(mt.Msc).toBeCloseTo(worst, 4);
    // The column axis is the enclosed centre, so the soil relieves rather than adds: the
    // section carries LESS than the column delivers.
    expect(mt.Msc).toBeLessThan(125);
    expect(mt.Msc).toBeGreaterThan(0.9 * 125);
  });

  it('cannot produce an OK punching result once the moment is significant', () => {
    const r = checkFooting(footing({ factoredMomentB: 125 }));
    expect(r.punching!.momentTransfer.status)
      .toBe('UNSUPPORTED_MOMENT_TRANSFER_NOT_EVALUATED');
    expect(r.punching!.momentTransfer.significant).toBe(true);
    expect(r.punching!.status).toBe('UNSUPPORTED');
    // The whole footing, not only the punching row: a footing whose punching could not be
    // verified is not a verified footing.
    expect(r.status).toBe('UNSUPPORTED');
    expect(r.unsupported.join(' ')).toMatch(/8\.4\.4\.2/);
    // The direct-shear numbers survive for the report; what is refused is the VERDICT.
    expect(r.punching!.utilization).toBeGreaterThan(0);
  });

  it('reports the moment a plan eccentricity alone transfers, and names the tolerance', () => {
    // NO applied moment. The pressure under the column is still non-uniform, so its resultant
    // misses the column axis and the critical section carries a moment. The applied-moment
    // term alone would report zero for exactly the footings that are deliberately eccentric.
    const f = footing({ eccentricityB: 0.30 });
    const r = checkFooting(f);
    const mt = r.punching!.momentTransfer;
    const q0 = 1250 / (2.5 * 2.5);
    // Column at u = −0.30 in centroid coordinates; with no applied moment both orientations
    // coincide, so u_R = −0.30.
    const expected = Math.abs(enclosedMoment(q0, 2.5, -0.30, 0.92, 0.92));
    expect(mt.MscY).toBeCloseTo(expected, 4);
    expect(mt.MscY).toBeGreaterThan(0);
    // Below the stated 2 % of V_u·d on this footing, so direct shear still governs — and the
    // memo says so rather than presenting a tolerance as an exact zero.
    expect(mt.status).toBe('NEGLIGIBLE');
    expect(r.punching!.memo.join(' ')).toMatch(/umbral de significancia/);
    expect(r.punching!.status).toBe('OK');
  });

  it('refuses to form the moment on a truncated perimeter instead of assuming zero', () => {
    for (const position of ['edge', 'corner'] as const) {
      const r = checkFooting(footing({ position }));
      expect(r.punching!.momentTransfer.status).toBe('UNSUPPORTED_MOMENT_NOT_FORMED');
      expect(r.punching!.momentTransfer.notFormedReason).toMatch(/truncado/);
      expect(r.punching!.status).toBe('UNSUPPORTED');
      expect(r.status).toBe('UNSUPPORTED');
    }
  });

  it('prints the applied and relief terms separately, because the relief is not derivable', () => {
    const memo = checkFooting(footing({ factoredMomentB: 125 })).memo.join(' ');
    expect(memo).toMatch(/Momento no balanceado en la conexión/);
    expect(memo).toMatch(/alivio de la presión encerrada/);
    // The axial force is explicitly stated not to contribute, so a reader does not have to
    // wonder whether it was forgotten.
    expect(memo).toMatch(/La fuerza axial no aporta momento/);
  });
});

describe('one-way shear in both directions', () => {
  it('gives the same verdict whichever way a rectangular base is turned', () => {
    // 1,5 × 3,0 m, d = 0,40, column 30×30, 1200 kN: the long cantilever governs either way round.
    const f = { B: 1.5, L: 3.0, d: 0.40, thickness: 0.48, columnB: 0.30, columnH: 0.30, factoredAxial: 1200 };
    const q = 1200 / (1.5 * 3.0);
    const a = checkOneWayShear(footing(f), q);
    const b = checkOneWayShear(footing({ ...f, B: 3.0, L: 1.5 }), q);
    expect(a.utilization).toBeCloseTo(b.utilization, 9);
    expect(a.status).toBe(b.status);
    // The long cantilever: a = (3,0 − 0,30)/2 − 0,40 = 0,95 m across the 1,5 m width.
    expect(a.cantilever).toBeCloseTo(0.95, 9);
    expect(a.Vu).toBeCloseTo(q * 0.95 * 1.5, 6);
  });
});
