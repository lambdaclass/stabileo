/**
 * The other direction: given the steel, what does the section carry?
 *
 * ── Why this is a separate file and not more branches ──────────────
 *
 * `checkFlexure` and `checkColumn` size a section — they take a demand and
 * return the steel it needs. The workbook offers verification too, and so
 * should we, but verification is not the same question asked backwards: it is
 * a shorter question. There is no search, no minimum to impose, no bar
 * selection. Given As, the block depth follows from equilibrium, the strains
 * follow from the block, φ follows from the strains, and the capacity is
 * arithmetic.
 *
 * Threading a `mode` flag through 260 lines of sizing logic to skip most of it
 * would make both harder to read than either.
 *
 * ── Everything here is the basis module's clauses ──────────────────
 *
 * β₁, the strain limits, φ from εt: all imported. Nothing in this file
 * decides a code question on its own, which is what keeps it from becoming a
 * second opinion about the same section.
 */

import { beta1, phiFromStrain, EPSILON_CU, minFlexuralSteelCm2 } from './cirsoc201-basis';
import type { ConcreteDesignParams } from './cirsoc201';
import { flangedBlockDepth, type FlangedGeometry } from './cirsoc201-flanged';
import { generateInteractionDiagram } from './interaction-diagram';
import { COLUMN_STEEL_RATIO } from './cirsoc201-basis';

export interface Capacity {
  /** Depth of the equivalent rectangular block, m. */
  a: number;
  /** Neutral axis depth, m. */
  c: number;
  /** Net tensile strain in the extreme tension steel. */
  epsilonT: number;
  phi: number;
  /** Nominal and design moment, kN·m. */
  Mn: number;
  phiMn: number;
  /** §9.6.1.2's minimum, cm² — a section below it does not comply. */
  AsMin: number;
  belowMinimum: boolean;
  /** Whether the section is tension-controlled at this steel. */
  tensionControlled: boolean;
  steps: string[];
}

/** The effective depth this module assumes, matching `cirsoc201.ts`. */
function effectiveDepth(h: number, cover: number, stirrupDia: number, barDia = 16): number {
  return h - cover - stirrupDia / 1000 - barDia / 2000;
}

/**
 * What a rectangular section carries with `AsCm2` in tension.
 *
 * Singly reinforced, and deliberately so: compression steel changes the
 * question into a two-unknown equilibrium that `checkFlexure` already solves
 * on the sizing side. A reader verifying a doubly-reinforced section is
 * better served by sizing it and comparing.
 */
export function rectCapacity(
  params: ConcreteDesignParams,
  AsCm2: number,
): Capacity {
  const { fc, fy, b, h, cover, stirrupDia } = params;
  const d = effectiveDepth(h, cover, stirrupDia);
  const As = AsCm2 * 1e-4;
  const alpha1 = 0.85;
  const fc_kPa = fc * 1000;
  const fy_kPa = fy * 1000;

  /*
   * From equilibrium, assuming the steel yields: C = T.
   *
   * The assumption is then checked rather than trusted — a heavily reinforced
   * section reaches its concrete limit with the bars still elastic, and
   * reporting As·fy for those would overstate the capacity. `phiFromStrain`
   * catches the consequence for φ; `belowYield` says it plainly in the memo.
   */
  const a = (As * fy_kPa) / (alpha1 * fc_kPa * b);
  const c = a / beta1(fc);
  const epsilonT = c > 1e-9 ? (EPSILON_CU * (d - c)) / c : Infinity;
  const phi = phiFromStrain(epsilonT, fy);

  const Mn = As * fy_kPa * (d - a / 2);
  const AsMin = minFlexuralSteelCm2(fc, fy, b, d);

  const steps = [
    `d = ${(d * 100).toFixed(1)} cm, As = ${AsCm2.toFixed(2)} cm²`,
    `a = As·fy / (α₁·f'c·b) = ${(a * 100).toFixed(2)} cm`,
    `c = a / β₁ = ${(c * 100).toFixed(2)} cm`,
    `εt = ${(epsilonT * 1000).toFixed(2)} ‰ → φ = ${phi.toFixed(3)}`,
    `Mn = As·fy·(d − a/2) = ${Mn.toFixed(2)} kN·m`,
    `φMn = ${(phi * Mn).toFixed(2)} kN·m`,
  ];
  if (AsCm2 < AsMin) {
    steps.push(`⚠ As < As,mín = ${AsMin.toFixed(2)} cm² (§9.6.1.2)`);
  }
  if (epsilonT < 0.005) {
    steps.push(`⚠ εt < 5 ‰: la sección no está controlada por tracción`);
  }

  return {
    a, c, epsilonT, phi, Mn, phiMn: phi * Mn,
    AsMin, belowMinimum: AsCm2 < AsMin,
    tensionControlled: epsilonT >= 0.005,
    steps,
  };
}

/**
 * The same for a flanged section, using the block depth the flanged module
 * derives — which is where the two-case split lives, so this file does not
 * repeat it.
 */
export function flangedCapacity(
  params: ConcreteDesignParams,
  geom: FlangedGeometry,
  AsCm2: number,
): Capacity & { withinFlange: boolean } {
  const { fc, fy, h, cover, stirrupDia } = params;
  const { bf, hf, bw } = geom;
  const d = effectiveDepth(h, cover, stirrupDia);
  const As = AsCm2 * 1e-4;
  const alpha1 = 0.85;
  const fc_kPa = fc * 1000;
  const fy_kPa = fy * 1000;

  const { a, withinFlange } = flangedBlockDepth(params, geom, AsCm2);
  const c = a / beta1(fc);
  const epsilonT = c > 1e-9 ? (EPSILON_CU * (d - c)) / c : Infinity;
  const phi = phiFromStrain(epsilonT, fy);

  /*
   * The moment about the tension steel, taking each piece of the compression
   * zone at its own centroid. In the shallow case that is one rectangle and
   * the expression collapses to the familiar `As·fy·(d − a/2)`.
   */
  let Mn: number;
  if (withinFlange) {
    Mn = As * fy_kPa * (d - a / 2);
  } else {
    const Cf = alpha1 * fc_kPa * (bf - bw) * hf;
    const Cw = alpha1 * fc_kPa * bw * a;
    Mn = Cf * (d - hf / 2) + Cw * (d - a / 2);
  }

  const AsMin = minFlexuralSteelCm2(fc, fy, bw, d);
  const steps = [
    `Sección T: el bloque queda ${withinFlange ? 'dentro del ala' : 'en el alma'}`,
    `a = ${(a * 100).toFixed(2)} cm, c = ${(c * 100).toFixed(2)} cm`,
    `εt = ${(epsilonT * 1000).toFixed(2)} ‰ → φ = ${phi.toFixed(3)}`,
    `φMn = ${(phi * Mn).toFixed(2)} kN·m`,
    `As,mín sobre el alma = ${AsMin.toFixed(2)} cm²`,
  ];

  return {
    a, c, epsilonT, phi, Mn, phiMn: phi * Mn,
    AsMin, belowMinimum: AsCm2 < AsMin,
    tensionControlled: epsilonT >= 0.005,
    withinFlange, steps,
  };
}

/**
 * Size a rectangular column's steel for a demand, by bisection.
 *
 * `checkColumn` already answers this, and this exists for the case it cannot:
 * the panel needs the SAME comparison in both directions, so that switching
 * between sizing and verifying does not switch which method is being applied.
 * Bisecting on the verification is the only way to guarantee that the steel
 * this returns is the steel the verification will pass.
 */
export function sizeByBisection(
  ratioAt: (AsCm2: number) => number,
  loCm2: number,
  hiCm2: number,
  iterations = 40,
): { AsCm2: number; ratio: number } | null {
  if (ratioAt(loCm2) <= 1) return { AsCm2: loCm2, ratio: ratioAt(loCm2) };
  if (ratioAt(hiCm2) > 1) return null;
  let lo = loCm2;
  let hi = hiCm2;
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    if (ratioAt(mid) > 1) lo = mid; else hi = mid;
  }
  return { AsCm2: hi, ratio: ratioAt(hi) };
}


// ── Rectangular columns, on the real curve ─────────────────────────

export interface ColumnCheck {
  /** Capacity on the ray from the origin through (Mu, Pu). */
  phiPn: number;
  phiMn: number;
  ratio: number;
  status: 'ok' | 'fail';
  /** Neutral axis depth at that point, m. */
  c: number;
  epsilonT: number;
  phi: number;
  steps: string[];
}

/**
 * Is (Pu, Mu) inside the section's interaction diagram?
 *
 * ── Why this exists when `checkColumn` already did ─────────────────
 *
 * `checkColumn` does not read the diagram. It sizes the steel for the moment
 * as an isolated couple, sizes more steel to carry the whole axial load on
 * the bars alone, halves the second, and adds them. Its own comments say
 * "rough" and "simplified", and the adapter that PRO designs through says
 * plainly that these estimators are not the authoritative path — PRO uses a
 * strain-compatible verifier.
 *
 * The additive rule has no interaction in it, and a column HAS interaction:
 * moderate axial compression raises the moment capacity, which is the whole
 * bulge of the curve up to the balance point. Swept against the real diagram
 * over nine points of a 30×30, it ran from 71 % to 171 % of the steel
 * actually required — conservative in the middle, and up to 29 % LIGHT in
 * the high-moment corner. Conservative on average is not a safety property.
 *
 * So the panel reads the curve, the same way the circular module does, with
 * the same ray comparison: hold the eccentricity and ask how much further
 * the column could be pushed. `checkColumn` is left alone — nothing else
 * calls it, and rewriting a function PRO's memos still quote is a separate
 * decision from fixing what the panel shows.
 */
export function rectColumnCheck(
  params: ConcreteDesignParams,
  AstCm2: number,
  Pu: number,
  Mu: number,
  barCount = 8,
  barDia = 20,
): ColumnCheck {
  const { fc, fy, b, h, cover, stirrupDia } = params;
  const diag = generateInteractionDiagram({
    b, h, fc, fy,
    /* The diagram measures to the bar centre; the params carry clear cover. */
    cover: cover + stirrupDia / 1000 + barDia / 2000,
    AsProv: AstCm2, barCount, barDia, nPoints: 60,
  });

  const MuAbs = Math.abs(Mu);
  const steps = [
    `Sección ${(b * 100).toFixed(0)}×${(h * 100).toFixed(0)} cm, Ast = ${AstCm2.toFixed(2)} cm²`,
    `Pu = ${Pu.toFixed(1)} kN, Mu = ${MuAbs.toFixed(2)} kN·m`,
    `Diagrama de interacción: ${diag.points.length} puntos por compatibilidad de deformaciones`,
  ];

  /* Pure bending: the ray lies along the moment axis and cannot be crossed. */
  if (Math.abs(Pu) < 1e-9) {
    let best = 0;
    let at = diag.points[0];
    for (const p of diag.points) if (p.phiPn >= 0 && p.phiMn > best) { best = p.phiMn; at = p; }
    const ratio = best > 0 ? MuAbs / best : Infinity;
    steps.push(`Flexión pura: φMn,máx = ${best.toFixed(2)} kN·m`);
    return {
      phiPn: 0, phiMn: best, ratio, status: ratio <= 1 ? 'ok' : 'fail',
      c: at.c, epsilonT: 0, phi: 0, steps,
    };
  }

  const slope = MuAbs / Pu;
  let capP = 0;
  let capM = 0;
  let at = diag.points[0];
  for (let i = 0; i < diag.points.length - 1; i++) {
    const A = diag.points[i];
    const B = diag.points[i + 1];
    const fA = A.phiMn - slope * A.phiPn;
    const fB = B.phiMn - slope * B.phiPn;
    if (fA === 0 || fA * fB < 0) {
      const t = fA / (fA - fB);
      capP = A.phiPn + t * (B.phiPn - A.phiPn);
      capM = A.phiMn + t * (B.phiMn - A.phiMn);
      at = Math.abs(t) < 0.5 ? A : B;
      break;
    }
  }

  const ratio = Math.hypot(capM, capP) > 1e-9
    ? Math.hypot(MuAbs, Pu) / Math.hypot(capM, capP)
    : Infinity;
  steps.push(`Capacidad sobre la recta de excentricidad: φPn = ${capP.toFixed(1)} kN, φMn = ${capM.toFixed(2)} kN·m`);
  steps.push(`Relación demanda/capacidad = ${ratio.toFixed(3)}`);

  return {
    phiPn: capP, phiMn: capM, ratio, status: ratio <= 1 ? 'ok' : 'fail',
    c: at.c, epsilonT: 0, phi: 0, steps,
  };
}

/** The steel a rectangular column needs, bisected on `rectColumnCheck`. */
export function designRectColumn(
  params: ConcreteDesignParams,
  Pu: number,
  Mu: number,
  barCount = 8,
  barDia = 20,
): { AstCm2: number; check: ColumnCheck } | null {
  const Ag = params.b * params.h;
  const sized = sizeByBisection(
    (Ast) => rectColumnCheck(params, Ast, Pu, Mu, barCount, barDia).ratio,
    COLUMN_STEEL_RATIO.min * Ag * 1e4,
    COLUMN_STEEL_RATIO.max * Ag * 1e4,
  );
  if (!sized) return null;
  return { AstCm2: sized.AsCm2, check: rectColumnCheck(params, sized.AsCm2, Pu, Mu, barCount, barDia) };
}
