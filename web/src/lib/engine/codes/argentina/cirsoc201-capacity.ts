/**
 * The other direction: given the steel, what does the section carry? — asked of the engine.
 *
 * Rectangular and flanged sections go through the engine's beam check (`cirsoc201_check`:
 * strain compatibility, φ from Tabla 21.2.2 of the edition, the flange's overhangs over
 * min(a, hf)); rectangular columns through its section engine (`cirsoc201_section`: the ray of
 * constant eccentricity on the design diagram). This module packs the questions, reports the
 * answers and keeps the search (`sizeByBisection`). The TypeScript that solved the equilibrium
 * here — a damped fixed-point on fs, and a sampled diagram read by linear interpolation — is the
 * oracle in `__tests__/differential/oracle/cirsoc201-capacity.ts`.
 *
 * Edition: default 2025, the edition in force; the CIRSOC_FLEX calculator passes its own.
 */

import { minFlexuralSteelCm2, yieldStrain, tensionControlledStrain, COLUMN_STEEL_RATIO, type Cirsoc201EditionLike } from './cirsoc201-basis';
import type { ConcreteDesignParams } from './cirsoc201';
import type { FlangedGeometry } from './cirsoc201-flanged';
import { evaluateBeamSection } from './cirsoc201-beam-kernel';
import { Cirsoc201EngineUnavailable } from './cirsoc201-engine';
import { withSection } from './cirsoc201-section';

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

/** The engine's singly-reinforced flexural state of a rectangle (bf = b) or a T. */
function engineCapacity(
  params: ConcreteDesignParams, AsCm2: number, edition: Cirsoc201EditionLike,
  flange?: { bf: number; hf: number; bw: number },
): { a: number; c: number; epsilonT: number; phi: number; fs: number; Mn: number; phiMn: number; d: number } {
  const { fc, fy, h, cover, stirrupDia } = params;
  const bw = flange ? flange.bw : params.b;
  const d = effectiveDepth(h, cover, stirrupDia);
  const r = evaluateBeamSection({
    edition: edition === '2005' ? '2005' : '2025', fc: fc * 1e6, fy: fy * 1e6, b: bw, h, d, As: AsCm2 * 1e-4,
    ...(flange ? { bf: flange.bf, hf: flange.hf } : {}),
  });
  if (!r) throw new Cirsoc201EngineUnavailable('section capacity');
  if (!r.flexureValid) {
    return { a: 0, c: 0, epsilonT: 0, phi: 0, fs: 0, Mn: 0, phiMn: 0, d };
  }
  const phiMn = r.phiMn / 1000;
  return { a: r.a, c: r.c, epsilonT: r.epsilonT, phi: r.phi, fs: r.fsTension / 1e6, Mn: r.phi > 0 ? phiMn / r.phi : 0, phiMn, d };
}

function steelSteps(fy: number, epsilonT: number, fs: number): string {
  return epsilonT >= yieldStrain(fy)
    ? 'La armadura traccionada fluye: fs = fy'
    : `εt = ${(epsilonT * 1000).toFixed(2)} ‰ < εy = ${(yieldStrain(fy) * 1000).toFixed(2)} ‰: ` +
      `la armadura no fluye — fs = ${fs.toFixed(0)} MPa por compatibilidad de deformaciones`;
}

/** What a rectangular section carries with `AsCm2` in tension (singly reinforced). */
export function rectCapacity(
  params: ConcreteDesignParams,
  AsCm2: number,
  edition: Cirsoc201EditionLike = '2025',
): Capacity {
  const { fc, fy, b, h } = params;
  const s = engineCapacity(params, AsCm2, edition);
  const AsMin = minFlexuralSteelCm2(fc, fy, b, s.d);
  const etc = tensionControlledStrain(fy, edition);
  /* 4 %·b·h: where the bars stop fitting — past it the answer is a bigger section. */
  const AsMaxPractical = 0.04 * b * h * 1e4;
  const exceedsPracticalMax = AsCm2 > AsMaxPractical;
  const steps = [
    `d = ${(s.d * 100).toFixed(1)} cm, As = ${AsCm2.toFixed(2)} cm²`,
    steelSteps(fy, s.epsilonT, s.fs),
    `a = ${(s.a * 100).toFixed(2)} cm, c = a / β₁ = ${(s.c * 100).toFixed(2)} cm`,
    `εt = ${(s.epsilonT * 1000).toFixed(2)} ‰ → φ = ${s.phi.toFixed(3)}`,
    `Mn = ${s.Mn.toFixed(2)} kN·m`,
    `φMn = ${s.phiMn.toFixed(2)} kN·m (motor, CIRSOC 201-${edition})`,
  ];
  if (AsCm2 < AsMin) steps.push(`⚠ As < As,mín = ${AsMin.toFixed(2)} cm² (§9.6.1.2)`);
  if (s.epsilonT < etc) steps.push(`⚠ εt < ${(etc * 1000).toFixed(2)} ‰: la sección no está controlada por tracción`);
  if (exceedsPracticalMax) {
    steps.push(
      `⚠ As = ${AsCm2.toFixed(1)} cm² supera el máximo práctico ${AsMaxPractical.toFixed(1)} cm² ` +
        `(4 %·b·h) — sección insuficiente: agrandar la sección`,
    );
  }
  return {
    a: s.a, c: s.c, epsilonT: s.epsilonT, phi: s.phi, fs: s.fs, Mn: s.Mn, phiMn: s.phiMn,
    AsMin, belowMinimum: AsCm2 < AsMin,
    tensionControlled: s.epsilonT >= etc,
    exceedsPracticalMax,
    steps,
  };
}

/** The same for a flanged section (flange in compression), from the engine's T. */
export function flangedCapacity(
  params: ConcreteDesignParams,
  geom: FlangedGeometry,
  AsCm2: number,
  edition: Cirsoc201EditionLike = '2025',
): Capacity & { withinFlange: boolean } {
  const { fc, fy, h } = params;
  const { bf, hf, bw } = geom;
  const s = engineCapacity(params, AsCm2, edition, { bf, hf, bw });
  const withinFlange = s.a <= hf;
  const AsMin = minFlexuralSteelCm2(fc, fy, bw, s.d);
  const etc = tensionControlledStrain(fy, edition);
  /* The 4 %·b·h ceiling, on the width the steel actually lives in: the web. */
  const AsMaxPractical = 0.04 * bw * h * 1e4;
  const exceedsPracticalMax = AsCm2 > AsMaxPractical;
  const steps = [
    `Sección T: el bloque queda ${withinFlange ? 'dentro del ala' : 'en el alma'}`,
    steelSteps(fy, s.epsilonT, s.fs),
    `a = ${(s.a * 100).toFixed(2)} cm, c = ${(s.c * 100).toFixed(2)} cm`,
    `εt = ${(s.epsilonT * 1000).toFixed(2)} ‰ → φ = ${s.phi.toFixed(3)}`,
    `φMn = ${s.phiMn.toFixed(2)} kN·m (motor, CIRSOC 201-${edition})`,
    `As,mín sobre el alma = ${AsMin.toFixed(2)} cm²`,
  ];
  if (exceedsPracticalMax) {
    steps.push(
      `⚠ As = ${AsCm2.toFixed(1)} cm² supera el máximo práctico ${AsMaxPractical.toFixed(1)} cm² ` +
        `(4 %·bw·h) — sección insuficiente: agrandar la sección`,
    );
  }
  return {
    a: s.a, c: s.c, epsilonT: s.epsilonT, phi: s.phi, fs: s.fs, Mn: s.Mn, phiMn: s.phiMn,
    AsMin, belowMinimum: AsCm2 < AsMin,
    tensionControlled: s.epsilonT >= etc,
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
 * Is (Pu, Mu) inside the section's interaction diagram? Read by the engine along the ray of
 * constant eccentricity (`Section::ray`), with half the steel on each face at the bar centre.
 * The neutral axis at the answer is solved, not interpolated between samples.
 */
export function rectColumnCheck(
  params: ConcreteDesignParams,
  AstCm2: number,
  Pu: number,
  Mu: number,
  _barCount = 8,
  barDia = 20,
  edition: Cirsoc201EditionLike = '2025',
): ColumnCheck {
  const { fc, fy, b, h, cover, stirrupDia } = params;
  /* The diagram measures to the bar centre; the params carry clear cover. */
  const yBar = h / 2 - (cover + stirrupDia / 1000 + barDia / 2000);
  const half = (AstCm2 / 2) * 1e-4;
  const u = withSection({ kind: 'rect', b, h }, [{ x: 0, y: yBar, area: half }, { x: 0, y: -yBar, area: half }],
    { fc, fy, edition }, (s) => s.ray(Pu, Mu));
  const MuAbs = Math.abs(Mu);
  const steps = [
    `Sección ${(b * 100).toFixed(0)}×${(h * 100).toFixed(0)} cm, Ast = ${AstCm2.toFixed(2)} cm²`,
    `Pu = ${Pu.toFixed(1)} kN, Mu = ${MuAbs.toFixed(2)} kN·m`,
    `Diagrama de interacción por compatibilidad de deformaciones (motor, CIRSOC 201-${edition})`,
    Math.abs(Pu) < 1e-9
      ? `Flexión pura: φMn = ${u.phiMn.toFixed(2)} kN·m`
      : `Capacidad sobre la recta de excentricidad: φPn = ${u.phiPn.toFixed(1)} kN, φMn = ${u.phiMn.toFixed(2)} kN·m`,
    `Relación demanda/capacidad = ${u.ratio.toFixed(3)}`,
  ];
  return {
    phiPn: u.phiPn, phiMn: u.phiMn, ratio: u.ratio, status: u.ratio <= 1 ? 'ok' : 'fail',
    c: u.c ?? 0, epsilonT: u.epsilonT ?? 0, phi: u.phi, steps,
  };
}

/** The steel a rectangular column needs, bisected on `rectColumnCheck`. */
export function designRectColumn(
  params: ConcreteDesignParams,
  Pu: number,
  Mu: number,
  barCount = 8,
  barDia = 20,
  edition: Cirsoc201EditionLike = '2025',
): { AstCm2: number; check: ColumnCheck } | null {
  const Ag = params.b * params.h;
  const sized = sizeByBisection(
    (Ast) => rectColumnCheck(params, Ast, Pu, Mu, barCount, barDia, edition).ratio,
    COLUMN_STEEL_RATIO.min * Ag * 1e4,
    COLUMN_STEEL_RATIO.max * Ag * 1e4,
  );
  if (!sized) return null;
  return { AstCm2: sized.AsCm2, check: rectColumnCheck(params, sized.AsCm2, Pu, Mu, barCount, barDia, edition) };
}
