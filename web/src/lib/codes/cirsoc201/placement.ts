/**
 * Placement tolerance: what CIRSOC prescribes, and what it does not.
 *
 * ── The research result ────────────────────────────────────────────
 *
 * CIRSOC 201-2025 §26.6.2.1 and Table 26.6.2.1(a) prescribe construction tolerances for the
 * EFFECTIVE DEPTH d and the EFFECTIVE COVER:
 *
 *     d ≤ 200 mm    d: ±10 mm    cover: lesser of −10 mm or −(1/3)·specified cover
 *     d > 200 mm    d: ±15 mm    cover: lesser of −15 mm or −(1/3)·specified cover
 *     footnote [1]  cover to the bottom of the member: −5 mm
 *
 * §26.6.2.1(c) defers the tie spacing tolerance in intermediate and special seismic systems
 * to INPRES-CIRSOC 103 Part II.
 *
 * It does NOT prescribe a tolerance on the transverse spacing between parallel bars. The
 * detailing engine has been carrying a hardcoded 10 mm allowance on clear spacing, and that
 * number has no clause behind it. The commentary to §26.6.2.1 is explicit that the designer
 * "should specify more restrictive tolerances than the Regulation permits where they are
 * needed", which is an instruction to make it a project decision — not a licence to invent
 * one and bury it in a constant.
 *
 * So the allowance is a PROJECT ASSUMPTION here: editable, visibly flagged, carried into
 * certificates, reports and drawings, and never presented as a code requirement.
 *
 * ── Why the distinction is load-bearing ────────────────────────────
 *
 * Code compliance and construction robustness are different questions and were being
 * conflated. A cage at exactly the code minimum IS code-legal and keeps its certificate;
 * whether it survives the bars being out of position is a second question with a different
 * answer. Treating the allowance as part of the code minimum vetoed arrangements the
 * verifier had already certified — see `column-candidates`, where a 28Ø12 column at 46.9 mm
 * against a 40 mm requirement was refused because 46.9 < 40 + 10.
 *
 * Pure: no store, no runes, no i18n.
 */

import { clause, type ClauseRef, type RegulationEdition } from '../regulation';
import { msg, round, type EngineMessage } from '../message';

/** §26.6.2.1 Table 26.6.2.1(a) — the depth at which the tolerance band changes. */
export const DEPTH_BAND_MM = 200;

/**
 * Default additional transverse bar-spacing margin: ZERO.
 *
 * CIRSOC's minimum clear spacing IS the construction requirement. The regulation prescribes
 * no further margin between parallel bars, so the app adds none by default and never
 * implies one is required.
 *
 * The engine previously carried a hardcoded 10 mm here and applied it as though it were
 * part of the code minimum. That vetoed arrangements the verifier had already certified —
 * a 28Ø12 column at 46.9 mm clear against a 40 mm requirement was refused for being under
 * 40 + 10 — and it presented a number with no clause as a regulatory threshold.
 *
 * An engineer who wants a more conservative cage raises it. Nobody has to argue the default
 * back down to what the code actually says.
 */
export const DEFAULT_SPACING_MARGIN_M = 0;

export interface PlacementPolicy {
  /**
   * Additional margin above the regulatory minimum, m. A PROJECT property. Zero by default,
   * never negative — this can only ever make the detailing more conservative.
   */
  spacingAllowance: number;
  /** True when the project has stated a value rather than accepting the zero default. */
  stated: boolean;
}

export const DEFAULT_PLACEMENT_POLICY: PlacementPolicy = {
  spacingAllowance: DEFAULT_SPACING_MARGIN_M,
  stated: false,
};

/** Clamp a project-entered margin: non-negative, and finite. */
export function normaliseMargin(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

/** Tolerances CIRSOC DOES prescribe, for one member. */
export interface PrescribedTolerances {
  /** ± tolerance on the effective depth, m. */
  depth: number;
  /** Negative tolerance on the specified cover, m (a reduction). */
  cover: number;
  /** Negative tolerance on cover to the bottom face, m. */
  bottomCover: number;
  refs: ClauseRef[];
  derivation: EngineMessage;
}

/**
 * Table 26.6.2.1(a) for a member of effective depth `d` and specified cover `cover`.
 *
 * Both in metres. The cover tolerance is the LESSER of a flat value and a third of the
 * specified cover — "lesser" meaning the smaller reduction, which is the stricter limit.
 */
export function prescribedTolerances(
  d: number, cover: number, edition: RegulationEdition,
): PrescribedTolerances {
  const large = d * 1000 > DEPTH_BAND_MM;
  const depth = large ? 0.015 : 0.010;
  const flat = large ? 0.015 : 0.010;
  const proportional = cover / 3;
  const coverTol = Math.min(flat, proportional);
  return {
    depth,
    cover: coverTol,
    // Footnote [1]: stricter at the bottom, for durability and fire protection.
    bottomCover: 0.005,
    refs: [
      clause('cirsoc-201', edition, 'Tabla 26.6.2.1(a)',
        'tolerancias para d y el recubrimiento efectivo'),
      clause('cirsoc-201', edition, '26.6.2.1', 'información sobre el diseño'),
    ],
    derivation: msg('codes.placement.prescribed', {
      d: round(d * 1000, 0), band: DEPTH_BAND_MM,
      depthTol: round(depth * 1000, 0),
      coverTol: round(coverTol * 1000, 1),
      governedBy: flat <= proportional
        ? 'codes.placement.governedFlat'
        : 'codes.placement.governedProportional',
    }),
  };
}

// ─── The seven-field spacing result ──────────────────────────────

/**
 * Everything a spacing check has to say, separated.
 *
 * One boolean cannot carry this. "Does it comply?" and "will it still comply once built?"
 * have different answers, different consequences, and — critically — different authority:
 * the first is the regulation's, the second is the project's.
 */
export interface SpacingAssessment {
  /** §25.2.1 / §25.2.3, m. The regulation's requirement. */
  codeMinimum: number;
  /** Clear distance as drawn, m. */
  achievedNominalClear: number;
  /** The project's assumed allowance, m. */
  placementAllowance: number;
  /** achievedNominalClear − placementAllowance, m. What the worst permitted build gives. */
  worstCasePlacedClear: number;
  /** Does the drawing comply? This is what VERIFIED depends on. */
  codeLegal: boolean;
  /** Does the worst permitted build still comply? This is what CONSTRUCTIBLE depends on. */
  placementRobust: boolean;
  /** codeMinimum + placementAllowance, m. What a NEW arrangement should aim for. */
  targetNominalClear: number;
  /**
   * True when a NON-ZERO margin is in force without the project having stated it.
   *
   * The zero default needs no caveat: it asserts nothing beyond the regulation. Only an
   * added margin is a claim that has to be attributed.
   */
  allowanceIsAssumed: boolean;
  refs: ClauseRef[];
  /** Human-readable, translated at the boundary. */
  summary: EngineMessage;
  /** Present only when the allowance is assumed. Must be surfaced wherever this is shown. */
  assumption?: EngineMessage;
}

/**
 * Assess one clear distance.
 *
 * `codeLegal` and `placementRobust` are computed independently and never collapsed. An
 * arrangement may be the first without the second, and that combination is exactly the one
 * the product has to be able to express: keep the certificate, withhold CONSTRUCTIBLE.
 */
export function assessSpacing(input: {
  codeMinimum: number;
  achievedNominalClear: number;
  policy?: PlacementPolicy;
  refs?: ClauseRef[];
}): SpacingAssessment {
  const policy = input.policy ?? DEFAULT_PLACEMENT_POLICY;
  const allowance = policy.spacingAllowance;
  const worst = input.achievedNominalClear - allowance;
  const codeLegal = input.achievedNominalClear >= input.codeMinimum - 1e-9;
  const placementRobust = worst >= input.codeMinimum - 1e-9;

  return {
    codeMinimum: input.codeMinimum,
    achievedNominalClear: input.achievedNominalClear,
    placementAllowance: allowance,
    worstCasePlacedClear: worst,
    codeLegal,
    placementRobust,
    targetNominalClear: input.codeMinimum + allowance,
    allowanceIsAssumed: !policy.stated && allowance > 0,
    refs: input.refs ?? [],
    summary: msg(
      !codeLegal ? 'codes.placement.notLegal'
        : allowance <= 0 ? 'codes.placement.legalAtCodeMinimum'
          : placementRobust ? 'codes.placement.legalAndRobust'
            : 'codes.placement.legalNotRobust',
      {
        achieved: round(input.achievedNominalClear * 1000, 1),
        required: round(input.codeMinimum * 1000, 1),
        allowance: round(allowance * 1000, 1),
        worst: round(worst * 1000, 1),
      },
    ),
    assumption: (!policy.stated && allowance > 0)
      ? msg('codes.placement.allowanceAssumed', { allowance: round(allowance * 1000, 1) })
      : undefined,
  };
}

/**
 * The worst-case effective depth, for re-verification after a layout moves bars.
 *
 * Table 26.6.2.1(a)'s tolerance on d is a real, prescribed number, and unlike the spacing
 * allowance it has a clause. A layout that changes the effective depth has to be re-checked
 * at the unfavourable end of that band, not at the nominal.
 */
export function worstCaseEffectiveDepth(
  nominalD: number, cover: number, edition: RegulationEdition,
): { d: number; tolerance: PrescribedTolerances } {
  const tolerance = prescribedTolerances(nominalD, cover, edition);
  return { d: nominalD - tolerance.depth, tolerance };
}
