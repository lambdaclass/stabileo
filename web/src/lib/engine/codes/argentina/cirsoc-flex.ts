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
  /** What to actually tie: count, diameter, and whether it fits. */
  barChoice?: BarChoice;
  barChoiceComp?: BarChoice;
  outline: Outline;
  /** The working, line by line, as keys the UI turns into sentences. */
  steps: EngineMessage[];
  /** Set when the section cannot take the demand even at 8 %. */
  impossible?: boolean;
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

/** The bar layout a case and a total steel area imply. */
function layoutFor(i: FlexInput, AstCm2: number): Bar[] {
  switch (i.kase) {
    case 'FSR':
    case 'FST':
      return flexural(outlineFor(i), i.dPrimeS, AstCm2);
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
   * Sizing on the interaction curve removes the band by construction. The
   * capacity of a section is monotone in its steel and monotone in the
   * moment asked of it, so a bisection cannot produce a hole.
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
    const bottomWidth = i.kase === 'FST' ? i.bw : i.b;
    const AstMaxHere = COLUMN_STEEL_RATIO.max * Ag * 1e4;

    /*
     * ── The effective cover is an OUTPUT, not an input ──────────────
     *
     * `d = h − d′s` is only true while the tension steel fits in one layer.
     * Ask a 20 cm web for 40 cm² and it does not: the bars go in two or
     * three layers, the group's centroid sits above the first layer, and `d`
     * is smaller than the field said. Smaller `d` means more steel, which
     * can mean another layer — so the two have to be solved together rather
     * than in sequence.
     *
     * Hence the loop below. It starts from the reader's cover, sizes, lays
     * the bars out, takes the centroid back as the new cover and sizes
     * again, until the cover it assumed and the cover the bars produce agree
     * to a tenth of a millimetre. It converges in two or three passes
     * because each layer moves the centroid by less than the last.
     */
    let effCover = i.dPrimeS;
    let dEff = i.h - effCover;
    let AsMin = minFlexuralSteelCm2(i.fc, i.fy, bottomWidth, dEff);

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
      const bars = flexural(outline, effCover, AsCm2, i.dPrime, AsCompCm2);
      const curve = interactionCurve(outline, bars, mat, Math.PI / 2, 400);
      for (let k = 0; k < curve.length - 1; k++) {
        const A = curve[k];
        const B = curve[k + 1];
        if (A.phiPn >= 0 && B.phiPn < 0) {
          const tt = A.phiPn / (A.phiPn - B.phiPn);
          const c0 = A.c + tt * (B.c - A.c);
          return {
            phiMn: Math.abs(A.phiMnx) + tt * (Math.abs(B.phiMnx) - Math.abs(A.phiMnx)),
            c: c0,
            a: beta1(i.fc) * c0,
            epsilonT: A.epsilonT + tt * (B.epsilonT - A.epsilonT),
            phi: A.phi + tt * (B.phi - A.phi),
          };
        }
      }
      return { phiMn: 0, c: 0, a: 0, epsilonT: 0, phi: 0 };
    };
    const capacityOf = (AsCm2: number, AsCompCm2 = 0) => stateOf(AsCm2, AsCompCm2).phiMn;

    const MuAbs = Math.abs(i.Mu);
    const bisect = (comp: number, target: number, hiCm2: number) => {
      let a = 0.05;
      let z = hiCm2;
      for (let k = 0; k < 45; k++) {
        const m = (a + z) / 2;
        if (capacityOf(m, comp) < target) a = m; else z = m;
      }
      return z;
    };

    /*
     * One sizing pass, at whatever `effCover` currently says.
     *
     * The singly-reinforced ceiling inside it is the steel at which εt falls
     * to 5 ‰. Beyond it φ starts dropping and the section stops being one
     * the code wants built, which is exactly where compression steel earns
     * its place.
     */
    /** The steel at which εt falls to 5 ‰ — shared by both modes. */
    const singlyLimit = () => {
      let a = 0.05;
      let z = AstMaxHere;
      for (let k = 0; k < 45; k++) {
        const m = (a + z) / 2;
        const bars = flexural(outline, effCover, m);
        const curve = interactionCurve(outline, bars, mat, Math.PI / 2, 400);
        const at = curve.reduce((q, p) => (Math.abs(p.phiPn) < Math.abs(q.phiPn) ? p : q), curve[0]);
        if (at.epsilonT > 0.005) a = m; else z = m;
      }
      return a;
    };

    const sizeOnce = () => {
      const AsAtLimit = singlyLimit();
      const MuSinglyMax = capacityOf(AsAtLimit);

      if (MuAbs <= MuSinglyMax) {
        return {
          AsReq: Math.max(bisect(0, MuAbs, AstMaxHere), AsMin),
          AsComp: 0,
          MuSinglyMax,
        };
      }
      /*
       * Hold the concrete at its limit and let a symmetric pair carry the
       * rest. Bisecting the PAIR keeps one unknown, and the pair is what a
       * doubly-reinforced section actually adds.
       */
      let a = 0;
      let z = AstMaxHere;
      for (let k = 0; k < 45; k++) {
        const m = (a + z) / 2;
        if (capacityOf(AsAtLimit + m, m) < MuAbs) a = m; else z = m;
      }
      return { AsReq: AsAtLimit + z, AsComp: z, MuSinglyMax };
    };

    /*
     * Bars and depth, solved together. `fitOpts` takes the cover to the bar
     * CENTRE, which is what the reader typed — the stirrup is not subtracted
     * again, because the centre is already inside it.
     */
    const fitOpts = { widthM: bottomWidth, coverM: i.dPrimeS, heightM: i.h };

    /*
     * ── Verify asks a different question, and had no answer ────────
     *
     * This branch did not exist. In `verify` the beam cases fell through to
     * the sizing code, which designs the section to the moment and then
     * reports the ratio between them — necessarily 1.000. A reader could
     * enter 2 cm² against 150 kN·m on a 20 × 50 and be told it verifies,
     * because nothing ever looked at the number they typed. The column
     * cases had the branch; the beams were never given one.
     *
     * Here the steel is an INPUT. The bars still have to go somewhere, so
     * the layering runs — 40 cm² in a 20 cm web stacks whether the reader
     * chose it or the sizing did, and `d` follows — but nothing is resized:
     * the capacity that comes out is the capacity of what they described.
     */
    let pass: { AsReq: number; AsComp: number; MuSinglyMax: number };
    let chosen: BarChoice;
    if (i.mode === 'verify') {
      const given = Math.max(i.AstGiven, 0);
      chosen = chooseBars(given, fitOpts);
      effCover = chosen.centroidFromFaceM ?? i.dPrimeS;
      dEff = i.h - effCover;
      AsMin = minFlexuralSteelCm2(i.fc, i.fy, bottomWidth, dEff);
      pass = { AsReq: given, AsComp: 0, MuSinglyMax: capacityOf(singlyLimit()) };
    } else {
      pass = sizeOnce();
      chosen = chooseBars(pass.AsReq, fitOpts);
      for (let layerPasses = 0; layerPasses < 8; layerPasses++) {
        const produced = chosen.centroidFromFaceM ?? i.dPrimeS;
        if (Math.abs(produced - effCover) < 1e-4) break;
        effCover = produced;
        dEff = i.h - effCover;
        AsMin = minFlexuralSteelCm2(i.fc, i.fy, bottomWidth, dEff);
        pass = sizeOnce();
        chosen = chooseBars(pass.AsReq, fitOpts);
      }
    }

    const MuSinglyMax = pass.MuSinglyMax;
    const AsReq = pass.AsReq;
    const AsComp = pass.AsComp;

    const total = AsReq + AsComp;
    const bars = flexural(outline, effCover, AsReq, i.dPrime, AsComp);
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
     * Conflating the two would answer "make it bigger" to someone who could
     * simply add a bar.
     */
    const cannotPlace =
      total > AstMaxHere
      || chosen.placeable === false
      || (chosenComp?.placeable === false);
    const shortOfDemand = st.phiMn < MuAbs * 0.999;
    const impossible = i.mode === 'verify' ? cannotPlace : (cannotPlace || shortOfDemand);
    const verifies = !cannotPlace && !shortOfDemand;

    return {
      AstCm2: total,
      AsCm2: AsReq,
      AsPrimeCm2: AsComp,

      rho: (total * 1e-4) / Ag,
      AsMinCm2: AsMin,
      /* §10.3.4's c at εt = 5 ‰, which is what the sheet prints as cmax. */
      a: st.a, c: st.c, cMax: (dEff * 0.003) / 0.008, epsilonT: st.epsilonT, phi: st.phi,
      phiMn: st.phiMn,
      ratio: st.phiMn > 0 ? MuAbs / st.phiMn : Infinity,
      ok: verifies,
      impossible,
      bars,
      barChoice: chosen,
      barChoiceComp: chosenComp ?? undefined,
      outline,
      steps: [
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
        chosen.layers && chosen.layers > 1
          ? msg('flex.step.asBarsLayers', {
              as: AsReq, bars: chosen.label, layers: chosen.layers,
              gap: chosen.clearSpacingMm ?? 0,
            })
          : msg('flex.step.asBars', { as: AsReq, bars: chosen.label }),
        ...(chosen.placeable === false ? [msg('flex.step.wontFit')] : []),
        ...(chosenComp
          ? [msg('flex.step.asCompBars', { as: AsComp, bars: chosenComp.label })] : []),
        msg('flex.step.phiMn', { m: st.phiMn }),
        ...(i.mode === 'verify' && shortOfDemand
          ? [msg('flex.step.fails', { phiMn: st.phiMn, mu: MuAbs })] : []),
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
  const widthForMin = i.b;
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
  const at = (AstCm2: number) =>
    utilisation(outline, layoutFor(i, AstCm2), mat, Pu, i.Mu, i.kase === 'FCO' ? i.Muy : 0);

  let AstCm2: number;
  let impossible = false;
  const steps: EngineMessage[] = [];

  if (i.mode === 'verify') {
    AstCm2 = i.AstGiven;
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
   */
  const choice = i.kase === 'FCR'
    ? chooseBarsPerLevel(AstCm2 / 2, {
        /* Cover to the bar centre, as the reader typed it — see `chooseBars`. */
        widthM: i.b, coverM: Math.max(i.dPrimeS, i.dPrime), heightM: i.h,
      })
    /*
     * No layout, no proposal. A percentage split that lands on zero bars —
     * every share set to 0 %, or a count of zero — has no arrangement to
     * price, and `chooseBarsForCount` asked for one anyway would invent a
     * count out of its own minimum and present it as the reader's layout.
     */
    : bars.length > 0 ? chooseBarsForCount(AstCm2, bars.length) : undefined;

  steps.push(
    msg('flex.step.diagram', { bars: bars.length }),
    msg('flex.step.onRay', { phiPn: u.phiPn, phiMn: u.phiMn }),
    msg('flex.step.state', {
      c: u.c * 100, a: b1 * u.c * 100, epsT: u.epsilonT * 1000, phi: u.phi,
    }),
    msg('flex.step.ratio', { ratio: u.ratio }),
    choice
      ? msg('flex.step.steel', { bars: choice.label, area: choice.areaCm2 })
      : msg('flex.step.noBars'),
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
    bars, barChoice: choice, outline, steps, impossible,
  };
}

/** A section point, for callers that want the curve rather than a verdict. */
export { interactionCurve, sectionPoint };
