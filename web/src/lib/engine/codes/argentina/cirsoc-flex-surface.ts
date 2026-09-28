/**
 * The interaction surface cut at a fixed axial load — FCO's section 5.
 *
 * ── What the biaxial sheets actually compare ───────────────────────
 *
 * FCR-VERIF judges a section along the ray of constant eccentricity in the
 * (M, P) plane: MV res / MV sol. FCO-VERIF does not. It holds the axial load
 * where the demand puts it, cuts the three-dimensional failure surface there,
 * and compares MOMENTS in that plane — "4.1 RELACIÓN DE MÓDULOS, φMn / Mu".
 * Its chart is that cut: a load contour in (Mxu, Myu) with the demand and the
 * resistance on the same ray from the origin.
 *
 * The two measures agree ON the surface — both read 1 there, which is why the
 * sheet's shipped example could not tell them apart — and nowhere else. A
 * reader comparing our φMn / Mu with the sheet's needs ours to be the sheet's
 * quantity, not a different one that happens to coincide at the answer.
 *
 * ── How the contour is traced ──────────────────────────────────────
 *
 * The sheet steps the NEUTRAL-AXIS angle, Fi = 0°, 7.5° … 90°, and for each
 * finds the depth at which φPn equals the fixed load. Fi is not the direction
 * of the moment that comes back — at Fi = 37.5° the example returns a moment
 * at 29.7° — which is the same fact that made the old perpendicular
 * assumption overestimate skew capacity by up to 8.9 %. Tracing by the axis
 * and reading the moment off the result cannot make that mistake.
 */

import { interactionCurve, sectionPoint, type Bar, type Outline, type Materials, type SectionPoint }
  from './cirsoc201-section';

/*
 * ── Signs are the SHEET's, not the section engine's ────────────────
 *
 * `sectionPoint` reports a section compressed on top (θ = π/2) with a
 * NEGATIVE Mnx — its sign is a statement about vector direction. The sheet
 * calls that same state a positive Mxu: "positivo tracciona fibra inferior".
 * Everything this module returns is flipped into the sheet's convention once,
 * here, so a caller comparing with a workbook cell never has to remember.
 * `utilisation` in `cirsoc-flex.ts` picks θ by the same rule, which is why the
 * two agree on which face a positive demand compresses.
 */
const sheetMx = (p: SectionPoint) => -p.phiMnx;
const sheetMy = (p: SectionPoint) => -p.phiMny;

export interface CutPoint {
  /** Neutral-axis angle, radians, the sheet's Fi: 0 → pure Mx, π/2 → pure My. */
  fi: number;
  /** kN·m, signed as the sheet signs them. */
  phiMnx: number;
  phiMny: number;
  /** The section's state there, for the reader who wants c, εt and φ. */
  state: SectionPoint;
}

/**
 * The section-engine angle for a sheet Fi, inside the quadrant (sx, sy).
 *
 * Pure positive Mx is θ = π/2 in `sectionPoint`'s convention and pure
 * positive My is θ = π; the signs rotate that quarter into whichever quadrant
 * the demand lives in.
 */
function thetaFor(fi: number, sx: number, sy: number): number {
  return Math.atan2(sx * Math.cos(fi), -sy * Math.sin(fi));
}

/**
 * The depth at which φPn = Pu, and the state there — or null when this axis
 * cannot reach that load (above the cap, or below pure tension).
 *
 * Bracketed on a coarse curve, then bisected on c itself. Interpolating
 * between curve points instead is what made εt wrong wherever it is steep:
 * εt goes as 1/c, and a straight line between two samples of a hyperbola
 * overstates everything in between.
 */
export function stateAtAxial(
  outline: Outline, bars: readonly Bar[], mat: Materials, theta: number, Pu: number,
): SectionPoint | null {
  const curve = interactionCurve(outline, bars, mat, theta, 60);
  for (let k = 0; k < curve.length - 1; k++) {
    const A = curve[k];
    const B = curve[k + 1];
    const fA = A.phiPn - Pu;
    const fB = B.phiPn - Pu;
    if (fA === 0) return A;
    if (fA * fB < 0) return refine(outline, bars, mat, theta, A.c, B.c, (p) => p.phiPn - Pu);
  }
  return null;
}

/**
 * Bisection on the neutral-axis depth between two bracketing states.
 *
 * `f` is whatever has to vanish — φPn minus a load, a capacity minus a ray.
 * Fifty halvings of a bracket a few centimetres wide is below a nanometre,
 * so what comes back is the section's own state and not an interpolation.
 */
export function refine(
  outline: Outline, bars: readonly Bar[], mat: Materials, theta: number,
  cA: number, cB: number, f: (p: SectionPoint) => number,
): SectionPoint {
  let a = cA;
  let b = cB;
  let fa = f(sectionPoint(outline, bars, mat, theta, a));
  for (let i = 0; i < 50; i++) {
    const m = (a + b) / 2;
    const pm = sectionPoint(outline, bars, mat, theta, m);
    const fm = f(pm);
    if (fm === 0) return pm;
    if (fa * fm < 0) { b = m; } else { a = m; fa = fm; }
  }
  return sectionPoint(outline, bars, mat, theta, (a + b) / 2);
}

/**
 * The load contour at φPn = Pu, in one quadrant, at the sheet's own angles.
 *
 * `steps` divisions of the quarter; twelve is the sheet's 7.5°, which is what
 * lets each point be compared with the workbook's cell for the same Fi. The
 * figure asks for more, to draw a curve rather than a polygon.
 */
export function surfaceCut(
  outline: Outline, bars: readonly Bar[], mat: Materials, Pu: number,
  opts: { sx?: number; sy?: number; steps?: number } = {},
): CutPoint[] {
  const sx = (opts.sx ?? 1) < 0 ? -1 : 1;
  const sy = (opts.sy ?? 1) < 0 ? -1 : 1;
  const steps = opts.steps ?? 12;
  const out: CutPoint[] = [];
  for (let k = 0; k <= steps; k++) {
    const fi = (k / steps) * (Math.PI / 2);
    const st = stateAtAxial(outline, bars, mat, thetaFor(fi, sx, sy), Pu);
    if (!st) continue;
    out.push({ fi, phiMnx: sheetMx(st), phiMny: sheetMy(st), state: st });
  }
  return out;
}

export interface MomentCapacity {
  /** φMn along the demand's own moment direction, at φPn = Pu. kN·m; components sheet-signed. */
  phiMn: number;
  phiMnx: number;
  phiMny: number;
  /** The neutral-axis angle that produced it, radians. */
  fi: number;
  state: SectionPoint;
}

/**
 * The sheet's "φMn" for a biaxial demand: where the ray from the origin
 * through (Mxu, Myu) meets the contour at the demand's own axial load.
 *
 * Solved for Fi by bisection on the direction of the moment that comes back,
 * which is monotone over the quarter. Null when the load itself is out of
 * reach — above the axial cap, where no moment at all can be added.
 */
export function momentCapacityAtAxial(
  outline: Outline, bars: readonly Bar[], mat: Materials,
  Pu: number, Mx: number, My: number,
): MomentCapacity | null {
  const sx = Mx < 0 ? -1 : 1;
  const sy = My < 0 ? -1 : 1;
  const want = Math.atan2(Math.abs(My), Math.abs(Mx));
  const at = (fi: number) => stateAtAxial(outline, bars, mat, thetaFor(fi, sx, sy), Pu);
  const dirOf = (p: SectionPoint) => Math.atan2(Math.abs(sheetMy(p)), Math.abs(sheetMx(p)));

  const pack = (fi: number, p: SectionPoint): MomentCapacity => ({
    phiMn: Math.hypot(p.phiMnx, p.phiMny), phiMnx: sheetMx(p), phiMny: sheetMy(p), fi, state: p,
  });

  /* On an axis the answer is the end of the contour; no search needed. */
  if (Math.abs(My) < 1e-9 || Math.abs(Mx) < 1e-9) {
    const fi = Math.abs(My) < 1e-9 ? 0 : Math.PI / 2;
    const p = at(fi);
    return p ? pack(fi, p) : null;
  }

  let lo = 0;
  let hi = Math.PI / 2;
  const pLo = at(lo);
  const pHi = at(hi);
  if (!pLo || !pHi) return null;
  let best = pack(lo, pLo);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const p = at(mid);
    if (!p) return null;
    best = pack(mid, p);
    const d = dirOf(p) - want;
    if (Math.abs(d) < 1e-7) break;
    if (d < 0) lo = mid; else hi = mid;
  }
  return best;
}

/** The greatest and least φPn the section reaches, kN — the ends of any cut. */
export function axialRange(outline: Outline, bars: readonly Bar[], mat: Materials): { max: number; min: number } {
  const curve = interactionCurve(outline, bars, mat, Math.PI / 2, 60);
  return {
    max: Math.max(...curve.map((p) => p.phiPn)),
    min: Math.min(...curve.map((p) => p.phiPn)),
  };
}
