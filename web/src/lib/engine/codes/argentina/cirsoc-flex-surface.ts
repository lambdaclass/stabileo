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
 *
 * The searches run in the engine (`Section::at_axial`, `moment_capacity_at_axial` in
 * `engine/src/postprocess/cirsoc201_section.rs`); this module only shapes the answers. The
 * TypeScript it replaced is the oracle in `__tests__/differential/oracle/`.
 */

import { prepareSection, withSection, type PreparedSection, type Bar, type Outline, type Materials, type SectionPoint }
  from './cirsoc201-section';

/*
 * Signs are the SHEET's, not the section engine's: a section compressed on top reports a
 * NEGATIVE Mnx, which the sheet calls a positive Mxu ("positivo tracciona fibra inferior").
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

/** θ (outward normal of the compressed face) for the sheet's angle Fi in the moments' quadrant. */
function thetaFor(fi: number, sx: number, sy: number): number {
  return Math.atan2(sx * Math.cos(fi), -sy * Math.sin(fi));
}

/** The state where φPn = Pu with the axis at θ; null when the section cannot carry Pu there. */
export function stateAtAxial(
  outline: Outline, bars: readonly Bar[], mat: Materials, theta: number, Pu: number,
): SectionPoint | null {
  return withSection(outline, bars, mat, (s) => s.atAxial(theta, Pu));
}

/**
 * Bisect `f` on the neutral-axis depth between `cA` and `cB` — a search; every state it reads
 * is the engine's.
 */
export function refine(
  outline: Outline, bars: readonly Bar[], mat: Materials, theta: number,
  cA: number, cB: number, f: (p: SectionPoint) => number,
): SectionPoint {
  const section = prepareSection(outline, bars, mat);
  try { return refinePrepared(section, theta, cA, cB, f); } finally { section.free(); }
}
export function refinePrepared(section: PreparedSection, theta: number, cA: number, cB: number, f: (p: SectionPoint) => number): SectionPoint {
  let a = cA;
  let b = cB;
  let fa = f(section.point(theta, a));
  for (let i = 0; i < 50; i++) {
    const m = (a + b) / 2;
    const pm = section.point(theta, m);
    const fm = f(pm);
    if (fm === 0) return pm;
    if (fa * fm < 0) { b = m; } else { a = m; fa = fm; }
  }
  return section.point(theta, (a + b) / 2);
}

/** The load contour at Pu, Fi = 0 … 90° in `steps`, in the quadrant of (sx, sy). */
export function surfaceCut(
  outline: Outline, bars: readonly Bar[], mat: Materials, Pu: number,
  opts: { sx?: number; sy?: number; steps?: number } = {},
): CutPoint[] {
  return withSection(outline, bars, mat, (section) => {
    const sx = (opts.sx ?? 1) < 0 ? -1 : 1;
    const sy = (opts.sy ?? 1) < 0 ? -1 : 1;
    const steps = opts.steps ?? 12;
    const out: CutPoint[] = [];
    for (let k = 0; k <= steps; k++) {
      const fi = (k / steps) * (Math.PI / 2);
      const st = section.atAxial(thetaFor(fi, sx, sy), Pu);
      if (!st) continue;
      out.push({ fi, phiMnx: sheetMx(st), phiMny: sheetMy(st), state: st });
    }
    return out;
  });
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

/** The moment capacity at Pu along the direction of (Mx, My) — the engine's load contour. */
export function momentCapacityAtAxial(
  outline: Outline, bars: readonly Bar[], mat: Materials,
  Pu: number, Mx: number, My: number,
): MomentCapacity | null {
  return withSection(outline, bars, mat, (s) => s.momentCapacityAtAxial(Pu, Mx, My));
}

/** The design diagram's axial extremes (kN), θ = π/2. */
export function axialRange(outline: Outline, bars: readonly Bar[], mat: Materials): { max: number; min: number } {
  const curve = withSection(outline, bars, mat, (s) => s.curve(Math.PI / 2, 60));
  return {
    max: Math.max(...curve.map((p) => p.phiPn)),
    min: Math.min(...curve.map((p) => p.phiPn)),
  };
}
