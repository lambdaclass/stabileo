/**
 * Classify what a bar pair actually IS before deciding whether it is a problem.
 *
 * ── Why this exists ────────────────────────────────────────────────
 *
 * The collision detector asked one question of every pair — "are these two bars at least
 * X apart?" — with a single X supplied by the caller. On the 408-member flagship that
 * produced ~11,000 conflicts, and inspection showed most of them were not conflicts:
 *
 *   * Every longitudinal-to-longitudinal pair was measured against the COLUMN rule
 *     (§25.2.3: max(40 mm, 1.5 db, 4/3 d_agg)), because the caller selected `beam` only
 *     when one of the bars was transverse — and stirrups are not emitted as bar paths at
 *     all. Beam bars were being held to 40 mm where §25.2.1 asks for 25 mm.
 *
 *   * Bars in different LAYERS of the same face were measured against the in-layer rule
 *     instead of §25.2.2's 25 mm between layers, so a correctly detailed two-layer group
 *     reported a violation.
 *
 *   * A beam bar crossing a column bar at ninety degrees was measured as though the two
 *     had to stand apart. They do not: crossing bars touch and are tied. What matters
 *     there is whether they physically interpenetrate.
 *
 * So the pair is classified first, and the class decides both the rule and whether a
 * shortfall is a defect at all. Required containment — a tie around the bars it confines —
 * is never a collision. Prohibited overlap is never explained away by tolerance.
 *
 * Pure: no store, no runes, no i18n.
 */

import type { BarPath, Point3 } from '../../codes/cirsoc201/bar-geometry';
import {
  minClearBetweenLayers, minClearSpacingColumn, minClearSpacingInLayer,
} from '../../codes/cirsoc201/spacing';
import { clause, type ClauseRef, type RegulationEdition } from '../../codes/regulation';

/**
 * What relationship two bars are in.
 *
 * The order matters: the first matching class wins, and they are arranged from "not a
 * conflict by construction" through to "physically impossible".
 */
export type PairClass =
  /**
   * A transverse bar enclosing or restraining a longitudinal bar it is there to confine, in
   * a relationship the generator DECLARED and whose geometry checks out. A stirrup touches
   * the bars it holds — that is its job — so this is never reported.
   *
   * It is not a role test. See `classifyPair` for what that cost.
   */
  | 'requiredContainment'
  /**
   * Non-parallel bars crossing. They are tied in contact; the code's clear-spacing rules
   * govern bars running alongside each other, not bars crossing. Only interpenetration
   * matters, and it is reported as `prohibitedOverlap`.
   */
  | 'orthogonalCrossing'
  /** Parallel bars in the same layer of the same face: §25.2.1 or §25.2.3. */
  | 'sameLayerSpacing'
  /** Parallel bars in different layers of the same face: §25.2.2, 25 mm. */
  | 'betweenLayerSpacing'
  /** Parallel bars belonging to different members meeting at a joint or support. */
  | 'crossMemberSpacing'
  /**
   * Two pieces of ONE member's transverse cage.
   *
   * Their spacing is governed by Table 9.7.6.2.2's along-member MAXIMUM, decided by the
   * design layer at each zone's own demand, and by nothing else. CIRSOC states no minimum
   * clear distance between successive stirrups.
   *
   * Before this class existed they fell through to `sameLayerSpacing` and were held to
   * §25.2.1 — a clause about longitudinal bars standing alongside each other in a layer,
   * applied to two stirrups at different stations, which are not in a layer and are not
   * longitudinal. Two Ø8 stirrups 35 mm apart were reported as 1,5 mm short of a 25,33 mm
   * requirement that does not govern them. Interpenetration between them is still a defect,
   * and it is caught before this class is reached.
   */
  | 'cageSpacing'
  /**
   * Two halves of a lap splice, §25.5.1.2 or §25.5.1.3.
   *
   * A lap is a DETAIL, and it is the one place in the code where two parallel bars are
   * meant to run alongside each other close enough to touch. Judging the pair by §25.2.1
   * clear spacing reports the detail as the defect — which is exactly what happened to
   * every materialised lap in the flagship before this class existed.
   *
   * A contact lap has no spacing requirement at all: the bars are supposed to be in
   * contact. A non-contact lap has a MAXIMUM, not a minimum — §25.5.1.3 bounds how far
   * apart the two halves may drift, and that is checked against `maxOffset`, not here.
   */
  | 'spliceLap'
  /** Bar surfaces interpenetrate. Never acceptable, never tolerance-adjusted. */
  | 'prohibitedOverlap';

export interface PairClassification {
  pairClass: PairClass;
  /** Clear distance the class demands, m. Zero means contact is acceptable. */
  requiredClear: number;
  /** True when a shortfall against `requiredClear` should be reported at all. */
  reportable: boolean;
  /** The clause the requirement comes from. Empty for classes with no spacing rule. */
  refs: ClauseRef[];
  /** i18n key naming the class, for the conflict UI. */
  labelKey: string;
}

export interface ClassificationContext {
  edition: RegulationEdition;
  maxAggregateSizeMm: number;
  /** Member kind per element id, so a beam bar is judged by the beam rule. */
  memberKindOf: (elementId: number) => 'beam' | 'column' | 'wall' | 'slab' | undefined;
  /** Layer index per bar id, when the generator recorded one. */
  layerOf?: (barId: string) => number | undefined;
  /**
   * Are these two bars the two halves of a materialised lap?
   *
   * Supplied only after `materialiseLaps` has run. Before materialisation nothing is a
   * lap, and the classifier must not pretend otherwise — an unmaterialised schedule is a
   * compatibility claim, not steel.
   */
  isLapPair?: (aId: string, bId: string) => 'contact' | 'nonContact' | undefined;
}

/** Unit direction of a bar, first point to last. */
export function barDirection(bar: BarPath): Point3 {
  const a = bar.segments[0]?.start;
  const b = bar.segments[bar.segments.length - 1]?.end;
  if (!a || !b) return { x: 1, y: 0, z: 0 };
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const L = Math.hypot(d.x, d.y, d.z);
  return L < 1e-9 ? { x: 1, y: 0, z: 0 } : { x: d.x / L, y: d.y / L, z: d.z / L };
}

/**
 * How parallel two bars are, 1 = collinear direction, 0 = perpendicular.
 *
 * The threshold below is deliberately generous: a bar at 20° to another is still running
 * "alongside" it for spacing purposes, and only a genuinely transverse crossing is exempt.
 *
 * ── Local when it can be, end-to-end when it cannot ────────────────
 *
 * `tangentA`/`tangentB` are the bars' directions AT the point of closest approach, supplied
 * by the collision detector, which knows which segment pair was closest. They are used when
 * available because "running alongside each other" is a local property and the end-to-end
 * chord only answers it for a straight bar.
 *
 * For a CLOSED STIRRUP the chord is not merely imprecise, it is meaningless: the first and
 * last points are the two hook tips, a few centimetres apart at one corner, so `barDirection`
 * returns a 45° diagonal that no part of the bar runs along. Measured on `rc-design-qa-8`:
 * that read every stirrup as parallel to the vertical column bars it crosses at a support,
 * and eight honest crossings were judged against §25.2.3's 40 mm column bar spacing — a
 * clause about two bars standing alongside each other, applied to two bars at right angles.
 */
export function parallelism(
  a: BarPath, b: BarPath, tangentA?: Point3, tangentB?: Point3,
): number {
  const u = tangentA ?? barDirection(a);
  const v = tangentB ?? barDirection(b);
  return Math.abs(u.x * v.x + u.y * v.y + u.z * v.z);
}

/** Above this the bars are treated as running alongside each other. */
export const PARALLEL_THRESHOLD = 0.5;

/** Two bars share a member when any owner element is common to both. */
export function sharesMember(a: BarPath, b: BarPath): boolean {
  return a.ownerElementIds.some((id) => b.ownerElementIds.includes(id));
}

/**
 * Which member rule governs a pair.
 *
 * When the two bars belong to different member kinds — a beam bar meeting a column bar at
 * a joint — the stricter of the two applies. That is the conservative reading and it is
 * also what a detailer does: the congested case sets the rule.
 */
function governingKind(
  a: BarPath, b: BarPath, ctx: ClassificationContext,
): 'beam' | 'column' | 'wall' | 'slab' {
  const kinds = [...a.ownerElementIds, ...b.ownerElementIds]
    .map(ctx.memberKindOf)
    .filter((k): k is NonNullable<typeof k> => k !== undefined);
  if (kinds.length === 0) return 'beam';
  // Column spacing is the strictest of the four, so its presence governs.
  return kinds.includes('column') ? 'column' : kinds[0];
}

function spacingFor(
  a: BarPath, b: BarPath, ctx: ClassificationContext,
): { minClear: number; refs: ClauseRef[] } {
  const inputs = {
    barDiameterMm: Math.max(a.diameterMm, b.diameterMm),
    maxAggregateSizeMm: ctx.maxAggregateSizeMm,
  };
  const kind = governingKind(a, b, ctx);
  const r = kind === 'column'
    ? minClearSpacingColumn(ctx.edition, inputs)
    : minClearSpacingInLayer(ctx.edition, inputs);
  return { minClear: r.minClear, refs: r.refs };
}

/**
 * Bars that are MEANT to touch may touch.
 *
 * A tie around its longitudinals and a slab mat's crossing bars are in contact by design,
 * so their surface distance is about zero. Only a real interpenetration — centrelines
 * driven into each other, as when a beam bar runs straight through a column bar — is a
 * defect. This is the depth past contact at which that becomes true.
 */
export const CONTACT_ALLOWANCE = 0.002;

/** Is `b` named in one of `a`'s declared relationship lists? */
function declares(a: BarPath, b: BarPath): boolean {
  return (a.enclosesBarIds?.includes(b.id) ?? false)
    || (a.restrainsBarIds?.includes(b.id) ?? false)
    || (a.hookContactsBarIds?.includes(b.id) ?? false);
}

/**
 * Are these two bars in a DECLARED containment relationship, either way round?
 *
 * Either direction counts because the relationship is one fact recorded on one side: the
 * cage knows which bars it holds, and a longitudinal bar does not carry a back-reference.
 */
export function declaredRelationship(a: BarPath, b: BarPath): boolean {
  return declares(a, b) || declares(b, a);
}

/**
 * Classify one pair.
 *
 * `surfaceClearance` is the measured surface-to-surface distance WITHOUT any placement
 * tolerance, in metres. Negative means the surfaces interpenetrate.
 *
 * ── Order matters, and it changed ──────────────────────────────────
 *
 * Interpenetration is now tested FIRST and is unconditional. The previous order tested the
 * contact relationships first, on the reasoning that "checking overlap first classifies
 * every tie point as a prohibited overlap, because bars that are tied together do touch."
 * That reasoning does not survive the definition: contact means `surfaceClearance ≈ 0`, and
 * `CONTACT_ALLOWANCE` already puts a 2 mm moat around it. Interpenetration means the
 * surfaces are driven THROUGH each other, which is not what tying looks like.
 *
 * What the old order actually bought was an exemption for the impossible. Rule 1 read
 * `role === 'transverse' && sharesMember(a, b)` → `requiredContainment`, reportable: false —
 * no geometry consulted, no relationship consulted. A stirrup driven straight through a
 * longitudinal bar, surfaces interpenetrating by a full diameter, was classified as required
 * containment and dropped from the conflict list before anything could measure it. Every
 * transverse-to-longitudinal pair in a member was exempt from every check.
 *
 * So containment now has to be EARNED, and it is three separate conditions:
 *
 *   1. a DECLARED relationship — the generator recorded that this piece encloses, restrains
 *      or hooks around this specific bar (`enclosesBarIds` / `restrainsBarIds` /
 *      `hookContactsBarIds`), by id, not by role;
 *   2. SHARED OWNERSHIP — a stirrup in one beam has no business containing another member's
 *      steel, and at a joint the two cages genuinely are unrelated;
 *   3. VALID GEOMETRY — the surfaces do not interpenetrate. This one is unconditional and
 *      is why it is tested first: a declared relationship is a statement of intent, and
 *      intent does not make two solids occupy one space.
 *
 * A transverse-to-longitudinal pair that is NOT in a declared relationship is no longer
 * waved past. It falls through to the crossing and spacing rules like any other pair, which
 * is the correct treatment: a stirrup passing a bar it does not hold is exactly the crossing
 * case those rules were written for.
 */
export function classifyPair(
  a: BarPath, b: BarPath, ctx: ClassificationContext, surfaceClearance: number,
  tangentA?: Point3, tangentB?: Point3,
): PairClassification {
  const interpenetrates = surfaceClearance < -CONTACT_ALLOWANCE;

  // 1. Physical interpenetration. ALWAYS prohibited, before any relationship is consulted.
  //    No clause makes two bar surfaces sharing a volume acceptable, and no declaration by
  //    the generator can make it so.
  if (interpenetrates) {
    return {
      pairClass: 'prohibitedOverlap', requiredClear: 0, reportable: true, refs: [],
      labelKey: 'detailing.pairClass.prohibitedOverlap',
    };
  }

  const oneTransverse = a.role === 'transverse' || b.role === 'transverse';
  const bothTransverse = a.role === 'transverse' && b.role === 'transverse';

  // 2. Two pieces of transverse steel. Whether they belong to one cage or to two that meet
  //    at a joint, how far apart they sit is governed by the along-member MAXIMA their own
  //    zones were built from — Table 9.7.6.2.2 for a beam, §10.7.6.2 for a column tie — and
  //    the design layer has already applied those at each zone's own demand.
  //
  //    CIRSOC states no MINIMUM clear distance between successive stirrups. Falling through
  //    to `sameLayerSpacing` applied §25.2.1/§25.2.3 to them, which are clauses about
  //    longitudinal bars standing alongside each other in a layer. Measured: a beam's first
  //    stirrup and the joint tie beside it, 17 mm apart and not touching, reported as 23 mm
  //    short of a 40 mm column-bar requirement that does not govern either of them.
  //
  //    This is a classification fix and not a suppression: interpenetration is rule 1, it is
  //    unconditional, and it has already run by the time this is reached.
  if (bothTransverse) {
    return {
      pairClass: 'cageSpacing', requiredClear: 0, reportable: false,
      refs: [clause('cirsoc-201', ctx.edition, '9.7.6.2.2',
        'separación máxima de la armadura transversal a lo largo del elemento')],
      labelKey: 'detailing.pairClass.cageSpacing',
    };
  }

  // 3. A tie or stirrup around the bars it DECLARES it confines, in the same member, with
  //    geometry that checks out (guaranteed by 1). It touches them; that is its job.
  if (oneTransverse && !bothTransverse && sharesMember(a, b) && declaredRelationship(a, b)) {
    return {
      pairClass: 'requiredContainment', requiredClear: 0, reportable: false,
      refs: [clause('cirsoc-201', ctx.edition, '25.7.1.2',
        'cada doblez debe contener una barra longitudinal')],
      labelKey: 'detailing.pairClass.requiredContainment',
    };
  }

  // 4. Crossing bars are tied in contact. Clear spacing governs bars running ALONGSIDE
  //    each other; for a crossing the only question was whether they interpenetrate, and
  //    rule 1 has already answered it.
  if (parallelism(a, b, tangentA, tangentB) < PARALLEL_THRESHOLD) {
    return {
      pairClass: 'orthogonalCrossing',
      requiredClear: 0,
      reportable: false,
      refs: [],
      labelKey: 'detailing.pairClass.orthogonalCrossing',
    };
  }

  // 5. The two halves of a lap. §25.5.1.2 puts them in contact ON PURPOSE.
  const lap = ctx.isLapPair?.(a.id, b.id);
  if (lap) {
    return {
      pairClass: 'spliceLap',
      requiredClear: 0,
      reportable: false,
      refs: [clause('cirsoc-201', ctx.edition,
        lap === 'contact' ? '25.5.1.2' : '25.5.1.3',
        lap === 'contact'
          ? 'empalmes por yuxtaposición en contacto'
          : 'separación transversal de empalmes sin contacto')],
      labelKey: 'detailing.pairClass.spliceLap',
    };
  }

  // 6. Parallel and clear of each other. Same face, different layers is §25.2.2.
  const la = ctx.layerOf?.(a.id);
  const lb = ctx.layerOf?.(b.id);
  if (sharesMember(a, b) && la !== undefined && lb !== undefined && la !== lb) {
    const layer = minClearBetweenLayers(ctx.edition);
    return {
      pairClass: 'betweenLayerSpacing', requiredClear: layer.minClear, reportable: true,
      refs: layer.refs, labelKey: 'detailing.pairClass.betweenLayerSpacing',
    };
  }

  const s = spacingFor(a, b, ctx);
  return {
    pairClass: sharesMember(a, b) ? 'sameLayerSpacing' : 'crossMemberSpacing',
    requiredClear: s.minClear,
    reportable: true,
    refs: s.refs,
    labelKey: sharesMember(a, b)
      ? 'detailing.pairClass.sameLayerSpacing'
      : 'detailing.pairClass.crossMemberSpacing',
  };
}
