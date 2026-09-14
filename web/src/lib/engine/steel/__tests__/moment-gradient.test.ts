/**
 * `Cb` per F.1.1, against the cases whose answers are known.
 *
 * ── Why these cases ───────────────────────────────────────────────
 *
 * F.1.1 is an interpolation formula, so a single-point test proves nothing. What pins it is the set
 * of diagrams whose `Cb` is a textbook number:
 *
 *   · **uniform moment** → 1,00 exactly. The formula's floor, and the case `Cb = 1` was written for.
 *   · **simply supported, uniform load** (parabola, zero at both ends) → 1,136.
 *   · **linear, zero at one end** → 1,667.
 *   · **linear, reversing sign end to end** (double curvature) → 2,273.
 *
 * Each is computed from the definition in the test rather than quoted, so a reader sees why the
 * number is that number; the assertions then check the module reproduces it.
 *
 * The scope cases matter as much as the arithmetic: F.1.1 is stated for doubly-symmetric sections
 * and for singly-symmetric ones in SINGLE curvature only, and §F.1(3) makes `Cb = 1` mandatory for
 * a cantilever with an unbraced free end. A formula applied outside its case is worse than a
 * conservative constant.
 */

import { describe, it, expect } from 'vitest';
import {
  momentGradient, shapeSymmetry, cbBasisKey, type StationMoment,
} from '../moment-gradient';
import es from '../../../i18n/locales/steel/es';
import en from '../../../i18n/locales/steel/en';
import pt from '../../../i18n/locales/steel/pt';

/**
 * Nine stations, so that t = 0,25 / 0,50 / 0,75 land exactly ON stations.
 *
 * Deliberate: with an eleven-station grid the quarter points fall BETWEEN samples and get linearly
 * interpolated, which on a parabola loses about a unit of moment and shifts Cb by ~0,006. That is
 * real behaviour and it has its own test below — but mixing it into the textbook cases would make
 * those cases about the sampling instead of about F.1.1.
 */
const N = 9;
const diagram = (f: (t: number) => number): StationMoment[] =>
  Array.from({ length: N }, (_, i) => ({ t: i / (N - 1), m: f(i / (N - 1)) }));

/** F.1.1, evaluated here so the expected values are derived and not quoted. */
function f11(mMax: number, mA: number, mB: number, mC: number): number {
  return (12.5 * mMax) / (2.5 * mMax + 3 * mA + 4 * mB + 3 * mC);
}

describe('the four diagrams whose Cb is known', () => {
  it('uniform moment gives exactly 1', () => {
    // Every quarter point equals Mmáx: 12,5/(2,5+3+4+3) = 1. The formula's floor.
    const g = momentGradient({ stations: diagram(() => 100), shape: 'I' });
    expect(g.basis).toBe('computed');
    expect(g.cb).toBeCloseTo(1, 12);
    expect(g.cb).toBeCloseTo(f11(100, 100, 100, 100), 12);
  });

  it('a simply supported beam under uniform load gives 1,136', () => {
    /*
     * M(t) = 4·Mmáx·t·(1 − t): zero at both ends, peak at mid. So MA = MC = 0,75·Mmáx and
     * MB = Mmáx, giving 12,5/(2,5 + 2,25 + 4 + 2,25) = 12,5/11 = 1,136…
     */
    const g = momentGradient({ stations: diagram((t) => 4 * 100 * t * (1 - t)), shape: 'I' });
    expect(g.basis).toBe('computed');
    expect(g.cb).toBeCloseTo(f11(100, 75, 100, 75), 9);
    expect(g.cb).toBeCloseTo(12.5 / 11, 9);
    expect(g.cb).toBeCloseTo(1.136, 3);
  });

  it('a linear diagram falling to zero gives 1,667', () => {
    // M(t) = Mmáx·(1 − t): MA = 0,75, MB = 0,50, MC = 0,25 of Mmáx.
    const g = momentGradient({ stations: diagram((t) => 100 * (1 - t)), shape: 'I' });
    expect(g.cb).toBeCloseTo(f11(100, 75, 50, 25), 9);
    expect(g.cb).toBeCloseTo(1.667, 3);
  });

  it('a linear diagram reversing sign gives 2,273', () => {
    /*
     * M(t) = Mmáx·(1 − 2t): +Mmáx at one end, −Mmáx at the other, zero at mid. The absolute
     * quarter-point moments are 0,5·Mmáx, 0 and 0,5·Mmáx.
     *
     * Double curvature, and legitimate here because the section is doubly symmetric — F.1.1 covers
     * «todos los casos de miembros con secciones de doble simetría» whatever the curvature.
     */
    const g = momentGradient({ stations: diagram((t) => 100 * (1 - 2 * t)), shape: 'I' });
    expect(g.curvature).toBe('double');
    expect(g.cb).toBeCloseTo(f11(100, 50, 0, 50), 9);
    expect(g.cb).toBeCloseTo(2.273, 3);
  });

  it('and every one of them is at least 1 — the formula never penalises', () => {
    // Which is why computing it can only raise a capacity above the permitted conservative floor.
    for (const f of [
      () => 100, (t: number) => 4 * 100 * t * (1 - t), (t: number) => 100 * (1 - t),
      (t: number) => 100 * (1 - 2 * t), (t: number) => 100 * Math.sin(Math.PI * t),
    ]) {
      expect(momentGradient({ stations: diagram(f), shape: 'H' }).cb).toBeGreaterThanOrEqual(1 - 1e-12);
    }
  });
});

describe('the moments it reports are the ones F.1.1 names', () => {
  it('reads the quarter, mid and three-quarter points of the segment', () => {
    const g = momentGradient({ stations: diagram((t) => 100 * (1 - t)), shape: 'I' });
    expect(g.mA).toBeCloseTo(75, 9);
    expect(g.mB).toBeCloseTo(50, 9);
    expect(g.mC).toBeCloseTo(25, 9);
    expect(g.mMax).toBeCloseTo(100, 9);
  });

  it('reads a sampled curve as sampled, not as the underlying function', () => {
    /*
     * The property the first run of this file mistook for a bug. On an ELEVEN-station grid the
     * quarter points sit between samples, so a parabola's MA comes out 74 instead of 75 — linear
     * interpolation cutting a corner off a curve. Cb then reads 1,1426 rather than 1,1364.
     *
     * That is correct: the module reads the diagram the analysis produced, not an idealised one. It
     * is asserted so nobody later "fixes" it into an assumption about the load shape, and the
     * direction is worth knowing — the coarser grid gives the slightly HIGHER Cb.
     */
    const eleven = Array.from({ length: 11 }, (_, i) => {
      const t = i / 10;
      return { t, m: 4 * 100 * t * (1 - t) };
    });
    const g = momentGradient({ stations: eleven, shape: 'I' });
    expect(g.mA).toBeCloseTo(74, 9);
    expect(g.cb).toBeCloseTo(f11(100, 74, 100, 74), 9);
    expect(g.cb).toBeGreaterThan(12.5 / 11);
  });

  it('and interpolates when the quarter point is not a station', () => {
    // Three stations only: 0, 0.5, 1. The quarter points fall between them.
    const g = momentGradient({
      stations: [{ t: 0, m: 100 }, { t: 0.5, m: 50 }, { t: 1, m: 0 }], shape: 'I',
    });
    expect(g.basis).toBe('computed');
    expect(g.mA).toBeCloseTo(75, 9);
    expect(g.mC).toBeCloseTo(25, 9);
  });

  it('honours a segment that is not the whole member', () => {
    /*
     * `Lb` is the whole member today, but the segment is a parameter because that is what F.1.1 is
     * written about — «el segmento no arriostrado». Reading the second half of a linear diagram
     * must give the quarter points OF THAT HALF.
     */
    const g = momentGradient({
      stations: diagram((t) => 100 * (1 - t)), shape: 'I', tStart: 0.5, tEnd: 1,
    });
    expect(g.mA).toBeCloseTo(37.5, 9);   // t = 0.625
    expect(g.mB).toBeCloseTo(25, 9);     // t = 0.75
    expect(g.mC).toBeCloseTo(12.5, 9);   // t = 0.875
  });
});

describe('the cantilever rule is mandatory, and comes first', () => {
  it('forces Cb = 1 whatever the diagram says', () => {
    /*
     * «Para miembros en voladizo, cuando el extremo libre no esté arriostrado, se deberá tomar
     * Cb = 1 para todos los casos, cualquiera sea el diagrama de momento flector en el voladizo.»
     *
     * The diagram used here would compute 1,667 if the rule were not applied, so this fails loudly
     * if the ordering ever changes.
     */
    const stations = diagram((t) => 100 * (1 - t));
    expect(momentGradient({ stations, shape: 'I' }).cb).toBeCloseTo(1.667, 3);
    const g = momentGradient({ stations, shape: 'I', cantileverFreeEnd: true });
    expect(g.cb).toBe(1);
    expect(g.basis).toBe('unityRequiredCantilever');
  });
});

describe('scope — the cases F.1.1 is written for, and no others', () => {
  it('applies to a doubly-symmetric section in either curvature', () => {
    for (const shape of ['I', 'H', 'RHS', 'CHS', 'rect']) {
      expect(shapeSymmetry(shape)).toBe('double');
      for (const f of [(t: number) => 100 * (1 - t), (t: number) => 100 * (1 - 2 * t)]) {
        expect(momentGradient({ stations: diagram(f), shape }).basis, shape).toBe('computed');
      }
    }
  });

  it('applies to a singly-symmetric section in SINGLE curvature', () => {
    for (const shape of ['U', 'C', 'T']) {
      expect(shapeSymmetry(shape)).toBe('single');
      const g = momentGradient({ stations: diagram((t) => 100 * (1 - t)), shape });
      expect(g.basis, shape).toBe('computed');
      expect(g.curvature).toBe('single');
    }
  });

  it('but NOT to a singly-symmetric section in double curvature — §F.1(4) wants both flanges', () => {
    /*
     * The scope boundary that matters. F.1(4): «Para miembros con secciones de simple simetría con
     * deformada de doble curvatura el estado límite de pandeo lateral-torsional deberá ser
     * verificado para ambas alas». This app computes one Mn, so applying F.1.1 there would be using
     * a formula outside the case it is written for.
     */
    for (const shape of ['U', 'C', 'T']) {
      const g = momentGradient({ stations: diagram((t) => 100 * (1 - 2 * t)), shape });
      expect(g.basis, shape).toBe('unityOutOfScope');
      expect(g.cb).toBe(1);
      expect(g.reasonKey).toBe('steel.cb.reason.singlySymmetricDoubleCurvature');
    }
  });

  it('and not to a section with no axis of symmetry', () => {
    // A zed has point symmetry only; an angle has none. Neither is in F.1.1's two cases.
    for (const shape of ['Z', 'L', 'invL']) {
      expect(shapeSymmetry(shape)).toBe('none');
      const g = momentGradient({ stations: diagram((t) => 100 * (1 - t)), shape });
      expect(g.basis, shape).toBe('unityOutOfScope');
      expect(g.cb).toBe(1);
    }
  });

  it('nor to a shape the app cannot name', () => {
    // `unknown` is not a licence to assume double symmetry: the scope is written in terms of
    // symmetry, and a shape with no name has none the app can assert.
    expect(shapeSymmetry(undefined)).toBe('unknown');
    expect(shapeSymmetry('generic')).toBe('unknown');
    const g = momentGradient({ stations: diagram(() => 100), shape: 'generic' });
    expect(g.basis).toBe('unityOutOfScope');
  });

  it('and symmetry is a DIFFERENT question from principal axes', () => {
    /*
     * A zed's geometric axes are not principal AND it has no axis of symmetry — two true facts, and
     * neither implies the other. A channel is the case that separates them: symmetric about one
     * axis, and its geometric axes ARE principal.
     */
    expect(shapeSymmetry('C')).toBe('single');
    expect(shapeSymmetry('Z')).toBe('none');
  });
});

describe('no diagram means the permitted constant, not a guess', () => {
  it('returns 1 with fewer than three stations in the segment', () => {
    for (const stations of [[], [{ t: 0, m: 10 }], [{ t: 0, m: 10 }, { t: 1, m: 0 }]]) {
      const g = momentGradient({ stations, shape: 'I' });
      expect(g.cb).toBe(1);
      expect(g.basis).toBe('unityNoDiagram');
    }
  });

  it('and returns 1 for a segment with no moment anywhere', () => {
    // F.1.1 is 0/0 there. `Cb = 1` is both permitted and the only defensible value.
    const g = momentGradient({ stations: diagram(() => 0), shape: 'I' });
    expect(g.cb).toBe(1);
    expect(g.reasonKey).toBe('steel.cb.reason.zeroMoment');
    expect(g.curvature).toBe('none');
  });
});

describe('every basis and reason resolves in the three offered languages', () => {
  const dicts = { es, en, pt } as Record<string, Record<string, string>>;

  it('resolves each basis label', () => {
    for (const [name, dict] of Object.entries(dicts)) {
      for (const b of ['computed', 'unityRequiredCantilever', 'unityNoDiagram', 'unityOutOfScope'] as const) {
        expect(dict[cbBasisKey(b)], `${name}: ${b}`).toBeTruthy();
      }
    }
  });

  it('resolves each reason as a sentence', () => {
    const reasons = ['computed', 'cantilever', 'noDiagram', 'zeroMoment',
                     'singlySymmetricDoubleCurvature', 'symmetryOutOfScope'];
    for (const [name, dict] of Object.entries(dicts)) {
      for (const r of reasons) {
        const v = dict[`steel.cb.reason.${r}`];
        expect(v, `${name}: ${r}`).toBeTruthy();
        expect(v.length, `${name}: ${r} is a sentence`).toBeGreaterThan(40);
      }
    }
  });

  it('and says in every language that Cb does not certify the bracing', () => {
    /*
     * The limitation that must not get lost in the improvement. Apéndice 6 §6.1 requires a brace to
     * meet strength and stiffness including connection and anchorage effects — computing Cb says
     * nothing about that.
     */
    for (const [name, dict] of Object.entries(dicts)) {
      const v = dict['steel.cb.notBracingProof'];
      expect(v, name).toBeTruthy();
      expect(v, name).toMatch(/6\.1|Apéndice 6|Apêndice 6/);
    }
  });
});
