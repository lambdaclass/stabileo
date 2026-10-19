/**
 * Bottom-mat flexural design for an isolated footing — CIRSOC 201-2025 Chapter 13.
 *
 * ── What was here before ───────────────────────────────────────
 *
 * `foundation-check.ts` computed ONE factored moment: the §13.2.7 cantilever integral about
 * the B axis, reported as `FootingCheck.Mu`, with the memo saying "la armadura de flexión se
 * dimensiona con el verificador de secciones". Nothing dimensioned it. The record's flexure
 * outcome was UNSUPPORTED with `footing.record.flexureNoSteel`, which was honest, and the
 * other direction of a two-way mat did not exist at all.
 *
 * This module is the missing design. It produces, per direction and separately:
 *
 *   * the demand, from the same trapezoidal soil-pressure integral the check already uses;
 *   * the steel required by FLEXURAL STRENGTH;
 *   * the steel required by the MINIMUM-reinforcement clause;
 *   * which of the two governs;
 *   * an integer bar count and layout that satisfies every applicable spacing limit;
 *   * the §13.3.3 distribution regions the bars belong in.
 *
 * It does NOT generate bars. No physical mat geometry exists after this runs, and the
 * record's `geometry` stays REQUIRED_NOT_MODELED so a footing with a designed-but-undrawn
 * mat cannot read as a verified footing.
 *
 * ── The verified clause chain ──────────────────────────────────
 *
 * Read off the ENACTED Annex IV of CIRSOC 201-2025 (Resolución 11/2025, InfoLeg 422490),
 * not an ACI summary and not the 2024 draft:
 *
 * §13.3.3.1  the design and detailing of two-way isolated footings shall comply with §13.3.3
 *            AND the applicable provisions of Chapters 7 and 8 — this is what makes every
 *            Chapter 7 rule below applicable to a footing at all.
 * §13.2.6.6  the external moment at any section is found by passing a vertical plane through
 *            the member and taking the moment of the forces on the whole area on one side of
 *            it. That integral, not a coefficient.
 * §13.2.7.1  Table: the critical section for M_u is at the FACE of the column or pedestal.
 * §13.3.1.2  the total depth shall be chosen so the effective depth of the bottom
 *            reinforcement is at least 150 mm.
 * §7.6.1     minimum flexural reinforcement in non-prestressed slabs: A_s,min = 0,0018 A_g.
 *            §8.6.1.1 states the same 0,0018 A_g for two-way slabs, so the two chapters
 *            §13.3.3.1 makes applicable agree and there is nothing to reconcile.
 * §7.7.2.1   the minimum spacing s shall comply with §25.2.
 * §25.2.1    clear distance ≥ max(25 mm, d_b, (4/3) d_agg).
 * §7.7.2.2   for non-prestressed slabs, the spacing of the bonded reinforcement closest to
 *            the tension face shall not exceed the value given in §24.3.
 * §24.3.2    Table 24.3.2 — see `crack-control.ts` for the expression.
 * §7.7.2.3   the maximum spacing of longitudinal deformed reinforcement shall be the LESSER
 *            of 3h and 300 mm. Three hundred, verified verbatim in the enacted text. The
 *            2024 draft's 450 mm is not in it; 450 mm appears in §7.7.2.4, which is the
 *            shrinkage-and-temperature rule and a different requirement.
 * §13.3.3.2  in SQUARE two-way footings the reinforcement shall be distributed uniformly
 *            across the full width in both directions.
 * §13.3.3.3  in RECTANGULAR footings: (a) the long-direction reinforcement is distributed
 *            uniformly across the full width; (b) of the short-direction reinforcement, the
 *            portion γs·A_s is distributed uniformly in a band whose width equals the SHORT
 *            side of the footing, centred on the column or pedestal axis, and the remainder
 *            (1 − γs)·A_s uniformly in the zones outside that band, with
 *
 *                γs = 2 / (β + 1)          (13.3.3.3)
 *
 *            where β is the ratio of the long side to the short side.
 * §13.2.8.1  anchorage of the reinforcement shall comply with Chapter 25; §13.2.8.3 puts the
 *            critical sections for anchorage at the §13.2.7.1 locations. The development
 *            length is reported here for the selected bar; whether the physical bar achieves
 *            it is a question about geometry that does not exist yet, and this module makes
 *            no anchorage claim.
 *
 * ── Two things this module deliberately does not do ────────────
 *
 * It does not use `checkFlexure().AsMin`. That is the BEAM minimum,
 * `max(0,25√f'c/f_y, 1,4/f_y)·b_w·d` from §9.6.1.2, and it is not the clause a footing mat
 * answers to. What it DOES reuse from `checkFlexure` is the rectangular stress block, via the
 * new `AsFlexural` output — the strength requirement on its own. Writing the stress block out
 * again here would make this a second flexural engine.
 *
 * It does not use `seedAreaFor`. That is a candidate-search ordering heuristic; it has no
 * design authority.
 *
 * Pure: no store, no runes. Forces kN, moments kN·m, lengths m, pressures kPa, areas m².
 */

import { clause, type ClauseRef, type RegulationEdition } from '../../codes/regulation';
import { msg, type EngineMessage } from '../../codes/message';
import { minClearSpacingInLayer } from '../../codes/cirsoc201/spacing';
import { crackControlMaxSpacing } from '../../codes/cirsoc201/crack-control';
import { barMass } from '../../codes/cirsoc201/bar-geometry';
import { checkFlexure } from '../codes/argentina/cirsoc201';
import { CIRSOC201_DESIGN_EDITION } from '../codes/argentina/cirsoc201-basis';
import type {
  FootingBottomMatLayerOrder, FootingLayerOrderPreference,
} from '../../model/footing';
import {
  MOMENT_ORIENTATIONS, axisPressure, columnOffsetFromCentroid, momentEccentricity,
} from './footing-actions';

// ─── Clause references ───────────────────────────────────────────

const R_TWO_WAY = clause('cirsoc-201', '2025', '13.3.3.1',
  'bases aisladas en dos direcciones: rigen además los Capítulos 7 y 8');
const R_MOMENT_PLANE = clause('cirsoc-201', '2025', '13.2.6.6',
  'momento externo en una sección por un plano vertical');
const R_CRITICAL = clause('cirsoc-201', '2025', '13.2.7.1',
  'sección crítica para Mu en la cara de la columna');
const R_MIN_DEPTH = clause('cirsoc-201', '2025', '13.3.1.2',
  'altura útil de la armadura inferior no menor que 150 mm');
const R_STRENGTH = clause('cirsoc-201', '2025', '7.5.1.1',
  'resistencia de cálculo a flexión de la losa: phi Mn no menor que Mu');
const R_AS_MIN = clause('cirsoc-201', '2025', '7.6.1',
  'armadura mínima a flexión en losas no pretensadas, 0,0018 Ag');
const R_AS_MIN_TWO_WAY = clause('cirsoc-201', '2025', '8.6.1.1',
  'armadura mínima a flexión en dos direcciones, 0,0018 Ag');
const R_MIN_SPACING = clause('cirsoc-201', '2025', '7.7.2.1',
  'la separación mínima debe cumplir con el artículo 25.2');
const R_CRACK_ROUTE = clause('cirsoc-201', '2025', '7.7.2.2',
  'la separación de la armadura más cercana a la cara traccionada sigue el artículo 24.3');
const R_MAX_SPACING = clause('cirsoc-201', '2025', '7.7.2.3',
  'separación máxima: el menor entre 3h y 300 mm');
const R_SQUARE = clause('cirsoc-201', '2025', '13.3.3.2',
  'bases cuadradas: armadura uniforme en todo el ancho en ambas direcciones');
const R_RECTANGULAR = clause('cirsoc-201', '2025', '13.3.3.3',
  'bases rectangulares: faja central y zonas exteriores, gamma_s = 2/(beta+1)');
const R_ANCHORAGE = clause('cirsoc-201', '2025', '13.2.8.1',
  'el anclaje de la armadura debe cumplir con el Capítulo 25');

/** §7.6.1 / §8.6.1.1 — minimum flexural reinforcement ratio on the gross area. */
export const FOOTING_AS_MIN_RATIO = 0.0018;

/** §7.7.2.3 — the absolute cap, m. Three hundred millimetres, from the enacted text. */
export const MAX_SPACING_CAP_M = 0.3;

/** §13.3.1.2 — least effective depth for the bottom mat, m. */
export const MIN_BOTTOM_MAT_DEPTH_M = 0.15;

// ─── Types ───────────────────────────────────────────────────────

/**
 * Which of the two mat directions.
 *
 * `X` bars run parallel to B and are distributed across L; `Y` bars run parallel to L and are
 * distributed across B. The pair is deliberately named for the mat, not for the global axes:
 * a footing's B and L are its own local dimensions and a rotated footing is refused upstream.
 */
export type FootingMatAxis = 'X' | 'Y';

export type FootingMatDirectionStatus = 'DESIGNED' | 'DESIGN_FAILED' | 'NOT_EVALUATED';

/** Which requirement set the steel. */
export type FootingAsGovernedBy = 'FLEXURE' | 'MINIMUM';

/** §13.3.3.2 versus §13.3.3.3 — how the direction's steel is spread across its width. */
export type FootingDistribution = 'UNIFORM_FULL_WIDTH' | 'BANDED_SHORT_DIRECTION';

export type FootingRegionKind = 'FULL_WIDTH' | 'CENTRAL_BAND' | 'OUTSIDE_BAND';

/**
 * How the bars sit inside one region.
 *
 * `EDGE_ANCHORED` is the ordinary full-width mat: the outermost bar stands one cover plus one
 * half-diameter in from the formwork, and n bars leave n−1 equal gaps across what is left.
 * That is how a footing schedule is written and how it is hand-checked.
 *
 * `TRIBUTARY_PITCH` is used inside a §13.3.3.3 band. A band boundary is not a formwork edge —
 * there is no cover to take there — so the clause's "distributed uniformly over the band" is
 * a bar per tributary strip of width s, giving s = w/n. It is also the model under which the
 * region's provided area is exactly n·A_b, which is what makes the γs split checkable.
 */
export type FootingLayoutModel = 'EDGE_ANCHORED' | 'TRIBUTARY_PITCH';

export interface FootingMatRegion {
  kind: FootingRegionKind;
  layoutModel: FootingLayoutModel;
  /** Region width along the distribution axis, m. */
  width: number;
  /**
   * Centre of the region measured from the footing CENTROID along the distribution axis, m.
   *
   * Carried numerically now so PR18-B can place physical bars from the engineering result
   * instead of re-deriving the band geometry from the clause a second time.
   */
  centreOffset: number;
  /** True when the region reaches a formwork edge, which is what makes cover apply. */
  touchesEdge: boolean;
  /**
   * Steel §13.3.3.3 ALLOCATED to this region, m² — before any minimum is applied.
   *
   * Kept beside `asRequired` because the clause and the minimum are two different
   * requirements and either can be the larger. On a real footing the minimum usually wins in
   * the outside zones, so a result that reported only `asRequired` would make the γs split
   * unverifiable exactly where it matters: `band/width` over `outside/width` is 2 for every β,
   * and that identity is checkable here and nowhere else.
   */
  distributionShare: number;
  /** Steel the region must provide, m². Equal to `distributionShare`: see `addRegion`. */
  asRequired: number;
  /**
   * `0,0018 A_g` evaluated on THIS region's strip, m² — a Stabileo policy figure, not a
   * requirement of the enacted text.
   *
   * §7.6.1 imposes its minimum on the direction's reinforcement and §13.3.3.3 then distributes
   * the total; neither clause, and neither commentary, imposes it again region by region. The
   * number is reported so a detailer who wants that extra conservatism can see it, and an
   * advisory names any region whose provided steel falls under it. It is NOT added to
   * `asRequired`, because a design must not present a house preference as a code requirement.
   */
  policyRegionalMinimum: number;
  /** Steel the integer bar count actually provides, m². Never below `asRequired`. */
  asProvided: number;
  barCount: number;
  /** Centre-to-centre spacing, m. */
  spacingCentre: number;
  /** Clear spacing between adjacent bars, m. */
  spacingClear: number;
  /**
   * Whether the §13.3.3.3 share or the §7.6.1 minimum ON THIS REGION set `asRequired`.
   *
   * The distribution rule moves steel from the outside zones into the central band, and on a
   * minimum-governed footing the share left outside can fall below 0,0018 A_g for the strip it
   * covers. §7.6.1 is a minimum AREA, so it is applied to the region as well as to the total;
   * the alternative is a mat that satisfies the minimum on average and not where the bars are.
   */
  governedBy: FootingAsGovernedBy | 'DISTRIBUTION';
}

export interface FootingSpacingLimits {
  /** §7.7.2.3 — min(3h, 300 mm), m. */
  generalMax: number;
  /** §24.3.2 via §7.7.2.2, m. */
  crackControlMax: number;
  /** The most restrictive applicable maximum, m. */
  governingMax: number;
  /** Clause number of whichever maximum governed. */
  governingMaxClause: string;
  /** §25.2.1 minimum clear distance, m. */
  minClear: number;
  /**
   * `c_c` used for §24.3.2, m — the CLEAR COVER.
   *
   * §24.3.2 measures it to the bar SURFACE and C 24.3.2 restricts it to the reinforcement
   * closest to the tension face, so this is `cover` and it does not depend on which direction
   * ends up in the lower layer.
   */
  clearCoverToTensionFace: number;
  refs: ClauseRef[];
}

export interface FootingDirectionDesign {
  axis: FootingMatAxis;
  /** Which footing dimension the bars of this direction run parallel to. */
  barsParallelTo: 'B' | 'L';
  /** The dimension they are distributed across, m. */
  distributionWidth: number;
  /**
   * Which of the two column faces governed, in centroid coordinates.
   *
   * Both are evaluated: a footing whose column is offset in plan has two unequal cantilevers,
   * and the longer one is not always the one under the heavier pressure. Null only when the
   * direction was not evaluated.
   */
  governingSide: 'low' | 'high' | null;
  /** Cantilever from the GOVERNING §13.2.7.1 critical section to its edge, m. */
  cantilever: number;
  /** Factored soil pressure at that critical section and at its edge, kPa. */
  qFace: number;
  qEdge: number;
  /** Factored moment at the critical section, kN·m. */
  Mu: number;
  diameterMm: number;
  /**
   * The effective depth this direction is DESIGNED at, m — its REAL one.
   *
   * Equal to `dIfLowerLayer` when this direction is the lower layer and to `dIfUpperLayer`
   * when it is the upper one. PR18-A used `dIfUpperLayer` for BOTH, because it established no
   * layer order and the shallower depth is the conservative envelope over the two
   * possibilities. Once the order is resolved that envelope is no longer the honest number for
   * the lower direction: it describes a bar sitting one diameter above where it is placed.
   */
  d: number;
  /** `h − cover − d_b/2`, m — this direction's depth if it is the LOWER layer. */
  dIfLowerLayer: number;
  /** `h − cover − d_b,other − d_b/2`, m — its depth if it is the UPPER layer. */
  dIfUpperLayer: number;
  /**
   * Where this direction physically sits, and therefore which `d` the design used.
   *
   * `ENVELOPE_UPPER_LAYER` survives for ONE case: no physical arrangement produced a
   * code-compliant layout, so no order could be established and the pre-resolution
   * conservative envelope is the only thing that can honestly be reported. It is a diagnostic,
   * not a design.
   */
  layerRole: 'LOWER_LAYER' | 'UPPER_LAYER' | 'ENVELOPE_UPPER_LAYER';
  /**
   * Steel stacked underneath this direction, mm — 0 for the lower layer, the other
   * direction's diameter for the upper one. The single quantity the two depths differ by.
   */
  barsBelowMm: number;
  /**
   * Elevation of this direction's bar CENTRELINE above the footing underside, m.
   *
   *     cover + barsBelow + d_b/2
   *
   * The lower layer rests on the cover, so its centre is at `cover + d_b/2`. The upper layer
   * rests on the crossing lower bars — `barsBelow` is a full lower-bar diameter, not half of
   * one, because the two mats are orthogonal and the upper bar bears on the TOP of the lower
   * one at every crossing.
   */
  centreElevation: number;
  /**
   * Clear distance from the bottom concrete face to this direction's bar SURFACE, m.
   *
   * `cover` for the lower layer, `cover + d_b,other` for the upper one. Cover is measured to
   * the bar surface and not to its centreline, which is the distinction that makes this
   * different from `centreElevation` by a half diameter rather than equal to it.
   */
  clearCoverToSoffit: number;
  /**
   * Whether the two mats may touch where they cross.
   *
   * They may. §25.2.1 sets a minimum clear distance between PARALLEL bars in a layer, and
   * §25.2.2 sets one between PARALLEL bars placed in two or more layers — beam tension steel
   * in two rows is the case it addresses. An orthogonal mat is neither: the upper bars cross
   * the lower ones rather than running beside or above them along their length, so no clear
   * distance is prescribed at the crossings and resting one mat directly on the other is the
   * ordinary placement. Recorded per direction so the constructibility pass can classify those
   * contacts as INTENTIONAL instead of reporting a mat against itself.
   */
  contactAtCrossingsPermitted: boolean;
  /** Steel required by flexural strength, m². */
  asFlexural: number;
  /** Steel required by §7.6.1 over the full distribution width, m². */
  asMinimum: number;
  asGoverning: number;
  governedBy: FootingAsGovernedBy;
  /** Clause that set `asGoverning`. */
  governingClause: string;
  spacing: FootingSpacingLimits;
  distribution: FootingDistribution;
  /** §13.3.3.3's β and γs. Null in the uniform case, where the clause does not apply. */
  beta: number | null;
  gammaS: number | null;
  regions: FootingMatRegion[];
  /** Total steel the layout provides across every region, m². */
  asProvided: number;
  barCount: number;
  /** §13.3.1.2 — false when the flexural effective depth is under 150 mm. */
  meetsMinimumDepth: boolean;
  /** Development length of the selected bar, m, when the caller supplied one. */
  developmentLength: number | null;
  status: FootingMatDirectionStatus;
  /** Why the direction is not DESIGNED. Empty when it is. */
  failures: EngineMessage[];
  /**
   * Observations that do NOT make the design non-compliant.
   *
   * Kept apart from `failures` because they are a different kind of statement: a region under
   * the Stabileo regional-minimum policy is code-compliant, and filing that next to a real
   * failure would train a reader to dismiss both.
   */
  advisories: EngineMessage[];
  steps: string[];
  refs: ClauseRef[];
}

/** PR18-A truthfully models no physical mat, and this type cannot say otherwise. */
export type FootingMatGeometryStatus = 'REQUIRED_NOT_MODELED';
/** No authoritative calculation shows top steel unnecessary, so it is not evaluated. */
export type FootingTopReinforcementStatus = 'NOT_EVALUATED';
/**
 * Whether a physical layer order was resolved.
 *
 * No clause prescribes the order — §13.2.8 and §25.4 govern anchorage, §13.3.3 governs
 * distribution, and neither says which perpendicular mat goes down — so it is a detailing
 * decision. PR18-A made none and reported NOT_ESTABLISHED honestly. It is now either the
 * engineer's stated override or the AUTO rule's deterministic selection, and it is
 * NOT_ESTABLISHED only when NEITHER physical arrangement can produce a code-compliant layout.
 */
export type FootingLayerOrderStatus = 'ESTABLISHED' | 'NOT_ESTABLISHED';

/** Why AUTO chose the arrangement it chose, or that the engineer chose it. */
export type FootingLayerOrderRationale =
  /** The engineer stated the order; AUTO was not consulted. */
  | 'MANUAL_OVERRIDE'
  /** Only one arrangement produced a code-compliant layout in both directions. */
  | 'ONLY_FEASIBLE_ARRANGEMENT'
  /** Both were feasible and this one needs less steel. */
  | 'LESS_PROVIDED_STEEL'
  /** Both feasible, equal steel; this one works its flexural steel less hard. */
  | 'LOWER_FLEXURAL_UTILIZATION'
  /** Both feasible, equal on both measures — X_BELOW_Y by rule, so the answer is stable. */
  | 'DETERMINISTIC_TIE_BREAK'
  /** Neither arrangement is code-compliant. No order is established. */
  | 'NO_FEASIBLE_ARRANGEMENT';

/** One arrangement's measures, as AUTO compared them. */
export interface FootingArrangementEvaluation {
  order: FootingBottomMatLayerOrder;
  /** True when BOTH directions reached DESIGNED. */
  feasible: boolean;
  /** Total provided bottom-mat steel mass, kg — the primary AUTO criterion. */
  providedSteelMassKg: number;
  /** Total provided steel volume, m³ — mass divided by the density, kept for audit. */
  providedSteelVolumeM3: number;
  /**
   * Worst `A_s,flexure / A_s,provided` over the two directions.
   *
   * A steel-area ratio, and named as one. It is not literally `M_u/φM_n`: obtaining that would
   * mean evaluating the rectangular stress block at THIS layout's provided area, and
   * `checkFlexure` reports φM_n at its own internal bar selection rather than at a caller's.
   * Writing the block out here would make this module a second flexural engine, which it
   * refuses to be for the design and must equally refuse to be for a tie-break. For an
   * under-reinforced section φM_n is very nearly linear in A_s, so the ratio tracks the
   * flexural utilisation closely — and it only ever decides anything when the masses tie.
   */
  worstFlexuralUtilization: number;
  /** Per-direction effective depths this arrangement produces, m. */
  dX: number;
  dY: number;
  /** Why it was rejected, when it was. */
  rejection: EngineMessage[];
}

export interface FootingLayerOrderResolution {
  status: FootingLayerOrderStatus;
  /** What the project asked for. */
  preference: FootingLayerOrderPreference;
  /** The order actually built at. Null only when none could be established. */
  resolved: FootingBottomMatLayerOrder | null;
  rationale: FootingLayerOrderRationale;
  /** Which direction is the lower layer, in words, for the UI and the certificate. */
  lowerLayerAxis: FootingMatAxis | null;
  /**
   * Both arrangements as AUTO evaluated them, in `X_BELOW_Y`, `Y_BELOW_X` order.
   *
   * Present even under a manual override, and that is the point: an engineer who fixes the
   * order can see what the other one would have cost. Empty only if the mat was never
   * evaluated at all.
   */
  evaluated: FootingArrangementEvaluation[];
  /** Human-readable reasoning, in the calculation-memo register. */
  steps: string[];
}
/**
 * Anchorage.
 *
 * `developmentLength` reports l_d for the selected bar from the authoritative clause module, and
 * that is a property of the bar. Whether the bar ACHIEVES it — the available length from the
 * §13.2.7.1 critical section, hooks, the §13.2.8.4 cases — is a question about geometry that
 * does not exist yet, so no anchorage verification is claimed at this stage.
 */
export type FootingAnchorageStatus = 'NOT_GEOMETRICALLY_VERIFIED';

export interface FootingMatDesign {
  x: FootingDirectionDesign;
  y: FootingDirectionDesign;
  /**
   * The depth the PUNCHING and one-way-shear checks use, m.
   *
   * Restated here on purpose. It is the AVERAGED two-layer mat depth `h − cover − d_b`, a
   * different convention from either flexural depth above, and that convention is deliberately
   * left alone. Putting the three numbers side by side is the only way a reader can see that
   * the difference is intentional rather than a disagreement.
   */
  punchingD: number;
  /**
   * DESIGNED only when BOTH directions are, and it means exactly one thing: the flexural
   * demand was evaluated and a reinforcement schedule satisfying every governing check was
   * found. It does NOT mean the anchorage was verified, the layer order was resolved, or any
   * physical clash was checked — those are the three statuses immediately below, and each says
   * so on its own.
   */
  status: FootingMatDirectionStatus;
  geometry: FootingMatGeometryStatus;
  topReinforcement: FootingTopReinforcementStatus;
  /** The resolved physical layer order, its rationale, and both arrangements as compared. */
  layerOrder: FootingLayerOrderResolution;
  anchorage: FootingAnchorageStatus;
  assumptions: EngineMessage[];
  failures: EngineMessage[];
  /** Policy observations from both directions. Compliant designs can carry these. */
  advisories: EngineMessage[];
  refs: ClauseRef[];
}

export interface FootingMatPreferencesInput {
  bottomMatDiameterXmm: number;
  bottomMatDiameterYmm: number;
  bottomMatSpacingPolicy: 'AUTO_CODE_COMPLIANT';
  /**
   * Which mat goes in the lower layer, or AUTO.
   *
   * Optional so that a caller written before the field existed keeps compiling; absent reads as
   * AUTO, which is the same migration the persisted preference makes.
   */
  bottomMatLayerOrder?: FootingLayerOrderPreference;
}

export interface FootingMatDesignInput {
  /** Plan dimensions, m. `B` is the X-bar direction, `L` the Y-bar direction. */
  B: number;
  L: number;
  /** Overall thickness, m, and clear cover to the bottom mat, m. */
  thickness: number;
  cover: number;
  /** Column plan dimensions, m — `columnB` along B, `columnH` along L. */
  columnB: number;
  columnH: number;
  /** Plan offset of the footing CENTROID from the column, m, in local axes. */
  eccentricityB: number;
  eccentricityL: number;
  fc: number;
  fy: number;
  /** Factored axial load, kN, and the factored moments of the governing combination. */
  factoredAxial: number;
  /** Moment producing eccentricity ALONG B, kN·m. Same convention as `FootingInput`. */
  factoredMomentB: number;
  factoredMomentL: number;
  maxAggregateSizeMm: number;
  edition: RegulationEdition;
  preferences: FootingMatPreferencesInput;
  /**
   * Development length per bar diameter, m, when the caller has the anchorage authority.
   *
   * Reported, never checked here. §13.2.8 sends anchorage to Chapter 25 and the length is a
   * property of the bar, but whether it FITS is a question about geometry PR18-A does not
   * model, and answering it from a length alone would be a claim about a bar that does not
   * exist.
   */
  developmentLengthFor?: (diameterMm: number) => number;
}

// ─── Geometry helpers ────────────────────────────────────────────

/** Nominal area of one bar, m². */
export function barArea(diameterMm: number): number {
  return Math.PI * (diameterMm / 2000) ** 2;
}

/**
 * Distinct clause references, by what they cite rather than by object identity.
 *
 * `crackControlMaxSpacing` and `minClearSpacingInLayer` build fresh `ClauseRef` objects on
 * every call, so both directions of a mat return §24.3.2 and §25.2.1 as different objects
 * citing the same clause. A `Set` of the objects would keep both and the record would list
 * §24.3.2 twice — the duplicate-reference defect `document-model` already has a test against.
 */
function distinctRefs(refs: readonly ClauseRef[]): ClauseRef[] {
  const seen = new Set<string>();
  const out: ClauseRef[] = [];
  for (const r of refs) {
    const key = `${r.regulation}/${r.edition}/${r.clause}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Flexural effective depth of one mat direction, m.
 *
 * ── Why the third argument exists ──────────────────────────────
 *
 * Two perpendicular mats cannot occupy one elevation. One direction sits on the cover and the
 * other sits ON TOP of it, so their effective depths differ by a full bar diameter and only
 * one of them is `h − cover − d_b/2`. `barsBelowMm` is the steel stacked underneath this
 * direction: zero for the lower layer, the other direction's diameter for the upper one.
 *
 * The first version of this module used the LOWER-layer depth for both directions while
 * simultaneously using the UPPER-layer cover for both crack-control checks. Each value was
 * defensible on its own and the combination described a footing that cannot be built: the
 * favourable depth of the bottom layer with the penalised cover of the layer above it.
 */
export function footingFlexuralDepth(
  thickness: number, cover: number, diameterMm: number, barsBelowMm = 0,
): number {
  return Math.max(0, thickness - cover - barsBelowMm / 1000 - diameterMm / 2000);
}

// ─── Layout ──────────────────────────────────────────────────────

type LayoutOutcome =
  | {
    ok: true; barCount: number; spacingCentre: number; spacingClear: number;
    asProvided: number;
    /** True when a bar was added to keep the region's centre line clear. See `layoutRegion`. */
    centreCleared: boolean;
    /** True when the centre line still carries a bar because no count could avoid it. */
    barOnCentre: boolean;
  }
  | { ok: false; reason: 'noPlaceableWidth' | 'minClear' | 'noMaxSpacing' };

/**
 * Does a uniform distribution of `n` bars put one ON the region's centre line?
 *
 * Both layout models are symmetric about the region centre, and both hit the centre for exactly
 * the same reason: an odd count has a middle bar and the middle bar is the centre.
 *
 *   EDGE_ANCHORED   bars at −span/2 + k·(span/(n−1)), k = 0…n−1 → centre at k = (n−1)/2
 *   TRIBUTARY_PITCH bars at −w/2 + (k+½)·(w/n),       k = 0…n−1 → centre at k = (n−1)/2
 *
 * so in both cases the centre is occupied iff `n` is odd.
 */
function barLandsOnRegionCentre(n: number): boolean {
  return n % 2 === 1;
}

/**
 * Choose an integer bar count for one region.
 *
 * Three requirements, in the order they bind:
 *
 *   1. the count must provide at least the required area — `ceil`, never `round`, because
 *      rounding the last bar away is a real shortfall dressed up as a tolerance;
 *   2. the resulting centre spacing must not exceed the governing maximum, which can force
 *      MORE bars than the area alone asks for and routinely does on a minimum-governed mat;
 *   3. the resulting clear spacing must not fall below §25.2.1, which caps the count from
 *      above. When the floor from (1) and (2) passes that cap there is no admissible layout
 *      at the selected diameter, and this returns a failure instead of quietly changing the
 *      diameter the engineer chose.
 *
 * ── And one coordination requirement: keep the centre line clear ────
 *
 * `avoidBarOnCentre` asks for a count that leaves the region's own centre line free of steel.
 * It is not an aesthetic preference and it is not the code speaking; it is a measured
 * constructibility constraint between this mat and the column above it.
 *
 * A column's certified eight-bar cage carries one longitudinal bar CENTRED on each face, so on
 * a concentric footing four starter dowels stand exactly on the two centre lines. A mat bar on
 * the same line sits directly beneath one of them, and it removes the only hook orientation
 * that dowel has: the leg that turns perpendicular to its own face is carried by the crossed
 * layer, must drop through the layer above, and finds that line already occupied — measured
 * interpenetration 16,00 mm, one full mat-bar diameter, axes coincident. What is left are the
 * along-face orientations, whose legs run 1,76 mm from the corner bars' line at the same
 * elevation, and those clash too.
 *
 * Measured on the production footing, 2,00 × 2,00 × 0,50 m with a 400 mm column carrying 8Ø20:
 *
 *   9 Ø16 per direction (odd)  → 0 feasible hook arrangements, exhaustive
 *   10 Ø16 per direction (even) → 496, every hook seated, 135,24 mm between hooks
 *   11 (odd) → 0     12 (even) → 496
 *
 * Parity is the whole of it. So an odd count gets ONE more bar, which costs steel the demand
 * did not ask for — 18,10 → 20,11 cm² on that footing — and buys a cage that can be built. The
 * extra bar is reported in the steps rather than folded into the area narrative, because a
 * reader comparing provided against required is owed the reason for the difference.
 *
 * When the §25.2.1 cap will not admit the extra bar the odd count STANDS. Nothing here silently
 * changes the diameter or drops below the clear-spacing minimum to satisfy a coordination rule,
 * and the consequence is not hidden either: the dowel cage measures the same conflict and
 * refuses to emit an unbuildable cage, naming the dowels involved.
 *
 * The rule keys on the REGION's centre, not on the column's axis, and those coincide only on a
 * concentric footing. On one with plan eccentricity the dowels do not stand on the centre line
 * and this buys nothing — the cage still measures the real geometry and still refuses when it
 * has to. A rule stated in terms this function can actually see is worth more than one that
 * pretends to a generality it does not have.
 */
function layoutRegion(opts: {
  width: number;
  model: FootingLayoutModel;
  asRequired: number;
  diameterMm: number;
  cover: number;
  maxSpacing: number;
  minClear: number;
  /** Keep the region's centre line free of steel when a count exists that does. */
  avoidBarOnCentre?: boolean;
}): LayoutOutcome {
  const db = opts.diameterMm / 1000;
  const area = barArea(opts.diameterMm);
  if (!(opts.maxSpacing > 0)) return { ok: false, reason: 'noMaxSpacing' };

  // Pitch a bar count implies, and the count a pitch implies — the two directions of the
  // same relation, which differ between the two layout models by exactly one gap.
  const edgeAnchored = opts.model === 'EDGE_ANCHORED';
  const span = edgeAnchored ? opts.width - 2 * opts.cover - db : opts.width;
  if (!(span > 0)) return { ok: false, reason: 'noPlaceableWidth' };
  const gaps = (n: number) => (edgeAnchored ? n - 1 : n);
  const spacingFor = (n: number) => span / gaps(n);

  // No tolerances anywhere in these three bounds. `ceil` on the area can only ever add a bar
  // the demand did not strictly need, and `floor` on the clear-spacing cap can only ever
  // remove one it did — both errors are in the safe direction, whereas an epsilon that
  // "rounds off" a shortfall is exactly the tolerance this design must not have.
  const nFloor = edgeAnchored ? 2 : 1;
  const nFromArea = Math.max(nFloor, Math.ceil(opts.asRequired / area));
  // Smallest count whose spacing is within the maximum.
  const nFromSpacing = Math.max(nFloor,
    (edgeAnchored ? 1 : 0) + Math.ceil(span / opts.maxSpacing));
  const required = Math.max(nFromArea, nFromSpacing);

  // Largest count the minimum clear distance still admits.
  const pitchFloor = opts.minClear + db;
  const nMax = edgeAnchored
    ? Math.floor(span / pitchFloor) + 1
    : Math.floor(span / pitchFloor);
  if (required > nMax) return { ok: false, reason: 'minClear' };

  // The coordination bump, LAST, so it can only ever add to a count the three code bounds have
  // already settled — and only when §25.2.1 still admits the extra bar.
  const wantsClearCentre = opts.avoidBarOnCentre === true
    && barLandsOnRegionCentre(required);
  const centreCleared = wantsClearCentre && required + 1 <= nMax;
  const n = centreCleared ? required + 1 : required;

  const spacingCentre = spacingFor(n);
  return {
    ok: true,
    barCount: n,
    spacingCentre,
    spacingClear: spacingCentre - db,
    asProvided: n * area,
    centreCleared,
    barOnCentre: barLandsOnRegionCentre(n),
  };
}

// ─── One direction ───────────────────────────────────────────────

interface DirectionGeometry {
  axis: FootingMatAxis;
  barsParallelTo: 'B' | 'L';
  /** Footing dimension the bars span, m — the pressure varies along this one. */
  spanDimension: number;
  /** Column dimension along `spanDimension`, m. */
  columnDimension: number;
  /** Footing dimension the bars are distributed across, m. */
  distributionWidth: number;
  /** Factored moment producing eccentricity along `spanDimension`, kN·m. */
  factoredMoment: number;
  /** Plan offset of the centroid from the column along the SPAN axis, m. */
  spanEccentricity: number;
  /** Plan offset of the centroid from the column along the DISTRIBUTION axis, m. */
  distributionEccentricity: number;
}

/** One candidate critical section: a column face, under one pressure diagram. */
interface FaceDemand {
  /** Which footing edge this cantilever reaches, in centroid coordinates. */
  side: 'low' | 'high';
  cantilever: number;
  qFace: number;
  qEdge: number;
  Mu: number;
  /** Offset of the pressure resultant from the footing centroid, m. */
  resultantOffset: number;
}

/**
 * The governing critical section on one axis.
 *
 * ── What this replaces, and why ────────────────────────────────
 *
 * The first version took ONE cantilever, `(S − columnDimension)/2`, which is the symmetric
 * value. `eccentricityB`/`eccentricityL` are not load eccentricities — `model/footing.ts`
 * defines them as the plan offset of the footing CENTROID from the supported node, and
 * `punchingPosition` already measures each column face to its own footing edge with them. So
 * the column really is off centre, the two cantilevers really are unequal, and the symmetric
 * value UNDER-states the longer one. A note about that is not good enough: it is the side that
 * governs.
 *
 * ── The envelope ───────────────────────────────────────────────
 *
 * Two things move independently, so both faces are evaluated under both:
 *
 *   * the GEOMETRIC offset of the column, whose direction is known;
 *   * the applied moment, whose sign is NOT usable here. The demand arrives as a reaction
 *     moment on global axes and the shared authority already discards its sign
 *     (`Math.abs`), because resolving a reaction-moment sign onto a footing-local axis is
 *     a separate piece of work this module must not guess at.
 *
 * So the moment is applied in both orientations and the worst of the four combinations
 * governs. That is sign-agnostic and cannot under-state the demand; the cost is that a footing
 * is occasionally designed for a diagram the real sign would not produce.
 *
 * The pressure is the same linear distribution the shared authority integrates,
 * `q(u) = q0 (1 + 12 u_R u / S²)`, written about the centroid so an off-centre resultant is
 * expressible at all. At `u = ±S/2` it reduces to `q0 (1 ± 6 e/S)` — the `1 ± k` form
 * `checkFooting` uses — so a centred column reproduces that result exactly.
 */
function governingFace(opts: {
  S: number;
  W: number;
  columnDimension: number;
  /** Column centre measured from the footing centroid along this axis, m. */
  columnOffset: number;
  q0: number;
  /** Load-eccentricity magnitude from the factored moment, m. */
  momentEccentricity: number;
}): {
  governing: FaceDemand | null;
  worstResultantOffset: number;
  kernLimit: number;
  /** True when EITHER orientation puts the resultant outside the kern. */
  anyOrientationLifts: boolean;
} {
  const { S, W, columnDimension, columnOffset, q0, momentEccentricity } = opts;
  const kernLimit = S / 6;
  let governing: FaceDemand | null = null;
  let worstResultantOffset = 0;
  let anyOrientationLifts = false;

  for (const orientation of MOMENT_ORIENTATIONS) {
    const uR = columnOffset + orientation * momentEccentricity;
    if (Math.abs(uR) > Math.abs(worstResultantOffset)) worstResultantOffset = uR;
    // Beyond the kern the base lifts and this distribution stops being valid. Recorded so the
    // caller can refuse: skipping this orientation and designing on the other one would be
    // picking the favourable moment sign by omission, which is the whole thing the sign-agnostic
    // envelope exists to avoid.
    if (Math.abs(uR) > kernLimit) {
      anyOrientationLifts = true;
      continue;
    }
    // The shared authority's field, not a local restatement of it: `foundation-check.ts`
    // integrates this same function, so the mat is reinforced for the pressure the footing
    // was checked against.
    const q = axisPressure(q0, S, uR);

    for (const side of ['low', 'high'] as const) {
      const faceU = side === 'low'
        ? columnOffset - columnDimension / 2
        : columnOffset + columnDimension / 2;
      const edgeU = side === 'low' ? -S / 2 : S / 2;
      const cantilever = side === 'low' ? faceU - edgeU : edgeU - faceU;
      if (!(cantilever > 0)) continue;
      const qFace = q(faceU);
      const qEdge = q(edgeU);
      // Exactly the trapezoid the shared authority integrates, on this side's own cantilever.
      const Mu = W * cantilever * cantilever * (2 * qFace + qEdge) / 6;
      if (governing === null || Mu > governing.Mu) {
        governing = { side, cantilever, qFace, qEdge, Mu, resultantOffset: uR };
      }
    }
  }
  return { governing, worstResultantOffset, kernLimit, anyOrientationLifts };
}

function designDirection(
  input: FootingMatDesignInput, geo: DirectionGeometry, diameterMm: number,
  layerRole: FootingDirectionDesign['layerRole'],
): FootingDirectionDesign {
  const steps: string[] = [];
  const failures: EngineMessage[] = [];
  const advisories: EngineMessage[] = [];
  const refs: ClauseRef[] = [R_TWO_WAY, R_MOMENT_PLANE, R_CRITICAL];

  const { thickness, cover, factoredAxial } = input;
  const W = geo.distributionWidth;
  const S = geo.spanDimension;
  const area = input.B * input.L;
  const qFactored = area > 0 ? factoredAxial / area : 0;

  // The column sits where the model puts it. `eccentricityB`/`eccentricityL` offset the footing
  // CENTROID from the supported node, so the column centre is at MINUS that offset in centroid
  // coordinates — the same reading `punchingPosition` already uses to measure each face to its
  // own edge.
  const columnOffset = columnOffsetFromCentroid(geo.spanEccentricity);
  const momentEcc = momentEccentricity(geo.factoredMoment, factoredAxial);
  const face = governingFace({
    S, W, columnDimension: geo.columnDimension, columnOffset,
    q0: qFactored, momentEccentricity: momentEcc,
  });

  const cantilever = face.governing?.cantilever ?? 0;
  const qFace = face.governing?.qFace ?? 0;
  const qEdge = face.governing?.qEdge ?? 0;
  const Mu = face.governing?.Mu ?? 0;

  // ── The two physical layers ──────────────────────────────────
  //
  // Perpendicular bars cannot share an elevation, so this direction is either the lower layer or
  // the upper one, and the two depths differ by a full bar diameter. Both are computed and
  // reported; the design uses the one belonging to the role this arrangement gives it.
  //
  // `ENVELOPE_UPPER_LAYER` is the pre-resolution diagnostic and takes the shallower depth for
  // both directions. It is reached only when no arrangement is code-compliant, in which case
  // there is no order to design at and the conservative envelope is the honest report.
  const otherDiameterMm = geo.axis === 'X'
    ? input.preferences.bottomMatDiameterYmm
    : input.preferences.bottomMatDiameterXmm;
  const dIfLowerLayer = footingFlexuralDepth(thickness, cover, diameterMm, 0);
  const dIfUpperLayer = footingFlexuralDepth(thickness, cover, diameterMm, otherDiameterMm);
  const barsBelowMm = layerRole === 'LOWER_LAYER' ? 0 : otherDiameterMm;
  const d = layerRole === 'LOWER_LAYER' ? dIfLowerLayer : dIfUpperLayer;
  // Cover is measured to the bar SURFACE, so the centre sits a half diameter above the steel
  // stacked beneath it and the clear cover to the soffit does not include that half diameter.
  const centreElevation = cover + barsBelowMm / 1000 + diameterMm / 2000;
  const clearCoverToSoffit = cover + barsBelowMm / 1000;

  steps.push(
    `Dirección ${geo.axis}: barras paralelas a ${geo.barsParallelTo}, repartidas en ` +
    `${W.toFixed(2)} m sobre una luz de ${S.toFixed(2)} m.`,
    `Columna a ${columnOffset.toFixed(3)} m del centroide: voladizos ` +
    `${(S / 2 + columnOffset - geo.columnDimension / 2).toFixed(3)} y ` +
    `${(S / 2 - columnOffset - geo.columnDimension / 2).toFixed(3)} m. ` +
    `Gobierna el lado ${face.governing?.side ?? '—'} con ${cantilever.toFixed(3)} m ` +
    '(13.2.7.1).',
    `Presión factorizada ${qFactored.toFixed(1)} kPa; resultante a ` +
    `${(face.governing?.resultantOffset ?? 0).toFixed(3)} m del centroide ` +
    `(excentricidad de momento ${momentEcc.toFixed(3)} m, envolvente de ambos ` +
    `signos): q_cara ${qFace.toFixed(1)}, q_borde ${qEdge.toFixed(1)} kPa.`,
    `Mu = ${W.toFixed(2)} × ${cantilever.toFixed(3)}² × (2×${qFace.toFixed(1)} + ` +
    `${qEdge.toFixed(1)})/6 = ${Mu.toFixed(1)} kN·m (13.2.6.6).`,
    `Altura útil: capa inferior daría ${dIfLowerLayer.toFixed(4)} m, capa superior ` +
    `${dIfUpperLayer.toFixed(4)} m (Ø${otherDiameterMm} debajo). ` +
    (layerRole === 'ENVELOPE_UPPER_LAYER'
      ? `No se pudo establecer el orden de capas: se dimensiona con ${d.toFixed(4)} m — la ` +
        'envolvente conservadora.'
      : `Esta dirección va en la capa ${layerRole === 'LOWER_LAYER' ? 'INFERIOR' : 'SUPERIOR'}` +
        `, de modo que se dimensiona con su altura real ${d.toFixed(4)} m.`),
    `Posición física: eje de barra a ${(centreElevation * 1000).toFixed(1)} mm sobre la cara ` +
    `inferior (recubrimiento ${(cover * 1000).toFixed(0)} mm + ${barsBelowMm} mm de barras ` +
    `debajo + Ø${diameterMm}/2); recubrimiento libre a la cara inferior ` +
    `${(clearCoverToSoffit * 1000).toFixed(1)} mm, medido a la SUPERFICIE de la barra. ` +
    'El contacto directo en los cruces ortogonales está permitido: 25.2.1 y 25.2.2 fijan ' +
    'distancias libres entre barras PARALELAS —de una capa y entre capas paralelas—, y una ' +
    'parrilla ortogonal no es ninguno de los dos casos.');

  // ── Contact validity ─────────────────────────────────────────
  //
  // Beyond the kern the base lifts and the linear distribution stops being valid. Designing
  // through it would reinforce for a pressure diagram the soil is not delivering, and the
  // linear q under-states the real peak — the wrong direction to be wrong in. Same refusal
  // `checkBearing` and `checkFooting` already make, restated here so this module is safe to
  // call on its own.
  const notEvaluated = (m: EngineMessage): FootingDirectionDesign => ({
    axis: geo.axis, barsParallelTo: geo.barsParallelTo, distributionWidth: W,
    governingSide: face.governing?.side ?? null,
    cantilever, qFace, qEdge, Mu, diameterMm,
    d, dIfLowerLayer, dIfUpperLayer, layerRole, barsBelowMm,
    centreElevation, clearCoverToSoffit, contactAtCrossingsPermitted: true,
    asFlexural: 0, asMinimum: 0, asGoverning: 0,
    governedBy: 'MINIMUM', governingClause: R_AS_MIN.clause,
    spacing: {
      generalMax: 0, crackControlMax: 0, governingMax: 0, governingMaxClause: R_MAX_SPACING.clause,
      minClear: 0, clearCoverToTensionFace: cover, refs: [],
    },
    distribution: 'UNIFORM_FULL_WIDTH', beta: null, gammaS: null,
    regions: [], asProvided: 0, barCount: 0,
    meetsMinimumDepth: d >= MIN_BOTTOM_MAT_DEPTH_M,
    developmentLength: null,
    status: 'NOT_EVALUATED', failures: [m], advisories: [], steps, refs,
  });

  // The envelope refuses if EITHER moment orientation lifts the base. The sign of the applied
  // moment is not usable here, so a footing that lifts under one of the two possible diagrams
  // is not designed under the other: that would be choosing the favourable sign by omission.
  if (face.anyOrientationLifts || face.governing === null) {
    return notEvaluated(msg('footing.mat.upliftNotEvaluated', {
      axis: geo.axis,
      e: +Math.abs(face.worstResultantOffset).toFixed(3),
      limit: +face.kernLimit.toFixed(3),
    }));
  }
  if (!(W > 0) || !(cantilever > 0) || !(qFactored > 0)) {
    return notEvaluated(msg('footing.mat.geometryNotEvaluated', { axis: geo.axis }));
  }

  // ── Steel required by flexural strength ──────────────────────
  //
  // The rectangular stress block comes from `checkFlexure`, which is the project's flexural
  // authority, driven with the mat strip as its section: b = the distribution width, h = the
  // footing thickness, no stirrup, and the diameter the engineer selected — so its internal
  // `d` is this direction's flexural depth and not the assumed Ø16 one.
  //
  // `stirrupDia` carries the steel stacked BENEATH this direction — zero in the lower layer,
  // the other direction's diameter in the upper one. `checkFlexure` computes its own depth as
  // `h − cover − stirrupDia/1000 − d_b/2000`, and in a footing the steel sitting between the
  // cover and this bar is the perpendicular mat, playing exactly the role a stirrup plays in a
  // beam. Passing `barsBelowMm` makes the depth `checkFlexure` DESIGNS at identical to `d`
  // above — which is now the direction's REAL depth rather than the envelope for both.
  //
  // Getting this wrong is not cosmetic and it is not hypothetical: an earlier revision of this
  // module reported the upper-layer `d` while leaving `stirrupDia: 0`, so the reported depth and
  // the designed depth differed by a bar diameter and the steel was under-computed. The φMn
  // closure in `footing-flexure.test.ts` is what caught it — a test that had recomputed the
  // module's own quadratic would have agreed with the mistake.
  // Sized by CIRSOC 201-2025 (`CIRSOC201_DESIGN_EDITION`): a footing is a slab here (13.3.3.1 →
  // Chapters 7 and 8), and 8.3.3.1 requires it tension-controlled, εt ≥ εty + 0,003.
  const flex = checkFlexure(
    { fc: input.fc, fy: input.fy, cover, b: W, h: thickness, stirrupDia: barsBelowMm },
    Mu, 0, { barDiameterMm: diameterMm, edition: CIRSOC201_DESIGN_EDITION },
  );
  // The two must agree by construction. If a future edit to either expression breaks that, this
  // throws in development instead of silently designing at a depth nobody reported.
  if (Math.abs(flex.d - d) > 1e-9) {
    throw new Error(
      `footing mat: designed depth ${flex.d} disagrees with reported depth ${d}`);
  }
  const asFlexural = Math.max(0, flex.AsFlexural) * 1e-4;   // cm² → m²

  // A footing mat is singly reinforced. Compression steel in a pad footing means the section
  // is too thin, and the answer is a thicker footing rather than a top mat resisting a
  // cantilever moment — so this is reported rather than designed around.
  if (flex.isDoublyReinforced) {
    failures.push(msg('footing.mat.needsCompressionSteel', {
      axis: geo.axis, Mu: +Mu.toFixed(1), thickness: +thickness.toFixed(3),
    }));
  }

  // ── Steel required by the minimum ────────────────────────────
  //
  // §7.6.1's own clause, on the gross area of the strip: A_g = distribution width × h.
  // NOT `checkFlexure().AsMin`, which is the beam rule on b·d and answers to §9.6.1.2.
  const asMinimum = FOOTING_AS_MIN_RATIO * W * thickness;
  const governedBy: FootingAsGovernedBy = asFlexural > asMinimum ? 'FLEXURE' : 'MINIMUM';
  const asGoverning = Math.max(asFlexural, asMinimum);
  const governingClause = governedBy === 'FLEXURE' ? R_STRENGTH.clause : R_AS_MIN.clause;
  refs.push(R_STRENGTH, R_AS_MIN, R_AS_MIN_TWO_WAY);
  steps.push(
    `As por resistencia a flexión = ${(asFlexural * 1e4).toFixed(2)} cm²; ` +
    `As mínima 0,0018·Ag = 0,0018 × ${W.toFixed(2)} × ${thickness.toFixed(3)} = ` +
    `${(asMinimum * 1e4).toFixed(2)} cm² (7.6.1). Gobierna ` +
    `${governedBy === 'FLEXURE' ? 'la flexión' : 'la armadura mínima'}: ` +
    `${(asGoverning * 1e4).toFixed(2)} cm².`);

  // ── §13.3.1.2 ────────────────────────────────────────────────
  const meetsMinimumDepth = d >= MIN_BOTTOM_MAT_DEPTH_M;
  refs.push(R_MIN_DEPTH);
  if (!meetsMinimumDepth) {
    failures.push(msg('footing.mat.depthBelowMinimum', {
      axis: geo.axis, d: +d.toFixed(4), min: MIN_BOTTOM_MAT_DEPTH_M,
    }));
  }

  // ── Spacing limits ───────────────────────────────────────────
  const generalMax = Math.min(3 * thickness, MAX_SPACING_CAP_M);
  /**
   * `c_c` for §24.3.2 is the CLEAR COVER, and it is order-independent.
   *
   * The enacted clause defines it as "la menor distancia desde la SUPERFICIE de la armadura
   * conformada […] a la cara traccionada", and C 24.3.2 narrows what it applies to: "solamente
   * la armadura de tracción más cercana a la cara traccionada necesita ser considerada para
   * seleccionar el valor de cc". §7.7.2.2 routes the same way — "la armadura adherente más
   * cercana a la cara en tracción".
   *
   * So the clause targets the LOWER layer, whose bar surface sits exactly one clear cover from
   * the tension face. Whichever of the two directions ends up lower, that number is the same
   * `cover`, which is why this needs no layer order.
   *
   * The first version used `cover + d_b,other` here — the upper layer's distance. That is not
   * the cc §24.3.2 defines for the bar it limits, and it happened to be MORE restrictive
   * (215 mm against 255 mm on the reference footing), so the error was conservative rather
   * than unsafe. It was still the wrong number attributed to the clause.
   *
   * The resulting limit is applied to BOTH directions. The lower layer must satisfy it and this
   * stage does not know which direction that is; imposing it on the upper layer as well is an
   * extra requirement the clause does not make of it, in the safe direction.
   */
  const clearCoverToTensionFace = cover;
  const crack = crackControlMaxSpacing(input.edition, {
    fy: input.fy, clearCoverToTensionFace,
  });
  const clear = minClearSpacingInLayer(input.edition, {
    barDiameterMm: diameterMm, maxAggregateSizeMm: input.maxAggregateSizeMm,
  });
  const governingMax = Math.min(generalMax, crack.maxSpacing);
  const spacing: FootingSpacingLimits = {
    generalMax,
    crackControlMax: crack.maxSpacing,
    governingMax,
    governingMaxClause: crack.maxSpacing < generalMax ? '24.3.2' : R_MAX_SPACING.clause,
    minClear: clear.minClear,
    clearCoverToTensionFace,
    refs: [R_MAX_SPACING, R_CRACK_ROUTE, ...crack.refs, R_MIN_SPACING, ...clear.refs],
  };
  refs.push(...spacing.refs);
  steps.push(
    `Separación máxima: 7.7.2.3 → menor entre 3h = ${(3 * thickness * 1000).toFixed(0)} mm y ` +
    `300 mm = ${(generalMax * 1000).toFixed(0)} mm; 24.3.2 con cc = recubrimiento libre ` +
    `${(clearCoverToTensionFace * 1000).toFixed(0)} mm (capa más cercana a la cara ` +
    `traccionada) y fs = ${crack.fs.toFixed(0)} MPa → ` +
    `${(crack.maxSpacing * 1000).toFixed(0)} mm. Gobierna ` +
    `${(governingMax * 1000).toFixed(0)} mm (${spacing.governingMaxClause}).`,
    `Separación libre mínima (25.2.1) = ${(clear.minClear * 1000).toFixed(1)} mm.`);

  // ── Distribution and layout ──────────────────────────────────
  const shortSide = Math.min(input.B, input.L);
  const longSide = Math.max(input.B, input.L);
  // The short-DIRECTION reinforcement is the one whose bars run parallel to the short side,
  // and it is the one §13.3.3.3(b) bands. Its bars are therefore distributed across the LONG
  // side, which is why the band width (the short side) always fits inside the width.
  const isShortDirection = longSide > shortSide && geo.spanDimension === shortSide;
  const distribution: FootingDistribution = isShortDirection
    ? 'BANDED_SHORT_DIRECTION'
    : 'UNIFORM_FULL_WIDTH';

  const beta = isShortDirection ? longSide / shortSide : null;
  const gammaS = beta === null ? null : 2 / (beta + 1);
  refs.push(isShortDirection ? R_RECTANGULAR : R_SQUARE);

  const regions: FootingMatRegion[] = [];
  const addRegion = (
    kind: FootingRegionKind, model: FootingLayoutModel, width: number, centreOffset: number,
    touchesEdge: boolean, share: number, shareGovernedBy: FootingAsGovernedBy | 'DISTRIBUTION',
    /** See `layoutRegion`: keep the starter dowels' centre line free of mat steel. */
    avoidBarOnCentre = false,
  ): void => {
    if (!(width > 1e-9)) return;
    /**
     * The region gets what the CODE allocates to it, and nothing added on top.
     *
     * The first version took `max(share, 0,0018·A_g,region)` and reported the floor as §7.6.1.
     * That floor is not in the enacted text. §7.6.1 states one requirement — "debe colocarse un
     * área mínima de armadura a flexión, As,min, de 0,0018 Ag" — on the reinforcement of the
     * direction, and §13.3.3.3 then prescribes how "la armadura total" is distributed, with
     * no regional minimum anywhere in either clause or in C 13.3.3.3. Applying 0,0018 A_g again
     * per region is a Stabileo conservative preference, and presenting it as the code's
     * requirement is exactly the kind of claim this module exists not to make.
     *
     * So AUTO_CODE_COMPLIANT follows the code: total minimum, then the γs distribution. The
     * policy value is still COMPUTED and reported, as an advisory identified as policy, because
     * a detailer may well want it — but it does not silently become the delivered design.
     */
    const asRequired = share;
    const policyRegionalMinimum = FOOTING_AS_MIN_RATIO * width * thickness;
    const laid = layoutRegion({
      width, model, asRequired, diameterMm, cover,
      maxSpacing: governingMax, minClear: clear.minClear,
      avoidBarOnCentre,
    });
    if (!laid.ok) {
      failures.push(msg('footing.mat.noFeasibleLayout', {
        axis: geo.axis, diameter: diameterMm, region: kind,
        width: +width.toFixed(3), reason: laid.reason,
      }));
      return;
    }
    // Reported against what the layout actually PROVIDES, not against the requirement: the
    // integer bar count routinely clears a floor the share alone would not, and an advisory
    // about steel that is already there would be noise.
    // The coordination bump, stated where the count is stated. A reader comparing 20,11 cm²
    // provided against 18,00 required is owed the reason, and "one extra bar so the starter
    // hooks have somewhere to turn" is the reason.
    if (laid.centreCleared) {
      steps.push(
        `${kind} (${geo.axis}): ${laid.barCount} barras en lugar de ${laid.barCount - 1} para ` +
        'dejar libre el eje de la región. Una barra sobre el eje queda justo debajo de la ' +
        'espera centrada en la cara de la columna y le anula la única orientación de gancho ' +
        'disponible; con el conteo par la jaula de esperas se puede construir.');
    } else if (laid.barOnCentre && avoidBarOnCentre) {
      steps.push(
        `${kind} (${geo.axis}): el eje de la región queda con una barra (${laid.barCount} ` +
        'barras) porque la separación libre mínima del artículo 25.2.1 no admite una más. No se ' +
        'reduce el diámetro ni la separación para evitarlo: si eso impide construir la jaula de ' +
        'esperas, la jaula lo mide y lo informa.');
    }
    if (laid.asProvided < policyRegionalMinimum) {
      advisories.push(msg('footing.mat.regionBelowPolicyMinimum', {
        axis: geo.axis, region: kind,
        provided: +(laid.asProvided * 1e4).toFixed(2),
        policy: +(policyRegionalMinimum * 1e4).toFixed(2),
      }));
    }
    regions.push({
      kind, layoutModel: model, width, centreOffset, touchesEdge,
      distributionShare: share,
      asRequired, policyRegionalMinimum,
      asProvided: laid.asProvided, barCount: laid.barCount,
      spacingCentre: laid.spacingCentre, spacingClear: laid.spacingClear,
      governedBy: shareGovernedBy,
    });
  };

  if (!isShortDirection) {
    // §13.3.3.2, and §13.3.3.3(a) for the long direction of a rectangular footing: uniform
    // across the FULL width. One region, edge to edge.
    addRegion('FULL_WIDTH', 'EDGE_ANCHORED', W, 0, true, asGoverning, governedBy, true);
    steps.push(
      `Distribución uniforme en todo el ancho ` +
      `(${input.B === input.L ? '13.3.3.2' : '13.3.3.3 (a)'}).`);
  } else {
    // §13.3.3.3(b). The band is as wide as the SHORT side and centred on the COLUMN axis, not
    // on the footing centroid — which are different points on a footing with plan
    // eccentricity, and make the two outside zones unequal.
    const bandWidth = shortSide;
    const columnOffset = columnOffsetFromCentroid(geo.distributionEccentricity);
    const lowerWidth = W / 2 + columnOffset - bandWidth / 2;
    const upperWidth = W / 2 - columnOffset - bandWidth / 2;
    const outsideWidth = lowerWidth + upperWidth;

    if (lowerWidth < -1e-9 || upperWidth < -1e-9) {
      // The prescribed band does not fit inside the footing. Clipping it would be inventing a
      // rule §13.3.3.3 does not state, and spreading the steel uniformly instead would drop
      // the band the clause requires.
      failures.push(msg('footing.mat.bandOutsideFooting', {
        axis: geo.axis, band: +bandWidth.toFixed(3), width: +W.toFixed(3),
        offset: +columnOffset.toFixed(3),
      }));
    } else {
      const g = gammaS as number;
      // The band is centred on the COLUMN axis, which is exactly where the face-centred
      // starters stand, so this is the region the rule was written for.
      addRegion('CENTRAL_BAND', 'TRIBUTARY_PITCH', bandWidth, columnOffset, false,
        g * asGoverning, 'DISTRIBUTION', true);
      // The remainder is uniform over the outside ZONES taken together, so each zone carries
      // it in proportion to its own width. On a centred footing the two are equal; on an
      // eccentric one they are not, and splitting the remainder in half would put the wrong
      // amount on the narrow side.
      for (const [kind, width, centre] of [
        ['OUTSIDE_BAND', lowerWidth, -W / 2 + lowerWidth / 2],
        ['OUTSIDE_BAND', upperWidth, W / 2 - upperWidth / 2],
      ] as Array<[FootingRegionKind, number, number]>) {
        const share = outsideWidth > 1e-9
          ? (1 - g) * asGoverning * (width / outsideWidth)
          : 0;
        addRegion(kind, 'TRIBUTARY_PITCH', width, centre, true, share, 'DISTRIBUTION');
      }
      steps.push(
        `Base rectangular, β = ${longSide.toFixed(2)}/${shortSide.toFixed(2)} = ` +
        `${(beta as number).toFixed(3)} → γs = 2/(β+1) = ${g.toFixed(4)} (13.3.3.3). ` +
        `Faja central de ${bandWidth.toFixed(2)} m centrada en el eje de la columna con ` +
        `${(g * asGoverning * 1e4).toFixed(2)} cm²; fuera de la faja ` +
        `${((1 - g) * asGoverning * 1e4).toFixed(2)} cm² en ${outsideWidth.toFixed(2)} m.`);
    }
  }

  const asProvided = regions.reduce((s, r) => s + r.asProvided, 0);
  const barCount = regions.reduce((s, r) => s + r.barCount, 0);
  for (const r of regions) {
    steps.push(
      `${r.kind}: ${r.barCount} Ø${diameterMm} en ${r.width.toFixed(2)} m, ` +
      `c/${(r.spacingCentre * 1000).toFixed(0)} mm (libre ` +
      `${(r.spacingClear * 1000).toFixed(0)} mm), As = ${(r.asProvided * 1e4).toFixed(2)} ` +
      `contra ${(r.asRequired * 1e4).toFixed(2)} cm² requeridos.`);
  }

  const development = input.developmentLengthFor
    ? input.developmentLengthFor(diameterMm)
    : null;
  if (development !== null) {
    refs.push(R_ANCHORAGE);
    steps.push(
      `Anclaje (13.2.8.1 → Cap. 25): ld = ${development.toFixed(3)} m para Ø${diameterMm}. ` +
      'La geometría física de la barra no está modelada en esta etapa, por lo que no se ' +
      'emite verificación de anclaje.');
  }

  return {
    axis: geo.axis, barsParallelTo: geo.barsParallelTo, distributionWidth: W,
    governingSide: face.governing.side,
    cantilever, qFace, qEdge, Mu, diameterMm,
    d, dIfLowerLayer, dIfUpperLayer, layerRole, barsBelowMm,
    centreElevation, clearCoverToSoffit, contactAtCrossingsPermitted: true,
    asFlexural, asMinimum, asGoverning, governedBy, governingClause,
    spacing, distribution, beta, gammaS, regions, asProvided, barCount,
    meetsMinimumDepth,
    developmentLength: development,
    // A direction with no region is a direction with no layout — `addRegion` records the
    // failure and returns, so an empty region list cannot read as DESIGNED.
    status: failures.length > 0 || regions.length === 0 ? 'DESIGN_FAILED' : 'DESIGNED',
    failures, advisories, steps, refs,
  };
}

// ─── The mat ─────────────────────────────────────────────────────

/**
 * Length of one straight mat bar, m.
 *
 * The bar runs the full span less one cover at EACH end, because §20.5.1's cover is measured
 * from the concrete face to the bar SURFACE and a straight bar end is a surface. Defined here,
 * once, so the AUTO steel comparison and the physical bar generator cannot disagree about how
 * long a bar is.
 */
export function matBarLength(spanDimension: number, cover: number): number {
  return Math.max(0, spanDimension - 2 * cover);
}

/** Total provided steel of one direction, as a volume (m³) and a mass (kg). */
function directionSteel(
  dir: FootingDirectionDesign, spanDimension: number, cover: number,
): { volumeM3: number; massKg: number } {
  const length = matBarLength(spanDimension, cover);
  // `barMass` is the project's one mass authority (density 7850 kg/m³); the volume is recovered
  // from it rather than computed from a second area expression.
  const massKg = dir.barCount * barMass(length, dir.diameterMm);
  return { volumeM3: massKg / 7850, massKg };
}

/** The two physical arrangements, in the order AUTO evaluates and reports them. */
const ARRANGEMENTS: readonly FootingBottomMatLayerOrder[] = ['X_BELOW_Y', 'Y_BELOW_X'];

/** Relative tolerance for calling two steel quantities equal. */
const STEEL_EQUAL_REL_TOL = 1e-9;

interface Arrangement {
  order: FootingBottomMatLayerOrder;
  x: FootingDirectionDesign;
  y: FootingDirectionDesign;
  evaluation: FootingArrangementEvaluation;
}

function buildArrangement(
  input: FootingMatDesignInput, order: FootingBottomMatLayerOrder,
): Arrangement {
  const dX = input.preferences.bottomMatDiameterXmm;
  const dY = input.preferences.bottomMatDiameterYmm;
  const xRole = order === 'X_BELOW_Y' ? 'LOWER_LAYER' : 'UPPER_LAYER';
  const yRole = order === 'X_BELOW_Y' ? 'UPPER_LAYER' : 'LOWER_LAYER';

  const x = designDirection(input, {
    axis: 'X', barsParallelTo: 'B',
    spanDimension: input.B, columnDimension: input.columnB,
    distributionWidth: input.L,
    factoredMoment: input.factoredMomentB,
    spanEccentricity: input.eccentricityB,
    distributionEccentricity: input.eccentricityL,
  }, dX, xRole);

  const y = designDirection(input, {
    axis: 'Y', barsParallelTo: 'L',
    spanDimension: input.L, columnDimension: input.columnH,
    distributionWidth: input.B,
    factoredMoment: input.factoredMomentL,
    spanEccentricity: input.eccentricityL,
    distributionEccentricity: input.eccentricityB,
  }, dY, yRole);

  const sx = directionSteel(x, input.B, input.cover);
  const sy = directionSteel(y, input.L, input.cover);
  const util = (dir: FootingDirectionDesign) =>
    dir.asProvided > 0 ? dir.asFlexural / dir.asProvided : Infinity;

  return {
    order, x, y,
    evaluation: {
      order,
      feasible: x.status === 'DESIGNED' && y.status === 'DESIGNED',
      providedSteelMassKg: sx.massKg + sy.massKg,
      providedSteelVolumeM3: sx.volumeM3 + sy.volumeM3,
      worstFlexuralUtilization: Math.max(util(x), util(y)),
      dX: x.d, dY: y.d,
      rejection: [...x.failures, ...y.failures],
    },
  };
}

/**
 * Select the physical layer order.
 *
 * ── Why AUTO evaluates rather than reasons ─────────────────────
 *
 * "Put the direction with the larger moment lower" is the rule of thumb, and it is not reliable
 * here. The deeper layer is worth a full bar diameter of `d`, which matters most where the steel
 * is FLEXURE-governed; but a mat direction is frequently MINIMUM-governed (§7.6.1's 0,0018 A_g
 * does not depend on `d` at all), and then the extra depth buys nothing while the other
 * direction's loss costs real steel. Whether the swap helps also depends on the two diameters,
 * on which direction §13.3.3.3 bands, and on the integer bar counts — the layout rounds up, so
 * a small change in required area can move a whole bar. So AUTO designs BOTH arrangements
 * completely and compares the results, which is the only way the answer is right for the reasons
 * it claims.
 *
 * ── The stated rule, in order ─────────────────────────────────
 *
 *   1. reject an arrangement that cannot produce a code-compliant layout in both directions;
 *   2. prefer the smaller total provided steel mass;
 *   3. on a tie, prefer the smaller worst flexural steel utilisation — more margin;
 *   4. still tied, `X_BELOW_Y`, so the answer is stable across runs and machines.
 *
 * Step 4 is reached by a square footing with equal diameters and equal moments, where the two
 * arrangements are genuinely indistinguishable. It exists so that case has ONE answer rather
 * than one that depends on comparison order.
 */
function resolveLayerOrder(
  preference: FootingLayerOrderPreference, arrangements: readonly Arrangement[],
): { resolution: FootingLayerOrderResolution; chosen: Arrangement } {
  const evaluated = arrangements.map((a) => a.evaluation);
  const byOrder = (o: FootingBottomMatLayerOrder) =>
    arrangements.find((a) => a.order === o) as Arrangement;
  const lowerAxis = (o: FootingBottomMatLayerOrder): FootingMatAxis =>
    o === 'X_BELOW_Y' ? 'X' : 'Y';

  // ── Manual override ────────────────────────────────────────
  if (preference !== 'AUTO') {
    const chosen = byOrder(preference);
    const other = byOrder(preference === 'X_BELOW_Y' ? 'Y_BELOW_X' : 'X_BELOW_Y');
    return {
      chosen,
      resolution: {
        status: 'ESTABLISHED',
        preference,
        resolved: preference,
        rationale: 'MANUAL_OVERRIDE',
        lowerLayerAxis: lowerAxis(preference),
        evaluated,
        steps: [
          `Orden de capas fijado a mano: ${preference} — la parrilla ` +
          `${lowerAxis(preference)} va en la capa inferior. No se aplicó la regla automática.`,
          `Alturas útiles resultantes: dX = ${chosen.x.d.toFixed(4)} m, ` +
          `dY = ${chosen.y.d.toFixed(4)} m.`,
          `Con el otro orden (${other.order}) serían dX = ${other.evaluation.dX.toFixed(4)} m, ` +
          `dY = ${other.evaluation.dY.toFixed(4)} m y ` +
          `${other.evaluation.feasible
            ? `${other.evaluation.providedSteelMassKg.toFixed(1)} kg de acero contra ` +
              `${chosen.evaluation.providedSteelMassKg.toFixed(1)} kg`
            : 'no habría disposición admisible'}.`,
        ],
      },
    };
  }

  // ── Step 1: feasibility ────────────────────────────────────
  const feasible = arrangements.filter((a) => a.evaluation.feasible);
  const steps: string[] = [
    'Orden de capas AUTOMÁTICO: se dimensionan las DOS disposiciones físicas completas, con la ' +
    'altura útil real de cada dirección en cada una, y se comparan los resultados.',
    ...arrangements.map((a) =>
      `${a.order}: dX = ${a.evaluation.dX.toFixed(4)} m, dY = ${a.evaluation.dY.toFixed(4)} m, ` +
      (a.evaluation.feasible
        ? `${a.x.barCount} Ø${a.x.diameterMm} + ${a.y.barCount} Ø${a.y.diameterMm} = ` +
          `${a.evaluation.providedSteelMassKg.toFixed(1)} kg, utilización a flexión ` +
          `${a.evaluation.worstFlexuralUtilization.toFixed(3)}.`
        : 'RECHAZADA — no produce una disposición reglamentaria en ambas direcciones.')),
  ];

  if (feasible.length === 0) {
    // No order can be established. The reported design falls back to the pre-resolution
    // envelope, which is built by the caller, and the status says NOT_ESTABLISHED.
    return {
      chosen: byOrder('X_BELOW_Y'),
      resolution: {
        status: 'NOT_ESTABLISHED',
        preference, resolved: null,
        rationale: 'NO_FEASIBLE_ARRANGEMENT',
        lowerLayerAxis: null,
        evaluated,
        steps: [...steps,
          'Ninguna de las dos disposiciones es reglamentaria, de modo que no se establece un ' +
          'orden de capas y no se emite una parrilla física.'],
      },
    };
  }

  if (feasible.length === 1) {
    const chosen = feasible[0];
    return {
      chosen,
      resolution: {
        status: 'ESTABLISHED',
        preference, resolved: chosen.order,
        rationale: 'ONLY_FEASIBLE_ARRANGEMENT',
        lowerLayerAxis: lowerAxis(chosen.order),
        evaluated,
        steps: [...steps,
          `Se adopta ${chosen.order}: es la única disposición que produce una disposición ` +
          'reglamentaria en ambas direcciones.'],
      },
    };
  }

  // ── Steps 2–4: both feasible ───────────────────────────────
  const [a, b] = ARRANGEMENTS.map(byOrder);
  const mA = a.evaluation.providedSteelMassKg;
  const mB = b.evaluation.providedSteelMassKg;
  const scale = Math.max(Math.abs(mA), Math.abs(mB), 1e-12);
  const massEqual = Math.abs(mA - mB) <= STEEL_EQUAL_REL_TOL * scale;

  if (!massEqual) {
    const chosen = mA < mB ? a : b;
    const other = mA < mB ? b : a;
    return {
      chosen,
      resolution: {
        status: 'ESTABLISHED',
        preference, resolved: chosen.order,
        rationale: 'LESS_PROVIDED_STEEL',
        lowerLayerAxis: lowerAxis(chosen.order),
        evaluated,
        steps: [...steps,
          `Se adopta ${chosen.order}: ambas son admisibles y ésta necesita menos acero ` +
          `(${chosen.evaluation.providedSteelMassKg.toFixed(1)} kg contra ` +
          `${other.evaluation.providedSteelMassKg.toFixed(1)} kg).`],
      },
    };
  }

  const uA = a.evaluation.worstFlexuralUtilization;
  const uB = b.evaluation.worstFlexuralUtilization;
  const utilScale = Math.max(Math.abs(uA), Math.abs(uB), 1e-12);
  if (Math.abs(uA - uB) > STEEL_EQUAL_REL_TOL * utilScale) {
    const chosen = uA < uB ? a : b;
    const other = uA < uB ? b : a;
    return {
      chosen,
      resolution: {
        status: 'ESTABLISHED',
        preference, resolved: chosen.order,
        rationale: 'LOWER_FLEXURAL_UTILIZATION',
        lowerLayerAxis: lowerAxis(chosen.order),
        evaluated,
        steps: [...steps,
          `Se adopta ${chosen.order}: ambas necesitan el mismo acero ` +
          `(${mA.toFixed(1)} kg), y ésta trabaja su armadura de flexión con más margen ` +
          `(${chosen.evaluation.worstFlexuralUtilization.toFixed(4)} contra ` +
          `${other.evaluation.worstFlexuralUtilization.toFixed(4)}).`],
      },
    };
  }

  return {
    chosen: a,
    resolution: {
      status: 'ESTABLISHED',
      preference, resolved: 'X_BELOW_Y',
      rationale: 'DETERMINISTIC_TIE_BREAK',
      lowerLayerAxis: 'X',
      evaluated,
      steps: [...steps,
        'Se adopta X_BELOW_Y por desempate determinístico: las dos disposiciones son ' +
        'equivalentes en acero y en utilización, de modo que la regla fija una para que el ' +
        'resultado no dependa del orden de comparación.'],
    },
  };
}

/**
 * Design both directions of an isolated footing's bottom mat.
 *
 * The two directions are computed INDEPENDENTLY — own cantilever, own distribution width, own
 * pressure trapezoid, own bar diameter and, now that the layer order is resolved, own REAL
 * effective depth. A square footing under a square centred column comes out symmetric because
 * its inputs are symmetric, not because one direction was copied onto the other.
 */
export function designFootingMat(input: FootingMatDesignInput): FootingMatDesign {
  const dX = input.preferences.bottomMatDiameterXmm;
  const dY = input.preferences.bottomMatDiameterYmm;
  const preference = input.preferences.bottomMatLayerOrder ?? 'AUTO';

  // BOTH arrangements are always built, even under a manual override. It costs one extra design
  // pass and it is what lets the panel and the certificate state what the other order would
  // have cost — an override with no visible alternative is a decision nobody can review.
  const arrangements = ARRANGEMENTS.map((o) => buildArrangement(input, o));
  const { resolution, chosen } = resolveLayerOrder(preference, arrangements);

  // With no order established there is no real depth to design at, so the reported design is
  // the pre-resolution envelope: both directions at the shallower depth, exactly as PR18-A did.
  const envelope = resolution.status === 'NOT_ESTABLISHED';
  const x = envelope
    ? designDirection(input, {
      axis: 'X', barsParallelTo: 'B',
      spanDimension: input.B, columnDimension: input.columnB,
      distributionWidth: input.L,
      factoredMoment: input.factoredMomentB,
      spanEccentricity: input.eccentricityB,
      distributionEccentricity: input.eccentricityL,
    }, dX, 'ENVELOPE_UPPER_LAYER')
    : chosen.x;
  const y = envelope
    ? designDirection(input, {
      axis: 'Y', barsParallelTo: 'L',
      spanDimension: input.L, columnDimension: input.columnH,
      distributionWidth: input.B,
      factoredMoment: input.factoredMomentL,
      spanEccentricity: input.eccentricityL,
      distributionEccentricity: input.eccentricityB,
    }, dY, 'ENVELOPE_UPPER_LAYER')
    : chosen.y;

  // The averaged two-layer depth the punching and one-way-shear checks keep using — the legacy
  // convention, `h − cover − d_b`, unchanged, with `d_b` the mean of the two selected diameters
  // so a project on the 16/16 default gets the previous number to the bit. It is deliberately
  // NOT recomputed as the exact mean of the two layer depths: that expression depends on which
  // direction is lower, and PR18-A does not establish it. Stated beside the two flexural depths
  // so all three are readable together instead of one standing in for the others.
  const punchingD = Math.max(0, input.thickness - input.cover - (dX + dY) / 2000);

  const assumptions: EngineMessage[] = [
    msg('footing.assumption.flexuralDepths', {
      dx: +x.d.toFixed(4), dy: +y.d.toFixed(4), punching: +punchingD.toFixed(4),
      bx: dX, by: dY,
    }),
  ];
  if (envelope) {
    // The pre-resolution envelope, reported ONLY when no order could be established. Under a
    // resolved order it would be a false statement about the delivered design.
    assumptions.push(msg('footing.assumption.layerEnvelope', {
      lowx: +x.dIfLowerLayer.toFixed(4), upx: +x.dIfUpperLayer.toFixed(4),
      lowy: +y.dIfLowerLayer.toFixed(4), upy: +y.dIfUpperLayer.toFixed(4),
      cc: +(input.cover * 1000).toFixed(0),
    }));
  } else {
    assumptions.push(msg('footing.assumption.layerOrderResolved', {
      order: resolution.resolved as string,
      lower: resolution.lowerLayerAxis as string,
      rationale: resolution.rationale,
      dx: +x.d.toFixed(4), dy: +y.d.toFixed(4),
      ex: +(x.centreElevation * 1000).toFixed(1),
      ey: +(y.centreElevation * 1000).toFixed(1),
    }));
  }
  // The applied moment's sign is not usable on a footing-local axis, so both orientations are
  // enveloped. Named because it can make a footing carry a diagram the real sign would not
  // produce — conservative, and not free.
  if (Math.abs(input.factoredMomentB) > 1e-9 || Math.abs(input.factoredMomentL) > 1e-9) {
    assumptions.push(msg('footing.assumption.momentOrientationEnvelope', {
      mb: +input.factoredMomentB.toFixed(1), ml: +input.factoredMomentL.toFixed(1),
    }));
  }

  const status: FootingMatDirectionStatus =
    x.status === 'NOT_EVALUATED' || y.status === 'NOT_EVALUATED'
      ? 'NOT_EVALUATED'
      : x.status === 'DESIGNED' && y.status === 'DESIGNED'
        ? 'DESIGNED'
        : 'DESIGN_FAILED';

  return {
    x, y, punchingD, status,
    // This function designs the mat and models none of it. `geometry`, `topReinforcement` and
    // `anchorage` each have ONE inhabitant, so no edit here can quietly promote them: the
    // geometry is not modelled, the top steel is not evaluated, and the anchorage is not
    // geometrically verified. DESIGNED above means the flexural schedule, and only that.
    //
    // `layerOrder` is the one that changed. It is no longer a bare NOT_ESTABLISHED constant but
    // a resolution carrying the preference, the order built at, the rationale, and BOTH
    // arrangements as they were compared.
    geometry: 'REQUIRED_NOT_MODELED',
    topReinforcement: 'NOT_EVALUATED',
    layerOrder: resolution,
    anchorage: 'NOT_GEOMETRICALLY_VERIFIED',
    assumptions,
    failures: [...x.failures, ...y.failures],
    advisories: [...x.advisories, ...y.advisories],
    refs: distinctRefs([...x.refs, ...y.refs]),
  };
}
