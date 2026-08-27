/**
 * §F.6.2 — flange local buckling in minor-axis bending: what is computable and what is not.
 *
 * ── The clause, and where it stops being readable ───────────────────
 *
 * F.6.2 has three branches, selected by the flange slenderness `λf = bf/tf`:
 *
 *   (a) `λf ≤ λpf` — compact flange: «el pandeo local del ala comprimida **no es aplicable**».
 *   (b) `λpf < λf ≤ λrf` — non-compact:
 *       `Mn = Mp − (Mp − 0,7·Fy·Sy·10⁻³)·((λf − λpf)/(λrf − λpf))`                    (F.6.2)
 *   (c) `λf > λrf` — slender: `Mn = Fcr·Sy·10⁻³`, with `Fcr = 138000/(bf/tf)²`        (F.6.3)
 *
 * Three of the four ingredients are here in full:
 *
 *   · **`λf`** — computable. The clause gives the convention: «bf para alas de sección doble Te =
 *     **mitad** de la longitud del ala completa; para alas de secciones canal = longitud del ala
 *     **completa**», in cm. Getting that wrong is a factor of two in a squared term.
 *   · **`Fcr`** — F.6.3 is a closed expression with a literal constant. No table.
 *   · **`Sy`** — the elastic modulus about the minor axis, «para secciones canal se tomará el módulo
 *     **mínimo**».
 *
 * The fourth is not: **`λpf` and `λrf` are «Tabla B.4.1b, caso 14»**, and Table B.4.1b is an image
 * in the source PDF. So the geometry is available, the formulas are available, and **the branch
 * cannot be selected**.
 *
 * ── What this module therefore does, and does not do ───────────────
 *
 * It reports `λf`, `Sy` and `Fcr`, and says the branch is undetermined with the reason. It does
 * **not** pick a branch, does not guess `λpf`/`λrf` from memory, and does not return a capacity —
 * because a capacity that depends on which branch applies is not a capacity when the branch is
 * unknown.
 *
 * That distinction is the whole design: «geometry available» and «classification unavailable» are
 * different facts, and collapsing them into one «unavailable» would throw away the half that a
 * reader holding the printed table could act on.
 */

/** Which of F.6.2's branches applies. `undetermined` is the honest answer today. */
export type F62Branch = 'notApplicableCompact' | 'nonCompact' | 'slender' | 'undetermined';

/** Why F.6.2 does not yield a capacity for this member. */
export type F62State =
  /** The section is not one F.6 covers. Nothing is missing; the clause does not reach it. */
  | 'outOfScope'
  /** `bf` or `tf` absent, so even the slenderness cannot be formed. */
  | 'geometryUnavailable'
  /** Geometry is there, the branch is not — λpf and λrf are in an image table. */
  | 'classificationUnavailable';

export interface F62Report {
  state: F62State;
  branch: F62Branch;
  reasonKey: string;
  /** `λf = bf/tf`, dimensionless. Null when the geometry is not there. */
  flangeSlenderness: number | null;
  /** The `bf` the clause's convention gives for this shape, metres. Null when unavailable. */
  bfM: number | null;
  /** `Fcr = 138000/(bf/tf)²`, MPa — F.6.3. Meaningful only in branch (c), and labelled as such. */
  fcrMPa: number | null;
  /** `Sy`, m³. Null when the inputs are not there. */
  syM3: number | null;
  /** i18n keys for what would have to exist to select a branch. */
  missingKeys: readonly string[];
}

export interface F62Input {
  shape?: string;
  /** Full flange width, metres — `Section.b`. */
  b?: number;
  /** Flange thickness, metres. */
  tf?: number;
  /** Minor-axis inertia, m⁴ — the app's `iz` for a tall section. */
  iMinor?: number;
}

/**
 * `bf` per the clause's own convention, which is NOT the same as `Section.b`.
 *
 * «bf para alas de sección doble Te = mitad de la longitud del ala completa; para alas de secciones
 * canal = longitud del ala completa.» An I-beam's flange is symmetric about the web, so the
 * outstanding leg is half of it; a channel's flange projects one way and the whole width outstands.
 *
 * Returns null for a shape the convention does not name, rather than guessing which half applies.
 */
export function flangeWidthForSlenderness(shape: string | undefined, b: number | undefined): number | null {
  if (b == null || b <= 0) return null;
  switch (shape) {
    case 'I': case 'H': return b / 2;
    case 'U': case 'C': return b;
    default: return null;
  }
}

/** F.6 covers doubly-symmetric I sections and channels bent about the minor axis. */
function inScope(shape: string | undefined): boolean {
  return shape === 'I' || shape === 'H' || shape === 'U' || shape === 'C';
}

/**
 * What F.6.2 can and cannot say about this member.
 *
 * Ordered so the cheapest exclusion comes first: a shape the clause does not cover needs no
 * geometry, and geometry that is absent makes the classification question moot.
 */
export function f62Report(input: F62Input): F62Report {
  const { shape, b, tf, iMinor } = input;
  const none = {
    flangeSlenderness: null, bfM: null, fcrMPa: null, syM3: null,
  };

  if (!inScope(shape)) {
    return {
      state: 'outOfScope', branch: 'undetermined',
      reasonKey: 'steel.f62.outOfScope', ...none, missingKeys: [],
    };
  }

  const bf = flangeWidthForSlenderness(shape, b);
  if (bf == null || tf == null || tf <= 0) {
    return {
      state: 'geometryUnavailable', branch: 'undetermined',
      reasonKey: 'steel.f62.geometryUnavailable', ...none,
      missingKeys: ['steel.f62.missing.flangeGeometry'],
    };
  }

  const lambdaF = bf / tf;
  /*
   * F.6.3's constant is 138000 with `bf/tf` dimensionless, giving MPa. Computed and reported even
   * though the branch is unknown, because it is the one number a reader holding the printed table
   * can use immediately: if their λrf says the flange is slender, this is their Fcr.
   */
  const fcr = 138000 / (lambdaF * lambdaF);
  const sy = iMinor != null && iMinor > 0 && b != null && b > 0 ? iMinor / (b / 2) : null;

  return {
    state: 'classificationUnavailable',
    branch: 'undetermined',
    reasonKey: 'steel.f62.classificationUnavailable',
    flangeSlenderness: lambdaF,
    bfM: bf,
    fcrMPa: fcr,
    syM3: sy,
    /*
     * Both limits come from the same cell of the same table, and that table is an image. Listed as
     * one missing datum rather than two, because no partial source closes half of it.
     */
    missingKeys: ['steel.f62.missing.slendernessLimits'],
  };
}

/** i18n key for a branch, so a surface never prints a raw enum. */
export const f62BranchKey = (b: F62Branch): string => `steel.f62.branch.${b}`;
