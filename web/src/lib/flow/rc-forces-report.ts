/**
 * The raw forces report: what the solver produced, configured for export.
 *
 * ── What this is NOT ───────────────────────────────────────────────
 *
 * It is not the design report. §5 of the scope is explicit that raw solver results must not be
 * mixed with reinforcement design, and they are two documents for a reason: one says what the
 * structure is carrying, the other says what steel was chosen and whether it verifies. A reader
 * who cannot tell which one is in front of them cannot tell a demand from a capacity.
 *
 * So nothing here imports from `engine/design` or `engine/detailing`, and a test asserts it.
 *
 * ── What the solver actually produces ──────────────────────────────
 *
 * Audited before this was written, because §5 forbids inventing magnitudes:
 *
 *   `AnalysisResults3D`   displacements · reactions · elementForces · plateStresses ·
 *                         quadStresses · constraintForces · diagnostics · timings
 *   `StationForces`       t · x · n · vy · vz · my · mz · torsion — SIGN PRESERVED
 *   `ElementStationResult` stationTs, and per combo a `StationForces[]`
 *
 * Every magnitude this contract offers comes from one of those. There is nothing here the
 * engine does not compute.
 *
 * ── The two station modes, and why the default is an evaluation ────
 *
 * `buildCriticalStations` unconditionally seeds 0, 0.25, 0.5, 0.75 and 1 before adding load
 * positions and extrema, so on a normal member the quarter grid IS a subset of what was
 * computed and no interpolation is involved.
 *
 * It is not a subset in one case, and that case is why the default is defined as an evaluation
 * rather than a filter: a member of effectively zero length short-circuits to `[0, 1]`. Filtering
 * would silently return two rows where the user asked for five. `extractForcesAtStation`
 * evaluates the diagram at any `t`, so evaluating is correct in both regimes and identical to
 * filtering wherever filtering would have worked.
 *
 * ── The rule that outranks both modes ──────────────────────────────
 *
 * Raw solver output is never replaced and never hidden. `quarters` is a REPORTING convention —
 * five positions chosen because they are what a drawing schedule wants — and choosing it must
 * not make the critical stations unavailable. That is why `RcForcesSection` carries
 * `rawStations` as its own section rather than as an alternative to `stations`: a reader can
 * always ask for everything the solver computed, in the same document.
 */

/** Which positions along a member the report tabulates. */
export type RcStationMode =
  /**
   * 0 %, 25 %, 50 %, 75 %, 100 %. The default, and a reporting convention rather than a
   * property of the analysis — the UI must say so, because five evenly spaced numbers look
   * like a result and are a choice.
   */
  | 'quarters'
  /**
   * Every station `buildCriticalStations` produced: the quarters plus point-load positions,
   * distributed-load boundaries and the extrema between them. What the engine actually used.
   */
  | 'critical';

/** The five positions, as fractions of the member's length. */
export const RC_QUARTER_STATIONS: readonly number[] = [0, 0.25, 0.5, 0.75, 1] as const;

/**
 * Resolve a mode into the `t` values to evaluate.
 *
 * `criticalTs` comes from `buildCriticalStations` and is only consulted for `critical`. Sorted
 * and de-duplicated so two members with differently ordered station sets produce comparably
 * ordered rows.
 */
export function rcResolveStations(mode: RcStationMode, criticalTs: readonly number[]): number[] {
  const ts = mode === 'quarters' ? RC_QUARTER_STATIONS : criticalTs;
  return [...new Set(ts)].sort((a, b) => a - b);
}

/**
 * The magnitudes a station row can carry.
 *
 * Exactly the fields of `StationForces`, in the order an engineer reads them: axial, then the
 * two shears, then the two moments, then torsion. Sign is preserved by the engine and must be
 * preserved here — an absolute value would make a hogging moment indistinguishable from a
 * sagging one, which is the difference between top and bottom steel.
 */
export type RcForcesMagnitude = 'n' | 'vy' | 'vz' | 'my' | 'mz' | 'torsion';

/** All of them, in reading order. */
export const RC_FORCES_MAGNITUDES: readonly RcForcesMagnitude[] =
  ['n', 'vy', 'vz', 'my', 'mz', 'torsion'] as const;

/**
 * The sections of the report, each of which becomes its own sheet in XLSX.
 *
 * `stations` and `rawStations` are both present on purpose — see the header. Choosing the
 * quarter convention must never be what makes the engine's own stations unavailable.
 */
export type RcForcesSection =
  /** Support reactions, per case and per combination. */
  | 'reactions'
  /** End forces per member — `AnalysisResults3D.elementForces`. */
  | 'elementForces'
  /** Station rows at the positions `stationMode` resolves to. */
  | 'stations'
  /** Every station the engine computed, whatever `stationMode` says. */
  | 'rawStations'
  /** Nodal displacements. */
  | 'displacements';

/** All sections, in the order they are emitted. */
export const RC_FORCES_SECTIONS: readonly RcForcesSection[] =
  ['reactions', 'displacements', 'elementForces', 'stations', 'rawStations'] as const;

/**
 * What the report covers.
 *
 * `elements` narrows to a selection — the same element ids the detailing list and the viewer
 * share, so "report on what I have selected" means one thing across the app. Narrowing the
 * scope does not narrow the reactions: a support reaction is a property of the model, and
 * filtering it by a member selection would produce an out-of-equilibrium table.
 */
export type RcForcesScope =
  | { kind: 'model' }
  | { kind: 'elements'; elementIds: readonly number[] };

/**
 * How it comes out.
 *
 * Audited rather than assumed, because §5 names three formats and only some of them exist:
 *
 *   `xlsx`  `exportToExcel({ extraSheets })` — already used by the detailing schedule, one
 *           sheet per section.
 *   `pdf`   KaTeX-rendered HTML handed to the browser's print pipeline, which is what
 *           `pro-report.ts` already does. There is NO packaged PDF writer in this tree — no
 *           jsPDF, no pdfmake — so "PDF with LaTeX" means the maths is typeset by KaTeX and
 *           the page is turned into a PDF by the browser. Better typography and no dependency;
 *           the cost is that nothing can assert the PDF was produced, since `print()` hands off
 *           to the operating system.
 *   `html`  the same document as a file. Not a downgrade — it is the fallback `exportReport`
 *           already falls back to when a popup is blocked, and it is the only one of the three
 *           that yields a file the app can hand over directly.
 */
export type RcForcesFormat = 'xlsx' | 'pdf' | 'html';

/** Everything the report needs to be generated. */
export interface RcForcesReportConfig {
  scope: RcForcesScope;
  sections: readonly RcForcesSection[];
  stationMode: RcStationMode;
  /** Which columns the station tables carry. Order is the column order. */
  magnitudes: readonly RcForcesMagnitude[];
  format: RcForcesFormat;
  /**
   * Combination ids to report, or null for every one solved.
   *
   * Null and `[]` differ: null is "all", `[]` is "none selected" and must produce an empty
   * report rather than a full one. The same distinction `statusElementIds` already draws in
   * `workspaceFilter`.
   */
  comboIds: readonly number[] | null;
}

/**
 * The default configuration.
 *
 * Quarters, every magnitude, every section, one combination set, XLSX. It reports everything
 * because a raw results report that omitted something by default would be a filtered result
 * wearing the name "raw".
 */
export const RC_FORCES_DEFAULT: RcForcesReportConfig = {
  scope: { kind: 'model' },
  sections: RC_FORCES_SECTIONS,
  stationMode: 'quarters',
  magnitudes: RC_FORCES_MAGNITUDES,
  format: 'xlsx',
  comboIds: null,
};

/**
 * Why a configuration cannot be generated, as i18n keys, or an empty list.
 *
 * Reasons and not a boolean: a disabled button whose reason is not written next to it is a
 * riddle, and this branch has already fixed that once on `review-submit`.
 */
export function rcForcesBlockers(
  cfg: RcForcesReportConfig,
  available: { solved: boolean; hasStations: boolean },
): string[] {
  const out: string[] = [];
  if (!available.solved) out.push('design.forcesReport.needSolve');
  const wantsStations = cfg.sections.includes('stations') || cfg.sections.includes('rawStations');
  if (wantsStations && !available.hasStations) out.push('design.forcesReport.needStations');
  if (cfg.sections.length === 0) out.push('design.forcesReport.needSection');
  if (cfg.magnitudes.length === 0 && wantsStations) out.push('design.forcesReport.needMagnitude');
  if (cfg.scope.kind === 'elements' && cfg.scope.elementIds.length === 0) {
    out.push('design.forcesReport.needElements');
  }
  if (cfg.comboIds !== null && cfg.comboIds.length === 0) {
    out.push('design.forcesReport.needCombo');
  }
  return out;
}

/**
 * Which sections a configuration will actually emit.
 *
 * `rawStations` survives every scope and mode, which is the enforcement of the rule in the
 * header: choosing the quarter convention narrows the `stations` sheet and never the engine's
 * own. Sections are returned in `RC_FORCES_SECTIONS` order regardless of the order they were
 * requested in, so two configurations that ask for the same sheets produce the same workbook.
 */
export function rcForcesSheets(cfg: RcForcesReportConfig): RcForcesSection[] {
  return RC_FORCES_SECTIONS.filter((s) => cfg.sections.includes(s));
}
