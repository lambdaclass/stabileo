/**
 * CIRSOC Flex — the eight sheets, behind one call.
 *
 * ── What this file is for ──────────────────────────────────────────
 *
 * The panel should not know that a T beam goes through the flexural engine
 * and a skew-bent column through the section engine, any more than the
 * workbook's user knows which of its sheets share formulas. This is the
 * seam: a case, its inputs as the sheet states them, and the outputs the
 * sheet prints.
 *
 * Keeping it out of the Svelte component matters for one reason above the
 * others — it can be tested against the workbook without a browser, which is
 * how every agreement in `section-engine-vs-workbook.test.ts` was reached.
 *
 * ── Inputs are the sheet's, not ours ───────────────────────────────
 *
 * `d'` and `d's` to the bar centre rather than a clear cover; `A's/As` rather
 * than two areas; A1/A2/A3 percentages rather than coordinates. Where the
 * sheet asks for something we would have derived, we ask for it too — a
 * reader checking our answer against theirs must not have to translate the
 * question first, because that is where the two diverge and neither is wrong.
 */

import {
  interactionCurve, sectionPoint, grossArea,
  type Bar, type Outline, type Materials,
} from './cirsoc201-section';
import { twoLevels, levelsFromBottom, facesA1A2A3, ring, flexural } from './cirsoc201-layouts';
import { COLUMN_STEEL_RATIO, minFlexuralSteelCm2, beta1 } from './cirsoc201-basis';
import { checkFlexure } from './cirsoc201';
import { checkFlexureFlanged } from './cirsoc201-flanged';

export type FlexCase =
  | 'FSR'           // rectangular, simple bending
  | 'FST'           // flanged, simple bending
  | 'FCR'           // rectangular, axial + uniaxial bending
  | 'FCR-CIR'       // circular, axial + uniaxial bending
  | 'FCO';          // rectangular, axial + biaxial bending

export type FlexMode = 'design' | 'verify';

/** Everything any sheet asks for. Unused fields are ignored per case. */
export interface FlexInput {
  kase: FlexCase;
  mode: FlexMode;

  // ── 1. Datos generales ──
  fc: number;              // MPa
  fy: number;              // MPa
  confinement: 'ties' | 'spiral';
  deductDisplacedConcrete: boolean;

  // ── 2. Sección ──
  b: number;               // m
  h: number;               // m
  dPrime: number;          // m — to the compression bar centre
  dPrimeS: number;         // m — to the tension bar centre
  /** FCO uses two covers, horizontal and vertical. */
  dPrimeH: number;
  dPrimeV: number;
  /** Rectangular void, the sheet's b_h / h_h. */
  holeB: number;
  holeH: number;
  // T
  bf: number;
  hf: number;
  bw: number;
  // Circular
  D: number;
  Dint: number;
  barCount: number;
  /** A bar at the top and bottom of the ring, versus rotated half a step. */
  barAtExtremeFibre: boolean;

  // ── 3. Armaduras y solicitaciones ──
  /** FCR's A's/As, 0 to 1. */
  ratioAsPrime: number;
  /** FCO's distribution. */
  pctA1: number; pctA2: number; pctA3: number;
  nA1: number; nA2: number; nA3: number;
  /** Verification: the steel already there, cm². */
  AstGiven: number;
  /** FCR-VERIF's arbitrary levels, distance from the bottom face. */
  levels: Array<{ distanceFromBottom: number; areaCm2: number }>;

  Pu: number;              // kN, + compression
  Mu: number;              // kN·m
  Muy: number;             // kN·m, FCO only
}

export interface FlexOutput {
  /** cm², total longitudinal steel. */
  AstCm2: number;
  /** cm², tension and compression where the sheet separates them. */
  AsCm2?: number;
  AsPrimeCm2?: number;
  /** Geometric ratio over the gross area. */
  rho: number;
  /** §9.6.1.2 flexural minimum, cm². */
  AsMinCm2: number;
  /** §10.9.1 column bounds, cm². Absent for the flexure sheets. */
  AstMinCm2?: number;
  AstMaxCm2?: number;
  /** State at the answer. */
  a?: number; c?: number; cMax?: number; epsilonT?: number; phi?: number;
  phiPn?: number; phiMn?: number;
  ratio: number;
  ok: boolean;
  /** The bars, so the drawing shows what was computed. */
  bars: Bar[];
  outline: Outline;
  steps: string[];
  /** Set when the section cannot take the demand even at 8 %. */
  impossible?: boolean;
}

const cm = (m: number) => `${(m * 100).toFixed(2)} cm`;

function materials(i: FlexInput): Materials {
  return {
    fc: i.fc, fy: i.fy,
    confinement: i.confinement,
    deductDisplacedConcrete: i.deductDisplacedConcrete,
  };
}

function outlineFor(i: FlexInput): Outline {
  if (i.kase === 'FST') return { kind: 'tee', bf: i.bf, hf: i.hf, bw: i.bw, h: i.h };
  if (i.kase === 'FCR-CIR') return { kind: 'circle', D: i.D, Dint: i.Dint > 0 ? i.Dint : undefined };
  const hole = i.holeB > 0 && i.holeH > 0 ? { b: i.holeB, h: i.holeH } : undefined;
  return { kind: 'rect', b: i.b, h: i.h, hole };
}

/** The bar layout a case and a total steel area imply. */
function layoutFor(i: FlexInput, AstCm2: number): Bar[] {
  switch (i.kase) {
    case 'FSR':
    case 'FST':
      return flexural(i.h, i.dPrimeS, AstCm2);
    case 'FCR':
      return i.mode === 'verify' && i.levels.some((l) => l.areaCm2 > 0)
        ? levelsFromBottom(i.h, i.levels)
        : twoLevels(i.h, i.dPrime, i.dPrimeS, AstCm2, i.ratioAsPrime);
    case 'FCR-CIR':
      return ring(i.D, i.dPrimeS, i.barCount, AstCm2, i.barAtExtremeFibre);
    case 'FCO':
      return facesA1A2A3(
        i.b, i.h, i.dPrimeH, i.dPrimeV, AstCm2,
        { a1: i.pctA1, a2: i.pctA2, a3: i.pctA3 },
        { n1: i.nA1, n2: i.nA2, n3: i.nA3 },
      );
  }
}

/**
 * Demand over capacity along the ray of constant eccentricity.
 *
 * The comparison an engineer draws by hand: hold the eccentricity and ask how
 * much further the section could be pushed. Comparing moments at constant
 * axial load instead reports an infinite reserve above the nose of the curve,
 * where there is none.
 *
 * Biaxial rides the same ray, with the moment taken as the resultant and the
 * neutral axis at the angle that resultant implies — which is what makes the
 * skew case the same calculation rather than Bresler's approximation of it.
 */
function utilisation(
  outline: Outline, bars: Bar[], mat: Materials,
  Pu: number, Mx: number, My: number,
): { ratio: number; phiPn: number; phiMn: number; c: number; epsilonT: number; phi: number } {
  const Mres = Math.hypot(Mx, My);
  /*
   * The compressed face is the one the resultant moment presses on. θ is
   * measured to the outward normal of that face; for pure Mx it is +π/2,
   * which puts the compression at the top.
   */
  const theta = Math.atan2(Mx, -My) || Math.PI / 2;
  const curve = interactionCurve(outline, bars, mat, theta, 90);

  const cap = (p: (typeof curve)[number]) => Math.hypot(p.phiMnx, p.phiMny);

  if (Math.abs(Pu) < 1e-9) {
    let best = curve[0];
    for (const p of curve) if (p.phiPn >= 0 && cap(p) > cap(best)) best = p;
    const m = cap(best);
    return {
      ratio: m > 0 ? Mres / m : Infinity,
      phiPn: 0, phiMn: m, c: best.c, epsilonT: best.epsilonT, phi: best.phi,
    };
  }

  const slope = Mres / Pu;
  let capP = 0;
  let capM = 0;
  let at = curve[0];
  for (let i = 0; i < curve.length - 1; i++) {
    const A = curve[i];
    const B = curve[i + 1];
    const fA = cap(A) - slope * A.phiPn;
    const fB = cap(B) - slope * B.phiPn;
    if (fA === 0 || fA * fB < 0) {
      const t = fA / (fA - fB);
      capP = A.phiPn + t * (B.phiPn - A.phiPn);
      capM = cap(A) + t * (cap(B) - cap(A));
      at = Math.abs(t) < 0.5 ? A : B;
      break;
    }
  }
  const demand = Math.hypot(Mres, Pu);
  const capacity = Math.hypot(capM, capP);
  return {
    ratio: capacity > 1e-9 ? demand / capacity : Infinity,
    phiPn: capP, phiMn: capM, c: at.c, epsilonT: at.epsilonT, phi: at.phi,
  };
}

/** One call, whichever sheet the reader picked. */
export function solveFlex(i: FlexInput): FlexOutput {
  const outline = outlineFor(i);
  const mat = materials(i);
  const Ag = grossArea(outline);
  const d = i.h - i.dPrimeS;

  // ── The two flexure sheets keep the flexural engine ──────────────
  /*
   * Not for lack of generality — the section engine handles them — but
   * because `checkFlexure` also selects bars, applies the doubly-reinforced
   * fallback and emits the memo, and it reproduces FSR and FST exactly. A
   * rewrite would trade a validated answer for an equivalent one.
   */
  if ((i.kase === 'FSR' || i.kase === 'FST') && i.mode === 'design') {
    const params = {
      fc: i.fc, fy: i.fy, cover: i.dPrimeS - 0.008, b: i.b, h: i.h, stirrupDia: 0,
    };
    const r = i.kase === 'FST'
      ? checkFlexureFlanged(params, { bf: i.bf, hf: i.hf, bw: i.bw }, i.Mu)
      : checkFlexure(params, i.Mu);
    /*
     * Designed by the flexural engine, JUDGED by the section engine.
     *
     * `checkFlexure` reproduces the workbook's FSR and FST exactly, so it
     * keeps the sizing. Its verdict is another matter: the status is
     * `Mu/φMn` and it keeps adding compression steel until that ratio falls
     * under one, so asked for 2000 kN·m on a 30×30 it reported a pass with
     * a φMn of 2 828 kN·m — a number that section cannot reach with any
     * amount of steel.
     *
     * Rather than reach into a function PRO's memos still quote, the answer
     * is checked here against the strain-compatibility engine with the very
     * bars it proposed. One verdict, from the one place, for every sheet.
     */
    const bars = flexural(i.h, i.dPrimeS, r.AsReq, i.dPrime, r.AsComp ?? 0);
    const u = utilisation(outline, bars, mat, 0, i.Mu, 0);

    /*
     * And a section is not a design if the steel does not fit in it.
     *
     * The strain-compatibility check above is not enough on its own: a
     * doubly-reinforced section with enough steel really does carry an
     * enormous couple, so the engine agrees with `checkFlexure` all the way
     * up to areas that are half the concrete. §10.9.1's 8 % is what makes
     * that unbuildable, and asked for 2000 kN·m on a 30×30 it is the only
     * clause that says no.
     */
    const AstMaxHere = COLUMN_STEEL_RATIO.max * Ag * 1e4;
    const total = r.AsReq + (r.AsComp ?? 0);
    const impossible = u.ratio > 1.02 || total > AstMaxHere;

    return {
      AstCm2: r.AsReq,
      AsCm2: r.AsReq,
      AsPrimeCm2: r.AsComp ?? 0,
      rho: (r.AsReq * 1e-4) / Ag,
      AsMinCm2: r.AsMin,
      a: r.aReq, c: r.c, cMax: r.cMax, epsilonT: r.epsilonT,
      phiMn: u.phiMn,
      ratio: u.ratio,
      ok: !impossible,
      impossible,
      bars,
      outline,
      steps: impossible
        ? [...r.steps,
           total > AstMaxHere
             ? `⚠ As total = ${total.toFixed(2)} cm² supera el 8 % de Ag (${AstMaxHere.toFixed(2)} cm²)`
             : `⚠ Verificado sobre el diagrama: φMn = ${u.phiMn.toFixed(2)} kN·m < Mu`,
           'La sección no alcanza con ninguna armadura.']
        : [...r.steps, `Verificado sobre el diagrama: φMn = ${u.phiMn.toFixed(2)} kN·m`],
    };
  }

  // ── Everything else is the section engine ────────────────────────
  /*
   * The width §9.6.1.2 is written on: the WEB of a T, and the full width of
   * anything else. `i.bw || i.b` looked equivalent and is not — `bw` carries
   * a value on every case because the form keeps one field per name, so a
   * rectangular column was taking the T's web and reporting As,min at 40 %
   * of the truth.
   */
  const widthForMin = i.kase === 'FST' ? i.bw : i.b;
  const AstMin = COLUMN_STEEL_RATIO.min * Ag * 1e4;
  const AstMax = COLUMN_STEEL_RATIO.max * Ag * 1e4;
  const isColumn = i.kase !== 'FSR' && i.kase !== 'FST';
  const lo = isColumn ? AstMin : Math.max(minFlexuralSteelCm2(i.fc, i.fy, widthForMin, d), 0.1);
  const hi = isColumn ? AstMax : 0.04 * i.b * i.h * 1e4;

  /*
   * Simple bending has no axial load, in EITHER mode.
   *
   * The design path for FSR and FST goes through the flexural engine, which
   * never sees `Pu`; the verify path comes here, and read it straight off
   * the form. So the same section answered two different questions
   * depending on which button was pressed — an e2e that sized a beam and
   * handed the steel back to the checker got a ratio of 1.41.
   */
  const Pu = i.kase === 'FSR' || i.kase === 'FST' ? 0 : i.Pu;
  const at = (AstCm2: number) =>
    utilisation(outline, layoutFor(i, AstCm2), mat, Pu, i.Mu, i.kase === 'FCO' ? i.Muy : 0);

  let AstCm2: number;
  let impossible = false;
  const steps: string[] = [];

  if (i.mode === 'verify') {
    AstCm2 = i.AstGiven;
    steps.push(`Armadura adoptada: Ast = ${AstCm2.toFixed(2)} cm²`);
  } else if (at(lo).ratio <= 1) {
    AstCm2 = lo;
    steps.push(`La armadura mínima alcanza: Ast = ${lo.toFixed(2)} cm²`);
  } else if (at(hi).ratio > 1) {
    AstCm2 = hi;
    impossible = true;
    steps.push(`⚠ La sección no verifica ni con el máximo (${hi.toFixed(2)} cm²)`);
  } else {
    let a = lo;
    let z = hi;
    for (let k = 0; k < 40; k++) {
      const m = (a + z) / 2;
      if (at(m).ratio > 1) a = m; else z = m;
    }
    AstCm2 = z;
    steps.push(`Ast necesaria por bisección sobre el diagrama: ${AstCm2.toFixed(2)} cm²`);
  }

  const bars = layoutFor(i, AstCm2);
  const u = at(AstCm2);
  const b1 = beta1(i.fc);

  steps.push(
    `Diagrama de interacción por compatibilidad de deformaciones, ${bars.length} barras`,
    `Capacidad sobre la recta de excentricidad: φPn = ${u.phiPn.toFixed(1)} kN, φMn = ${u.phiMn.toFixed(2)} kN·m`,
    `c = ${cm(u.c)}, a = ${cm(b1 * u.c)}, εt = ${(u.epsilonT * 1000).toFixed(2)} ‰ → φ = ${u.phi.toFixed(3)}`,
    `Relación demanda/capacidad = ${u.ratio.toFixed(3)}`,
  );

  const r = i.ratioAsPrime;
  return {
    AstCm2,
    ...(i.kase === 'FCR'
      ? { AsCm2: AstCm2 / (1 + r), AsPrimeCm2: (AstCm2 * r) / (1 + r) }
      : {}),
    rho: (AstCm2 * 1e-4) / Ag,
    AsMinCm2: minFlexuralSteelCm2(i.fc, i.fy, widthForMin, d),
    AstMinCm2: AstMin,
    AstMaxCm2: AstMax,
    c: u.c, a: b1 * u.c, epsilonT: u.epsilonT, phi: u.phi,
    phiPn: u.phiPn, phiMn: u.phiMn,
    ratio: u.ratio,
    ok: !impossible && u.ratio <= 1,
    bars, outline, steps, impossible,
  };
}

/** A section point, for callers that want the curve rather than a verdict. */
export { interactionCurve, sectionPoint };
