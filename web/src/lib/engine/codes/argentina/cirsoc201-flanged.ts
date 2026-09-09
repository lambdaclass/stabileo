/**
 * Flanged sections in simple flexure — the T beam. CIRSOC 201-05 §10.
 *
 * ── Composed, not copied ───────────────────────────────────────────
 *
 * `checkFlexure` is 260 lines of stress block, strain check, φ transition and
 * doubly-reinforced fallback, and every branch of it is written around one
 * compression width `b`. Threading a flange through all of them would touch
 * every branch of the one function in this module that a regression test pins
 * numerically — to add a shape, at the cost of the shape that already works.
 *
 * So this file does what the textbook does instead: it turns a T into a
 * rectangle and asks the existing engine. Two cases, and the first is not an
 * approximation of anything.
 *
 *   a ≤ hf   The compression block lies inside the flange, so the section IS a
 *            rectangle of width bf. Concrete below the neutral axis carries
 *            nothing, and the web's absence changes no term. One call.
 *
 *   a > hf   The block reaches into the web. Split the resistance: the two
 *            flange overhangs (bf − bw)·hf are a couple of known size, and
 *            what is left is a rectangular problem of width bw. One call for
 *            the web, plus the flange steel added on.
 *
 * The consequence worth stating: every φ decision, every strain check and the
 * whole doubly-reinforced path are the SAME code the rectangular case runs. A
 * change to how this application interprets εt reaches T beams for free, and
 * cannot reach them differently.
 *
 * ── Where the web width is not the flange width ────────────────────
 *
 * §9.6.1.2's minimum is `ρmin·bw·d`, on the WEB. A T beam asked for its
 * minimum with bf would be told to place two or three times the steel the
 * code wants — the flange is in compression and contributes nothing to a
 * minimum written for the tension side. `checkFlexure` computes it from
 * whatever `b` it is handed, so the a ≤ hf case has to correct it afterwards;
 * the a > hf case is already called with bw and needs no correction.
 */

import { checkFlexure, type ConcreteDesignParams, type FlexureResult } from './cirsoc201';

/** A T or L section: a flange on top of a web. */
export interface FlangedGeometry {
  /** Effective flange width, m. */
  bf: number;
  /** Flange thickness, m. */
  hf: number;
  /** Web width, m. */
  bw: number;
}

export interface FlangedFlexureResult extends FlexureResult {
  /** Whether the compression block stayed inside the flange. */
  withinFlange: boolean;
  /** Steel balancing the flange overhangs, cm². Zero when `withinFlange`. */
  AsFlange: number;
}

/** β₁ per §10.2.7.3 — the same rule the rest of the module applies. */
function beta1(fc: number): number {
  if (fc <= 28) return 0.85;
  return Math.max(0.65, 0.85 - (0.05 * (fc - 28)) / 7);
}

/**
 * Design a flanged section for a moment.
 *
 * `params.b` is ignored; the flange geometry supplies every width. `Mu` in
 * kN·m, positive sagging — the flange in compression, which is the case a T
 * beam is for. A T with its flange in tension is a rectangle of width bw and
 * should be asked for as one, because that is what it is.
 */
export function checkFlexureFlanged(
  params: ConcreteDesignParams,
  geom: FlangedGeometry,
  Mu: number,
): FlangedFlexureResult {
  const { fc, fy, cover, stirrupDia } = params;
  const { bf, hf, bw } = geom;

  const alpha1 = 0.85;
  const fc_kPa = fc * 1000;
  const fy_kPa = fy * 1000;
  const MuAbs = Math.abs(Mu);

  /*
   * Which case, decided before designing anything.
   *
   * The depth of the block is not known until the steel is, and the steel is
   * not known until the width is — so the test is made on the moment the
   * flange alone can resist. If the whole flange in compression is already
   * more than asked for, the block cannot have reached the web.
   */
  const dTrial = params.h - cover - stirrupDia / 1000 - 0.008;
  const MnFlangeFull = alpha1 * fc_kPa * bf * hf * (dTrial - hf / 2);
  const withinFlange = 0.9 * MnFlangeFull >= MuAbs;

  if (withinFlange) {
    /*
     * A rectangle of width bf, with one correction. `checkFlexure` derived
     * As,min from the b it was given, and §9.6.1.2 wants it on the web.
     */
    const r = checkFlexure({ ...params, b: bf }, Mu);
    const rhoMin = Math.max((0.25 * Math.sqrt(fc)) / fy, 1.4 / fy);
    const AsMinWeb = rhoMin * bw * r.d * 1e4;
    const AsReq = Math.max(r.AsFlexural, AsMinWeb);

    return {
      ...r,
      AsMin: AsMinWeb,
      AsReq,
      withinFlange: true,
      AsFlange: 0,
      steps: [
        `Sección T: a ≤ hf → se comporta como rectangular de ancho bf = ${(bf * 100).toFixed(0)} cm`,
        ...r.steps,
        `As,mín se toma sobre el alma (bw = ${(bw * 100).toFixed(0)} cm) = ${AsMinWeb.toFixed(2)} cm²`,
      ],
    };
  }

  /*
   * The block reaches the web, so the resistance splits.
   *
   * The overhangs are a compression force of known size at a known depth —
   * nothing about them depends on the steel — so their moment comes off the
   * top and the web is left with an ordinary rectangular problem. The steel
   * balancing them is added back at the end.
   */
  const Cf = alpha1 * fc_kPa * (bf - bw) * hf; // kN
  const MnFlange = Cf * (dTrial - hf / 2); // kN·m
  const AsFlange = (Cf / fy_kPa) * 1e4; // cm²

  const MuWeb = Math.max(MuAbs - 0.9 * MnFlange, 0.01);
  const web = checkFlexure({ ...params, b: bw }, MuWeb);

  const AsReq = web.AsReq + AsFlange;
  return {
    ...web,
    AsFlexural: web.AsFlexural + AsFlange,
    AsReq,
    /*
     * The capacity reported is the web's plus the flange couple, because that
     * is what the section carries — reporting only the web's would understate
     * a T beam by the part that made it a T beam.
     */
    phiMn: web.phiMn + 0.9 * MnFlange,
    ratio: MuAbs / (web.phiMn + 0.9 * MnFlange),
    withinFlange: false,
    AsFlange,
    steps: [
      `Sección T: a > hf → las alas y el alma se reparten el momento`,
      `Cf = α₁·f'c·(bf−bw)·hf = ${Cf.toFixed(1)} kN`,
      `φMn,alas = ${(0.9 * MnFlange).toFixed(2)} kN·m → As,alas = ${AsFlange.toFixed(2)} cm²`,
      `Momento al alma: ${MuWeb.toFixed(2)} kN·m sobre bw = ${(bw * 100).toFixed(0)} cm`,
      ...web.steps,
      `As total = ${AsReq.toFixed(2)} cm²`,
    ],
  };
}

/**
 * The depth of the compression block a given steel area produces in a T.
 *
 * Exposed because the panel draws it, and because a reader checking a
 * published example wants the number the book prints rather than a status.
 */
export function flangedBlockDepth(
  params: ConcreteDesignParams,
  geom: FlangedGeometry,
  AsCm2: number,
): { a: number; withinFlange: boolean } {
  const { fc, fy } = params;
  const { bf, hf, bw } = geom;
  const As = AsCm2 * 1e-4;
  const alpha1 = 0.85;

  const aIfFlange = (As * fy) / (alpha1 * fc * bf);
  if (aIfFlange <= hf) return { a: aIfFlange, withinFlange: true };

  /*
   * One decomposition, all the way through.
   *
   * The compression zone can be split two equivalent ways — full flange plus
   * the web BELOW it, `bf·hf + bw·(a−hf)`, or the two overhangs plus a web
   * strip running the full depth, `(bf−bw)·hf + bw·a`. They are the same
   * number, and mixing them is not: taking `Cf` from the second and then
   * adding `hf` to the web depth as the first does counts the `bw·hf` strip
   * twice, and reports a block deeper than the steel can equilibrate.
   *
   * `Cf` below is the overhangs, so `a` is measured from the top of the
   * section — the second form, and the one `checkFlexureFlanged` uses when it
   * hands the web an ordinary rectangular problem of width bw.
   */
  const Cf = alpha1 * fc * (bf - bw) * hf;
  const Cw = Math.max(As * fy - Cf, 0);
  return { a: Cw / (alpha1 * fc * bw), withinFlange: false };
}

/** Exported so tests and the panel agree about β₁ without re-deriving it. */
export { beta1 as flangedBeta1 };
