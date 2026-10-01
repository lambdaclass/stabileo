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
  type Bar, type Outline, type Materials, type SectionPoint,
} from './cirsoc201-section';
import { refine, momentCapacityAtAxial } from './cirsoc-flex-surface';
import {
  twoLevels, levelsFromBottom, facesA1A2A3, ring, flexural, faceShares, a3Sides,
} from './cirsoc201-layouts';
import { COLUMN_STEEL_RATIO, ES_MPA, minFlexuralSteelCm2, beta1, axialCap } from './cirsoc201-basis';
import { chooseBars, chooseBarsForCount, chooseBarsPerLevel, type BarChoice } from './cirsoc201-bars';
import { msg, type EngineMessage } from '../../../codes/message';

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
  /**
   * §9.6.1.2's flexural minimum. Beams only — a column answers to §10.9.1's
   * 1 % of the gross area, which is `AstMinCm2`, and asking for a beam rule
   * on a circular section produced a NaN the panel printed as "NaN cm²".
   */
  AsMinCm2?: number;
  /** §10.9.1 column bounds, cm². Absent for the flexure sheets. */
  AstMinCm2?: number;
  AstMaxCm2?: number;
  /** State at the answer. */
  a?: number; c?: number; cMax?: number; epsilonT?: number; phi?: number;
  phiPn?: number; phiMn?: number;
  /**
   * The neutral-axis direction at the answer, as `sectionPoint`'s θ — the
   * outward normal of the compressed face. What the drawing needs to hatch
   * the right side of the section, and on FCO to tilt it.
   */
  theta?: number;
  /**
   * FCO's "Pu (max)", kN. The design sheet prints it for the 8 % ceiling —
   * the most axial load any reinforcement could carry — and the verification
   * sheet for the steel given.
   */
  puMax?: number;
  ratio: number;
  ok: boolean;
  /** The bars, so the drawing shows what was computed. */
  bars: Bar[];
  /** What to actually tie: count, diameter, and whether it fits. */
  barChoice?: BarChoice;
  barChoiceComp?: BarChoice;
  outline: Outline;
  /** The working, line by line, as keys the UI turns into sentences. */
  steps: EngineMessage[];
  /**
   * Set when there is no answer: the section cannot take the demand even at
   * 8 %, or (with `invalid`) the inputs describe no section at all.
   */
  impossible?: boolean;
  /**
   * The inputs were refused before anything was computed — a material that
   * is not a positive number, a geometry that is not a section, a layout
   * with no bars. `steps` says which, and nothing else in the output is a
   * result: every area is 0 and the ratio infinite.
   */
  invalid?: boolean;
  /**
   * FCO's proposal face by face, each sized for its own share. Present when
   * the faces carry different shares, so a single bar size would either
   * short the heavier face or waste steel on the lighter one.
   */
  barFaces?: Array<{ face: 'A1' | 'A2' | 'A3'; needCm2: number; choice: BarChoice }>;
}

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

/**
 * FCR's A′s/As as the layout uses it: clamped to [0, 1], and 1 (symmetric,
 * what the sheet ships with) when the field is not a number. One place, so
 * the bars, the printed As / A′s and the proposal all read the same value.
 */
function asPrimeRatio(i: FlexInput): number {
  const r = i.ratioAsPrime;
  return typeof r === 'number' && Number.isFinite(r) ? Math.max(0, Math.min(1, r)) : 1;
}

/**
 * ── Inputs that describe no section are refused, not computed ─────
 *
 * Nothing used to check them. An f′c of 0 (or an EMPTY field, which the panel
 * hands over as null) designed the beam as a steel couple and called it
 * verified; fy = 0 filled every area with NaN; a negative width printed a
 * negative As,min; a flange deeper than the beam built a section twice as
 * deep as the one typed; a void larger than the column gave a negative Ast.
 * Each of those is a question with no answer, and the honest reply is to say
 * which number is wrong rather than to print a result for it.
 *
 * Only the fields the chosen case reads are checked: the form keeps every
 * case's fields at once, and a circular column must not be refused over the
 * width of a rectangle the reader cannot see.
 */
function validate(i: FlexInput): EngineMessage[] {
  const out: EngineMessage[] = [];
  const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

  if (!positive(i.fc)) out.push(msg('flex.step.badMaterial', { name: 'f′c' }));
  if (!positive(i.fy)) out.push(msg('flex.step.badMaterial', { name: 'fy' }));

  const dims = (pairs: Array<[string, number]>) => {
    let ok = true;
    for (const [name, v] of pairs) {
      if (!positive(v)) { out.push(msg('flex.step.badDimension', { name })); ok = false; }
    }
    return ok;
  };
  /** A cover to a bar centre: from the face inward, and short of `limitM`. */
  const cover = (name: string, v: number, limitM: number) => {
    if (!finite(v) || v < 0 || v >= limitM) {
      out.push(msg('flex.step.badCover', { name, limit: Math.round(limitM * 1e4) / 100 }));
    }
  };
  const rectHole = () => {
    if (i.holeB > 0 && i.holeH > 0 && (i.holeB >= i.b || i.holeH >= i.h)) out.push(msg('flex.step.badHole'));
  };
  const verifyingByArea = i.mode === 'verify'
    && !(i.kase === 'FCR' && i.levels.some((l) => l.areaCm2 > 0));
  if (verifyingByArea && !(finite(i.AstGiven) && i.AstGiven >= 0)) out.push(msg('flex.step.badSteel'));

  switch (i.kase) {
    case 'FSR':
      if (dims([['b', i.b], ['h', i.h]])) {
        cover('d′s', i.dPrimeS, i.h);
        cover('d′', i.dPrime, i.h);
      }
      break;
    case 'FST':
      if (dims([['bf', i.bf], ['hf', i.hf], ['bw', i.bw], ['h', i.h]])) {
        if (i.hf >= i.h) out.push(msg('flex.step.badFlange'));
        /*
         * bf < bw is not a flanged section: it is a rectangle with its top
         * corners cut away, and the reader typed a T. Refused, pointing at
         * the rectangular sheet, rather than designed as something else.
         */
        if (i.bf < i.bw) out.push(msg('flex.step.flangeNarrow'));
        cover('d′s', i.dPrimeS, i.h);
        cover('d′', i.dPrime, i.h);
      }
      break;
    case 'FCR':
      if (dims([['b', i.b], ['h', i.h]])) {
        rectHole();
        if (!(i.mode === 'verify' && i.levels.some((l) => l.areaCm2 > 0))) {
          /* The two levels have to stay inside the section and in their order. */
          const dp = finite(i.dPrime) ? Math.max(i.dPrime, 0) : 0;
          const ds = finite(i.dPrimeS) ? Math.max(i.dPrimeS, 0) : 0;
          cover('d′s', i.dPrimeS, i.h - dp);
          cover('d′', i.dPrime, i.h - ds);
        }
      }
      break;
    case 'FCR-CIR':
      if (dims([['D', i.D]])) {
        const Dint = finite(i.Dint) ? i.Dint : 0;
        if (Dint < 0 || Dint >= i.D) out.push(msg('flex.step.badDint'));
        else cover('d′s', i.dPrimeS, (i.D - Dint) / 2);
      }
      /* A ring of 0 bars used to become a ring of ONE, and design as such. */
      if (!(Number.isInteger(i.barCount) && i.barCount >= 1)) out.push(msg('flex.step.badBarCount'));
      break;
    case 'FCO': {
      if (dims([['b', i.b], ['h', i.h]])) {
        rectHole();
        cover('d′sh', i.dPrimeH, i.b / 2);
        cover('d′sv', i.dPrimeV, i.h / 2);
      }
      let layoutOk = true;
      for (const [face, n] of [['A1', i.nA1], ['A2', i.nA2], ['A3', i.nA3]] as const) {
        if (!(Number.isInteger(n) && n >= 0)) { out.push(msg('flex.step.badFaceCount', { face })); layoutOk = false; }
      }
      for (const [face, p] of [['A1', i.pctA1], ['A2', i.pctA2], ['A3', i.pctA3]] as const) {
        if (!(finite(p) && p >= 0)) { out.push(msg('flex.step.badPct', { face })); layoutOk = false; }
      }
      /*
       * Every share at 0 %, or every share on a face with no bars: there is
       * no layout to size, and saying "not even the maximum works" sent the
       * reader to enlarge a section whose problem was the distribution.
       */
      if (layoutOk && faceShares(fcoPct(i), fcoCounts(i)).sum === 0) out.push(msg('flex.step.noBars'));
      break;
    }
  }
  return out;
}

const fcoPct = (i: FlexInput) => ({ a1: i.pctA1, a2: i.pctA2, a3: i.pctA3 });
const fcoCounts = (i: FlexInput) => ({ n1: i.nA1, n2: i.nA2, n3: i.nA3 });

/** The answer to inputs `validate` refused: no numbers, only the reasons. */
function refused(i: FlexInput, reasons: EngineMessage[]): FlexOutput {
  return {
    AstCm2: 0, rho: 0, ratio: Infinity, ok: false, impossible: true, invalid: true,
    bars: [], outline: outlineFor(i), steps: reasons,
  };
}

/** The bar layout a case and a total steel area imply. */
function layoutFor(i: FlexInput, AstCm2: number): Bar[] {
  switch (i.kase) {
    case 'FSR':
    case 'FST':
      return flexural(outlineFor(i), i.dPrimeS, AstCm2);
    case 'FCR':
      return i.mode === 'verify' && i.levels.some((l) => l.areaCm2 > 0)
        ? levelsFromBottom(i.h, i.levels)
        : twoLevels(i.h, i.dPrime, i.dPrimeS, AstCm2, asPrimeRatio(i));
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
 * Demand over capacity along the ray of constant eccentricity — FCR's measure.
 *
 * The comparison an engineer draws by hand: hold the eccentricity and ask how
 * much further the section could be pushed. Comparing moments at constant
 * axial load instead reports an infinite reserve above the nose of the curve,
 * where there is none. This is what FCR-VERIF prints as MV res / MV sol.
 *
 * Uniaxial only. The biaxial sheet measures differently — moments at the
 * fixed axial load, on the surface cut — and goes through
 * `momentCapacityAtAxial` instead; see `cirsoc-flex-surface.ts`.
 *
 * ── The state is SOLVED for, not interpolated ─────────────────────
 *
 * Both branches used to read c, εt and φ by linear interpolation between two
 * samples of the curve, or simply off the nearer sample. εt goes as 1/c, so a
 * straight line between two samples overstates it wherever c is small — FST's
 * published εt of 169,7 ‰ came back as 172,0 ‰. `refine` bisects the
 * neutral-axis depth itself and returns the section's own state there.
 */
interface Utilisation {
  ratio: number; phiPn: number; phiMn: number;
  /** Absent for a purely axial demand, where no neutral axis describes the answer. */
  c?: number; epsilonT?: number;
  phi: number; theta: number;
  /** The demand has no moment and was measured against the axial limit alone. */
  axialOnly?: boolean;
}

/**
 * ── A demand with no moment is measured on the axial axis ─────────
 *
 * Along the ray of constant eccentricity, Mu = 0 is the P axis itself, and
 * searching for where the curve crosses it went wrong both ways. On a
 * symmetric rectangle the fully compressed point has a moment of exactly
 * zero, so it was taken as the crossing whatever the sign of Pu — a column in
 * pure TENSION was checked against its compression capacity and 9 cm² passed
 * 500 kN of pull that needs 13.2. On the 360-gon of a circle that moment is a
 * rounding residue, never zero, so no crossing was found at all and every
 * circular column with Mu = 0 was refused.
 *
 * The answer is the end of the diagram on the demand's own side: the capped
 * compression φPn,max for Pu > 0 (compression-controlled, φ = 0.65 or 0.70),
 * the pure-tension φPn for Pu < 0 (every bar yielding, φ = 0.90).
 */
function axialLimit(
  outline: Outline, bars: readonly Bar[], mat: Materials, theta: number, Pu: number,
): Utilisation {
  const curve = interactionCurve(outline, bars, mat, theta, 90);
  const compression = Pu >= 0;
  const end = curve.reduce((best, p) => (compression ? p.phiPn > best.phiPn : p.phiPn < best.phiPn) ? p : best);
  const lim = end.phiPn;
  const reaches = compression ? lim > 1e-9 : lim < -1e-9;
  return {
    ratio: Math.abs(Pu) < 1e-9 ? 0 : reaches ? Pu / lim : Infinity,
    phiPn: lim, phiMn: 0, phi: end.phi, theta, axialOnly: true,
    /* No bar is in tension at the compression end; at the tension end every one yields without limit. */
    ...(compression ? { epsilonT: end.epsilonT } : {}),
  };
}

function utilisation(
  outline: Outline, bars: Bar[], mat: Materials,
  Pu: number, Mu: number,
): Utilisation {
  const Mres = Math.abs(Mu);
  /* A positive Mu compresses the top face: θ = π/2 in `sectionPoint`'s terms. */
  const theta = Mu < 0 ? -Math.PI / 2 : Math.PI / 2;
  if (Mres < 1e-9 && Math.abs(Pu) >= 1e-9) return axialLimit(outline, bars, mat, theta, Pu);
  const curve = interactionCurve(outline, bars, mat, theta, 90);
  const cap = (p: SectionPoint) => Math.hypot(p.phiMnx, p.phiMny);

  if (Math.abs(Pu) < 1e-9) {
    /*
     * ── Pure bending is where the curve CROSSES zero, not its nose ──
     *
     * Taking the greatest moment with φPn ≥ 0 credited a section carrying no
     * axial load with the capacity it has under substantial compression. The
     * workbook settles which is right — FCR-VERIF prints 87,79 kN·m of pure
     * flexure for 21,34 cm².
     */
    for (let k = 0; k < curve.length - 1; k++) {
      const A = curve[k];
      const B = curve[k + 1];
      if (A.phiPn >= 0 && B.phiPn < 0) {
        const p = refine(outline, bars, mat, theta, A.c, B.c, (q) => q.phiPn);
        const m = cap(p);
        return {
          ratio: m > 1e-9 ? Mres / m : Infinity,
          phiPn: 0, phiMn: m, c: p.c, epsilonT: p.epsilonT, phi: p.phi, theta,
        };
      }
    }
    /* No crossing: every point carries compression, so it cannot bend alone. */
    const last = curve[curve.length - 1];
    return {
      ratio: Infinity, phiPn: 0, phiMn: 0,
      c: last.c, epsilonT: last.epsilonT, phi: last.phi, theta,
    };
  }

  const slope = Mres / Pu;
  const onRay = (p: SectionPoint) => cap(p) - slope * p.phiPn;
  for (let i = 0; i < curve.length - 1; i++) {
    const A = curve[i];
    const B = curve[i + 1];
    const fA = onRay(A);
    const fB = onRay(B);
    if (fA === 0 || fA * fB < 0) {
      const p = fA === 0 ? A : refine(outline, bars, mat, theta, A.c, B.c, onRay);
      const capP = p.phiPn;
      const capM = cap(p);
      const capacity = Math.hypot(capM, capP);
      return {
        ratio: capacity > 1e-9 ? Math.hypot(Mres, Pu) / capacity : Infinity,
        phiPn: capP, phiMn: capM, c: p.c, epsilonT: p.epsilonT, phi: p.phi, theta,
      };
    }
  }
  const first = curve[0];
  return { ratio: Infinity, phiPn: 0, phiMn: 0, c: first.c, epsilonT: first.epsilonT, phi: first.phi, theta };
}

/**
 * FCO's measure: Mu over the moment capacity at the demand's own axial load,
 * along the demand's own moment direction. The reciprocal of the sheet's
 * "φMn / Mu". Infinite when the load is out of reach of the section at all.
 */
function biaxialUtilisation(
  outline: Outline, bars: Bar[], mat: Materials, Pu: number, Mx: number, My: number,
): Utilisation {
  const Mres = Math.hypot(Mx, My);
  if (Mres < 1e-9) {
    /*
     * No moment: the question is the axial load alone, against its own limit
     * — and φ is the one at that limit. It was reported as 0, with c, a and
     * εt at 0 beside it, which CIRSOC 201 never gives.
     */
    return axialLimit(outline, bars, mat, Math.PI / 2, Pu);
  }
  const got = momentCapacityAtAxial(outline, bars, mat, Pu, Mx, My);
  if (!got) {
    return { ratio: Infinity, phiPn: Pu, phiMn: 0, c: 0, epsilonT: 0, phi: 0, theta: Math.PI / 2 };
  }
  const sx = Mx < 0 ? -1 : 1;
  const sy = My < 0 ? -1 : 1;
  return {
    ratio: got.phiMn > 1e-9 ? Mres / got.phiMn : Infinity,
    phiPn: Pu, phiMn: got.phiMn,
    c: got.state.c, epsilonT: got.state.epsilonT, phi: got.state.phi,
    theta: Math.atan2(sx * Math.cos(got.fi), -sy * Math.sin(got.fi)),
  };
}

/** One call, whichever sheet the reader picked. */
export function solveFlex(i: FlexInput): FlexOutput {
  const rejected = validate(i);
  if (rejected.length > 0) return refused(i, rejected);
  const outline = outlineFor(i);
  const mat = materials(i);
  const Ag = grossArea(outline);

  // ── Simple bending, sized on the same curve that judges it ───────
  /*
   * ── Why this stopped going through `checkFlexure` ────────────────
   *
   * It sized singly-reinforced sections past the point where a singly-
   * reinforced section can carry the moment, and only switched to
   * compression steel later. On a 20 × 50 that produced a DEAD BAND:
   * Mu = 225 passed, 230 and 235 failed, 240 passed again. A beam that
   * cannot be designed for less load than one that can is not a rounding
   * problem, it is a wrong answer wearing a verdict.
   *
   * Sizing on the interaction curve removes the band by construction, as
   * long as each bisection searches where the capacity IS monotone in the
   * steel — below the singly-reinforced limit, and along the balanced pair
   * above it. See `bisect` for what happened when it searched past that.
   *
   * The two-stage rule below is the textbook one, and it is what makes the
   * transition continuous:
   *
   *   1. find the moment the section carries singly-reinforced at the
   *      tension-controlled limit — as much as it can take before the code
   *      stops calling it ductile
   *   2. under that, bisect the tension steel alone
   *   3. over it, hold the section at that limit and add a compression /
   *      tension pair to carry the remainder
   *
   * `checkFlexure` still supplies the bar SELECTION and the memo, since it
   * reproduces the workbook exactly and neither depends on the sizing.
   */
  if (i.kase === 'FSR' || i.kase === 'FST') {
    /*
     * ── A T under a negative moment is compressed in its WEB ─────────
     *
     * |Mu| used to be bent with the top face compressed whatever its sign, so
     * a hogging T was credited with its flange as the compression zone while
     * the flange is the side in tension: the workbook's own T at −80 kN·m
     * came out 14 % short. Hogging now bends the section the other way up —
     * compression at the bottom of the web, tension steel at the top — and
     * the minimum is §10.5.2's, written for a flange in tension: §10.5.1's
     * rule with bw replaced by the lesser of 2·bw and bf. A rectangle is the
     * same section either way up and keeps the one convention.
     */
    const hogging = i.kase === 'FST' && i.Mu < 0;
    const theta = hogging ? -Math.PI / 2 : Math.PI / 2;
    const bottomWidth = i.kase === 'FST' ? i.bw : i.b;
    const minWidth = hogging ? Math.min(2 * i.bw, i.bf) : bottomWidth;
    const AstMaxHere = COLUMN_STEEL_RATIO.max * Ag * 1e4;

    /*
     * ── The effective cover is an OUTPUT, not an input ──────────────
     *
     * `d = h − d′s` is only true while the tension steel fits in one layer.
     * Ask a 20 cm web for 40 cm² and it does not: the bars go in two or
     * three layers, the group's centroid sits above the first layer, and `d`
     * is smaller than the field said. Smaller `d` means more steel, which
     * can mean another layer — so the two have to be solved together rather
     * than in sequence. See the loop below for how they are.
     */
    let effCover = i.dPrimeS;
    let dEff = i.h - effCover;
    let AsMin = minFlexuralSteelCm2(i.fc, i.fy, minWidth, dEff);
    const setCover = (cover: number) => {
      effCover = cover;
      dEff = i.h - effCover;
      AsMin = minFlexuralSteelCm2(i.fc, i.fy, minWidth, dEff);
    };

    /**
     * The section's state at pure bending, for a given pair of steel areas.
     *
     * Capacity AND the numbers a reader checks it by — c, a and εt — from
     * the same interpolation, so they cannot describe different sections.
     * An earlier version took them from `checkFlexure` called with the WEB
     * width, which for a T put the stress block twelve times too deep: the
     * block is in the flange and that call knew nothing about it.
     */
    const stateOf = (AsCm2: number, AsCompCm2 = 0) => {
      const bars = flexural(outline, effCover, AsCm2, i.dPrime, AsCompCm2, hogging);
      const curve = interactionCurve(outline, bars, mat, theta, 120);
      for (let k = 0; k < curve.length - 1; k++) {
        const A = curve[k];
        const B = curve[k + 1];
        if (A.phiPn >= 0 && B.phiPn < 0) {
          /* Bisected on c, not interpolated — see `utilisation` for why. */
          const p = refine(outline, bars, mat, theta, A.c, B.c, (q) => q.phiPn);
          return {
            phiMn: Math.abs(p.phiMnx),
            c: p.c,
            a: beta1(i.fc) * p.c,
            epsilonT: p.epsilonT,
            phi: p.phi,
          };
        }
      }
      return { phiMn: 0, c: 0, a: 0, epsilonT: 0, phi: 0 };
    };
    const capacityOf = (AsCm2: number, AsCompCm2 = 0) => stateOf(AsCm2, AsCompCm2).phiMn;

    const MuAbs = Math.abs(i.Mu);
    /*
     * ── φMn is NOT monotone in As, so the search stays where it is ──
     *
     * Past εt = 5 ‰ φ falls from 0.9 toward 0.65 faster than Mn grows: φMn(As)
     * peaks at the singly-reinforced limit, dips, and climbs again on the
     * φ = 0.65 branch. Bisecting all the way to the 8 % ceiling assumed
     * otherwise, and whenever the midpoint already sat on that second branch
     * it converged there — a compression-controlled "design" with 77 % more
     * steel than the ductile one — or walked up to the ceiling itself.
     * Below the singly-reinforced limit φ is 0.9 throughout and Mn grows with
     * As, so the bisection is bounded by that limit and cannot leave it.
     */
    const bisect = (target: number, hiCm2: number) => {
      let a = 0.05;
      let z = hiCm2;
      for (let k = 0; k < 45; k++) {
        const m = (a + z) / 2;
        if (capacityOf(m) < target) a = m; else z = m;
      }
      return z;
    };

    /** The steel at which εt falls to 5 ‰ — shared by both modes. */
    const singlyLimit = () => {
      let a = 0.05;
      let z = AstMaxHere;
      for (let k = 0; k < 45; k++) {
        const m = (a + z) / 2;
        /* εt from the solved state, not from the nearest of 400 samples. */
        if (stateOf(m).epsilonT > 0.005) a = m; else z = m;
      }
      return a;
    };

    /*
     * One sizing pass, at whatever `effCover` currently says.
     *
     * The singly-reinforced ceiling inside it is the steel at which εt falls
     * to 5 ‰. Beyond it φ starts dropping and the section stops being one
     * the code wants built, which is exactly where compression steel earns
     * its place.
     */
    const sizeOnce = () => {
      const AsAtLimit = singlyLimit();
      const MuSinglyMax = capacityOf(AsAtLimit);

      if (MuAbs <= MuSinglyMax) {
        return {
          AsReq: Math.max(bisect(MuAbs, AsAtLimit), AsMin),
          AsComp: 0,
          MuSinglyMax,
        };
      }
      /*
       * Hold the concrete at its limit and let a pair carry the rest —
       * A′s on top and the tension steel that BALANCES it, which is A′s·f′s/fy
       * and not A′s. The top bar works at f′s, less the concrete it displaces
       * ("f′s corregido" on the sheet: 420 − 21,25 = 398,75 MPa), so adding
       * equal areas put more force in the bottom than the top, pushed the
       * neutral axis past c máx and left εt at 4,96 ‰ instead of the 5 ‰ the
       * branch exists to hold. Balanced, c stays where the singly-reinforced
       * limit put it — which is the sheet's closed form, by construction.
       * Holding c holds φ at 0.9, so this search IS monotone in A′s.
       */
      const cLim = stateOf(AsAtLimit).c;
      const eps = cLim > 0 ? (0.003 * (cLim - i.dPrime)) / cLim : 0;
      let fsComp = Math.min(eps * ES_MPA, i.fy);
      if (i.deductDisplacedConcrete !== false && i.dPrime <= beta1(i.fc) * cLim) fsComp -= 0.85 * i.fc;
      const balance = Math.max(fsComp, 0) / i.fy;
      let a = 0;
      let z = AstMaxHere;
      for (let k = 0; k < 45; k++) {
        const m = (a + z) / 2;
        if (capacityOf(AsAtLimit + balance * m, m) < MuAbs) a = m; else z = m;
      }
      return { AsReq: AsAtLimit + balance * z, AsComp: z, MuSinglyMax };
    };

    /*
     * Bars and depth, solved together. `fitOpts` takes the cover to the bar
     * CENTRE, which is what the reader typed — the stirrup is not subtracted
     * again, because the centre is already inside it. The tension bars go
     * across the web in both senses of the moment: a hogging T's top steel
     * is detailed over the web, the conservative reading of a flange.
     */
    const fitOpts = { widthM: bottomWidth, coverM: i.dPrimeS, heightM: i.h };

    /*
     * ── Verify asks a different question, and had no answer ────────
     *
     * In `verify` the steel is an INPUT. The bars still have to go somewhere,
     * so the layering runs — 40 cm² in a 20 cm web stacks whether the reader
     * chose it or the sizing did, and `d` follows — but nothing is resized:
     * the capacity that comes out is the capacity of what they described.
     */
    let pass: { AsReq: number; AsComp: number; MuSinglyMax: number };
    let chosen: BarChoice;
    if (i.mode === 'verify') {
      const given = Math.max(i.AstGiven, 0);
      chosen = chooseBars(given, fitOpts);
      setCover(chosen.centroidFromFaceM ?? i.dPrimeS);
      pass = { AsReq: given, AsComp: 0, MuSinglyMax: capacityOf(singlyLimit()) };
    } else {
      /*
       * ── Sizing and layering, until the bars sit where d assumed ───
       *
       * Size at a cover, lay the bars out, take their centroid as the new
       * cover and size again. The loop used to replace the cover with the
       * centroid both ways and stop after eight passes; with the sizing able
       * to jump branches it oscillated between two covers and exited on a pair
       * that did not agree — "d = 25 cm" printed over bars that put it at
       * 23.5, whose own verification failed by 12 %.
       *
       * The cover now only moves UP. A deeper centroid than assumed means
       * less d than was sized for, so size again; a centroid at or below the
       * assumed cover means the bars have at least the d the steel was sized
       * at, so they carry the moment, and d is then read from THEM. Either
       * way what is printed is the d of the bars proposed, and the capacity
       * below is computed there.
       */
      pass = sizeOnce();
      chosen = chooseBars(pass.AsReq, fitOpts);
      for (let layerPasses = 0; layerPasses < 40; layerPasses++) {
        const produced = chosen.centroidFromFaceM;
        if (produced === undefined || produced <= effCover + 1e-4) break;
        setCover(produced);
        pass = sizeOnce();
        chosen = chooseBars(pass.AsReq, fitOpts);
      }
      if (chosen.centroidFromFaceM !== undefined) setCover(chosen.centroidFromFaceM);
    }

    const MuSinglyMax = pass.MuSinglyMax;
    const AsReq = pass.AsReq;
    const AsComp = pass.AsComp;

    const total = AsReq + AsComp;
    const bars = flexural(outline, effCover, AsReq, i.dPrime, AsComp, hogging);
    const st = stateOf(AsReq, AsComp);
    /*
     * ── What makes a section impossible ────────────────────────────
     *
     * Not "the bars do not fit in one layer" — that is what a second layer
     * is for, and treating it as failure is what made the panel refuse
     * ordinary beams. A section is impossible when the steel cannot be
     * PLACED at all within `maxLayers`, when it exceeds the ratio ceiling,
     * or when the curve simply does not reach the moment.
     */
    const chosenComp = AsComp > 0
      ? chooseBars(AsComp, { ...fitOpts, coverM: i.dPrime })
      : null;
    /*
     * `impossible` means "no admissible reinforcement makes this section
     * work", which is a statement about the SECTION. In verify the reader
     * supplied the steel, so a shortfall is not the section being too small
     * — it is their bars being too few, and the ratio is what says so.
     */
    const cannotPlace =
      total > AstMaxHere
      || chosen.placeable === false
      || (chosenComp?.placeable === false);
    const shortOfDemand = st.phiMn < MuAbs * 0.999;
    /*
     * §10.3.5: a flexural member has εt ≥ 4 ‰ at nominal strength. Design
     * holds 5 ‰ by construction; a VERIFICATION of steel the reader typed
     * checked only φMn ≥ Mu, and passed a 50 × 50 with 60 cm² at εt = 2 ‰.
     * Only where there is a state to read it from: with no steel at all
     * there is no strain to speak of, and the moment check says why it fails.
     */
    const overReinforced = total > 0 && st.c > 0 && st.epsilonT < 0.004 - 1e-9;
    const impossible = i.mode === 'verify' ? cannotPlace : (cannotPlace || shortOfDemand || overReinforced);
    const verifies = !cannotPlace && !shortOfDemand && !overReinforced;

    return {
      AstCm2: total,
      AsCm2: AsReq,
      AsPrimeCm2: AsComp,

      rho: (total * 1e-4) / Ag,
      AsMinCm2: AsMin,
      /* §10.3.4's c at εt = 5 ‰, which is what the sheet prints as cmax. */
      a: st.a, c: st.c, cMax: (dEff * 0.003) / 0.008, epsilonT: st.epsilonT, phi: st.phi,
      phiMn: st.phiMn, theta,
      ratio: st.phiMn > 0 ? MuAbs / st.phiMn : Infinity,
      ok: verifies,
      impossible,
      bars,
      barChoice: chosen,
      barChoiceComp: chosenComp ?? undefined,
      outline,
      steps: [
        ...(hogging ? [msg('flex.step.teeHogging', { bmin: minWidth * 100 })] : []),
        chosen.layers && chosen.layers > 1
          ? msg('flex.step.dLayers', {
              d: dEff * 100, layers: chosen.layers,
              split: chosen.perLayer?.join('+') ?? '', dFlat: (i.h - i.dPrimeS) * 100,
              asMin: AsMin,
            })
          : msg('flex.step.d', { d: dEff * 100, asMin: AsMin }),
        msg('flex.step.singlyMax', { m: MuSinglyMax }),
        ...(i.mode === 'verify'
          ? [msg('flex.step.givenAs', { as: AsReq })]
          : [MuAbs <= MuSinglyMax
              ? msg('flex.step.singly')
              : msg('flex.step.doubly', { asComp: AsComp })]),
        /*
         * No bars are proposed for a section that no admissible steel makes
         * work: an arrangement for the 8 % ceiling is not an answer. Whether
         * the bars would fit still is — it can be the reason.
         */
        ...(impossible && i.mode === 'design' ? [] : [
          chosen.layers && chosen.layers > 1
            ? msg('flex.step.asBarsLayers', {
                as: AsReq, bars: chosen.label, layers: chosen.layers,
                gap: chosen.clearSpacingMm ?? 0,
              })
            : msg('flex.step.asBars', { as: AsReq, bars: chosen.label }),
        ]),
        ...(chosen.placeable === false ? [msg('flex.step.wontFit')] : []),
        ...(chosenComp && !(impossible && i.mode === 'design')
          ? [msg('flex.step.asCompBars', { as: AsComp, bars: chosenComp.label })] : []),
        msg('flex.step.phiMn', { m: st.phiMn }),
        ...(i.mode === 'verify' && shortOfDemand
          ? [msg('flex.step.fails', { phiMn: st.phiMn, mu: MuAbs })] : []),
        ...(overReinforced ? [msg('flex.step.notDuctile', { epsT: st.epsilonT * 1000 })] : []),
        ...(impossible && i.mode !== 'verify' ? [msg('flex.step.impossible')] : []),
        ...(i.mode === 'verify' && AsReq < AsMin
          ? [msg('flex.step.belowMin', { as: AsReq, asMin: AsMin })] : []),
      ],
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
  const AstMin = COLUMN_STEEL_RATIO.min * Ag * 1e4;
  const AstMax = COLUMN_STEEL_RATIO.max * Ag * 1e4;
  /* Only the column cases reach here — simple bending returned above. */
  const lo = AstMin;
  const hi = AstMax;

  /*
   * Simple bending has no axial load, in EITHER mode.
   *
   * The design path for FSR and FST goes through the flexural engine, which
   * never sees `Pu`; the verify path comes here, and read it straight off
   * the form. So the same section answered two different questions
   * depending on which button was pressed — an e2e that sized a beam and
   * handed the steel back to the checker got a ratio of 1.41.
   */
  const Pu = i.Pu;
  const at = (AstCm2: number) => (i.kase === 'FCO'
    ? biaxialUtilisation(outline, layoutFor(i, AstCm2), mat, Pu, i.Mu, i.Muy)
    : utilisation(outline, layoutFor(i, AstCm2), mat, Pu, i.Mu));

  let AstCm2: number;
  let impossible = false;
  const steps: EngineMessage[] = [];

  if (i.mode === 'verify') {
    /*
     * FCR-VERIF's levels ARE the steel. The generic Ast box is only read when
     * no level has an area — reading it anyway printed 20 cm² and its ρ under a
     * section whose five levels summed to 21,336, while the capacity beside
     * them came, correctly, from the levels.
     */
    const byLevels = i.kase === 'FCR' && i.levels.some((l) => l.areaCm2 > 0);
    AstCm2 = byLevels ? i.levels.reduce((s, l) => s + Math.max(l.areaCm2, 0), 0) : i.AstGiven;
    steps.push(msg('flex.step.givenAst', { ast: AstCm2 }));
  } else if (at(lo).ratio <= 1) {
    AstCm2 = lo;
    steps.push(msg('flex.step.minEnough', { ast: lo }));
  } else if (at(hi).ratio > 1) {
    AstCm2 = hi;
    impossible = true;
    steps.push(msg('flex.step.noneWorks', { ast: hi }));
  } else {
    let a = lo;
    let z = hi;
    for (let k = 0; k < 40; k++) {
      const m = (a + z) / 2;
      if (at(m).ratio > 1) a = m; else z = m;
    }
    AstCm2 = z;
    steps.push(msg('flex.step.astByBisection', { ast: AstCm2 }));
  }

  const bars = layoutFor(i, AstCm2);
  const u = at(AstCm2);
  const b1 = beta1(i.fc);

  /*
   * ── Bars, and what the layout's entries actually mean ────────────
   *
   * The workbook stops at areas on its column sheets; a sheet that says
   * 21.35 cm² and not "8 Ø20" leaves the question of whether the steel fits
   * unanswered. Supplying it means reading each layout's entries correctly,
   * and they do not all mean the same thing:
   *
   *   FCR      TWO LEVELS, each a lumped area — not two bars
   *   FCR-CIR  a real ring, one entry per bar
   *   FCO      real positions on the three faces, one entry per bar
   *
   * Treating FCR's two levels as two bars is what produced "2 Ø32" for a
   * section that had just been told it needs 21.31 cm², and two bars is not
   * a rectangular column under §10.9.2 either.
   *
   * Each level, and each face, is sized for its OWN area. Halving the total
   * for FCR's level assumed A′s/As = 1, and at 0.5 left the tension level
   * 20 % short; giving every FCO bar the average share left an 80/20 split's
   * heavier face 31 % short.
   */
  const byLevels = i.kase === 'FCR' && i.mode === 'verify' && i.levels.some((l) => l.areaCm2 > 0);
  const rLevels = byLevels ? 1 : asPrimeRatio(i);
  const AsTension = AstCm2 / (1 + rLevels);
  const AsCompression = AstCm2 - AsTension;
  /* Cover to the bar centre, as the reader typed it — see `chooseBars`. */
  const levelOpts = { widthM: i.b, coverM: Math.max(i.dPrimeS, i.dPrime), heightM: i.h };

  let choice: BarChoice | undefined;
  let choiceComp: BarChoice | undefined;
  let levelChoices: BarChoice[] | undefined;
  let barFaces: FlexOutput['barFaces'];
  if (i.kase === 'FCR') {
    if (byLevels) {
      /*
       * Verify by levels asks for no d′/d′s, so the stale covers of whichever case
       * was open before cannot be the ones the fit is judged on: each level's own
       * distance from the nearest face is its cover (the one-cover-on-every-face
       * reading the levels' positions allow), and each level's own area decides
       * its own bars — halving the total assumed two equal levels.
       */
      levelChoices = i.levels
        .filter((l) => l.areaCm2 > 0)
        .map((l) => chooseBarsPerLevel(l.areaCm2, {
          widthM: i.b,
          coverM: Math.max(0, Math.min(l.distanceFromBottom, i.h - l.distanceFromBottom)),
          heightM: i.h,
        }));
      choice = levelChoices[0];
      choiceComp = levelChoices.length > 1 ? levelChoices[levelChoices.length - 1] : undefined;
    } else {
      choice = chooseBarsPerLevel(AsTension, levelOpts);
      /* A lighter compression level gets its own line; at A′s/As = 1 one line is both. */
      if (rLevels < 1) choiceComp = chooseBarsPerLevel(AsCompression, levelOpts);
    }
  } else if (i.kase === 'FCO') {
    const sh = faceShares(fcoPct(i), fcoCounts(i));
    barFaces = ([['A1', sh.a1, i.nA1], ['A2', sh.a2, i.nA2], ['A3', sh.a3, i.nA3]] as const)
      .filter(([, share]) => share > 0)
      .map(([face, share, n]) => ({ face, needCm2: AstCm2 * share, choice: chooseBarsForCount(AstCm2 * share, n) }));
    if (barFaces.length > 0) {
      const count = barFaces.reduce((s, f) => s + f.choice.count, 0);
      const diameters = new Set(barFaces.map((f) => f.choice.diameter));
      const asTyped = barFaces.every((f) => f.choice.count === (f.face === 'A1' ? i.nA1 : f.face === 'A2' ? i.nA2 : i.nA3));
      const uniform = diameters.size === 1 && asTyped;
      choice = {
        count,
        diameter: Math.max(...diameters),
        areaCm2: barFaces.reduce((s, f) => s + f.choice.areaCm2, 0),
        /* One size throughout reads as it always did; otherwise face by face. */
        label: uniform
          ? `${count} Ø${barFaces[0].choice.diameter}`
          : barFaces.map((f) => `${f.choice.label} (${f.face})`).join(' + '),
        fitsInOneLayer: null,
        clearSpacingMm: null,
      };
      if (uniform) barFaces = undefined;
    } else {
      barFaces = undefined;
    }
  } else {
    /*
     * No layout, no proposal: `chooseBarsForCount` asked for one anyway would
     * invent a count out of its own minimum and present it as the reader's.
     */
    choice = bars.length > 0 ? chooseBarsForCount(AstCm2, bars.length) : undefined;
  }

  /*
   * ── FCO's distribution, as it was used ───────────────────────────
   *
   * The shares are read in proportion over the faces that have bars (see
   * `facesA1A2A3`), which at A1 + A2 + A3 = 100 is exactly what was typed.
   * Whenever it is not — a split that adds to 150, or a share on a face with
   * no bars — the memo says what was taken, so the number printed is never
   * the answer to a different question than the reader thinks they asked.
   */
  const fcoNotes: EngineMessage[] = [];
  if (i.kase === 'FCO') {
    const sh = faceShares(fcoPct(i), fcoCounts(i));
    const typed = i.pctA1 + i.pctA2 + i.pctA3;
    if (Math.abs(sh.sum - 100) > 1e-6 || Math.abs(typed - 100) > 1e-6) {
      const pc = (x: number) => Math.round(x * 1000) / 10;
      fcoNotes.push(msg('flex.step.pctNormalised', {
        sum: Math.round(sh.sum * 100) / 100, a1: pc(sh.a1), a2: pc(sh.a2), a3: pc(sh.a3),
      }));
    }
    if (sh.a3 > 0 && i.nA3 % 2 === 1) {
      const { left, right } = a3Sides(i.nA3);
      fcoNotes.push(msg('flex.step.a3Split', { left, right }));
    }
  }

  const columnWontFit = (ch: BarChoice | undefined) =>
    !!ch && ((ch.layers ?? 1) > 1 || ch.placeable === false);

  /* What was taken of the distribution comes before anything computed from it. */
  steps.unshift(...fcoNotes);
  steps.push(
    msg('flex.step.diagram', { bars: bars.length }),
    msg(i.kase === 'FCO' ? 'flex.step.atAxial' : 'flex.step.onRay', { phiPn: u.phiPn, phiMn: u.phiMn }),
    u.axialOnly || u.c === undefined || u.epsilonT === undefined
      ? msg('flex.step.axialOnly', { phiPn: u.phiPn, phi: u.phi })
      : msg('flex.step.state', {
          c: u.c * 100, a: b1 * u.c * 100, epsT: u.epsilonT * 1000, phi: u.phi,
        }),
    msg('flex.step.ratio', { ratio: u.ratio }),
    /*
     * The bar arrangement is not printed — the sheet stops at the area — but
     * one that does not fit across the face is a safety signal, not a matter
     * of matching the sheet. Without this line only the drawing showed it.
     *
     * A column level's bars go in ONE row along the face. `placeable` is the
     * beam criterion (up to three layers), under which "3 Ø32 (1+1+1)" on a
     * 12 cm face passed; for a column, a second row already means it does not fit.
     */
    /* A proposal beyond the sheet, when sizing; the bars are an input when checking. */
    ...(i.mode === 'design' && choice ? [msg('flex.step.steel', { bars: choice.label, area: choice.areaCm2 })] : []),
    ...(i.mode === 'design' && choiceComp
      ? [msg('flex.step.asCompBars', { as: AsCompression, bars: choiceComp.label })] : []),
    ...(columnWontFit(choice) || columnWontFit(choiceComp) || (levelChoices ?? []).some(columnWontFit) ? [msg('flex.step.wontFitColumn')] : []),
  );

  return {
    AstCm2,
    ...(i.kase === 'FCR' ? { AsCm2: AsTension, AsPrimeCm2: AsCompression } : {}),
    rho: (AstCm2 * 1e-4) / Ag,
    /*
     * §9.6.1.2's flexural minimum, on the RECTANGULAR column sheets, where
     * the section has a width and a depth to apply it to. The workbook
     * prints it there — 2.5 cm² for the 30 × 30 — so it is reported too.
     *
     * Not on the circular one, which has neither. The guard used to be
     * "b and h are numbers", but the panel always sends them — they are the
     * hidden rectangular fields — so a D = 40 column printed a beam rule
     * evaluated on a rectangle the reader could not see. A column's real
     * floor is §10.9.1's 1 % of Ag either way, and that is `AstMinCm2`.
     *
     * FCO has no `d′s` field — its covers are d′sh and d′sv — so reading
     * `dPrimeS` there picked up whatever the last rectangular case left in it:
     * 2,66 cm² against the sheet's 2,50 for the 30 × 30.
     */
    ...(i.kase === 'FCR' || i.kase === 'FCO'
      ? { AsMinCm2: minFlexuralSteelCm2(i.fc, i.fy, i.b, i.h - (i.kase === 'FCO' ? i.dPrimeV : i.dPrimeS)) }
      : {}),
    AstMinCm2: AstMin,
    AstMaxCm2: AstMax,
    c: u.c, a: u.c === undefined ? undefined : b1 * u.c, epsilonT: u.epsilonT, phi: u.phi,
    phiPn: u.phiPn, phiMn: u.phiMn, theta: u.theta,
    ...(i.kase === 'FCO'
      ? { puMax: axialCap(i.fc, i.fy, Ag, (i.mode === 'design' ? AstMax : AstCm2) * 1e-4, i.confinement) }
      : {}),
    ratio: u.ratio,
    ok: !impossible && u.ratio <= 1,
    bars, barChoice: choice, barChoiceComp: choiceComp, barFaces, outline, steps, impossible,
  };
}

/** A section point, for callers that want the curve rather than a verdict. */
export { interactionCurve, sectionPoint };
