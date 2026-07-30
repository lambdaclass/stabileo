/**
 * Table 9.7.6.2.2 — maximum spacing of the legs of shear reinforcement.
 *
 * THE authority for this rule. There is deliberately no second implementation and no
 * fallback constant: the candidate generator, the provided-reinforcement verifier, the
 * final-geometry feedback loop, the physical cage generator, the fit/collision checks,
 * the calculation memos, the UI, the reports and the PDF/DXF/XLSX writers all consume
 * this one function.
 *
 * ── Why it had to be rewritten ─────────────────────────────────────
 *
 * The rule was previously written out by hand in three places (`maxStirrupSpacing` in
 * `station-design-forces.ts`, `checkShear` in `codes/argentina/cirsoc201.ts`, and a
 * literal `Math.min(0.20, d / 4)` in `detailing/generate-beam.ts`). All three carried the
 * same three defects:
 *
 *   1. UNCONSERVATIVE — an invented branch. `if (VsReq <= 0) return min(0,8·d, 300 mm)`.
 *      The table is indexed on "V_s **requerido**", so a required V_s of zero is squarely
 *      inside row 1 and the row-1 limit applies. `0,8·d` appears nowhere in the table, in
 *      §9.7.6.2 or in its commentary. For the measured qa-8 beam (d = 512 mm) it PERMITTED
 *      300 mm where the table permits 256 mm — a spacing the regulation forbids could be
 *      certified. This is the defect that mattered.
 *
 *   2. WRONG CAP — the absolute cap was 300 mm in row 1 where the 2025 table prints
 *      400 mm, and 200 mm in row 2 (correct). Conservative, so it could not cause a false
 *      pass, but it is still not the rule.
 *
 *   3. MISSING REQUIREMENT — only the along-the-length column existed. §9.7.6.2.2 reads
 *      "La separación máxima de ramas de la armadura de corte a lo largo de la longitud del
 *      elemento **y a través del ancho** del elemento debe cumplir con la Tabla 9.7.6.2.2."
 *      Both dimensions are mandatory in the clause body. The across-width limit is what
 *      forces multiple legs (and therefore crossties) into wide members.
 *
 * ── The table, verbatim ────────────────────────────────────────────
 *
 * CIRSOC 201-2025, page 209 of 656 (Cap. 9 - 177), expediente
 * IF-2025-136960277-APN-DNGPO#MOP. Read off the rendered page, not the flattened Markdown
 * conversion, because the conversion loses the column spans.
 *
 *   Tabla 9.7.6.2.2. Separación máxima para las ramas de la armadura de corte
 *   header: "s máximo, mm"
 *
 *   V_s requerido        |     Viga no pretensada    |      Viga pretensada
 *                        | A lo largo | A través del | A lo largo | A través del
 *                        | de la long.|     ancho    | de la long.|    ancho
 *   ≤ 0,33·√f'c·bw·d     |    d/2     |      d       |    3h/4    |    3h/2
 *          El menor de:  |                  400 mm                          |
 *   > 0,33·√f'c·bw·d     |    d/4     |     d/2      |    3h/8    |    3h/4
 *          El menor de:  |                  200 mm                          |
 *
 * The `400 mm` and `200 mm` cells SPAN ALL FOUR COLUMNS of their row. The cap is therefore
 * a property of the ROW, not of the along-the-length column, and it applies to the
 * across-width limit as well. Modelled that way here.
 *
 * The threshold is printed as `0,33`, not as `1/3`. The 2025 edition prints decimal
 * coefficients throughout (0,17 · 0,33 · 0,66 — see §22.5.1.2, Table 22.5.5.1, §22.6). The
 * previous implementation used `1/3`, which is 1,01 % larger and therefore selected row 1
 * for a narrow band of demands that belong in row 2. `0,33` as printed is used here.
 *
 * `bw` is the web width, matching the `b` the callers pass.
 *
 * ── The across-width geometry ──────────────────────────────────────
 *
 * C 9.7.6.2.2 states the intent: "Una separación reducida de los estribos a través del
 * ancho de la viga asegura una transferencia más uniforme de la compresión diagonal del
 * alma... La intención de estos requisitos es que se coloquen múltiples ramas de estribo a
 * través del ancho en vigas anchas y losas en una dirección que requieran estribos."
 * (Leonhardt and Walther, 1964; Anderson and Ramírez, 1989; Lubell, 2009.)
 *
 * So the limit is on the spacing BETWEEN LEGS across the width, measured centre to centre
 * exactly as `s` is measured along the length. The outermost legs sit at the cover line, so
 * the span the legs have to subdivide is
 *
 *     acrossSpan = bw − 2·cover − d_stirrup
 *
 * (cover is to the OUTSIDE of the stirrup, so a leg's centre is `cover + d_stirrup/2` from
 * the face). `n` legs equally spaced leave `n − 1` gaps, so
 *
 *     requiredLegs = max(2, 1 + ceil(acrossSpan / acrossMax))
 *
 * Two legs is the floor: a closed stirrup has two legs whatever the width.
 *
 * The clause limits leg-to-leg spacing only. It states no maximum distance from a leg to
 * the section face, and none is invented here.
 *
 * ── Prestressed members ────────────────────────────────────────────
 *
 * The table's 3h/4 · 3h/2 · 3h/8 · 3h/4 columns are real provisions of the regulation, and
 * prestressing is NOT an implemented capability of this app: there is no prestress force, no
 * tendon geometry, no `h` in the shear path that a prestressed check could use, and no
 * §22.5.6 prestressed V_c. A prestressed member therefore returns an explicit structured
 * unsupported result. Silently applying the non-prestressed columns would be a false pass
 * in the unconservative direction for row 1 (3h/2 > d for most sections) and a false claim
 * of a check that was never performed.
 *
 * ── Editions: 2025 ONLY, and 2005 REFUSES ──────────────────────────
 *
 * This module implements ONE edition: CIRSOC 201-2025, Table 9.7.6.2.2. Any other edition
 * gets a structured unsupported result and NO usable limits.
 *
 * An earlier revision of this module applied the 2025 table to 2005 projects and declared
 * the substitution, on the argument that the 2025 table is at least as restrictive in every
 * cell (2005 caps at 600 mm where 2025 caps at 400 mm, and 2005 carries no across-width
 * provision at all), so it could not produce a false pass. **That reasoning was wrong about
 * what the product claims.** Conservatism is not provenance. A member stamped "CIRSOC
 * 201-2005" whose spacing was decided by the 2025 table is a document that cites a rule it
 * did not apply, and the reviewing engineer cannot tell. Being conservative makes it a safe
 * design; it does not make it a 2005 design.
 *
 * The 2005 text is not supplied with this repository — `REGULATIONS` records
 * `textAvailable: false` for CIRSOC 201-2005, and `docs/codes/CIRSOC/` contains no
 * 201-2005 document. So the rule cannot be implemented, and the repository's own stated
 * policy applies (`docs/codes/CIRSOC/SOURCES.md`: data not available in the supplied text
 * "is marked unsupported in code rather than guessed"). This is the same precedent already
 * set for INPRES-CIRSOC 103 Parte II, where an assumed 2021 edition was withdrawn in favour
 * of the edition actually supplied.
 *
 * Consequence, stated plainly: transverse reinforcement is required in essentially every
 * beam, so refusing this rule means **no beam reaches VERIFIED under the 2005 adapter**.
 * That is the honest outcome. The alternative was a certificate whose governing spacing came
 * from a table the certificate does not name.
 *
 * To implement 2005 properly: supply CIRSOC 201-2005, convert it under
 * `docs/codes/CIRSOC/markdown/`, then add a SEPARATE evaluator with its own §11.5 clause
 * refs and its own boundary tests. Do not parameterise this one — the editions renumber
 * wholesale and share no clause identifier.
 *
 * All lengths in metres unless the name says `Mm`. Forces in kN. Pure: no store, no runes.
 */

import { msg, round, type EngineMessage } from '../message';
import { clause, type ClauseRef, type RegulationEdition } from '../regulation';

/**
 * Which row of the table applies.
 *
 * `row1` is `V_s requerido ≤ 0,33·√f'c·bw·d` — which INCLUDES a required `V_s` of zero.
 */
export type TransverseSpacingRow = 'row1' | 'row2';

/**
 * Capability gap keys. Deliberately a subset of `LimitingConstraint` (declared in
 * `lib/engine/design/outcome.ts`) by value rather than by import: `lib/codes` is the lower
 * layer and must not depend on the design engine. A test asserts the assignability.
 */
export type TransverseSpacingGap = 'unsupportedCheck';

/**
 * The ONE edition this module implements. Not configurable.
 *
 * A named constant rather than an inline `'2025'` so the gate, the clause refs and the
 * tests all read from the same place, and so a future 2005 or 2028 evaluator is obviously a
 * separate module rather than a new branch in here.
 */
export const TRANSVERSE_SPACING_EDITION: RegulationEdition = '2025';

/** Which term of a `El menor de:` pair produced the governing limit. */
export type TransverseSpacingGovernor = 'depthTerm' | 'absoluteCap';

export interface TransverseSpacingInputs {
  /**
   * Required steel shear contribution `V_s requerido = V_u/φ − V_c`, kN.
   *
   * Passed in rather than recomputed: `V_c` is the verifier's business (axial interaction,
   * §22.5.5) and two independent `V_c` expressions is exactly the duplication this module
   * exists to remove. Values ≤ 0 select row 1, per "V_s **requerido**".
   */
  VsRequired: number;
  /** Web width `bw`, m. */
  bw: number;
  /** Effective depth `d`, m. */
  d: number;
  /** Specified compressive strength `f'c`, MPa. */
  fc: number;
  /** Concrete cover to the OUTSIDE of the stirrup, m. */
  cover: number;
  /** Stirrup bar diameter, mm. */
  stirrupDiaMm: number;
  /**
   * True for a prestressed member. The table's prestressed columns are unsupported, so
   * this produces a structured unsupported result rather than the non-prestressed limits.
   */
  prestressed?: boolean;
}

export interface TransverseSpacingLimits {
  row: TransverseSpacingRow;
  /** Maximum leg spacing ALONG the member axis, m. */
  alongMax: number;
  /** Maximum leg spacing ACROSS the member width, m. */
  acrossMax: number;
  /** Legs required so that no across-width gap exceeds `acrossMax`. Never below 2. */
  requiredLegs: number;
  /** Centre-to-centre span the legs subdivide, m: `bw − 2·cover − d_stirrup`. */
  acrossSpan: number;
  /** Actual centre-to-centre leg spacing that `requiredLegs` produces, m. */
  legSpacingAtRequiredLegs: number;
  alongGovernedBy: TransverseSpacingGovernor;
  acrossGovernedBy: TransverseSpacingGovernor;
  /** The row-selection threshold `0,33·√f'c·bw·d`, kN. */
  rowThreshold: number;
  /** `V_s requerido` as used, with negatives clamped to zero, kN. */
  VsRequired: number;
  /** Why this row and these limits — for memos, reports and the UI. */
  demandBasis: EngineMessage[];
  clauses: ClauseRef[];
  /** Non-empty when the table carries a provision this app does not implement. */
  unsupported: TransverseSpacingGap[];
}

/** The row-selection threshold, kN. Exported so callers can show it without recomputing. */
export function rowThreshold(fc: number, bw: number, d: number): number {
  return TABLE_THRESHOLD_COEFF * Math.sqrt(fc) * (bw * 1000) * (d * 1000) / 1000;
}

/** As printed in Table 9.7.6.2.2: `0,33·√f'c·bw·d`. Not `1/3`. */
const TABLE_THRESHOLD_COEFF = 0.33;

/** Per-row absolute caps, m. They span all four columns of their row. */
const ROW_CAP: Record<TransverseSpacingRow, number> = { row1: 0.400, row2: 0.200 };

/** Per-row depth divisors, along the length and across the width. */
const ROW_DIVISOR: Record<TransverseSpacingRow, { along: number; across: number }> = {
  row1: { along: 2, across: 1 },
  row2: { along: 4, across: 2 },
};

/**
 * The depth term as an expression, nested so the boundary renders `d` and not `d/1`.
 *
 * Row 1's across-width term IS `d`, with no divisor. Passing the divisor as a number and
 * writing `d/{divisor}` in the locale file would print "d/1", which is not how the table
 * prints it. `MessageParam` allows a nested message for exactly this.
 */
function depthExpr(divisor: number): EngineMessage {
  return divisor === 1
    ? msg('codes.cirsoc201.transverseSpacing.termD')
    : msg('codes.cirsoc201.transverseSpacing.termDOver', { divisor });
}

function tableRef(): ClauseRef {
  return clause('cirsoc-201', '2025', 'Tabla 9.7.6.2.2',
    'separación máxima para las ramas de la armadura de corte');
}

function clauseRef(): ClauseRef {
  return clause('cirsoc-201', '2025', '9.7.6.2.2',
    'separación de ramas a lo largo de la longitud y a través del ancho');
}

/** Centre-to-centre span the legs of one stirrup set have to subdivide, m. */
export function acrossWidthSpan(bw: number, cover: number, stirrupDiaMm: number): number {
  return Math.max(0, bw - 2 * cover - stirrupDiaMm / 1000);
}

/**
 * Legs needed so that no gap between adjacent legs exceeds `acrossMax`.
 *
 * A closed stirrup has two legs however narrow the web, so 2 is the floor and a section
 * whose `acrossSpan` already fits inside `acrossMax` needs no crosstie.
 */
export function legsForAcrossWidth(acrossSpan: number, acrossMax: number): number {
  if (!(acrossMax > 0)) return 2;
  if (acrossSpan <= acrossMax + LENGTH_EPS) return 2;
  return Math.max(2, 1 + Math.ceil(acrossSpan / acrossMax - LENGTH_EPS));
}

/** Floating-point slack, m. 1 µm — far below any fabrication tolerance. */
export const LENGTH_EPS = 1e-6;

/**
 * Evaluate Table 9.7.6.2.2 for one member and one shear demand.
 *
 * Total function: every input produces a structured result. A prestressed member produces
 * a result whose `unsupported` is non-empty and whose limits are the non-prestressed ones
 * ONLY so that downstream code has finite numbers to draw; callers MUST check `unsupported`
 * before treating the result as a verdict. `transverseSpacingIsSupported` is the guard.
 */
export function transverseSpacingLimits(
  edition: RegulationEdition,
  inputs: TransverseSpacingInputs,
): TransverseSpacingLimits {
  // ── Edition gate: refuse, do not substitute ──
  //
  // Returned BEFORE any arithmetic, and with limits of zero rather than the 2025 numbers, so
  // that a caller which ignores `unsupported` cannot accidentally certify anything: every
  // positive provided spacing exceeds a zero limit, and `requiredLegs` of zero is not a
  // buildable stirrup. Failing closed is the point.
  if (edition !== TRANSVERSE_SPACING_EDITION) {
    return {
      row: 'row1', alongMax: 0, acrossMax: 0, requiredLegs: 0,
      acrossSpan: acrossWidthSpan(inputs.bw, inputs.cover, inputs.stirrupDiaMm),
      legSpacingAtRequiredLegs: 0,
      alongGovernedBy: 'absoluteCap', acrossGovernedBy: 'absoluteCap',
      rowThreshold: 0, VsRequired: Math.max(0, inputs.VsRequired),
      demandBasis: [msg('codes.cirsoc201.transverseSpacing.editionUnsupported', { edition })],
      // No clause is cited. Citing the 2025 table here is exactly the mislabelling this gate
      // exists to prevent, and there is no 2005 clause to cite because the text is not
      // supplied.
      clauses: [],
      unsupported: ['unsupportedCheck'],
    };
  }

  const VsRequired = Math.max(0, inputs.VsRequired);
  const threshold = rowThreshold(inputs.fc, inputs.bw, inputs.d);

  // "V_s requerido ≤ 0,33·√f'c·bw·d" — the `≤` puts the threshold itself, and zero, in row 1.
  const row: TransverseSpacingRow = VsRequired <= threshold + FORCE_EPS ? 'row1' : 'row2';
  const cap = ROW_CAP[row];
  const div = ROW_DIVISOR[row];

  const alongTerm = inputs.d / div.along;
  const acrossTerm = inputs.d / div.across;
  const alongMax = Math.min(alongTerm, cap);
  const acrossMax = Math.min(acrossTerm, cap);
  const alongGovernedBy: TransverseSpacingGovernor = alongTerm <= cap ? 'depthTerm' : 'absoluteCap';
  const acrossGovernedBy: TransverseSpacingGovernor = acrossTerm <= cap ? 'depthTerm' : 'absoluteCap';

  const acrossSpan = acrossWidthSpan(inputs.bw, inputs.cover, inputs.stirrupDiaMm);
  const requiredLegs = legsForAcrossWidth(acrossSpan, acrossMax);

  const demandBasis: EngineMessage[] = [
    msg(row === 'row1'
      ? 'codes.cirsoc201.transverseSpacing.row1'
      : 'codes.cirsoc201.transverseSpacing.row2', {
      vs: round(VsRequired, 1), threshold: round(threshold, 1),
    }),
    msg(alongGovernedBy === 'depthTerm'
      ? 'codes.cirsoc201.transverseSpacing.alongDepth'
      : 'codes.cirsoc201.transverseSpacing.alongCap', {
      expr: depthExpr(div.along), term: round(alongTerm * 1000, 0),
      cap: round(cap * 1000, 0), value: round(alongMax * 1000, 0),
    }),
    msg(acrossGovernedBy === 'depthTerm'
      ? 'codes.cirsoc201.transverseSpacing.acrossDepth'
      : 'codes.cirsoc201.transverseSpacing.acrossCap', {
      expr: depthExpr(div.across), term: round(acrossTerm * 1000, 0),
      cap: round(cap * 1000, 0), value: round(acrossMax * 1000, 0),
    }),
    msg('codes.cirsoc201.transverseSpacing.legs', {
      legs: requiredLegs, span: round(acrossSpan * 1000, 0),
      acrossMax: round(acrossMax * 1000, 0),
    }),
  ];

  const unsupported: TransverseSpacingGap[] = [];
  if (inputs.prestressed === true) {
    unsupported.push('unsupportedCheck');
    demandBasis.push(msg('codes.cirsoc201.transverseSpacing.prestressedUnsupported'));
  }
  const gaps = requiredLegs - 1;
  return {
    row, alongMax, acrossMax, requiredLegs, acrossSpan,
    legSpacingAtRequiredLegs: gaps > 0 ? acrossSpan / gaps : 0,
    alongGovernedBy, acrossGovernedBy,
    rowThreshold: threshold, VsRequired,
    demandBasis,
    clauses: [clauseRef(), tableRef()],
    unsupported,
  };
}

/** Floating-point slack on the row threshold, kN. */
const FORCE_EPS = 1e-9;

/**
 * `V_s requerido = V_u/φ − V_c`, kN — the quantity Table 9.7.6.2.2 is indexed on.
 *
 * `V_c` is the plain §22.5.5.1 expression `(1/6)·√f'c·bw·d` with no axial interaction. The
 * row index is a coarse two-band classification, and the axial-corrected `V_c` belongs to
 * the capacity verdict, not to the row selection. φ = 0,75 per §21.2.1.
 *
 * Lives here rather than in the engine so that the design path, the detailing path and the
 * legacy estimator all obtain the row from the same arithmetic. When the engine had its own
 * copy, the three disagreed.
 */
export function requiredVsForTable(Vu: number, bw: number, d: number, fc: number): number {
  const Vc = (1 / 6) * Math.sqrt(fc) * (bw * 1000) * (d * 1000) / 1000;
  return Math.max(0, Math.abs(Vu) / PHI_SHEAR - Vc);
}

/** §21.2.1 strength-reduction factor for shear. */
const PHI_SHEAR = 0.75;

/**
 * Table 9.7.6.2.2 evaluated straight from a shear demand.
 *
 * The convenience entry point every caller that has `V_u` rather than `V_s requerido` uses,
 * so the `V_s` arithmetic is not repeated at each site.
 */
export function transverseSpacingForDemand(
  edition: RegulationEdition,
  inputs: {
    Vu: number; bw: number; d: number; fc: number;
    cover: number; stirrupDiaMm: number; prestressed?: boolean;
  },
): TransverseSpacingLimits {
  return transverseSpacingLimits(edition, {
    VsRequired: requiredVsForTable(inputs.Vu, inputs.bw, inputs.d, inputs.fc),
    bw: inputs.bw, d: inputs.d, fc: inputs.fc,
    cover: inputs.cover, stirrupDiaMm: inputs.stirrupDiaMm,
    prestressed: inputs.prestressed,
  });
}

/** True when the result may be used as a verdict. False when a provision is unsupported. */
export function transverseSpacingIsSupported(limits: TransverseSpacingLimits): boolean {
  return limits.unsupported.length === 0;
}

/**
 * True when this edition's transverse-spacing rule is implemented at all.
 *
 * Separate from `transverseSpacingIsSupported` because the two answer different questions at
 * different times: this one is a property of the EDITION and can be asked before any member
 * geometry exists, which is what lets the design adapter refuse at its capability gate
 * rather than after a fruitless search.
 */
export function transverseSpacingSupportedForEdition(edition: RegulationEdition): boolean {
  return edition === TRANSVERSE_SPACING_EDITION;
}

/**
 * Centre-to-centre leg spacing that `legs` equally-spaced legs produce across the width.
 *
 * The generator, the verifier and the drawing must all place legs at the same coordinates,
 * so the position rule lives here with the limit it has to satisfy.
 */
export function legSpacingAcross(
  legs: number, bw: number, cover: number, stirrupDiaMm: number,
): number {
  const span = acrossWidthSpan(bw, cover, stirrupDiaMm);
  return legs > 1 ? span / (legs - 1) : 0;
}

/**
 * Across-width offsets of every leg, m, measured from the section centreline.
 *
 * Symmetric about the centreline and outermost legs on the cover line — the same layout
 * the cage generator draws and the collision checker tests, produced from one function so
 * the three cannot disagree.
 */
export function legOffsetsAcross(
  legs: number, bw: number, cover: number, stirrupDiaMm: number,
): number[] {
  const n = Math.max(2, Math.floor(legs));
  const half = acrossWidthSpan(bw, cover, stirrupDiaMm) / 2;
  if (half <= 0) return new Array<number>(n).fill(0);
  const pitch = (2 * half) / (n - 1);
  return Array.from({ length: n }, (_, i) => -half + i * pitch);
}

export interface TransverseSpacingCheck {
  /** True when both the along and across limits are met. */
  ok: boolean;
  alongOk: boolean;
  acrossOk: boolean;
  /** Provided spacing along the member, m. */
  alongProvided: number;
  /** Provided centre-to-centre leg spacing across the width, m. */
  acrossProvided: number;
  /** Utilization demand/capacity for each direction, so the UI can rank them. */
  alongUtilization: number;
  acrossUtilization: number;
  limits: TransverseSpacingLimits;
  reasons: EngineMessage[];
}

/**
 * Verify a provided stirrup arrangement against both columns of the row.
 *
 * The verifier and the generator call this same function, which is why a candidate the
 * generator proposes can never be rejected by the verifier for a reason the generator did
 * not model.
 */
export function checkTransverseSpacing(
  edition: RegulationEdition,
  inputs: TransverseSpacingInputs,
  provided: { spacing: number; legs: number },
): TransverseSpacingCheck {
  const limits = transverseSpacingLimits(edition, inputs);
  const acrossProvided = legSpacingAcross(
    provided.legs, inputs.bw, inputs.cover, inputs.stirrupDiaMm);

  const alongOk = provided.spacing <= limits.alongMax + LENGTH_EPS;
  const acrossOk = acrossProvided <= limits.acrossMax + LENGTH_EPS;

  const reasons: EngineMessage[] = [];
  if (!alongOk) {
    reasons.push(msg('codes.cirsoc201.transverseSpacing.alongExceeded', {
      provided: round(provided.spacing * 1000, 0), max: round(limits.alongMax * 1000, 0),
    }));
  }
  if (!acrossOk) {
    reasons.push(msg('codes.cirsoc201.transverseSpacing.acrossExceeded', {
      provided: round(acrossProvided * 1000, 0), max: round(limits.acrossMax * 1000, 0),
      legs: provided.legs, requiredLegs: limits.requiredLegs,
    }));
  }

  return {
    ok: alongOk && acrossOk, alongOk, acrossOk,
    alongProvided: provided.spacing, acrossProvided,
    alongUtilization: limits.alongMax > 0 ? provided.spacing / limits.alongMax : Number.POSITIVE_INFINITY,
    acrossUtilization: limits.acrossMax > 0 ? acrossProvided / limits.acrossMax : Number.POSITIVE_INFINITY,
    limits, reasons,
  };
}
