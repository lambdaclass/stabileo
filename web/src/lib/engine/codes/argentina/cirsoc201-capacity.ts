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

import {
  beta1, phiFromStrain, EPSILON_CU, ES_MPA, yieldStrain, minFlexuralSteelCm2,
} from './cirsoc201-basis';
import type { ConcreteDesignParams } from './cirsoc201';
import type { FlangedGeometry } from './cirsoc201-flanged';
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
  /** Steel stress at equilibrium, MPa — below fy when the steel does not yield. */
  fs: number;
  /** Nominal and design moment, kN·m. */
  Mn: number;
  phiMn: number;
  /** §9.6.1.2's minimum, cm² — a section below it does not comply. */
  AsMin: number;
  belowMinimum: boolean;
  /** Whether the section is tension-controlled at this steel. */
  tensionControlled: boolean;
  /**
   * Past 4 %·b·h the honest answer is a bigger section, not a bigger number —
   * the same practical ceiling `checkFlexure` states, applied here so the two
   * capacity paths refuse absurd sections identically.
   */
  exceedsPracticalMax: boolean;
  steps: string[];
}

/** The effective depth this module assumes, matching `cirsoc201.ts`. */
function effectiveDepth(h: number, cover: number, stirrupDia: number, barDia = 16): number {
  return h - cover - stirrupDia / 1000 - barDia / 2000;
}

/**
 * The steel stress at equilibrium, found by strain compatibility.
 *
 * Verification closes C = T, and an earlier version closed it with fs = fy
 * unconditionally: `a = As·fy / (α₁·f'c·b)`, `Mn = As·fy·(d − a/2)`. For an
 * over-reinforced section the concrete crushes with the bars still elastic,
 * and the fy-based answer keeps growing with As forever — an unbounded,
 * phantom capacity for a verification that should be refusing the section.
 *
 * Strain compatibility closes it instead: start at fs = fy, get `a` from
 * equilibrium, εt from c = a/β₁, and re-seat fs at min(fy, εt·Es) until the
 * two agree. The fixed point is unique because εt falls as fs grows — but
 * the bare iteration is not a contraction for heavy steel (its slope at the
 * fixed point is d/(d − c), past 1 as c approaches d), and with the yield
 * clamp it bounces between fy and a low value forever. So the step is
 * damped, and the damping is halved every time the residual changes sign:
 * for the monotone map this is, that converges whatever the steel.
 *
 * `blockDepth` is the section's a(fs) — one line for a rectangle, the
 * flange/web split for a T.
 */
function steelStressAtEquilibrium(
  d: number, b1: number, fy_kPa: number, Es_kPa: number,
  blockDepth: (fs: number) => number,
): { fs: number; a: number; c: number; epsilonT: number } {
  let fs = fy_kPa;
  let omega = 1;
  let previousSign = 0;
  for (let k = 0; k < 200; k++) {
    const a = blockDepth(fs);
    const c = a / b1;
    const epsilonT = c > 1e-9 ? (EPSILON_CU * (d - c)) / c : Infinity;
    const target = Math.min(fy_kPa, Math.max(0, epsilonT * Es_kPa));
    const residual = target - fs;
    if (Math.abs(residual) <= 1e-9 * fy_kPa) {
      return { fs: target, a: blockDepth(target), c: blockDepth(target) / b1, epsilonT };
    }
    const sign = Math.sign(residual);
    if (previousSign !== 0 && sign !== previousSign) omega *= 0.5;
    previousSign = sign;
    fs += omega * residual;
  }
  /* Unreachable for a monotone map; kept so the function is total. */
  const a = blockDepth(fs);
  const c = a / b1;
  return { fs, a, c, epsilonT: c > 1e-9 ? (EPSILON_CU * (d - c)) / c : Infinity };
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
  const Es_kPa = ES_MPA * 1000;
  const b1 = beta1(fc);

  const { fs, a, c, epsilonT } = steelStressAtEquilibrium(
    d, b1, fy_kPa, Es_kPa,
    (trial) => (As * trial) / (alpha1 * fc_kPa * b),
  );
  const phi = phiFromStrain(epsilonT, fy);

  const Mn = As * fs * (d - a / 2);
  const AsMin = minFlexuralSteelCm2(fc, fy, b, d);
  const yields = epsilonT >= yieldStrain(fy);

  /* Same ceiling, same remedy as `checkFlexure`: 4 %·b·h is where the bars
   * stop fitting, and past it the answer is a bigger section. */
  const AsMaxPractical = 0.04 * b * h * 1e4; // cm²
  const exceedsPracticalMax = AsCm2 > AsMaxPractical;

  const steps = [
    `d = ${(d * 100).toFixed(1)} cm, As = ${AsCm2.toFixed(2)} cm²`,
    yields
      ? 'La armadura traccionada fluye: fs = fy'
      : `εt = ${(epsilonT * 1000).toFixed(2)} ‰ < εy = ${(yieldStrain(fy) * 1000).toFixed(2)} ‰: ` +
        `la armadura no fluye — fs = ${(fs / 1000).toFixed(0)} MPa por compatibilidad de deformaciones`,
    `a = As·fs / (α₁·f'c·b) = ${(a * 100).toFixed(2)} cm, c = a / β₁ = ${(c * 100).toFixed(2)} cm`,
    `εt = ${(epsilonT * 1000).toFixed(2)} ‰ → φ = ${phi.toFixed(3)}`,
    `Mn = As·fs·(d − a/2) = ${Mn.toFixed(2)} kN·m`,
    `φMn = ${(phi * Mn).toFixed(2)} kN·m`,
  ];
  if (AsCm2 < AsMin) {
    steps.push(`⚠ As < As,mín = ${AsMin.toFixed(2)} cm² (§9.6.1.2)`);
  }
  if (epsilonT < 0.005) {
    steps.push(`⚠ εt < 5 ‰: la sección no está controlada por tracción`);
  }
  if (exceedsPracticalMax) {
    steps.push(
      `⚠ As = ${AsCm2.toFixed(1)} cm² supera el máximo práctico ${AsMaxPractical.toFixed(1)} cm² ` +
        `(4 %·b·h) — sección insuficiente: agrandar la sección`,
    );
  }

  return {
    a, c, epsilonT, phi, fs: fs / 1000, Mn, phiMn: phi * Mn,
    AsMin, belowMinimum: AsCm2 < AsMin,
    tensionControlled: epsilonT >= 0.005,
    exceedsPracticalMax,
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
  const Es_kPa = ES_MPA * 1000;
  const b1 = beta1(fc);

  /*
   * The same strain compatibility as the rectangular path, with the block
   * re-derived at each steel stress: the flange/web split depends on `a`,
   * and `a` depends on fs, so the case is decided inside the iteration.
   * `flangedBlockDepth` cannot be reused here — it closes equilibrium with
   * fy unconditionally, which is the assumption being removed.
   */
  const Cf = alpha1 * fc_kPa * (bf - bw) * hf; // the overhangs, independent of fs
  const blockDepth = (trial: number): number => {
    const aIfFlange = (As * trial) / (alpha1 * fc_kPa * bf);
    return aIfFlange <= hf ? aIfFlange : Math.max(As * trial - Cf, 0) / (alpha1 * fc_kPa * bw);
  };
  const { fs, a, c, epsilonT } = steelStressAtEquilibrium(d, b1, fy_kPa, Es_kPa, blockDepth);
  const withinFlange = (As * fs) / (alpha1 * fc_kPa * bf) <= hf;
  const phi = phiFromStrain(epsilonT, fy);

  /*
   * The moment about the tension steel, taking each piece of the compression
   * zone at its own centroid. In the shallow case that is one rectangle and
   * the expression collapses to the familiar `As·fs·(d − a/2)`.
   */
  let Mn: number;
  if (withinFlange) {
    Mn = As * fs * (d - a / 2);
  } else {
    const Cw = alpha1 * fc_kPa * bw * a;
    Mn = Cf * (d - hf / 2) + Cw * (d - a / 2);
  }

  const AsMin = minFlexuralSteelCm2(fc, fy, bw, d);
  const yields = epsilonT >= yieldStrain(fy);

  /* The 4 %·b·h ceiling, on the width the steel actually lives in: the web. */
  const AsMaxPractical = 0.04 * bw * h * 1e4; // cm²
  const exceedsPracticalMax = AsCm2 > AsMaxPractical;

  const steps = [
    `Sección T: el bloque queda ${withinFlange ? 'dentro del ala' : 'en el alma'}`,
    yields
      ? 'La armadura traccionada fluye: fs = fy'
      : `εt = ${(epsilonT * 1000).toFixed(2)} ‰ < εy = ${(yieldStrain(fy) * 1000).toFixed(2)} ‰: ` +
        `la armadura no fluye — fs = ${(fs / 1000).toFixed(0)} MPa por compatibilidad de deformaciones`,
    `a = ${(a * 100).toFixed(2)} cm, c = ${(c * 100).toFixed(2)} cm`,
    `εt = ${(epsilonT * 1000).toFixed(2)} ‰ → φ = ${phi.toFixed(3)}`,
    `φMn = ${(phi * Mn).toFixed(2)} kN·m`,
    `As,mín sobre el alma = ${AsMin.toFixed(2)} cm²`,
  ];
  if (exceedsPracticalMax) {
    steps.push(
      `⚠ As = ${AsCm2.toFixed(1)} cm² supera el máximo práctico ${AsMaxPractical.toFixed(1)} cm² ` +
        `(4 %·bw·h) — sección insuficiente: agrandar la sección`,
    );
  }

  return {
    a, c, epsilonT, phi, fs: fs / 1000, Mn, phiMn: phi * Mn,
    AsMin, belowMinimum: AsCm2 < AsMin,
    tensionControlled: epsilonT >= 0.005,
    exceedsPracticalMax,
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
