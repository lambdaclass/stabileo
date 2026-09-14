/**
 * One section engine, for every case the workbook solves.
 *
 * ── The realisation this file is built on ──────────────────────────
 *
 * CIRSOC_FLEX has eight sheets and they are one problem. A rectangular beam
 * in simple bending, a T beam, a rectangular column under axial load and
 * bending, a round column, a hollow pier and a skew-bent column with twenty
 * bars at arbitrary coordinates differ in exactly two things: the outline of
 * the concrete, and where the bars are. Everything after that — the plane of
 * strains, the stress block, the yield check, φ, the axial cap — is the same
 * clause applied to the same geometry.
 *
 * Written as five special cases, adding the sixth means writing it again,
 * and the five drift. Written once, adding the sixth is a new outline.
 *
 * ── What it computes ───────────────────────────────────────────────
 *
 * For a neutral axis — an angle θ and a depth — the strain plane is fixed by
 * §10.2.3's ε_cu at the extreme compressed fibre. Every bar's strain follows
 * from its distance to the axis, its stress from the elastic-perfectly-plastic
 * law, and the concrete's contribution from the equivalent rectangular block
 * clipped out of the outline. Summing gives (Pn, Mnx, Mny).
 *
 * Sweeping θ and the depth gives the interaction surface; holding θ and
 * sweeping the depth gives the familiar planar diagram.
 *
 * ── Sign convention, stated once ───────────────────────────────────
 *
 * Compression positive, for forces and strains. Axes are the section's own,
 * origin at the centroid of the gross outline. `Mnx` bends about x — it is
 * the moment a beam has under vertical load — and `Mny` about y. A bar in
 * tension has negative force, and `Mn = Σ F·arm` needs no special case for
 * it, which is the reason for choosing this convention over the alternative.
 */

import {
  EPSILON_CU, ES_MPA, beta1, phiFromStrain, squashLoad, axialCap,
} from './cirsoc201-basis';
import {
  type Pt, rectPolygon, teePolygon, circlePolygon, compressedZone, polygonArea,
} from './section-polygon';

/** A longitudinal bar: where it is, and how much steel. */
export interface Bar {
  /** Metres from the section centroid. */
  x: number;
  y: number;
  /** m². */
  area: number;
}

/**
 * The concrete outline.
 *
 * Holes are what the workbook calls `b_h`/`h_h` on the rectangular sheets and
 * `D int` on the circular one — a hollow pier, which is ordinary for a bridge
 * and was the one modelling capability the first version of this module
 * lacked outright.
 */
export type Outline =
  | { kind: 'rect'; b: number; h: number; hole?: { b: number; h: number } }
  | { kind: 'tee'; bf: number; hf: number; bw: number; h: number }
  | { kind: 'circle'; D: number; Dint?: number };

export interface Materials {
  /** MPa. */
  fc: number;
  fy: number;
  confinement?: 'ties' | 'spiral';
  /**
   * Subtract the concrete a compression bar displaces. DEFAULTS TO ON.
   *
   * A bar sitting inside the stress block occupies concrete that the block
   * has already been credited with, so not deducting counts that area twice
   * and OVERSTATES the capacity. An earlier version of this module defaulted
   * it off and called that the conservative side; it is the opposite, and
   * the workbook comparison is what showed it — with the deduction the
   * biaxial example lands within 0.7 % of the published steel and without it
   * 5 % under.
   *
   * Left as a switch because the workbook has one, and a reader reproducing
   * a calculation made with it off needs to be able to say so.
   */
  deductDisplacedConcrete?: boolean;
}

/** Outer ring and holes, in section coordinates. */
export function outlineRings(o: Outline): { outer: Pt[]; holes: Pt[][] } {
  switch (o.kind) {
    case 'rect':
      return {
        outer: rectPolygon(o.b, o.h),
        holes: o.hole ? [rectPolygon(o.hole.b, o.hole.h)] : [],
      };
    case 'tee':
      return { outer: teePolygon(o.bf, o.hf, o.bw, o.h), holes: [] };
    case 'circle':
      return {
        outer: circlePolygon(o.D),
        holes: o.Dint && o.Dint > 0 ? [circlePolygon(o.Dint)] : [],
      };
  }
}

/** Gross area, holes removed. */
export function grossArea(o: Outline): number {
  const { outer, holes } = outlineRings(o);
  return Math.abs(polygonArea(outer)) - holes.reduce((s, hr) => s + Math.abs(polygonArea(hr)), 0);
}

/** How far the outline reaches along a direction, from the centroid. */
function extentAlong(o: Outline, nx: number, ny: number): { max: number; min: number } {
  const { outer } = outlineRings(o);
  let max = -Infinity;
  let min = Infinity;
  for (const p of outer) {
    const s = nx * p.x + ny * p.y;
    if (s > max) max = s;
    if (s < min) min = s;
  }
  return { max, min };
}

export interface SectionPoint {
  /** kN, positive in compression. */
  Pn: number;
  /** kN·m. */
  Mnx: number;
  Mny: number;
  /** Design values, φ applied. */
  phiPn: number;
  phiMnx: number;
  phiMny: number;
  phi: number;
  /** Net tensile strain in the most-stretched bar; 0 when none is in tension. */
  epsilonT: number;
  /** Depth of the neutral axis from the extreme compressed fibre, m. */
  c: number;
}

/**
 * The section's state for one neutral axis.
 *
 * `theta` is the direction of the OUTWARD normal to the compressed face, so
 * θ = −π/2 (pointing at −y) puts the compression at the bottom, which is what
 * a sagging beam has. `c` is measured from the extreme compressed fibre.
 */
export function sectionPoint(
  outline: Outline,
  bars: readonly Bar[],
  mat: Materials,
  theta: number,
  c: number,
): SectionPoint {
  const nx = Math.cos(theta);
  const ny = Math.sin(theta);
  const { max } = extentAlong(outline, nx, ny);

  const fc_kPa = mat.fc * 1000;
  const fy_kPa = mat.fy * 1000;
  const b1 = beta1(mat.fc);

  /*
   * The stress block runs `a = β₁c` from the extreme fibre inward, so it is
   * the half-plane at signed distance `max − a` and beyond.
   */
  const { min } = extentAlong(outline, nx, ny);
  const a = Math.max(Math.min(b1 * c, max - min), 0);
  const { outer, holes } = outlineRings(outline);
  const zone = compressedZone(outer, holes, nx, ny, max - a);

  const Cc = 0.85 * fc_kPa * zone.area; // kN
  let Pn = Cc;
  /*
   * From the FIRST MOMENTS, not from a centroid. `compressedZone` returns
   * `m = A·c̄` on purpose: at the tension end of the diagram the compressed
   * area is zero, and `m/A` there is 0/0 while `0.85·f'c·m` is simply zero,
   * which is the right answer.
   *
   * The sign on `Mnx` is because a compression force ABOVE the centroid
   * (positive y) produces sagging, which this convention calls positive.
   */
  let Mnx = -0.85 * fc_kPa * zone.my;
  let Mny = 0.85 * fc_kPa * zone.mx;

  let epsilonT = 0;
  for (const bar of bars) {
    /* Distance from the neutral axis, positive toward compression. */
    const s = nx * bar.x + ny * bar.y;
    const strain = c > 1e-9 ? (EPSILON_CU * (s - (max - c))) / c : -10 * (mat.fy / ES_MPA);
    const fs = Math.max(-fy_kPa, Math.min(fy_kPa, strain * ES_MPA * 1000));

    let F = bar.area * fs;
    if ((mat.deductDisplacedConcrete ?? true) && strain > 0 && s >= max - a) {
      F -= bar.area * 0.85 * fc_kPa;
    }
    Pn += F;
    Mnx += -F * bar.y;
    Mny += F * bar.x;
    if (strain < epsilonT) epsilonT = strain;
  }

  const epsT = Math.abs(Math.min(epsilonT, 0));
  const phi = phiFromStrain(epsT, mat.fy, mat.confinement ?? 'ties');

  const Ast = bars.reduce((s, b) => s + b.area, 0);
  const cap = axialCap(mat.fc, mat.fy, grossArea(outline), Ast, mat.confinement ?? 'ties');

  return {
    Pn, Mnx, Mny,
    phiPn: Math.min(phi * Pn, cap),
    phiMnx: phi * Mnx,
    phiMny: phi * Mny,
    phi, epsilonT: epsT, c,
  };
}

/**
 * The interaction diagram in one bending plane.
 *
 * From a neutral axis far past the section — every fibre compressed — to one
 * that has left it, which is pure tension.
 */
export function interactionCurve(
  outline: Outline,
  bars: readonly Bar[],
  mat: Materials,
  theta: number,
  nPoints = 60,
): SectionPoint[] {
  const { max, min } = extentAlong(outline, theta === 0 ? 1 : Math.cos(theta), Math.sin(theta));
  const depth = max - min;

  const cs: number[] = [10 * depth];
  for (let i = 0; i <= nPoints; i++) {
    const c = 2 * depth * (1 - i / nPoints);
    if (c > 1e-5) cs.push(c);
  }
  cs.push(1e-5);
  cs.sort((p, q) => q - p);
  return cs.map((c) => sectionPoint(outline, bars, mat, theta, c));
}

/** The squash load this section reaches with its bars, kN. */
export function sectionSquashLoad(outline: Outline, bars: readonly Bar[], mat: Materials): number {
  const Ast = bars.reduce((s, b) => s + b.area, 0);
  return squashLoad(mat.fc, mat.fy, grossArea(outline), Ast);
}
