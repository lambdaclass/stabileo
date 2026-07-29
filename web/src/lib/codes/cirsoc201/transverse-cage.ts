/**
 * Physical transverse reinforcement — closed stirrups and crossties as real bars.
 *
 * ── What this replaces ─────────────────────────────────────────────
 *
 * `StirrupZone` said "Ø8, 3 legs, every 50 mm, from x=0 to x=0,6". That is an instruction,
 * not a bar. Nothing had coordinates, so nothing could be collision-checked, marked,
 * scheduled, weighed, cut or drawn. The leg COUNT was correct and verified against Table
 * 9.7.6.2.2; the steel did not exist.
 *
 * This module fabricates the pieces. One closed perimeter stirrup plus `legs − 2` crossties,
 * repeated at every station the zone's spacing produces.
 *
 * ── The regulation, verbatim, and where each number comes from ──────
 *
 * §25.7.1.1  Stirrups must be placed as close to the tension and compression surfaces as
 *            cover and the proximity of other reinforcement allow, and **must be anchored at
 *            both ends**. As shear reinforcement they must extend a distance `d` from the
 *            extreme compression fibre.
 *
 * §25.7.1.2  "Entre los extremos anclados, cada doblez en la parte continua de los estribos
 *            en U, sencillos o múltiples, y cada doblez en un estribo cerrado, debe contener
 *            una barra longitudinal o cordón." — **every bend must contain a longitudinal
 *            bar.** This is a geometric requirement, not a detailing preference, and it is
 *            what ties the cage corners to the actual bar positions. Asserted, not assumed:
 *            `cornerContainment` reports which longitudinal bar each corner encloses and
 *            flags any corner that encloses none.
 *
 * §25.7.1.3(a) For d_b ≤ 16 mm — every stirrup diameter this app generates — anchorage is
 *            "un gancho normal alrededor de la armadura longitudinal": a standard hook per
 *            §25.3.2, hooked around a longitudinal bar. No embedment length is required;
 *            that is §25.7.1.3(b), which applies to Ø20–25 with f_yt > 220 MPa and is not
 *            reachable here. `assertHookAnchorageSupported` refuses rather than silently
 *            applying (a) outside its range.
 *
 * §25.3.2 / Table 25.3.2  Mandrel diameter and hook extension. Already implemented and
 *            verified cell-by-cell against the rendered PDF in `bar-geometry.ts`; this module
 *            calls `standardHook(d, angle, 'transverse')` and invents nothing.
 *
 * §25.3.5    THE crosstie ("gancho suplementario") clause, and the one that governs a beam's
 *            internal legs. It lives in §25.3 "Ganchos normales y ganchos suplementarios",
 *            NOT in the column-tie section, so it applies to beams:
 *              (a) continuous between its ends;
 *              (b) a 135° hook at ONE end;
 *              (c) a standard hook with a minimum 90° bend at the OTHER end;
 *              (d) the hooks must embrace the PERIPHERAL longitudinal bars;
 *              (e) the 90° hooks of two successive crossties embracing the same longitudinal
 *                  bars must have their ends ALTERNATED, unless INPRES-CIRSOC 103-II or
 *                  §25.7.1.6.1 is satisfied.
 *            §22.5.8.5.5 confirms a crosstie counts as shear reinforcement: "Para cada
 *            estribo... o gancho suplementario, Av debe tomarse como el área efectiva de las
 *            ramas... dentro de la separación s."
 *
 *            (e) is a "deben" — NORMATIVE. An earlier revision of this module implemented
 *            alternation from C 25.7.2.3.1's "deberían... cuando sea posible" and therefore
 *            labelled it *practice*. That was wrong twice: it cited a COLUMN clause for a beam
 *            piece, and it downgraded a requirement to a preference.
 *
 * §25.7.2.3  NOT USED for beams. It sits under "§25.7.2 Estribos cerrados de COLUMNAS".
 *            `unbracedBarReport` implements its (b) sub-clause and is retained for the column
 *            generator only; a source gate asserts no column-only clause reaches a beam's
 *            transverse bars.
 *
 * Table 9.7.6.2.2 (via `./transverse-spacing`) remains the sole authority on the row, the
 * along-member limit, the across-width limit, the required leg count and the leg
 * coordinates. This module consumes `legOffsetsAcross` rather than computing positions, so
 * the cage, the verifier, the collision checker and the drawing cannot disagree.
 *
 * ── What is NOT invented here ──────────────────────────────────────
 *
 * No hook angle, extension, mandrel, spacing, first-stirrup offset or cover allowance is
 * chosen by this module. §25.7.1.1 prescribes no longitudinal offset for the first stirrup —
 * the "s/2 from the support face" rule of common practice has no clause — so stations are
 * generated at `from + k·s` from the zone boundary, which invents nothing, and adjacent-zone
 * duplicates are removed geometrically.
 *
 * All lengths in metres unless the name says `Mm`. Pure: no store, no runes.
 */

import {
  arcSegment, centrelineRadius, developedLength, minMandrelDiameter, standardHook,
  straightSegment, type BarPath, type BarSegment, type HookAngle, type HookGeometry,
  type Point3,
} from './bar-geometry';
import {
  LENGTH_EPS, legOffsetsAcross, type TransverseSpacingLimits,
} from './transverse-spacing';
import { clause, type ClauseRef } from '../regulation';

// ─── Shapes ──────────────────────────────────────────────────────

/**
 * What a fabricated transverse piece IS, not what it does.
 *
 * The bender needs the shape; the engineer needs the role. A closed stirrup and a crosstie
 * are different fabricated items with different cutting lengths and different marks, so they
 * are different shapes even when they sit at the same station.
 */
export type TransverseShape = 'closedStirrup' | 'crosstie';

/** Largest stirrup diameter §25.7.1.3(a) covers without an added embedment length. */
export const HOOK_ANCHORAGE_MAX_DIA_MM = 16;

/**
 * Closing-hook angle for a CLOSED STIRRUP.
 *
 * §25.7.1.3(a) requires "un gancho normal alrededor de la armadura longitudinal" for
 * d_b ≤ 16 mm and does not fix the angle; Table 25.3.2 tabulates 90°, 135° and 180° for
 * transverse bars. 135° is chosen among the tabulated options and its mandrel and extension
 * are read from the table rather than invented.
 */
export const STIRRUP_HOOK_ANGLE: HookAngle = 135;

/**
 * Crosstie hook angles — §25.3.5(b) and (c), not a choice.
 *
 * (b) 135° at one end. (c) a standard hook with a minimum 90° bend at the other. A crosstie
 * with 135° at BOTH ends, which this module produced first, satisfies neither (c) as written
 * nor (e)'s alternation, whose whole subject is the 90° end.
 */
export const CROSSTIE_HOOK_ANGLE_135: HookAngle = 135;
export const CROSSTIE_HOOK_ANGLE_90: HookAngle = 90;

/** @deprecated Split into the stirrup and crosstie constants above. */
export const TRANSVERSE_HOOK_ANGLE: HookAngle = STIRRUP_HOOK_ANGLE;

export interface TransversePiece {
  /** The fabricated bar. `role` is always `'transverse'`. */
  path: BarPath;
  shape: TransverseShape;
  /** Owning member. */
  elementId: number;
  /** Zone this piece belongs to, e.g. `e162:support:0`. */
  zoneId: string;
  /** Distance along the member axis, m, from the member's i end. */
  station: number;
  /**
   * How many legs of the SET this piece contributes across the width.
   * A closed stirrup contributes 2; a crosstie contributes 1.
   */
  legsContributed: number;
  /** Across-width offsets of this piece's legs, m from the section centreline. */
  legOffsets: number[];
  /**
   * Which longitudinal bar each bend of this piece encloses — §25.7.1.2.
   * A `null` entry is a bend that encloses nothing, which is a defect, not a detail.
   */
  cornerContainment: Array<{ at: Point3; longitudinalBarId: string | null }>;
  /** Hook orientation, so consecutive pieces can be staggered (C 25.7.2.3.1, practice). */
  hookOrientation: 'a' | 'b';
  refs: ClauseRef[];
}

/** A longitudinal bar this cage has to enclose, in section coordinates. */
export interface LongitudinalBarRef {
  id: string;
  /** Across-width offset from the section centreline, m. */
  across: number;
  /** Height above the section centreline, m. Positive toward the top face. */
  up: number;
  diameterMm: number;
}

export interface StirrupSetInput {
  elementId: number;
  /** The member's cage. Every piece of one member's transverse steel shares it. */
  cageId?: string;
  zoneId: string;
  /** Station along the member axis, m. */
  station: number;
  /** Web width and overall depth, m. */
  b: number;
  h: number;
  /** Cover to the OUTSIDE of the stirrup, m. */
  cover: number;
  stirrupDiaMm: number;
  /** Legs across the width, from Table 9.7.6.2.2. Never below 2. */
  legs: number;
  /** Longitudinal bars present at this station, for the §25.7.1.2 containment check. */
  longitudinalBars: readonly LongitudinalBarRef[];
  /** Member frame. `across` = axis × up, matching the longitudinal generator exactly. */
  origin: Point3;
  axis: Point3;
  up: Point3;
  across: Point3;
  /** Alternates the hook corner between consecutive stations (C 25.7.2.3.1, practice). */
  hookOrientation: 'a' | 'b';
  /**
   * Shift of this PIECE along the member axis, m, within its set.
   *
   * The pieces of one set are not coplanar. A closed stirrup and the crossties threaded
   * through it are separate bars standing side by side against the formwork, one diameter
   * apart — they cannot all occupy one section plane, and modelling them that way makes every
   * crossing between them read as an interpenetration. Measured on the joint cage: 24
   * crosstie-to-stirrup and 12 crosstie-to-crosstie overlaps, all at zero station difference,
   * all of them the model rather than the steel.
   *
   * The set builders assign it; nothing else should.
   */
  axialNudge?: number;
  /** Maximum nominal coarse-aggregate size, mm — §25.7.2.1(a) clear-spacing term. */
  maxAggregateSizeMm: number;
  /**
   * Table 9.7.6.2.2 across-width limit, m.
   *
   * Passed in because it decides whether an interior leg may be snapped to a bar position: both
   * that limit and §25.3.5(d) are mandatory, and when they conflict the spacing limit governs.
   */
  acrossMax?: number;
}

function add(p: Point3, v: Point3, k: number): Point3 {
  return { x: p.x + v.x * k, y: p.y + v.y * k, z: p.z + v.z * k };
}

/**
 * Section point → global, using the member frame the longitudinal generator uses.
 *
 * `axialOffset` shifts the point along the member axis. It is zero for everything on the
 * stirrup's own section plane, and non-zero only for the two closing hook tails, which
 * physically pass each other rather than occupying one line.
 */
function sectionPoint(
  input: Pick<StirrupSetInput,
    'origin' | 'axis' | 'up' | 'across' | 'station' | 'axialNudge'>,
  acrossOffset: number, upOffset: number, axialOffset = 0,
): Point3 {
  const atStation = add(
    input.origin, input.axis, input.station + (input.axialNudge ?? 0) + axialOffset);
  return add(add(atStation, input.across, acrossOffset), input.up, upOffset);
}

/**
 * Half-extents of the stirrup CENTRELINE rectangle, m.
 *
 * Cover is to the stirrup's outside, so the centreline sits `cover + d_s/2` from each face.
 * The full across-width span is therefore `b − 2·cover − d_s`, which is exactly
 * `acrossWidthSpan()` in `./transverse-spacing` — the two must agree or the outer legs of the
 * cage would not sit where the spacing rule believes they do.
 */
export function stirrupCentrelineHalfExtents(
  b: number, h: number, cover: number, stirrupDiaMm: number,
): { halfAcross: number; halfUp: number } {
  const inset = cover + stirrupDiaMm / 2000;
  return { halfAcross: Math.max(0, b / 2 - inset), halfUp: Math.max(0, h / 2 - inset) };
}

/**
 * How far a longitudinal bar SEATED IN A CORNER BEND sits from each leg centreline, m.
 *
 * ── The identity this replaces, and why it was wrong ───────────────
 *
 * The longitudinal generator seated its outer bars at `(d_s + d_b)/2` from each leg
 * centreline — bar surface against leg surface, contact, asserted to twelve decimal places.
 * That identity is exactly right for a bar lying against a STRAIGHT leg, and it is wrong for
 * a bar at a BEND, because the bend cuts the corner off.
 *
 * Measured: a Ø8 stirrup bends at a 32 mm mandrel, so the corner arc has a centreline radius
 * of 20 mm and its centre sits 20 mm in from each leg. A Ø10 bar pushed to `(8+10)/2 = 9 mm`
 * from both legs lands 15,56 mm from that centre — 4,44 mm inside a 20 mm arc. Its surface
 * interpenetrates the stirrup by 4,56 mm. It is not a tight detail; the bar cannot be there,
 * and on `rc-design-qa-8` that single identity produced 78 prohibited conflicts.
 *
 * A bar can be pushed into the corner only until it meets the bend. Its centre then lies
 * `free = r − (d_s + d_b)/2` from the bend centre, along the diagonal toward the corner, so
 * it sits `r − free/√2` from each leg centreline. For Ø8/Ø10 that is 12,22 mm; the bar is
 * held by the BEND, per §25.7.1.2, and clears each straight leg by about 3 mm.
 *
 * When the bar is too big for the bend to hold (`free ≤ 0`) it seats at the bend centre. The
 * result is never allowed below `(d_s + d_b)/2`, which is the straight-leg contact distance
 * and remains a hard floor whatever the bend geometry says.
 */
export function seatedCornerInset(stirrupDiaMm: number, barDiaMm: number): number {
  const r = centrelineRadius(minMandrelDiameter(stirrupDiaMm, 'transverse').value, stirrupDiaMm);
  const contact = (stirrupDiaMm + barDiaMm) / 2000;
  const free = Math.max(0, r - contact);
  return Math.max(contact, r - free * Math.SQRT1_2);
}

/**
 * THE rectangle a member's outermost longitudinal bars sit on — the one authoritative answer.
 *
 * ── Why this exists as one function ────────────────────────────────
 *
 * Three subsystems were deciding where a longitudinal bar sits relative to its cage, and they
 * disagreed. `generate-beam` derived a clear width from `b − 2·(cover + d_s)`; `liftBarPositions`
 * in `generate-column` used `cover + d_s + d_b/2` directly; the cage itself used
 * `stirrupCentrelineHalfExtents`. Two of the three put the corner bars INSIDE the corner bend,
 * because `(d_s + d_b)/2` is the contact distance from a STRAIGHT leg and the bend cuts the
 * corner off. The beam generator was corrected; the column generator was not, and its corner
 * bars interpenetrated the joint ties by 3,3 mm apiece.
 *
 * So the derivation lives here, once, and every consumer reads it:
 *
 *   cage      the stirrup/tie CENTRELINE rectangle — `cover` is to the OUTSIDE of the
 *             transverse steel, so the centreline sits `cover + d_s/2` in from each face.
 *   inset     how far a bar seated in a CORNER BEND sits from each leg centreline, which is
 *             `seatedCornerInset` and is NOT `(d_s + d_b)/2`.
 *   half*     the rectangle the outermost bars sit on: the cage centreline, brought in by the
 *             seated inset on all four sides.
 *
 * ── Corner and face bars are NOT collinear, and that is not an approximation ─
 *
 * A bar against a straight leg touches it: `(d_s + d_b)/2` from the leg centreline. A bar at a
 * corner cannot get that close, because the bend is in the way — it seats in the bend, further
 * in by `cornerInset − faceInset` (2,3 mm for a Ø8 tie on Ø16 bars). So a column's corner bars
 * sit slightly inboard of the intermediate bars on the same face. That is what a real cage
 * does; drawing them collinear is the convention, not the geometry, and a collision check run
 * against the convention reports overlaps that are not there and misses ones that are.
 *
 * A BEAM's row is different: its bars share one elevation, so the corner bar governs and the
 * whole row follows it. The cost is a fraction of a millimetre of lever arm, which the
 * re-verification pass measures rather than assumes.
 */
export function seatedLongitudinalHalfExtents(
  b: number, h: number, cover: number, tieDiaMm: number, barDiaMm: number,
): {
  /** The transverse steel's own centreline rectangle. */
  cage: { halfAcross: number; halfUp: number };
  /** Bars seated in a CORNER BEND — the four corners of a column, a row's outermost bars. */
  corner: { halfAcross: number; halfUp: number };
  /** Bars against a STRAIGHT LEG — a column's intermediate face bars. */
  face: { halfAcross: number; halfUp: number };
  cornerInset: number;
  faceInset: number;
} {
  const cage = stirrupCentrelineHalfExtents(b, h, cover, tieDiaMm);
  const cornerInset = seatedCornerInset(tieDiaMm, barDiaMm);
  // Against a straight leg the two surfaces simply touch: half of each diameter.
  const faceInset = (tieDiaMm + barDiaMm) / 2000;
  return {
    cage,
    corner: {
      halfAcross: Math.max(0, cage.halfAcross - cornerInset),
      halfUp: Math.max(0, cage.halfUp - cornerInset),
    },
    face: {
      halfAcross: Math.max(0, cage.halfAcross - faceInset),
      halfUp: Math.max(0, cage.halfUp - faceInset),
    },
    cornerInset,
    faceInset,
  };
}

/**
 * §25.7.1.3 — is a standard hook alone a legal anchorage for this stirrup diameter?
 *
 * (a) covers d_b ≤ 16 mm outright. (b) covers Ø20 and Ø25 with f_yt > 220 MPa but demands an
 * additional embedded length, which this module does not compute. Returning `false` makes the
 * caller declare the case unsupported rather than applying (a) beyond its stated range.
 */
export function hookAnchorageIsSupported(stirrupDiaMm: number): boolean {
  return stirrupDiaMm <= HOOK_ANCHORAGE_MAX_DIA_MM;
}

const REF_ANCHOR = () => clause('cirsoc-201', '2025', '25.7.1.3',
  'anclaje de estribos: gancho normal alrededor de la armadura longitudinal');
const REF_BEND_CONTAINS = () => clause('cirsoc-201', '2025', '25.7.1.2',
  'cada doblez debe contener una barra longitudinal');
const REF_HOOK_TABLE = () => clause('cirsoc-201', '2025', 'Tabla 25.3.2',
  'diámetro mínimo de doblado y geometría del gancho para estribos');
const REF_CROSSTIE = () => clause('cirsoc-201', '2025', '25.3.5',
  'ganchos suplementarios: 135° en un extremo, gancho normal de 90° mínimo en el otro, ' +
  'abrazando las barras longitudinales periféricas');
const REF_CROSSTIE_ALTERNATE = () => clause('cirsoc-201', '2025', '25.3.5(e)',
  'los ganchos de 90° de ganchos suplementarios sucesivos deben quedar alternados');
const REF_AV = () => clause('cirsoc-201', '2025', '22.5.8.5.5',
  'Av incluye las ramas de los ganchos suplementarios dentro de la separación s');

/**
 * The nearest longitudinal bar a bend encloses, or null when it encloses none.
 *
 * "Encloses" is judged by proximity to the corner of the centreline rectangle: a bend of
 * inside radius `r` wraps a bar whose centre lies within roughly `r + d_b/2` of the corner.
 * §25.7.1.2 is a yes/no requirement, so this returns the bar rather than a distance score.
 */
function barAtCorner(
  bars: readonly LongitudinalBarRef[],
  acrossOffset: number, upOffset: number,
  bendCentrelineRadius: number, stirrupDiaMm: number,
  tolerance = 0.002,
): string | null {
  // A bar is contained by a bend when it is SEATED in the corner: nestled against the inside
  // of the bend arc, touching both legs. That is a physical condition, so the reach is the sum
  // of the geometry involved — the bend's centreline radius, the stirrup's own half-diameter,
  // and the bar's half-diameter — plus a small fabrication tolerance.
  //
  // Two looser models were tried and both misreported real cages. Using the bend radius alone
  // failed a 300 mm section whose corner bar legitimately sits ~13 mm diagonally inboard of the
  // leg centreline; a flat 5 mm tolerance failed for the same reason. Neither cage was wrong —
  // the check was.
  let best: { id: string; d: number } | null = null;
  const reachBase = bendCentrelineRadius + stirrupDiaMm / 2000 + tolerance;
  for (const bar of bars) {
    const d = Math.hypot(bar.across - acrossOffset, bar.up - upOffset);
    if (d <= reachBase + bar.diameterMm / 2000 && (best === null || d < best.d)) {
      best = { id: bar.id, d };
    }
  }
  return best?.id ?? null;
}

/**
 * Which bars a closed perimeter ENCLOSES — inside the centreline rectangle.
 *
 * Enclosure is a weaker claim than restraint and is recorded separately for that reason. A
 * bar sitting anywhere inside the stirrup is enclosed by it; only a bar seated in a bend is
 * restrained by it. §25.7.1.2 asks for the second, and a check that accepted the first would
 * pass a cage whose corners grip nothing simply because bars exist somewhere within it.
 *
 * The bar's own radius is allowed to overhang the centreline: a corner bar legitimately sits
 * with its centre inside and its surface against the inside face of the leg.
 */
function barsInsidePerimeter(
  bars: readonly LongitudinalBarRef[],
  halfAcross: number, halfUp: number,
): string[] {
  return bars
    .filter((b) => Math.abs(b.across) <= halfAcross + 1e-9
      && Math.abs(b.up) <= halfUp + 1e-9)
    .map((b) => b.id);
}

/**
 * One closed rectangular stirrup as a real bar path.
 *
 * ── The shape, and the two defects it replaces ─────────────────────
 *
 * A closed stirrup is ONE bar with TWO ends. It runs the perimeter and both ends terminate at
 * the same corner, each with a 135° hook turned into the core, the two tails passing each
 * other one diameter apart along the member axis. That is what is built here.
 *
 * The previous version had four 90° corner arcs and then this, as its whole closing hook:
 *
 *     const hookTip = sectionPoint(input, ha − sign(ha)·hook.extension, hu + hook.extension);
 *     segments.push(straightSegment(sectionPoint(input, ha, hu), hookTip));
 *
 * Three defects in two lines. The extension is added to the across coordinate AND to the up
 * coordinate, so Table 25.3.2's 75 mm extension is drawn as a **106 mm** diagonal — longer by
 * √2. There is no bend at all, so the piece's cutting length is short by the arc and long by
 * the overshoot. And it starts at the rectangle corner, which is not where the perimeter loop
 * ends, so the path had a gap in it.
 *
 * Measured consequence on `rc-design-qa-8`: that 106 mm diagonal is driven straight through
 * the second-layer bottom bars, which sit 81 mm diagonally in from the corner — 73 prohibited
 * conflicts, contact at 78 % along the line. With the bend modelled and the extension at its
 * tabulated length the free end stops 18 mm short of those bars.
 *
 * The second end was never drawn either, though `startTreatment` declared it.
 *
 * ── Which corner closes, and why it is chosen rather than fixed ────
 *
 * `hookOrientation` used to DECIDE the closing corner: 'a' put it bottom-left, 'b' bottom-
 * right, alternating station by station so consecutive closures stagger. That staggering is
 * C 25.7.2.3.1, a commentary "deberían ... cuando sea posible" — a preference.
 *
 * A 135° tail is 75 mm of steel driven diagonally into the core, and whether it lands in a
 * bar or in clear web depends entirely on which corner it starts from. Measured on
 * `rc-design-qa-8`: with the corner fixed by the alternation, **88 of 166** stirrups — the
 * half that closed on the congested side — drove a tail through the bottom mat, 130
 * prohibited conflicts. The other half were clear. The bars are not symmetric, so neither
 * corner is right for every station.
 *
 * No clause fixes the corner. §25.7.1.3(a) asks for a standard hook around a longitudinal
 * bar and every corner has one; §25.7.1.2 is satisfied at every corner too. So the corner is
 * CHOSEN: all four are evaluated against the bars actually present at this station, and the
 * one whose two tails clear them best wins. `hookOrientation` survives as the tie-break, so
 * closures still stagger wherever staggering costs nothing — which is exactly the standing a
 * commentary preference should have against a constructability requirement.
 */
export function buildClosedStirrup(input: StirrupSetInput): TransversePiece {
  const ds = input.stirrupDiaMm;
  const { halfAcross, halfUp } = stirrupCentrelineHalfExtents(input.b, input.h, input.cover, ds);
  const mandrel = minMandrelDiameter(ds, 'transverse');
  const r = centrelineRadius(mandrel.value, ds);
  const hook = standardHook(ds, STIRRUP_HOOK_ANGLE, 'transverse');

  const SQ = Math.SQRT1_2;
  /**
   * Half a diameter each side of the section plane, for the two closing tails.
   *
   * The two ends of one bar cannot occupy one line. On site they pass, and the closure is one
   * diameter thick; modelling them coincident would report the stirrup as interpenetrating
   * itself, which is a modelling artefact and not a defect anyone can fix on site.
   */
  const gap = ds / 2000;

  /**
   * The closing corner, as a mirror pair: `s` flips left/right, `v` flips bottom/top.
   *
   * Everything downstream is written in terms of these two, so the four candidate corners are
   * the four sign combinations and no case is special.
   */
  interface Closure { s: 1 | -1; v: 1 | -1 }

  /** Section geometry of one candidate closure. */
  const layout = (k: Closure) => {
    const { s, v } = k;
    const corners: Array<[number, number]> = [
      [-halfAcross * s, -halfUp * v],
      [halfAcross * s, -halfUp * v],
      [halfAcross * s, halfUp * v],
      [-halfAcross * s, halfUp * v],
    ];
    const dir = corners.map((c, i): [number, number] => {
      const n = corners[(i + 1) % 4];
      return [Math.sign(n[0] - c[0]), Math.sign(n[1] - c[1])];
    });
    // Both hooks turn about this one point: they are the same physical bend around the same
    // corner longitudinal bar, `r` in from each of the two faces that meet there.
    const bendCentre: [number, number] = [s * (r - halfAcross), v * (r - halfUp)];
    const intoCore: [number, number] = [s * SQ, v * SQ];
    const bendStart: [number, number] = [
      bendCentre[0] - r * s * SQ, bendCentre[1] + r * v * SQ,
    ];
    const tipStart: [number, number] = [
      bendStart[0] + hook.extension * intoCore[0], bendStart[1] + hook.extension * intoCore[1],
    ];
    const exitEnd: [number, number] = [
      bendCentre[0] + r * s * SQ, bendCentre[1] - r * v * SQ,
    ];
    const tipEnd: [number, number] = [
      exitEnd[0] + hook.extension * intoCore[0], exitEnd[1] + hook.extension * intoCore[1],
    ];
    const onSide0: [number, number] = [
      corners[0][0] + dir[0][0] * r, corners[0][1] + dir[0][1] * r,
    ];
    const bendEnd: [number, number] = [
      corners[0][0] - dir[3][0] * r, corners[0][1] - dir[3][1] * r,
    ];
    return { corners, dir, bendCentre, intoCore, bendStart, tipStart, exitEnd, tipEnd, onSide0, bendEnd };
  };

  /**
   * Worst surface clearance between this closure's two tails and the longitudinal bars, m.
   *
   * Negative means a tail is driven through a bar. Both the 135° arc and the straight
   * extension are sampled, and the axial `gap` is carried into the distance — a tail that
   * passes a bar half a diameter out of plane is further away than the section view suggests,
   * and pretending otherwise would reject corners that are in fact fine.
   */
  const tailClearance = (k: Closure): number => {
    const g = layout(k);
    const pts: Array<[number, number]> = [];
    const sample = (from: [number, number], to: [number, number], n: number) => {
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
      }
    };
    // The arcs, on the true circle rather than the chord.
    for (const [from, to] of [[g.bendStart, g.onSide0], [g.bendEnd, g.exitEnd]] as const) {
      const a0 = Math.atan2(from[1] - g.bendCentre[1], from[0] - g.bendCentre[0]);
      const a1 = Math.atan2(to[1] - g.bendCentre[1], to[0] - g.bendCentre[0]);
      let d = a1 - a0;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      for (let i = 0; i <= 12; i++) {
        const a = a0 + d * (i / 12);
        pts.push([g.bendCentre[0] + r * Math.cos(a), g.bendCentre[1] + r * Math.sin(a)]);
      }
    }
    sample(g.bendStart, g.tipStart, 12);
    sample(g.exitEnd, g.tipEnd, 12);

    let worst = Number.POSITIVE_INFINITY;
    for (const bar of input.longitudinalBars) {
      for (const [a, u] of pts) {
        const inPlane = Math.hypot(bar.across - a, bar.up - u);
        const d3 = Math.hypot(inPlane, gap);
        worst = Math.min(worst, d3 - ds / 2000 - bar.diameterMm / 2000);
      }
    }
    return worst;
  };

  // Preference order: the requested orientation first, so a station whose corners are all
  // equally clear still staggers against its neighbour.
  const preferred: 1 | -1 = input.hookOrientation === 'a' ? 1 : -1;
  const candidates: Closure[] = [
    { s: preferred, v: 1 }, { s: -preferred as 1 | -1, v: 1 },
    { s: preferred, v: -1 }, { s: -preferred as 1 | -1, v: -1 },
  ];
  let closure = candidates[0];
  let bestClear = tailClearance(candidates[0]);
  for (const k of candidates.slice(1)) {
    if (bestClear >= 0) break;          // the preferred corner already works; stagger wins.
    const c = tailClearance(k);
    if (c > bestClear) { closure = k; bestClear = c; }
  }

  const geom = layout(closure);
  const { corners, dir, bendCentre, bendStart, tipStart, exitEnd, tipEnd, onSide0, bendEnd } = geom;

  const segments: BarSegment[] = [];
  const P = (a: number, u: number, ax = 0) => sectionPoint(input, a, u, ax);

  // ── Leading end: free tip → 135° bend → onto the first side ──
  segments.push(straightSegment(P(tipStart[0], tipStart[1], -gap), P(bendStart[0], bendStart[1], -gap)));
  segments.push(arcSegment(P(bendStart[0], bendStart[1], -gap), P(onSide0[0], onSide0[1]),
    r, STIRRUP_HOOK_ANGLE, P(bendCentre[0], bendCentre[1], -gap / 2)));

  // ── Perimeter: three 90° corners, then the last side back to the closing corner ──
  let at: [number, number] = onSide0;
  for (let i = 0; i < 3; i++) {
    const next = corners[i + 1];
    const endTrim: [number, number] = [next[0] - dir[i][0] * r, next[1] - dir[i][1] * r];
    segments.push(straightSegment(P(at[0], at[1]), P(endTrim[0], endTrim[1])));
    const arcEnd: [number, number] = [next[0] + dir[i + 1][0] * r, next[1] + dir[i + 1][1] * r];
    // The corner's bend centre: back off the incoming direction by r, then in along the
    // outgoing one by r. Both tangent points are exactly r from it.
    const cc: [number, number] = [
      next[0] - dir[i][0] * r + dir[i + 1][0] * r, next[1] - dir[i][1] * r + dir[i + 1][1] * r,
    ];
    segments.push(arcSegment(P(endTrim[0], endTrim[1]), P(arcEnd[0], arcEnd[1]), r, 90,
      P(cc[0], cc[1])));
    at = arcEnd;
  }
  // The last side runs into the tangent point of the closing bend, not into the corner.
  segments.push(straightSegment(P(at[0], at[1]), P(bendEnd[0], bendEnd[1])));

  // ── Trailing end: 135° bend → free tip, one diameter clear of the leading one ──
  segments.push(arcSegment(P(bendEnd[0], bendEnd[1]), P(exitEnd[0], exitEnd[1], gap),
    r, STIRRUP_HOOK_ANGLE, P(bendCentre[0], bendCentre[1], gap / 2)));
  segments.push(straightSegment(P(exitEnd[0], exitEnd[1], gap), P(tipEnd[0], tipEnd[1], gap)));

  const containment = corners.map(([a, u]) => ({
    at: sectionPoint(input, a, u),
    longitudinalBarId: barAtCorner(input.longitudinalBars, a, u, r, ds),
  }));

  const refs = [
    REF_BEND_CONTAINS(), REF_ANCHOR(), REF_HOOK_TABLE(), ...mandrel.refs, ...hook.refs,
  ];

  // The relationships this piece is IN, recorded as bar ids so the collision classifier can
  // check the claim instead of inferring one from the pair's roles.
  const restrains = [...new Set(
    containment.map((c) => c.longitudinalBarId).filter((id): id is string => id !== null))];
  // §25.7.1.3(a): the closing hook is "un gancho normal alrededor de la armadura
  // longitudinal" — it wraps the bar at the corner it closes on, which is `corners[0]`.
  const hookBar = containment[0]?.longitudinalBarId ?? null;

  return {
    path: {
      id: `${input.zoneId}:stirrup:${input.station.toFixed(4)}`,
      diameterMm: ds,
      role: 'transverse',
      segments,
      startTreatment: { kind: 'hook', hook },
      endTreatment: { kind: 'hook', hook },
      cuttingLength: developedLength(segments),
      ownerElementIds: [input.elementId],
      layerId: `${input.zoneId}:stirrup`,
      enclosesBarIds: barsInsidePerimeter(input.longitudinalBars, halfAcross, halfUp),
      restrainsBarIds: restrains,
      hookContactsBarIds: hookBar === null ? [] : [hookBar],
      cageId: input.cageId,
      zoneId: input.zoneId,
      station: input.station,
      source: 'generated',
      locked: false,
      refs,
    },
    shape: 'closedStirrup',
    elementId: input.elementId,
    zoneId: input.zoneId,
    station: input.station,
    legsContributed: 2,
    legOffsets: [-halfAcross, halfAcross],
    cornerContainment: containment,
    hookOrientation: input.hookOrientation,
    refs,
  };
}

/**
 * One crosstie ("gancho suplementario") as a real bar path — §25.3.5.
 *
 * A straight leg across the section depth with, per (b) and (c), a **135° hook at one end and a
 * 90° hook at the other**. Both hooks embrace the peripheral longitudinal bars, per (d).
 *
 * `hookOrientation` swaps which end carries the 90° hook. That is §25.3.5(e) and it is
 * NORMATIVE — "deben quedar con los extremos alternados" for successive crossties embracing the
 * same longitudinal bars. An earlier revision used 135° at BOTH ends and justified alternation
 * from C 25.7.2.3.1's "cuando sea posible", which was wrong twice over: it cited a COLUMN clause
 * for a beam piece, and it downgraded a requirement to a preference.
 */
export function buildCrosstie(
  input: StirrupSetInput, acrossOffset: number, index: number,
): TransversePiece {
  const ds = input.stirrupDiaMm;
  const { halfUp } = stirrupCentrelineHalfExtents(input.b, input.h, input.cover, ds);
  const mandrel = minMandrelDiameter(ds, 'transverse');
  const r = centrelineRadius(mandrel.value, ds);
  const hook135 = standardHook(ds, CROSSTIE_HOOK_ANGLE_135, 'transverse');
  const hook90 = standardHook(ds, CROSSTIE_HOOK_ANGLE_90, 'transverse');

  // §25.3.5(e): which END carries the 90° hook alternates between successive ties.
  const ninetyAtTop = input.hookOrientation === 'b';
  const bottomHook = ninetyAtTop ? hook135 : hook90;
  const topHook = ninetyAtTop ? hook90 : hook135;

  // ── The bars this tie embraces, and the bends that embrace them ──
  //
  // §25.3.5(d): a crosstie's hooks "deben abrazar las barras longitudinales periféricas". To
  // wrap a bar whose axis runs along the member, a bend has to curl in the plane PERPENDICULAR
  // to it — the section plane — about the bar's own centre. Two consequences the previous
  // geometry got wrong, both of them by a full bar:
  //
  //   * the straight shaft ran from `−halfUp` to `+halfUp`, i.e. all the way to the cage
  //     CENTRELINE at each face, which drives it straight THROUGH the peripheral bars it is
  //     supposed to hold. Measured: −12 mm, exactly `(d_s + d_b)/2`, the shaft centreline
  //     passing through the bar centre.
  //   * the hooks extended along the member AXIS, out of the section plane, which wraps
  //     nothing: a tail parallel to a bar does not embrace it.
  //
  // A shaft tangent to a bend of centreline radius `r` about the bar therefore sits `r` to
  // one side of the bar line. That lateral offset is the geometry, not an approximation of
  // it; it is why a crosstie in a photograph never looks collinear with the bars it grips.
  const nearestOn = (wantTop: boolean): LongitudinalBarRef | null => {
    let best: LongitudinalBarRef | null = null;
    for (const bar of input.longitudinalBars) {
      if (wantTop ? bar.up <= 0 : bar.up > 0) continue;
      if (Math.abs(bar.across - acrossOffset) > 0.006) continue;
      if (best === null || Math.abs(bar.up) > Math.abs(best.up)) best = bar;
    }
    return best;
  };
  const barBot = nearestOn(false);
  const barTop = nearestOn(true);
  // Absent a bar to grip, the end goes to the cage centreline and `cornerContainment` reports
  // the bend as holding nothing — which is the §25.7.1.2 defect, stated rather than hidden.
  const uBot = barBot ? barBot.up : -halfUp;
  const uTop = barTop ? barTop.up : halfUp;
  // Which side the shaft passes on. Toward the section centre keeps it clear of the perimeter
  // leg on the near face; at the centreline the choice is free and is fixed for determinism.
  const side = acrossOffset > 1e-9 ? -1 : 1;
  const aLeg = acrossOffset + side * r;

  const segments: BarSegment[] = [];
  const SQ = Math.SQRT1_2;
  /** Tail direction after a bend of `angle` at the bar, leaving a shaft travelling `dir`. */
  const tail = (angle: HookAngle, dirUp: number): [number, number] =>
    angle === 90
      ? [-side * 1, 0]
      : [-side * SQ, -dirUp * SQ];

  // Bottom end: shaft arrives travelling up; the bend curls about the bottom bar.
  const bendBot: [number, number] = [acrossOffset, uBot];
  const tanBot: [number, number] = [aLeg, uBot];
  const eBot = tail(bottomHook.angle, 1);
  const exitBot: [number, number] = [
    bendBot[0] + r * -eBot[1] * side, bendBot[1] + r * eBot[0] * side,
  ];
  const tipBot: [number, number] = [
    exitBot[0] + bottomHook.extension * eBot[0], exitBot[1] + bottomHook.extension * eBot[1],
  ];
  segments.push(straightSegment(
    sectionPoint(input, tipBot[0], tipBot[1]), sectionPoint(input, exitBot[0], exitBot[1])));
  segments.push(arcSegment(
    sectionPoint(input, exitBot[0], exitBot[1]), sectionPoint(input, tanBot[0], tanBot[1]),
    r, bottomHook.angle, sectionPoint(input, bendBot[0], bendBot[1])));

  // The shaft, between the two bends.
  const tanTop: [number, number] = [aLeg, uTop];
  segments.push(straightSegment(
    sectionPoint(input, tanBot[0], tanBot[1]), sectionPoint(input, tanTop[0], tanTop[1])));

  // Top end.
  const bendTop: [number, number] = [acrossOffset, uTop];
  const eTop = tail(topHook.angle, -1);
  const exitTop: [number, number] = [
    bendTop[0] + r * eTop[1] * side, bendTop[1] - r * eTop[0] * side,
  ];
  const tipTop: [number, number] = [
    exitTop[0] + topHook.extension * eTop[0], exitTop[1] + topHook.extension * eTop[1],
  ];
  segments.push(arcSegment(
    sectionPoint(input, tanTop[0], tanTop[1]), sectionPoint(input, exitTop[0], exitTop[1]),
    r, topHook.angle, sectionPoint(input, bendTop[0], bendTop[1])));
  segments.push(straightSegment(
    sectionPoint(input, exitTop[0], exitTop[1]), sectionPoint(input, tipTop[0], tipTop[1])));

  const containment = [
    {
      at: sectionPoint(input, bendBot[0], bendBot[1]),
      longitudinalBarId: barBot ? barBot.id : null,
    },
    {
      at: sectionPoint(input, bendTop[0], bendTop[1]),
      longitudinalBarId: barTop ? barTop.id : null,
    },
  ];

  const refs = [
    REF_CROSSTIE(), REF_CROSSTIE_ALTERNATE(), REF_AV(), REF_HOOK_TABLE(),
    ...mandrel.refs, ...hook135.refs, ...hook90.refs,
  ];

  // A crosstie is an open piece: it has no perimeter, so it ENCLOSES nothing. What it does
  // is grip the two peripheral bars its hooks embrace (§25.3.5(d)). Recording an empty
  // enclosure rather than omitting the field is deliberate — "this piece encloses nothing"
  // is the claim, and a classifier that reads `undefined` as "unknown" would have to guess.
  const restrains = [...new Set(
    containment.map((c) => c.longitudinalBarId).filter((id): id is string => id !== null))];

  return {
    path: {
      id: `${input.zoneId}:crosstie${index}:${input.station.toFixed(4)}`,
      diameterMm: ds,
      role: 'transverse',
      segments,
      startTreatment: { kind: 'hook', hook: bottomHook },
      endTreatment: { kind: 'hook', hook: topHook },
      cuttingLength: developedLength(segments),
      ownerElementIds: [input.elementId],
      layerId: `${input.zoneId}:crosstie${index}`,
      enclosesBarIds: [],
      restrainsBarIds: restrains,
      hookContactsBarIds: restrains,
      cageId: input.cageId,
      zoneId: input.zoneId,
      station: input.station,
      source: 'generated',
      locked: false,
      refs,
    },
    shape: 'crosstie',
    elementId: input.elementId,
    zoneId: input.zoneId,
    station: input.station,
    legsContributed: 1,
    legOffsets: [acrossOffset],
    cornerContainment: containment,
    hookOrientation: input.hookOrientation,
    refs,
  };
}

export interface StirrupSetResult {
  pieces: TransversePiece[];
  /** Every leg offset across the width, sorted — what the across-width limit is judged on. */
  legOffsets: number[];
  /** Non-empty when a provision could not be applied. */
  unsupported: ClauseRef[];
}

/**
 * One complete stirrup set at one station: the closed perimeter stirrup plus `legs − 2`
 * crossties, with leg positions taken from the authoritative evaluator.
 *
 * A required crosstie is never a numeric third leg: it is a fabricated piece with its own
 * path, hooks, cutting length and mark.
 */
/**
 * Interior leg offsets, snapped to longitudinal bar positions that exist on BOTH faces.
 *
 * §25.3.5(d) requires a crosstie's hooks to embrace the peripheral longitudinal bars, so an
 * interior leg belongs AT a bar, not at an arbitrary fraction of the width. Candidates are the
 * across-offsets that carry a bar near the top face and near the bottom face alike; the chooser
 * picks the `legs − 2` of them whose positions come closest to an even division, which keeps the
 * across-width gaps as uniform as the real bar layout allows.
 *
 * When no shared candidate exists the even division is returned unchanged. That leg will fail the
 * §25.7.1.2 containment check, which is the honest outcome: the section cannot host the crosstie
 * the table requires, and the caller reports it rather than drawing a tie that grips nothing.
 */
export function chooseInteriorLegOffsets(
  bars: readonly LongitudinalBarRef[],
  halfAcross: number,
  legs: number,
  evenDivision: readonly number[],
  acrossMax: number,
  tolerance = 0.006,
): { offsets: number[]; snapped: boolean } {
  const wanted = Math.max(0, legs - 2);
  const target = evenDivision.slice(1, evenDivision.length - 1);
  if (wanted === 0) return { offsets: [], snapped: true };

  // Shared candidates: an across-offset carrying a bar BOTH above and below the centreline, so a
  // crosstie there can embrace a peripheral bar at each end (§25.3.5(d)).
  const upper = bars.filter((b) => b.up > 0);
  const lower = bars.filter((b) => b.up <= 0);
  const shared = [...new Set(lower.map((b) => +b.across.toFixed(6)))]
    .filter((a) => Math.abs(a) < halfAcross - 1e-9)
    .filter((a) => upper.some((u) => Math.abs(u.across - a) <= tolerance))
    .sort((x, y) => x - y);

  const worstGap = (interior: readonly number[]): number => {
    const all = [-halfAcross, ...interior, halfAcross];
    let w = 0;
    for (let i = 1; i < all.length; i++) w = Math.max(w, all[i] - all[i - 1]);
    return w;
  };

  // Best subset of shared candidates of the required size, by smallest worst gap. `wanted` is 1
  // or 2 in practice and the candidate list is a handful of bars, so exhaustive is fine and
  // deterministic — which matters more here than cleverness.
  let best: number[] | null = null;
  const pick = (start: number, chosen: number[]) => {
    if (chosen.length === wanted) {
      if (best === null || worstGap(chosen) < worstGap(best)) best = [...chosen];
      return;
    }
    for (let i = start; i < shared.length; i++) pick(i + 1, [...chosen, shared[i]]);
  };
  pick(0, []);

  // Table 9.7.6.2.2's across-width limit and §25.3.5(d) are BOTH "debe". A snapped set that
  // breaks the spacing limit is not a compromise worth making — measured: snapping a third leg to
  // the nearest shared bar on a 6Ø12 mat put it 12 mm from the corner leg and left a 230 mm gap
  // against a 200 mm limit. So spacing wins, the even division is used, and §25.7.1.2 then
  // reports that the leg grips only one face. Both facts reach the engineer.
  if (best !== null && worstGap(best) <= acrossMax + LENGTH_EPS) {
    return { offsets: [...best].sort((x, y) => x - y), snapped: true };
  }
  return { offsets: [...target], snapped: false };
}

export function buildStirrupSet(input: StirrupSetInput): StirrupSetResult {
  const unsupported: ClauseRef[] = [];
  if (!hookAnchorageIsSupported(input.stirrupDiaMm)) {
    // §25.7.1.3(b) needs an embedment length this module does not compute. Refuse rather
    // than apply (a) outside the diameter range it states.
    unsupported.push(clause('cirsoc-201', '2025', '25.7.1.3(b)',
      'anclaje de estribos Ø20-25 con fyt > 220 MPa requiere longitud empotrada adicional'));
    return { pieces: [], legOffsets: [], unsupported };
  }

  const legs = Math.max(2, Math.floor(input.legs));
  const even = legOffsetsAcross(legs, input.b, input.cover, input.stirrupDiaMm);
  const { halfAcross } = stirrupCentrelineHalfExtents(
    input.b, input.h, input.cover, input.stirrupDiaMm);

  // Interior legs SNAP to real longitudinal bar positions.
  //
  // §25.3.5(d): a crosstie's hooks "deben abrazar las barras longitudinales periféricas". A leg
  // at a mathematically even division grips nothing when no bar happens to sit there — measured
  // on the row-2 fixture, whose 6Ø12 bottom mat has no centreline bar, so an equally-divided
  // third leg embraced air. Equal division is the fallback, not the rule.
  const chosen = chooseInteriorLegOffsets(
    input.longitudinalBars, halfAcross, legs, even, // No limit supplied means DO NOT SNAP. Snapping without knowing the across-width limit can
    // place a leg that breaks it, which is how a third leg once landed 12 mm from the corner.
    input.acrossMax ?? 0);
  const interior = chosen.offsets;

  const offsets = [-halfAcross, ...interior, halfAcross];
  // The set STRADDLES its station rather than starting at it. Centring keeps the group's
  // centroid on the design station — so the spacing the table asked for is the spacing
  // between set centres — and halves how far the outermost piece reaches, which is what
  // decides whether a set at the end of a zone still fits inside it.
  const nudge = setNudge(1 + interior.length, input.stirrupDiaMm);
  const pieces: TransversePiece[] = [buildClosedStirrup({ ...input, axialNudge: nudge(0) })];
  for (let i = 0; i < interior.length; i++) {
    pieces.push(buildCrosstie(
      { ...input, axialNudge: nudge(i + 1) }, interior[i], i + 1));
  }
  return { pieces, legOffsets: offsets, unsupported };
}

/**
 * Axial offsets for the `n` pieces of one set, centred on the design station.
 *
 * Adjacent pieces sit one bar diameter apart — touching, which is how they stand against the
 * formwork — and the group's centroid stays on the station the spacing table chose, so the
 * table's spacing remains the spacing between sets. `setSpread` is what a caller must reserve
 * at each end of a zone for the set to fit inside it.
 */
export function setNudge(n: number, diaMm: number): (i: number) => number {
  const step = diaMm / 1000;
  return (i: number) => (i - (n - 1) / 2) * step;
}

/** Full axial thickness of a set of `n` pieces, m. */
export function setSpread(n: number, diaMm: number): number {
  return Math.max(0, n - 1) * diaMm / 1000;
}

/**
 * A COLUMN tie set at one station — the perimeter tie plus the crossties §25.7.2.3 demands.
 *
 * ── The clause, and why a perimeter tie alone is not it ────────────
 *
 * §25.7.2.3(a) Every corner bar and every alternate longitudinal bar must have lateral
 *              support from the CORNER of a tie, with an included angle not greater than
 *              135°. A bar merely lying against a straight leg is not laterally supported:
 *              the leg can bow outward, which is the whole reason the sub-clause names the
 *              corner.
 * §25.7.2.3(b) No bar without that support may be more than the LESSER of 15·d_be and 150 mm
 *              CLEAR from a bar that has it.
 *
 * A single closed perimeter tie supports only the four corner bars. Measured on a 400 mm
 * square column with 8Ø16 and Ø8 ties: the mid-face bars sit 140,7 mm clear of the nearest
 * corner bar against a 120 mm limit, so (b) is violated and crossties are not optional.
 *
 * ── Both directions, from the bars that are there ──────────────────
 *
 * A crosstie spans between two OPPOSITE faces, so it can only exist on a line that carries a
 * bar at each end (§25.3.5(d) — its hooks must embrace peripheral bars). The lines are read
 * off the cage: an interior across-offset holding a bar near both the top and the bottom face
 * earns a tie spanning the depth, and an interior up-offset holding a bar near both sides
 * earns one spanning the width. For the 8-bar cage above that is exactly one of each, which
 * is the detail every drawing of that column shows.
 *
 * The perpendicular crosstie reuses `buildCrosstie` through a SWAPPED frame rather than a
 * second implementation: `b`↔`h` and `across`↔`up` describe the same piece turned ninety
 * degrees, and two spellings of one bend are two things to get wrong.
 */
export function buildColumnTieSet(input: StirrupSetInput): StirrupSetResult {
  const unsupported: ClauseRef[] = [];
  if (!hookAnchorageIsSupported(input.stirrupDiaMm)) {
    unsupported.push(clause('cirsoc-201', '2025', '25.7.1.3(b)',
      'anclaje de estribos Ø20-25 con fyt > 220 MPa requiere longitud empotrada adicional'));
    return { pieces: [], legOffsets: [], unsupported };
  }

  const { halfAcross, halfUp } = stirrupCentrelineHalfExtents(
    input.b, input.h, input.cover, input.stirrupDiaMm);

  /** Interior offsets on `axisOf` that carry a bar near each of the two opposite faces. */
  const interiorLines = (
    axisOf: (bar: LongitudinalBarRef) => number,
    spanOf: (bar: LongitudinalBarRef) => number,
    halfOnAxis: number, halfOnSpan: number,
  ): number[] => {
    const reach = seatedCornerInset(input.stirrupDiaMm, 0) + input.stirrupDiaMm / 1000;
    const near = (v: number, half: number) => Math.abs(Math.abs(v) - half) <= half - 1e-9
      ? Math.abs(v) >= half - reach - 0.02 : false;
    const out = new Set<number>();
    for (const bar of input.longitudinalBars) {
      const a = +axisOf(bar).toFixed(6);
      if (Math.abs(a) >= halfOnAxis - reach - 1e-9) continue;   // that is a face bar, not a line
      const hasHigh = input.longitudinalBars.some(
        (o) => Math.abs(axisOf(o) - a) <= 0.006 && spanOf(o) > 0 && near(spanOf(o), halfOnSpan));
      const hasLow = input.longitudinalBars.some(
        (o) => Math.abs(axisOf(o) - a) <= 0.006 && spanOf(o) <= 0 && near(spanOf(o), halfOnSpan));
      if (hasHigh && hasLow) out.add(a);
    }
    return [...out].sort((x, y) => x - y);
  };

  const acrossLines = interiorLines((b) => b.across, (b) => b.up, halfAcross, halfUp);
  const upLines = interiorLines((b) => b.up, (b) => b.across, halfUp, halfAcross);
  const nudge = setNudge(1 + acrossLines.length + upLines.length, input.stirrupDiaMm);

  const pieces: TransversePiece[] = [
    buildClosedStirrup({ ...input, axialNudge: nudge(0) }),
  ];
  // Crossties spanning the DEPTH, at interior across-offsets.
  acrossLines.forEach((offset, i) => pieces.push(buildCrosstie(
    { ...input, axialNudge: nudge(i + 1) }, offset, i + 1)));

  // Crossties spanning the WIDTH, at interior up-offsets — the same piece, frame swapped.
  const swapped: StirrupSetInput = {
    ...input,
    b: input.h, h: input.b,
    across: input.up, up: input.across,
    longitudinalBars: input.longitudinalBars.map((bar) => ({
      ...bar, across: bar.up, up: bar.across,
    })),
  };
  upLines.forEach((offset, i) => pieces.push(buildCrosstie(
    { ...swapped, axialNudge: nudge(acrossLines.length + i + 1) },
    offset, acrossLines.length + i + 1)));

  return {
    pieces,
    legOffsets: [-halfAcross, ...acrossLines, halfAcross],
    unsupported,
  };
}

// ─── Station sequence ────────────────────────────────────────────

export interface StationSequenceInput {
  from: number;
  to: number;
  spacing: number;
  /** True when another zone starts exactly at `to`, so the boundary bar belongs to it. */
  nextZoneStartsAtEnd: boolean;
}

/**
 * Stations for one zone, m from the member's i end.
 *
 * §25.7.1.1 requires anchorage at both ends and a depth extent of `d`; it prescribes **no**
 * longitudinal offset for the first stirrup. The "first stirrup at s/2 from the support face"
 * rule of common practice has no clause behind it, so it is not applied — stations run from
 * the zone boundary at the spacing the table allows, which invents nothing.
 *
 * The boundary bar is emitted by the FIRST of two adjacent zones only, so a shared boundary
 * does not produce two bars at one point. That is a fabrication error, not a tight detail.
 */
export function stirrupStations(input: StationSequenceInput): number[] {
  const { from, to, spacing } = input;
  if (!(spacing > 0) || !(to > from)) return [];
  const span = to - from;

  // ── Distributed evenly, at or under the table's maximum ────────────
  //
  // The previous rule ran stations at exactly `spacing` from the zone start and then, if the
  // last one fell short of the zone end, tacked one more on AT the end. That leaves the last
  // two stirrups a remainder apart, and a remainder is whatever the zone length happens to
  // leave over — measured on `rc-design-qa-8`, two Ø8 stirrups **31 mm** apart, four times.
  // Buildable at 19,9 mm clear, and no detailer would draw it: it is two bars where the
  // design asked for one, at a spacing nothing chose.
  //
  // Table 9.7.6.2.2 states a MAXIMUM. `n = ceil(span / s_max)` intervals of `span / n` is the
  // loosest arrangement that respects it while landing exactly on both zone ends, so it
  // satisfies the clause everywhere, covers the zone by construction, and invents no number —
  // `span / n ≤ s_max` follows from the definition of the ceiling. It is also what is
  // actually built, which is not the reason but is worth saying.
  const n = Math.max(1, Math.ceil(span / spacing - 1e-9));
  const pitch = span / n;

  const out: number[] = [];
  for (let k = 0; k <= n; k++) {
    // Skip the closing boundary when the next zone owns it: a shared boundary must not
    // produce two bars at one point, which is a fabrication error and not a tight detail.
    if (input.nextZoneStartsAtEnd && k === n) continue;
    out.push(+(from + k * pitch).toFixed(6));
  }
  return out;
}

/**
 * How many stations a zone REQUIRES, derived from the zone rather than from the pieces.
 *
 * ── Why not just count what was generated ──────────────────────────
 *
 * Because a generator that emits nothing would then satisfy the requirement trivially. The
 * whole point of the materialisation gate is to catch the gap between what the design layer
 * asked for and what the geometry layer built, and a requirement read off the output cannot
 * see that gap by construction.
 *
 * Shares `stirrupStations`' arithmetic so the two cannot drift: the count IS the length of
 * the sequence, and this function exists to name that fact at the call sites that need the
 * number without the coordinates.
 */
export function stirrupStationCount(
  from: number, to: number, spacing: number, nextZoneStartsAtEnd = false,
): number {
  return stirrupStations({ from, to, spacing, nextZoneStartsAtEnd }).length;
}

// ─── §25.7.2.3(b) unbraced-bar check ────────────────────────────

export interface UnbracedBarReport {
  ok: boolean;
  /** Clear limit actually applied, m — the lesser of 15·d_be and 150 mm. */
  limit: number;
  /** Bars further than the limit from a braced bar. */
  offenders: Array<{ id: string; clearToNearestBraced: number }>;
  refs: ClauseRef[];
}

/**
 * §25.7.2.3(b) — "Ninguna barra que no esté arriostrada lateralmente puede estar separada
 * más de 15·d_be o 150 mm libres de una barra arriostrada."
 *
 * A bar is braced when a leg of the cage reaches it, which after `buildStirrupSet` means its
 * across-offset coincides with a leg offset. The limit is the LESSER of the two terms, and it
 * is a CLEAR distance, so the two bar radii come off the centre-to-centre distance.
 */
export function unbracedBarReport(
  bars: readonly LongitudinalBarRef[],
  /**
   * The fabricated pieces, when they exist — the authoritative answer to which bars have
   * lateral support. A bare list of leg offsets is still accepted for the one-dimensional
   * case a single beam row presents.
   */
  cage: readonly TransversePiece[] | readonly number[],
  stirrupDiaMm: number,
  tolerance = 0.002,
): UnbracedBarReport {
  const limit = Math.min(15 * stirrupDiaMm / 1000, 0.150);

  // ── What "laterally supported" means, per §25.7.2.3(a) ─────────────
  //
  // A bar has lateral support when it sits in the CORNER of a tie — a bend with an included
  // angle not greater than 135°. Lying against a straight leg is not support: a straight leg
  // can bow outward, which is precisely why the sub-clause names the corner.
  //
  // So when the fabricated pieces are available the bends are read directly: every bar a
  // bend embraces is supported, and every bar it does not is not. `cornerContainment` already
  // records exactly that, for a closed tie's four corners and for a crosstie's two hooks.
  //
  // The older form compared a bar's ACROSS offset against a list of leg positions. That is a
  // one-dimensional test, adequate for a beam's single row and wrong for a column's perimeter
  // cage, where it credited a mid-face bar lying on a straight leg with support the clause
  // does not grant it — and, once corner bars were seated in their bends 2,3 mm further in,
  // stopped recognising the corner bars it was actually right about.
  const isPieces = cage.length > 0 && typeof cage[0] === 'object';
  const supportedIds = isPieces
    ? new Set((cage as readonly TransversePiece[]).flatMap((p) => p.cornerContainment
      .map((c) => c.longitudinalBarId)
      .filter((id): id is string => id !== null)))
    : null;
  const isBraced = (bar: LongitudinalBarRef) => supportedIds !== null
    ? supportedIds.has(bar.id)
    : (cage as readonly number[]).some((o) => Math.abs(o - bar.across)
      <= (stirrupDiaMm + bar.diameterMm) / 2000 + tolerance);

  const braced = bars.filter(isBraced);
  const offenders: UnbracedBarReport['offenders'] = [];
  for (const bar of bars) {
    if (isBraced(bar)) continue;
    let nearest = Number.POSITIVE_INFINITY;
    for (const b of braced) {
      const centre = Math.hypot(b.across - bar.across, b.up - bar.up);
      const clear = centre - (b.diameterMm + bar.diameterMm) / 2000;
      nearest = Math.min(nearest, clear);
    }
    if (!(nearest <= limit)) offenders.push({ id: bar.id, clearToNearestBraced: nearest });
  }
  return { ok: offenders.length === 0, limit, offenders, refs: [
    clause('cirsoc-201', '2025', '25.7.2.3(b)',
      'barra no arriostrada a no más de 15 dbe o 150 mm libres de una barra arriostrada'),
  ] };
}

/**
 * §25.7.1.2 — every bend must contain a longitudinal bar.
 *
 * Returns the bends that contain none. A non-empty result is a DEFECT: the cage has a corner
 * gripping nothing, which is exactly what the clause forbids.
 */
export function bendsWithoutLongitudinalBar(
  pieces: readonly TransversePiece[],
): Array<{ pieceId: string; at: Point3 }> {
  const out: Array<{ pieceId: string; at: Point3 }> = [];
  for (const p of pieces) {
    for (const c of p.cornerContainment) {
      if (c.longitudinalBarId === null) out.push({ pieceId: p.path.id, at: c.at });
    }
  }
  return out;
}

/**
 * Total legs a set provides across the width, for comparison against `requiredLegs`.
 *
 * Counted from the fabricated pieces, not from the number that was requested — the point of
 * materialising the cage is that the count becomes an observation rather than an intention.
 */
export function legsProvided(pieces: readonly TransversePiece[]): number {
  return pieces.reduce((n, p) => n + p.legsContributed, 0);
}

/** True when the fabricated set satisfies both columns of the table it was built from. */
export function setSatisfiesLimits(
  pieces: readonly TransversePiece[],
  limits: TransverseSpacingLimits,
  spacingAlong: number,
): { ok: boolean; alongOk: boolean; acrossOk: boolean; worstAcrossGap: number } {
  const offsets = [...new Set(pieces.flatMap((p) => p.legOffsets))].sort((a, b) => a - b);
  let worst = 0;
  for (let i = 1; i < offsets.length; i++) worst = Math.max(worst, offsets[i] - offsets[i - 1]);
  const alongOk = spacingAlong <= limits.alongMax + 1e-9;
  const acrossOk = offsets.length >= 2 && worst <= limits.acrossMax + 1e-9;
  return { ok: alongOk && acrossOk, alongOk, acrossOk, worstAcrossGap: worst };
}
