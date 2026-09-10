/**
 * `Cb`, the moment gradient factor, from the moment diagram — CIRSOC 301 §F.1.
 *
 * ── The clause, verbatim from the shipped text ──────────────────────
 *
 * §F.1(3), for doubly-symmetric sections and for singly-symmetric sections in single curvature:
 *
 *     Cb = 12,5 Mmáx / (2,5 Mmáx + 3 MA + 4 MB + 3 MC)                        (F.1.1)
 *
 * with `Mmáx` the absolute maximum moment in the unbraced segment and `MA`, `MB`, `MC` the absolute
 * moments at the quarter, mid and three-quarter points of that segment, all in kN·m. And then:
 *
 *   > «Se permite adoptar conservadoramente un valor Cb = 1 para todos los casos de diagramas de
 *   > momento flector.»
 *
 *   > «Para miembros en voladizo, cuando el extremo libre no esté arriostrado, se deberá tomar
 *   > Cb = 1 para todos los casos.»
 *
 * So `Cb = 1` is never wrong — it is the code's own conservative option — and it is REQUIRED for a
 * cantilever with an unbraced free end. Computing F.1.1 raises the capacity for a non-uniform
 * diagram; it never lowers it below 1, because the expression's minimum over any diagram is 1.
 *
 * ── The scope this module refuses to exceed ─────────────────────────
 *
 * F.1.1 is stated for two cases only: doubly-symmetric sections, and singly-symmetric ones in
 * SINGLE curvature. For a singly-symmetric section in double curvature, §F.1(4) requires something
 * else entirely — «el estado límite de pandeo lateral-torsional deberá ser verificado para ambas
 * alas», with the design strength compared against the maximum moment compressing the flange under
 * consideration. This app computes one `Mn` and cannot check two flanges, so applying F.1.1 there
 * would be using a formula outside the case it is written for.
 *
 * A section with NO axis of symmetry — an angle, a zed — is in neither case, so it gets `Cb = 1`
 * with the reason said out loud rather than a number nobody can trace.
 *
 * ── What computing Cb does NOT establish ───────────────────────────
 *
 * Nothing about the bracing. `Cb` is a property of the moment diagram over a segment whose length
 * the caller supplies; it says nothing about whether the points bounding that segment are braced.
 * Apéndice 6 §6.1 requires a brace to meet minimum strength and stiffness «incluyendo los efectos
 * de las uniones y detalles de anclaje», which this app cannot evaluate. **Computing Cb is not
 * certifying the bracing**, and the surface has to keep saying so.
 */

/** Moments along an element, as the station machinery produces them. */
export interface StationMoment {
  /** Normalised position in [0, 1] along the element. */
  t: number;
  /** Moment about the axis being checked, signed, kN·m. */
  m: number;
}

/** Why `Cb` has the value it has. Never a bare number on a surface. */
export type CbBasis =
  /** F.1.1 was evaluated from the diagram. */
  | 'computed'
  /** §F.1(3): a cantilever with an unbraced free end. `Cb = 1` is mandatory, not chosen. */
  | 'unityRequiredCantilever'
  /** No diagram to read — no analysis, or too few stations. The permitted conservative value. */
  | 'unityNoDiagram'
  /** F.1.1's stated cases do not cover this section and curvature. See §F.1(4). */
  | 'unityOutOfScope';

export interface MomentGradient {
  cb: number;
  basis: CbBasis;
  /** i18n key explaining the basis. Required on every basis, including `computed`. */
  reasonKey: string;
  /** The four moments F.1.1 consumes, kN·m, absolute. Zero when nothing was read. */
  mMax: number;
  mA: number;
  mB: number;
  mC: number;
  /** Whether the moment changes sign over the segment. `none` when the diagram is flat at zero. */
  curvature: 'single' | 'double' | 'none';
}

/** Symmetry of a shape, which is what F.1.1's scope is written in terms of. */
export type ShapeSymmetry = 'double' | 'single' | 'none' | 'unknown';

/**
 * How many axes of symmetry a shape has.
 *
 * Separate from `section/axes.ts`, which answers whether the GEOMETRIC axes are PRINCIPAL. That is a
 * different question with a different consumer: a zed has no axis of symmetry (so `none` here) and
 * its principal axes are rotated (so `notPrincipal` there). Both are true and neither implies the
 * other.
 */
export function shapeSymmetry(shape: string | undefined): ShapeSymmetry {
  switch (shape) {
    case 'I': case 'H': case 'RHS': case 'CHS': case 'rect':
      return 'double';
    // One axis of symmetry: a channel about its horizontal axis, a tee about its vertical one.
    case 'U': case 'C': case 'T':
      return 'single';
    // A zed has point symmetry only; an angle has none at all.
    case 'Z': case 'L': case 'invL':
      return 'none';
    default:
      return 'unknown';
  }
}

/** Linear interpolation of the moment at a normalised position, from a sorted station list. */
function momentAt(stations: readonly StationMoment[], t: number): number {
  if (stations.length === 0) return 0;
  if (t <= stations[0].t) return stations[0].m;
  const last = stations[stations.length - 1];
  if (t >= last.t) return last.m;
  for (let i = 1; i < stations.length; i++) {
    const a = stations[i - 1], b = stations[i];
    if (t <= b.t) {
      const span = b.t - a.t;
      if (span <= 0) return b.m;
      return a.m + ((t - a.t) / span) * (b.m - a.m);
    }
  }
  return last.m;
}

export interface MomentGradientInput {
  /** The diagram, in element-normalised `t`. Any order; sorted internally. */
  stations: readonly StationMoment[];
  /** The unbraced segment, in element-normalised `t`. Whole member is `0` to `1`. */
  tStart?: number;
  tEnd?: number;
  /** `Section.shape`, which decides whether F.1.1's cases cover this member. */
  shape?: string;
  /**
   * Whether this member is a cantilever whose free end is unbraced.
   *
   * Supplied by the caller because it is a topology fact — a node with one element and no support —
   * and this module is pure. When true, §F.1(3) makes `Cb = 1` mandatory and nothing else is read.
   */
  cantileverFreeEnd?: boolean;
}

/**
 * `Cb` for one unbraced segment.
 *
 * Order of decision matters and follows the clause: the cantilever rule is mandatory so it comes
 * first; then scope; then whether there is a diagram at all; only then F.1.1.
 */
export function momentGradient(input: MomentGradientInput): MomentGradient {
  const { stations, tStart = 0, tEnd = 1, shape, cantileverFreeEnd } = input;
  const empty = { mMax: 0, mA: 0, mB: 0, mC: 0, curvature: 'none' as const };

  if (cantileverFreeEnd) {
    return {
      cb: 1, basis: 'unityRequiredCantilever',
      reasonKey: 'steel.cb.reason.cantilever', ...empty,
    };
  }

  const sorted = [...stations].sort((a, b) => a.t - b.t);
  const inSegment = sorted.filter((s) => s.t >= tStart - 1e-9 && s.t <= tEnd + 1e-9);

  /*
   * Curvature is read BEFORE the scope test, because the scope depends on it: a singly-symmetric
   * section is inside F.1.1 in single curvature and outside it in double.
   */
  const signs = inSegment.map((s) => Math.sign(s.m)).filter((x) => x !== 0);
  const curvature: MomentGradient['curvature'] =
    signs.length === 0 ? 'none'
      : signs.some((x) => x !== signs[0]) ? 'double' : 'single';

  const sym = shapeSymmetry(shape);
  const inScope =
    sym === 'double' ? true
      : sym === 'single' ? curvature !== 'double'
        : false;

  if (!inScope) {
    /*
     * `unknown` lands here too, and deliberately: a section whose shape the app cannot name is not
     * a section whose symmetry it can assert, and F.1.1's scope is written in terms of symmetry.
     */
    return {
      cb: 1, basis: 'unityOutOfScope',
      reasonKey: sym === 'single'
        ? 'steel.cb.reason.singlySymmetricDoubleCurvature'
        : 'steel.cb.reason.symmetryOutOfScope',
      ...empty, curvature,
    };
  }

  /*
   * Three interior points plus the ends is the minimum that makes F.1.1 mean anything. With fewer
   * stations the quarter-point moments would be interpolations of interpolations, so the permitted
   * `Cb = 1` is the honest answer rather than a number computed from nothing.
   */
  if (inSegment.length < 3) {
    return {
      cb: 1, basis: 'unityNoDiagram',
      reasonKey: 'steel.cb.reason.noDiagram', ...empty, curvature,
    };
  }

  const span = tEnd - tStart;
  const mA = Math.abs(momentAt(sorted, tStart + 0.25 * span));
  const mB = Math.abs(momentAt(sorted, tStart + 0.50 * span));
  const mC = Math.abs(momentAt(sorted, tStart + 0.75 * span));
  const mMax = Math.max(...inSegment.map((s) => Math.abs(s.m)), mA, mB, mC);

  const denom = 2.5 * mMax + 3 * mA + 4 * mB + 3 * mC;
  if (denom <= 0) {
    // A segment with no moment anywhere. F.1.1 is 0/0 there; `Cb = 1` is both permitted and the
    // only defensible value.
    return {
      cb: 1, basis: 'unityNoDiagram',
      reasonKey: 'steel.cb.reason.zeroMoment',
      mMax, mA, mB, mC, curvature,
    };
  }

  /*
   * F.1.1. No cap is applied: the expression's own maximum is 3,0 for a diagram that is zero
   * everywhere but at one end, and AISC's `Cb ≤ 3` limit does not appear in this clause — so
   * clamping it would be adding a rule the shipped text does not state.
   */
  const cb = (12.5 * mMax) / denom;
  return { cb, basis: 'computed', reasonKey: 'steel.cb.reason.computed', mMax, mA, mB, mC, curvature };
}

/** i18n key for a basis, so a surface never prints a raw enum. */
export const cbBasisKey = (b: CbBasis): string => `steel.cb.basis.${b}`;
