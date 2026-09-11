/**
 * §E.4 — torsional and flexural-torsional buckling: what it needs, and what is missing.
 *
 * ── Why this reports instead of computing ───────────────────────────
 *
 * E.4 governs for the sections whose axes M2 already warns about — angles, tees, cruciforms — so
 * implementing it would close a real gap. The audit of the shipped text says it cannot be done here,
 * and the useful thing to ship is the reason, per member, rather than a silence.
 *
 * **What IS available**, and it is most of it:
 *
 *   · `Ag`, `Ix`, `Iy` — on every section that reaches the checker;
 *   · `G`, the shear modulus — `E/(2(1+ν))`, and the material carries both;
 *   · `xo`, `yo`, the shear-centre offsets that `r̄o` and `H` are built from — `section-teaching.ts`
 *     already computes them via `shearCentreWorking`, for `I/H/RHS/CHS/rect` (zero, doubly
 *     symmetric), `T`, `U`, `C` and the angles;
 *   · `J`, the torsional constant — but only sometimes.
 *
 * **What is missing**, each independently fatal:
 *
 *   1. **`Cw`, the warping constant (cm⁶).** E.4.9 is
 *      `Fez = (π²·E·Cw/(kz·L)² + G·J) · 1/(Ag·r̄o²)`. **No section in this app declares one** — not
 *      the catalogue, not the parametric templates, and the caller never passes it. Verified by
 *      grep. Without `Cw` the general branch cannot be evaluated at all.
 *   2. **`kz`, the torsional effective length factor.** The clause fixes it: «kz = 1 cuando los
 *      extremos del miembro tienen la torsión impedida y el alabeo libre». That is a BOUNDARY
 *      CONDITION about the connections, and the model records nothing about warping restraint.
 *      Assuming it would be inventing a boundary condition.
 *   3. **The classification condition of E.4.2(a).** That branch covers «secciones doble ángulo en
 *      contacto continuo o formando columnas del Grupo II y secciones Te, **todas compactas o no
 *      compactas**» — i.e. explicitly not slender. Establishing that needs B.4.1, whose λp/λr
 *      tables are images in the source PDF.
 *   4. **The torsional unbraced length**, for the doubly-symmetric case. E.4 applies to a doubly
 *      symmetric open section «cuando la longitud efectiva torsional lateralmente no arriostrada es
 *      mayor que la longitud efectiva flexional» — two lengths the model holds as one.
 *
 * So this module answers «could E.4 run for this member, and if not, precisely why». Nothing is
 * invented: no `Cw`, no torsional constant where the section has none, no boundary condition.
 */

/** An input E.4 needs and this app cannot supply. */
export type E4Gap =
  /** `Cw`, the warping constant. Absent from every section in the app. */
  | 'warpingConstant'
  /** `J`, the torsional constant. Present on some sections, absent on others. */
  | 'torsionalConstant'
  /** `kz` — whether the ends have torsion prevented and warping free. Not modelled. */
  | 'torsionalEndCondition'
  /** Whether the section is compact or non-compact, which E.4.2(a) requires. Needs B.4.1. */
  | 'sectionClassification'
  /** The torsional unbraced length, held as one length with the flexural one. */
  | 'torsionalUnbracedLength'
  /** The shear-centre offsets, for a shape whose outline the app cannot decompose. */
  | 'shearCentre';

export type E4Verdict =
  /** E.4 does not govern this member, so nothing is missing. */
  | { applicable: false; scope: 'outOfScope'; reasonKey: string; gaps: readonly [] }
  /** E.4 could govern and the inputs are not there. The gaps say which. */
  | { applicable: false; scope: 'inScope'; reasonKey: string; gaps: readonly E4Gap[] }
  /**
   * Everything E.4 needs is present.
   *
   * Unreachable today — `warpingConstant` is always missing — and the branch exists so that the day
   * a section carries `Cw` the shape of the answer does not have to change.
   */
  | { applicable: true; scope: 'inScope'; reasonKey: string; gaps: readonly [] };

/** What this module reads off a section and its material. */
export interface E4Input {
  shape?: string;
  /** Torsional constant, m⁴. Zero or absent both count as absent — E.4.3 divides by nothing else. */
  j?: number;
  /** Warping constant, cm⁶. Nothing in this app supplies it; the field exists to be honest. */
  cw?: number;
  /** Whether the app can place the shear centre for this shape. */
  shearCentreKnown?: boolean;
}

/** Shapes for which `shearCentreWorking` has a rule. Kept in step with that module by test. */
const SHEAR_CENTRE_SHAPES = new Set(['I', 'H', 'RHS', 'CHS', 'rect', 'T', 'U', 'C', 'L', 'invL']);

/**
 * Whether §E.4 could govern this shape at all.
 *
 * E.4's scope, from the clause: singly-symmetric or asymmetric sections; some doubly-symmetric ones
 * (cruciforms, built-up Groups I–III, «o en general secciones con poca rigidez torsional y/o pequeño
 * Cw»); and every doubly-symmetric OPEN section whose torsional unbraced length exceeds its flexural
 * one.
 *
 * A closed section — a tube — has high torsional stiffness and is not in the list, so it is out of
 * scope rather than missing data. That distinction is the point of separating `outOfScope` from
 * `inScope`.
 */
function scopeOf(shape: string | undefined): 'inScope' | 'outOfScope' | 'unknown' {
  switch (shape) {
    // Closed sections: torsionally stiff, not among the cases E.4 lists.
    case 'RHS': case 'CHS':
      return 'outOfScope';
    // Singly symmetric and asymmetric — the clause's first bullet.
    case 'T': case 'U': case 'C': case 'L': case 'invL': case 'Z':
      return 'inScope';
    /*
     * Doubly-symmetric OPEN sections are in scope only when the torsional unbraced length exceeds
     * the flexural one — which the model cannot answer, so they are reported in scope with that
     * length as a gap rather than quietly excluded.
     */
    case 'I': case 'H':
      return 'inScope';
    case 'rect':
      // A solid rectangle has no warping and enormous torsional stiffness relative to an open
      // shape; not one of the cases E.4 names.
      return 'outOfScope';
    default:
      return 'unknown';
  }
}

/**
 * Could §E.4 run for this member, and if not, exactly what is missing.
 *
 * The gaps are ordered by how hard they are to close: the warping constant is a datum nobody has,
 * the classification is blocked on table images, and the end condition is a modelling decision.
 */
export function e4Applicability(input: E4Input): E4Verdict {
  const { shape, j, cw } = input;
  const scope = scopeOf(shape);

  if (scope === 'outOfScope') {
    return { applicable: false, scope: 'outOfScope', reasonKey: 'steel.e4.outOfScope', gaps: [] };
  }
  if (scope === 'unknown') {
    /*
     * A shape the app cannot name is not a shape whose torsional behaviour it can rule out. Reported
     * in scope with everything missing, which is the conservative reading.
     */
    return {
      applicable: false, scope: 'inScope', reasonKey: 'steel.e4.shapeUnknown',
      gaps: ['shearCentre', 'warpingConstant', 'torsionalEndCondition'],
    };
  }

  const gaps: E4Gap[] = [];
  // E.4.9 needs it and nothing supplies it. Always first, because it alone is fatal.
  if (cw == null || cw <= 0) gaps.push('warpingConstant');
  // E.4.3's Fcrz = G·J/(Ag·r̄o²): a zero J makes Fcrz zero, which is not a small value, it is no value.
  if (j == null || j <= 0) gaps.push('torsionalConstant');
  if (input.shearCentreKnown === false || !SHEAR_CENTRE_SHAPES.has(shape ?? '')) {
    gaps.push('shearCentre');
  }
  // «kz = 1 cuando los extremos del miembro tienen la torsión impedida y el alabeo libre» — a fact
  // about the connections, not about the member.
  gaps.push('torsionalEndCondition');
  // E.4.2(a) covers Tees and double angles «todas compactas o no compactas».
  if (shape === 'T') gaps.push('sectionClassification');
  // The doubly-symmetric case turns on two lengths the model holds as one.
  if (shape === 'I' || shape === 'H') gaps.push('torsionalUnbracedLength');

  if (gaps.length === 0) {
    return { applicable: true, scope: 'inScope', reasonKey: 'steel.e4.available', gaps: [] };
  }
  return { applicable: false, scope: 'inScope', reasonKey: 'steel.e4.missingInputs', gaps };
}

/** i18n key for a gap. Never a raw enum on screen. */
export const e4GapKey = (g: E4Gap): string => `steel.e4.gap.${g}`;

/**
 * The shear modulus, from what the material already carries.
 *
 * Exported because it is the one E.4 input this app CAN produce and it should be visible as such:
 * `G = E / (2(1+ν))`. Not used by anything yet, and that is the honest state — a value with no
 * formula to feed.
 */
export function shearModulus(eMPa: number, nu: number): number {
  return eMPa / (2 * (1 + nu));
}
