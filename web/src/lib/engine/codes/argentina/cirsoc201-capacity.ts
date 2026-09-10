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
