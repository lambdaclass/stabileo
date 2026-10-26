/**
 * Column-stack generation and beam-column joint coordination.
 *
 * A column stack is not a list of independent columns. Its bars run through floors, its
 * splices must sit in the permitted zone, its section may change between storeys, and at
 * every level it shares the joint with two to four beams whose top and bottom bars have
 * to pass through the same 400 mm cube. Designing each lift alone produces a set of
 * cages that cannot be assembled.
 *
 * ── Normative content (CIRSOC 201-2025) ────────────────────────
 *
 * §10.7.4  longitudinal bars offset by a change of section — the slope of the inclined
 *          portion shall not exceed 1 in 6, the portions above and below the offset are
 *          parallel to the column axis, and horizontal support must be provided by ties
 *          placed within 150 mm of the bend.
 * §10.7.5  splices of longitudinal reinforcement — lap, mechanical or welded.
 * §10.7.6  transverse reinforcement — ties enclosing the longitudinal bars, spacing not
 *          exceeding the least of 16·d_b(long), 48·d_b(tie) and the least column
 *          dimension.
 * §25.5    splice lengths.
 * §15.2    beam-column joints — the joint must be confined and the beam bars developed.
 *
 * ── Layer allocation at a joint ────────────────────────────────
 *
 * Two beams framing in perpendicular to each other cannot both put their top bars at the
 * same depth: one set has to sit under the other. The allocation is deterministic — by
 * descending beam depth, then by element id — so the same floor always produces the same
 * drawing. Arbitrary allocation would make every golden test unstable and, worse, would
 * make two runs of the same model produce two different bar schedules.
 *
 * Pure: no store, no runes.
 */

import { columnTieSpacing } from '../../codes/cirsoc201/transverse-spacing';
import {
  buildStraightBarWithHooks, standardHook, straightSegment, developedLength, type BarPath, type Point3,
} from '../../codes/cirsoc201/bar-geometry';
import { minClearSpacingColumn } from '../../codes/cirsoc201/spacing';
import { deriveCompressionDevelopment } from '../../codes/cirsoc201/anchorage';
import { seatedLongitudinalHalfExtents } from '../../codes/cirsoc201/transverse-cage';
import { clause, type ClauseRef, type RegulationEdition } from '../../codes/regulation';
import { computeColumnLayout } from '../station-design-forces';
import { MAX_NONCONTACT_PITCH_MM } from './splice';

// ─── Column stacks ───────────────────────────────────────────────

export interface ColumnLift {
  elementId: number;
  /** Base elevation of this lift, m. */
  baseZ: number;
  /** Top elevation, m. */
  topZ: number;
  b: number;
  h: number;
  /**
   * Plan centre of the column at this lift: its axis, the node plus the insertion offset the
   * model declares. Moves when the section is offset.
   */
  centre: { x: number; y: number };
  /**
   * Plan position of the lift's nodes, where its joints are made. Differs from `centre` where
   * the model declares an insertion (a column placed by a face or a corner). Absent: `centre`.
   */
  nodePlan?: { x: number; y: number };
  /** Longitudinal bars chosen for this lift. */
  bars: { count: number; diameterMm: number };
  /** Tie diameter, mm. */
  tieDia: number;
  cover: number;
  /** Denser ties at both ends of the lift (the design's `tieZones`): length from each end and spacing, m. */
  endZone?: { length: number; spacing: number };
}

export interface ColumnStackInput {
  stackId: string;
  /** Lifts ordered bottom to top. */
  lifts: ColumnLift[];
  fc: number;
  fy: number;
  maxAggregateSizeMm: number;
  edition: RegulationEdition;
  /** Lap-splice length for a bar of the given diameter, m. */
  lapSplice: (diameterMm: number) => number;
  /**
   * Depth of the deepest beam framing in at each level, m, keyed by lift index (the joint above).
   *
   * Alone, it says the beams lie centred on the node — the centroidal convention, which holds
   * only where the model declares no insertion — and the joint spans the node ± half that depth
   * (`jointBand`). Reading the node as the top of the floor put the upper lift's bars, its
   * splices and the lower lift's ties in the beams' own half of the joint below the node.
   */
  beamDepthAtTop: Map<number, number>;
  /** Depth of the deepest beam framing in at the lowest lift's base (a ground beam), m. */
  beamDepthAtBase?: number;
  /**
   * The joint each level's beams actually make, m, keyed like `beamDepthAtTop`: from the lowest
   * soffit to the highest top face of the beams framing in, each read on its own axis — the
   * node plus its declared insertion (`member-offsets.ts` `memberReferenceLine`). A top-flush
   * beam makes the band [node − h, node], not node ± h/2. Given, `jointBand` reads it; absent,
   * the depths above centred on the node.
   */
  jointAtTop?: Map<number, { lo: number; hi: number }>;
  /** The joint at the lowest lift's base, as `jointAtTop`. */
  jointAtBase?: { lo: number; hi: number };
  /**
   * Does the top lift's steel need TENSION development at the roof?
   *
   * §25.4.1.2: "Los ganchos y las barras conformadas con cabeza no se deben emplear para
   * anclar barras en compresión." Not "need not" — SHALL NOT. The commentary explains
   * why: hooks are not effective in compression and no data supports crediting them.
   *
   * So a hook at a roof termination is not a conservative default. On a compression-only
   * column it is geometry the code refuses to credit, and it was being generated
   * unconditionally — which is also what put a 12db horizontal extension through the beam's
   * top mat at every roof joint on the QA fixture.
   *
   * When false, the bars terminate straight and are developed under §25.4.9 (ldc).
   */
  roofTermination: boolean;
  /**
   * Plan offsets for the longitudinal bars, relative to the lift centre.
   *
   * Supplied by the coordination search, which chooses the cage ARRANGEMENT — where the
   * non-corner face bars sit — as one of its variables. Evenly spreading them, which is
   * what this function does on its own, leaves narrow channels between column bars and can
   * make a large beam bar impossible to thread; clustering them toward the corners at the
   * §25.2.3 minimum opens a wide central channel and is equally legal.
   *
   * Absent, the even distribution below is used, which keeps every existing caller and
   * every golden test unchanged.
   */
  barPositions?: ReadonlyArray<{ x: number; y: number }>;
}

export type TransitionKind = 'none' | 'countChange' | 'diameterChange' | 'offset' | 'sectionChange';

export interface ColumnTransition {
  /** Index of the lift BELOW the transition. */
  liftIndex: number;
  z: number;
  kinds: TransitionKind[];
  /** Offset slope, run over rise, when `kinds` includes 'offset'. */
  offsetSlope?: number;
  /** True when the offset slope exceeds the §10.7.4.1 limit of 1 in 6. */
  offsetExceedsLimit?: boolean;
  /** Per-face movement between the two lifts — what §10.7.4.2 actually measures. */
  faces?: FaceOffsets;
  /**
   * True when §10.7.4.2 forbids bending: a face is offset 75 mm or more.
   *
   * Independent of `offsetExceedsLimit`. The slope limit governs a bar that MAY be bent;
   * this says it may not be bent at all, and separate lap-spliced dowels go in instead.
   */
  requiresSeparateDowels?: boolean;
  /** Bars that cannot continue and must be spliced or terminated. */
  discontinued: number;
  note: string;
  refs: ClauseRef[];
}


/**
 * Clear distance between one face's hook tier and the next, m.
 *
 * NOT a chosen number. Two hook extensions in adjacent tiers run alongside each other, so
 * they are exactly what §25.2.3 governs: parallel longitudinal bars in a column, needing
 * max(40 mm, 1,5db, 4/3 dagg) between them.
 *
 * It was 5 mm — enough to stop the extensions interpenetrating and nowhere near enough to
 * satisfy the clause. The collision checker was right to report it: 36 conflicts on the QA
 * fixture, every one at 5 mm clear against a 40 mm requirement. Separating steel so that it
 * no longer overlaps is not the same as separating it legally.
 */
function hookTierGap(diameterMm: number, edition: RegulationEdition, dagg: number): number {
  return minClearSpacingColumn(edition, {
    barDiameterMm: diameterMm, maxAggregateSizeMm: dagg,
  }).minClear;
}

/**
 * Which face a column bar belongs to, and which way its roof hook turns.
 *
 * ── The defect this replaces ───────────────────────────────────────
 *
 * Every roof hook used to turn along ±x: `hookNormal: { x: -Math.sign(p.x) || 1, y: 0 }`.
 * So every bar on one face pointed its 12db extension along the SAME line at the SAME
 * elevation, and adjacent bars simply overlapped. On the flagship two Ø20 bars on the
 * y = −211 face ran from x = −141 to 99 and from x = −71 to 169, two millimetres apart in
 * z. That is 214 prohibited overlaps, and none of them was a crank: §10.7.4 offset bars
 * never entered into it, because the bars are straight.
 *
 * ── The rule ───────────────────────────────────────────────────────
 *
 * A bar's hook turns inward perpendicular to the face it sits on, so every extension on
 * one face is parallel to its neighbours and offset from them by the bar spacing. That
 * alone fixes same-face overlap.
 *
 * It does not fix opposite and adjacent faces: a −y bar's extension runs +y, a +y bar's
 * runs −y, and in a 400 mm column two 240 mm extensions on the same line still meet. So
 * each face also gets its own elevation tier. Within a tier all extensions are parallel
 * and never meet; across tiers they are at different heights and cannot.
 *
 * Corner bars sit on two faces and are assigned to exactly one, deterministically: the
 * face they are closer to, ties broken by face order. A corner bar must not be counted
 * twice or left out.
 */
function faceOf(
  p: { x: number; y: number }, halfB: number, halfH: number,
): { tier: number; inward: Point3 } {
  // Distance to each face, in face order: −y, +x, +y, −x.
  const d = [
    Math.abs(p.y + halfH),
    Math.abs(p.x - halfB),
    Math.abs(p.y - halfH),
    Math.abs(p.x + halfB),
  ];
  const inward: Point3[] = [
    { x: 0, y: 1, z: 0 }, { x: -1, y: 0, z: 0 },
    { x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 },
  ];
  let best = 0;
  for (let i = 1; i < 4; i++) if (d[i] < d[best] - 1e-9) best = i;
  return { tier: best, inward: inward[best] };
}

/** §10.7.4.1 — the maximum slope of an offset bent bar, expressed as run/rise. */
export const MAX_OFFSET_SLOPE = 1 / 6;

/**
 * §10.7.4.2 — the face offset at or above which a bar MAY NOT be bent.
 *
 * "Cuando la cara de la columna está desalineada 75 mm o más, las barras longitudinales no
 * se deben doblar. Se deben colocar dovelas separadas empalmadas por yuxtaposición con las
 * barras longitudinales adyacentes a las caras desalineadas de la columna."
 *
 * A prohibition, not a slope check. A gentle slope buys no exemption from it.
 */
export const FACE_OFFSET_NO_BEND = 0.075;

export interface FaceOffsets {
  /** Per-face offset between the two lifts, m. Always non-negative. */
  xMinus: number;
  xPlus: number;
  yMinus: number;
  yPlus: number;
  max: number;
  /** Names of the faces at or above the §10.7.4.2 threshold. */
  beyondLimit: Array<'xMinus' | 'xPlus' | 'yMinus' | 'yPlus'>;
}

/**
 * How far each column face moves between two lifts.
 *
 * This is what §10.7.4.2 measures, and it is NOT the centre shift the code used to test.
 * Two independent ways a face moves, and only their combination is the offset:
 *
 *   - the axis translates            → every face moves the same way
 *   - the section changes size       → opposite faces move TOWARD each other
 *
 * A 400 mm column becoming a concentric 250 mm one has a zero centre shift and offsets all
 * four faces by 75 mm — exactly the threshold. Testing the centre alone reported no offset
 * at all for it.
 */
export function faceOffsets(
  lo: { centre: { x: number; y: number }; b: number; h: number },
  hi: { centre: { x: number; y: number }; b: number; h: number },
): FaceOffsets {
  const per = {
    xMinus: Math.abs((hi.centre.x - hi.b / 2) - (lo.centre.x - lo.b / 2)),
    xPlus: Math.abs((hi.centre.x + hi.b / 2) - (lo.centre.x + lo.b / 2)),
    yMinus: Math.abs((hi.centre.y - hi.h / 2) - (lo.centre.y - lo.h / 2)),
    yPlus: Math.abs((hi.centre.y + hi.h / 2) - (lo.centre.y + lo.h / 2)),
  };
  const names = ['xMinus', 'xPlus', 'yMinus', 'yPlus'] as const;
  return {
    ...per,
    max: Math.max(per.xMinus, per.xPlus, per.yMinus, per.yPlus),
    beyondLimit: names.filter((n) => per[n] >= FACE_OFFSET_NO_BEND - 1e-9),
  };
}

/**
 * The joint a lift meets at its top (`at: 'top'`) or its base: the band the beams framing in
 * there make on their own axes (`jointAtTop`), else the node ± half the deepest of them, and
 * nothing where no beam does. The base of a lift above the first is the joint at the top of the
 * lift below.
 */
export function jointBand(input: Pick<ColumnStackInput, 'lifts' | 'beamDepthAtTop' | 'beamDepthAtBase' | 'jointAtTop' | 'jointAtBase'>, i: number, at: 'top' | 'base'): { lo: number; hi: number } {
  const lift = input.lifts[i];
  const band = at === 'top' ? input.jointAtTop?.get(i)
    : i > 0 ? input.jointAtTop?.get(i - 1) : input.jointAtBase;
  if (band) return { lo: band.lo, hi: band.hi };
  const z = at === 'top' ? lift.topZ : lift.baseZ;
  const depth = at === 'top' ? input.beamDepthAtTop.get(i) ?? 0
    : i > 0 ? input.beamDepthAtTop.get(i - 1) ?? 0 : input.beamDepthAtBase ?? 0;
  return { lo: z - depth / 2, hi: z + depth / 2 };
}

/** Detect what changes between consecutive lifts. */
export function detectTransitions(input: ColumnStackInput): ColumnTransition[] {
  const out: ColumnTransition[] = [];
  const c = (id: string, label?: string) => clause('cirsoc-201', input.edition, id, label);

  for (let i = 0; i + 1 < input.lifts.length; i++) {
    const lo = input.lifts[i];
    const hi = input.lifts[i + 1];
    const kinds: TransitionKind[] = [];
    const refs: ClauseRef[] = [];
    const notes: string[] = [];

    if (lo.bars.count !== hi.bars.count) {
      kinds.push('countChange');
      notes.push(`La cantidad de barras pasa de ${lo.bars.count} a ${hi.bars.count}.`);
    }
    if (lo.bars.diameterMm !== hi.bars.diameterMm) {
      kinds.push('diameterChange');
      notes.push(`El diámetro pasa de Ø${lo.bars.diameterMm} a Ø${hi.bars.diameterMm}.`);
    }
    if (lo.b !== hi.b || lo.h !== hi.h) {
      kinds.push('sectionChange');
      notes.push(`La sección pasa de ${lo.b}×${lo.h} a ${hi.b}×${hi.h} m.`);
    }

    const dx = hi.centre.x - lo.centre.x;
    const dy = hi.centre.y - lo.centre.y;
    const shift = Math.hypot(dx, dy);
    const faces = faceOffsets(lo, hi);
    let offsetSlope: number | undefined;
    let offsetExceedsLimit: boolean | undefined;
    let requiresSeparateDowels: boolean | undefined;

    // A face that moves is an offset, whether the axis moved or the section shrank around
    // it. Testing `shift` alone missed every concentric size change.
    if (shift > 1e-9 || faces.max > 1e-9) {
      kinds.push('offset');
      // The bend is made within the joint depth; with no beam the lift height is used.
      const rise = input.beamDepthAtTop.get(i) ?? (lo.topZ - lo.baseZ);
      // The run the bar has to make is its OWN transverse travel. For a translation that is
      // the centre shift; for a size change the bar moves with its face.
      const run = Math.max(shift, faces.max);
      offsetSlope = rise > 0 ? run / rise : Infinity;
      offsetExceedsLimit = offsetSlope > MAX_OFFSET_SLOPE + 1e-9;
      requiresSeparateDowels = faces.beyondLimit.length > 0;
      refs.push(c('10.7.4.1', 'pendiente de la parte inclinada'));
      notes.push(
        `Las caras se desalinean hasta ${(faces.max * 1000).toFixed(0)} mm sobre una altura ` +
        `de ${(rise * 1000).toFixed(0)} mm: pendiente 1 en ` +
        `${(1 / (offsetSlope || 1e-9)).toFixed(1)}.`);
      if (requiresSeparateDowels) {
        // §10.7.4.2 governs and the slope question does not arise: the bar is not bent.
        refs.push(c('10.7.4.2', 'dovelas separadas en caras desalineadas'));
        notes.push(
          `La desalineación alcanza o supera los 75 mm del artículo 10.7.4.2 en ` +
          `${faces.beyondLimit.length} cara(s): las barras NO se doblan y se colocan ` +
          'dovelas separadas empalmadas por yuxtaposición con las barras adyacentes.');
      } else {
        notes.push(offsetExceedsLimit
          ? 'EXCEDE el límite de 1 en 6 del artículo 10.7.4.1 y la desalineación no llega a ' +
            'los 75 mm que habilitan dovelas separadas: no puede acodarse dentro del nudo.'
          : 'Dentro del límite de 1 en 6; se acodan las barras y se colocan estribos a ' +
            'menos de 150 mm del doblado.');
      }
    }

    if (kinds.length === 0) {
      out.push({
        liftIndex: i, z: lo.topZ, kinds: ['none'], discontinued: 0,
        note: 'Sin cambios: las barras continúan.', refs: [],
      });
      continue;
    }

    out.push({
      liftIndex: i, z: lo.topZ, kinds,
      offsetSlope, offsetExceedsLimit,
      faces, requiresSeparateDowels,
      discontinued: Math.max(0, lo.bars.count - hi.bars.count),
      note: notes.join(' '),
      refs: [...refs, c('10.7.5', 'empalmes de la armadura longitudinal')],
    });
  }
  return out;
}

export interface SpliceZone {
  liftIndex: number;
  /** Splice start elevation, m. */
  from: number;
  to: number;
  diameterMm: number;
  /** Bars spliced in this zone; the rest are staggered into the alternate zone. */
  barCount: number;
  /** Stagger group: 0 spliced low, 1 spliced high. */
  staggerGroup: 0 | 1;
  refs: ClauseRef[];
}

/**
 * Place lap splices just above each floor, staggered in two groups.
 *
 * Splicing every bar at the same section concentrates the whole transfer in one plane.
 * Staggering half the bars by one lap length is standard practice and is what the
 * drawing has to show.
 */
export function planSplices(input: ColumnStackInput): SpliceZone[] {
  const out: SpliceZone[] = [];
  const ref = clause('cirsoc-201', input.edition, '25.5', 'empalmes por yuxtaposición');

  for (let i = 1; i < input.lifts.length; i++) {
    const lift = input.lifts[i];
    // The lap the bars below run up into this lift (§25.5.2.2, as `generateColumnStack` lays it).
    const lap = input.lapSplice(Math.max(lift.bars.diameterMm, input.lifts[i - 1]!.bars.diameterMm));
    const half = Math.floor(lift.bars.count / 2);
    // Group 0 starts on the floor, at the top of the joint below; group 1 one lap higher.
    const floor = jointBand(input, i, 'base').hi;
    out.push({
      liftIndex: i, from: floor, to: floor + lap,
      diameterMm: lift.bars.diameterMm, barCount: half, staggerGroup: 0, refs: [ref],
    });
    out.push({
      liftIndex: i, from: floor + lap, to: floor + 2 * lap,
      diameterMm: lift.bars.diameterMm, barCount: lift.bars.count - half,
      staggerGroup: 1, refs: [ref],
    });
  }
  return out;
}

/** Column tie spacing, by the one rule of `columnTieSpacing` (25.7.2.1 in 2025, 7.10.5.2 in 2005). */
export function tieSpacing(
  longDiameterMm: number, tieDiameterMm: number, leastDimension: number,
  edition: RegulationEdition,
): { spacing: number; governedBy: '16db' | '12db' | '48dbe' | 'leastDimension'; refs: ClauseRef[] } {
  const r = columnTieSpacing(edition, longDiameterMm, tieDiameterMm, leastDimension);
  const governedBy = r.governedBy === 'longBar' ? (r.barFactor === 12 ? '12db' : '16db') : r.governedBy === 'tie' ? '48dbe' : 'leastDimension';
  return { spacing: r.spacing, governedBy, refs: [r.ref] };
}

/**
 * Plan positions of a column's longitudinal bars, relative to the section centre.
 *
 * ── One arrangement, and it is the certified one ────────────────────
 *
 * `computeColumnLayout` is what the verifier places bars with and certifies the section from.
 * Every other subsystem reads it: `column-candidates.ts` builds its 'even' candidate from it,
 * and now the physical bars, the footing dowels and the drawings do too.
 *
 * What this replaces was a fourth distribution, and it was not a cosmetic difference. For the
 * eight-bar cage it spread the four intermediate bars along ONE axis and then alternated them
 * between the two y faces, at t = 1/5, 2/5, 3/5, 4/5 of the face width — so the −y face carried
 * bars at −79,2 and +26,4 mm and the +y face at −26,4 and +79,2 mm, four bars on each of two
 * faces, none on the other two, and not one of them centred. The certificate said something
 * else: 4 + 1 per face, three bars visible on every face. Measured consequence on the reference
 * footing: the starter cage built from those positions has ZERO feasible hook arrangements —
 * the exhaustive search visits 224 nodes and every one of the eight dowels ends up in conflict.
 * The certified layout has 100.
 *
 * The count, the diameter and the total As are inputs here, never outputs. This function moves
 * bars; it does not choose how many or how big.
 */
export function columnBarPositions(
  b: number, h: number, cover: number, tieDiaMm: number,
  diameterMm: number, count: number,
): Array<{ x: number; y: number }> {
  // No spacing rule is passed: the rule governs the `issues` the layout REPORTS, not where it
  // puts the bars, and every caller here runs its own §25.2.3 check against its own edition and
  // aggregate size. Passing a half-populated rule would invite the two to disagree.
  const layout = computeColumnLayout(count, diameterMm, b, h, cover, tieDiaMm);
  return layout.bars.map((bar) => ({ x: bar.x - b / 2, y: bar.y - h / 2 }));
}

/**
 * Plan positions of one lift's longitudinal bars, relative to the lift centre.
 *
 * Extracted so the dowel emission below and the bar emission cannot diverge. This codebase
 * has already paid for three subsystems distributing column bars three different ways — a
 * dowel drawn at a position no bar occupies would be exactly the same class of defect.
 */
export function liftBarPositions(
  lift: ColumnLift,
  chosenPositions?: ReadonlyArray<{ x: number; y: number }>,
): { positions: Array<{ x: number; y: number }>; halfB: number; halfH: number; repeated: boolean } {
  // Where the bars sit is decided ONCE, by `seatedLongitudinalHalfExtents`, and read here.
  //
  // This used to be `cover + d_s + d_b/2` computed in place — the contact distance from a
  // STRAIGHT leg. At a corner the bend cuts the corner off and a bar pushed that far in lands
  // inside the arc: measured on `rc-design-qa-8`, every corner bar of every column
  // interpenetrated the joint tie above it by 3,3 mm. The beam generator was corrected for the
  // same defect; this one was not, which is exactly the divergence one shared derivation
  // exists to prevent.
  const seat = seatedLongitudinalHalfExtents(
    lift.b, lift.h, lift.cover, lift.tieDia, lift.bars.diameterMm);
  const halfB = seat.corner.halfAcross;
  const halfH = seat.corner.halfUp;

  // The coordinated arrangement is taken only if it is actually usable: the right NUMBER of
  // bars, and no two of them in the same place.
  //
  // Both guards earned their place. The override used to map the whole array rather than the
  // first `count`, so a longer list silently added bars the design never called for; and it
  // never checked for repeats, so a list carrying a position twice put two bars on one point
  // — which reads downstream as a bar interpenetrating itself, not as the missing bar it is.
  // Exactly this lift's count: the arrangement is chosen for one lift (`run-detailing` reads the
  // stack's lowest), and the first `count` positions of a larger cage are not a cage — a 16-bar
  // lift above a 28-bar one took 16 of the 28 positions, every face bar on one side of the column.
  const chosen = chosenPositions && chosenPositions.length === lift.bars.count ? chosenPositions : null;
  const distinct = chosen !== null
    && chosen.length === lift.bars.count
    && new Set(chosen.map((p) => `${Math.round(p.x * 1e5)}:${Math.round(p.y * 1e5)}`)).size
      === chosen.length;
  if (chosen && distinct) {
    return { positions: chosen.map((p) => ({ x: p.x, y: p.y })), halfB, halfH, repeated: false };
  }

  // The certified arrangement — corners plus the face bars apportioned PER FACE — from the one
  // authority. Corners seat in the bend and the intermediate face bars lie against a straight
  // leg, so the two sit on slightly different rectangles; that is the cage, not a rounding, and
  // `computeColumnLayout` carries both.
  const positions = columnBarPositions(
    lift.b, lift.h, lift.cover, lift.tieDia, lift.bars.diameterMm, lift.bars.count);
  return {
    positions, halfB, halfH,
    repeated: chosen !== null && chosen.length === lift.bars.count && !distinct,
  };
}

/**
 * The separate lap-spliced dowels §10.7.4.2 requires at an offset face.
 *
 * Geometry, and why it is this and not a bent bar: the lower lift's bar cannot reach the
 * upper lift's position without an inclined portion, and at 75 mm or more the clause forbids
 * that portion outright. So a distinct bar is cast through the transition at the UPPER lift's
 * position, long enough to lap with the upper bars above it and with the lower bars below it.
 * That is what a detailer places and what the clause describes.
 *
 * The lap with the LOWER bars is a NON-CONTACT lap — the two are a face offset apart — so
 * §25.5.1.3's transverse limit of min(lst/5, 150 mm) applies and is CHECKED. Beyond it the
 * dowel is still emitted (the steel is needed) and the shortfall is reported, because
 * silently drawing a lap the code does not credit is the worse of the two failures.
 */
function emitDowels(
  input: ColumnStackInput,
  t: ColumnTransition,
  refs: ClauseRef[],
  unsupported: string[],
  trace: string[],
): BarPath[] {
  const lo = input.lifts[t.liftIndex];
  const hi = input.lifts[t.liftIndex + 1];
  if (!lo || !hi || !t.faces) return [];

  const out: BarPath[] = [];
  // The dowel laps the upper bars above and the lower ones below: §25.5.2.2 on the larger.
  const lap = input.lapSplice(Math.max(hi.bars.diameterMm, lo.bars.diameterMm));
  const upper = liftBarPositions(hi, input.barPositions);
  // The floor the upper lift stands on: the top of the joint, where its bars start.
  const floor = jointBand(input, t.liftIndex, 'top').hi;
  // §25.5.1.3 — the transverse pitch a non-contact lap may have.
  const maxPitch = Math.min(lap / 5, MAX_NONCONTACT_PITCH_MM / 1000);

  // Only the bars ON an offset face get a dowel, and each such bar gets exactly one even if
  // it sits on two offset faces (a corner).
  const seen = new Set<number>();
  for (const face of t.faces.beyondLimit) {
    for (let k = 0; k < Math.min(upper.positions.length, hi.bars.count); k++) {
      if (seen.has(k)) continue;
      const p = upper.positions[k];
      if (!adjacentToFace(p, face, upper.halfB, upper.halfH, hi.bars.diameterMm)) continue;
      seen.add(k);
      out.push(buildStraightBarWithHooks({
        id: `${input.stackId}-D${t.liftIndex}-${k}`,
        diameterMm: hi.bars.diameterMm,
        role: 'longitudinal',
        // Straight through the transition: one lap below it and one lap above.
        start: { x: hi.centre.x + p.x, y: hi.centre.y + p.y, z: floor - lap },
        end: { x: hi.centre.x + p.x, y: hi.centre.y + p.y, z: floor + lap },
        axis: { x: 0, y: 0, z: 1 },
        hookNormal: { x: 1, y: 0, z: 0 },
        // A dowel is owned by BOTH lifts: it is the splice between them, and filing it under
        // one would leave the other's assembly missing steel that physically crosses it.
        ownerElementIds: [lo.elementId, hi.elementId],
        edition: input.edition,
        source: 'coordinated',
      }));
    }
  }

  refs.push(clause('cirsoc-201', input.edition, '25.5.1.3',
    'empalmes por yuxtaposición sin contacto'));
  trace.push(
    `Nivel +${t.z.toFixed(2)} m: ${out.length} dovela(s) Ø${hi.bars.diameterMm} de ` +
    `${(2 * lap * 1000).toFixed(0)} mm en ${t.faces.beyondLimit.length} cara(s) desalineada(s) ` +
    `(art. 10.7.4.2).`);

  if (out.length === 0) {
    // The clause asks for dowels at the offset faces and no bar sits on one. Reported rather
    // than passed over: a transition needing dowels and receiving none is not a clean result.
    unsupported.push(
      `La transición en +${t.z.toFixed(2)} m requiere dovelas separadas (art. 10.7.4.2) pero ` +
      'ninguna barra del tramo superior queda adyacente a una cara desalineada.');
  }
  if (t.faces.max > maxPitch + 1e-9) {
    unsupported.push(
      `Las dovelas en +${t.z.toFixed(2)} m quedan a ${(t.faces.max * 1000).toFixed(0)} mm de ` +
      `las barras del tramo inferior, por encima del límite de ` +
      `${(maxPitch * 1000).toFixed(0)} mm que el artículo 25.5.1.3 fija para un empalme por ` +
      'yuxtaposición sin contacto. El empalme debe resolverse con barras adicionales o un ' +
      'empalme mecánico.');
  }
  return out;
}

/**
 * Is a bar adjacent to a given face of its lift?
 *
 * §10.7.4.2 places dowels at "las barras longitudinales adyacentes a las caras desalineadas",
 * so only the bars ON an offset face get one. A bar is adjacent when it sits within its own
 * diameter of that face's bar line.
 */
function adjacentToFace(
  p: { x: number; y: number }, face: keyof FaceOffsets, halfB: number, halfH: number,
  diameterMm: number,
): boolean {
  const tol = Math.max(diameterMm / 1000, 1e-6);
  switch (face) {
    case 'xMinus': return Math.abs(p.x + halfB) <= tol;
    case 'xPlus': return Math.abs(p.x - halfB) <= tol;
    case 'yMinus': return Math.abs(p.y + halfH) <= tol;
    case 'yPlus': return Math.abs(p.y - halfH) <= tol;
    default: return false;
  }
}

export interface GeneratedColumnStack {
  bars: BarPath[];
  transitions: ColumnTransition[];
  splices: SpliceZone[];
  ties: Array<{ liftIndex: number; from: number; to: number; spacing: number; diameterMm: number }>;
  trace: string[];
  refs: ClauseRef[];
  unsupported: string[];
}

/** Generate the physical bars for a whole column stack. */
export function generateColumnStack(input: ColumnStackInput): GeneratedColumnStack {
  const trace: string[] = [];
  const unsupported: string[] = [];
  const bars: BarPath[] = [];
  const refs: ClauseRef[] = [];
  const ties: GeneratedColumnStack['ties'] = [];
  /** §10.7.4.2 dowels, appended after the lift bars so ids stay grouped and stable. */
  const dowels: BarPath[] = [];

  const transitions = detectTransitions(input);
  const splices = planSplices(input);

  for (const t of transitions) {
    trace.push(`Nivel +${t.z.toFixed(2)} m: ${t.note}`);
    refs.push(...t.refs);

    // ── §10.7.4.2: the bars are not bent, separate dowels go in ──
    //
    // These ARE emitted now. The previous behaviour reported "requires separate dowels,
    // which are not generated automatically" and drew nothing, which left the stack with an
    // unsupported condition and no steel at the offset — a drawing that is both incomplete
    // and clean-looking.
    if (t.requiresSeparateDowels && t.faces) {
      dowels.push(...emitDowels(input, t, refs, unsupported, trace));
      continue;
    }

    // Bending IS permitted by §10.7.4.2 (the offset is under 75 mm) and yet the slope will
    // not fit in the joint. Neither clause authorises a way out of that: §10.7.4.1 forbids
    // the slope and §10.7.4.2 does not reach this case, so it is reported rather than drawn.
    if (t.offsetExceedsLimit) {
      unsupported.push(
        `El acodamiento en +${t.z.toFixed(2)} m tiene pendiente 1 en ` +
        `${(1 / (t.offsetSlope || 1e-9)).toFixed(1)}, que excede el límite de 1 en 6 del ` +
        `artículo 10.7.4.1, y la desalineación de ${((t.faces?.max ?? 0) * 1000).toFixed(0)} mm ` +
        'no alcanza los 75 mm que habilitan las dovelas separadas del artículo 10.7.4.2. ' +
        'Debe aumentarse la altura disponible para el doblado o revisarse la transición.');
    }
  }

  /**
   * The crank of lift `lo`'s bar `k` under lift `hi`, toward the section's centre until the two
   * stand in contact: where both lifts share their centre and bar `k` of the one above stands
   * closer to it than two bars in contact (on its plan point, or a few mm off where the
   * diameters differ).
   */
  const crankBetween = (lo: number, hi: number, k: number): { dx: number; dy: number; off: number } | null => {
    const a = input.lifts[lo], b = input.lifts[hi];
    if (!a || !b || Math.hypot(b.centre.x - a.centre.x, b.centre.y - a.centre.y) > 1e-6) return null;
    const lowerAt = liftBarPositions(a, input.barPositions).positions;
    const upperAt = liftBarPositions(b, input.barPositions).positions;
    if (k >= Math.min(lowerAt.length, upperAt.length, b.bars.count, a.bars.count)) return null;
    const p = lowerAt[k]!, q = upperAt[k]!;
    const off = (a.bars.diameterMm + b.bars.diameterMm) / 2000;
    if (Math.hypot(q.x - p.x, q.y - p.y) >= off - 1e-4) return null;
    const r = Math.hypot(p.x, p.y);
    if (r < 1e-6) return null;
    // Inward past the upper bar, wherever it stands along that line, by the two bars in contact.
    const ux = -p.x / r, uy = -p.y / r;
    const by = Math.max(off, (q.x - p.x) * ux + (q.y - p.y) * uy + off);
    return { dx: ux * by, dy: uy * by, off: by };
  };
  for (let i = 0; i < input.lifts.length; i++) {
    const lift = input.lifts[i];
    const spacing = minClearSpacingColumn(input.edition, {
      barDiameterMm: lift.bars.diameterMm, maxAggregateSizeMm: input.maxAggregateSizeMm,
    });
    refs.push(...spacing.refs);

    // Perimeter positions, corners first then faces, deterministic — unless the
    // coordination search chose an arrangement, in which case that is the cage.
    const layout = liftBarPositions(lift, input.barPositions);
    const { positions, halfB, halfH } = layout;
    if (layout.repeated) {
      unsupported.push(
        `La disposición coordinada de ${lift.bars.count}Ø${lift.bars.diameterMm} ` +
        `repite posiciones; se usa la disposición perimetral generada.`);
    }

    // §25.2.3: the perimeter has to actually HOLD them.
    //
    // This was unchecked, and the flagship contains columns whose certified bar count is
    // 24Ø12 — which this loop happily drew at 20 mm pitch, an 8 mm clear distance against
    // the 40 mm the article requires. An illegal cage is bad on its own; it also blocks
    // every beam framing into that joint, which is how 120 beams came to be reported as
    // impossible to thread by a search that was being handed geometry no one would build.
    //
    // The count and diameter are certified and are NOT changed here. When they will not fit
    // legally, that is a real inadequacy of the section and is reported as one.
    let tightest = Infinity;
    for (let a = 0; a < positions.length; a++) {
      for (let bIdx = a + 1; bIdx < positions.length; bIdx++) {
        tightest = Math.min(tightest, Math.hypot(
          positions[a].x - positions[bIdx].x,
          positions[a].y - positions[bIdx].y) - lift.bars.diameterMm / 1000);
      }
    }
    if (Number.isFinite(tightest) && tightest < spacing.minClear - 1e-9) {
      unsupported.push(
        `Tramo ${i}: ${lift.bars.count}Ø${lift.bars.diameterMm} no entran en el perímetro ` +
        `de ${(lift.b * 1000).toFixed(0)}×${(lift.h * 1000).toFixed(0)} mm respetando la ` +
        `separación libre mínima de ${(spacing.minClear * 1000).toFixed(0)} mm ` +
        `(art. ${input.edition === '2025' ? '25.2.3' : '7.6.3'}): la disposición alcanza ` +
        `${(tightest * 1000).toFixed(0)} mm. Se requiere agrandar la sección, reducir el ` +
        'número de barras o usar haces.');
      trace.push(
        `Tramo ${i}: separación libre ${(tightest * 1000).toFixed(0)} mm < ` +
        `${(spacing.minClear * 1000).toFixed(0)} mm requerida.`);
    }

    // Bars stand on the floor below (the top of its joint; the lift's base at the first lift)
    // and run through the joint above, plus the lap above it unless this is the top lift.
    const isTop = i === input.lifts.length - 1;
    // §25.5.2.2: bars of two sizes lap the larger of ℓd of the larger bar and ℓst of the smaller.
    // The lap is the lower bars running on past the floor, and it was the lower bar's own ℓst: a
    // Ø16 lift under a Ø20 one ran up 759,5 mm against the 902,1 mm of ℓd(Ø20). Class B on the
    // larger of the two (`lapSplice` is monotonic in db) covers both terms.
    const lap = input.lapSplice(isTop ? lift.bars.diameterMm
      : Math.max(lift.bars.diameterMm, input.lifts[i + 1]!.bars.diameterMm));
    const below = jointBand(input, i, 'base');
    const above = jointBand(input, i, 'top');
    const baseZ = i > 0 ? below.hi : lift.baseZ;
    // §25.4.1.2 — a hook may anchor a bar in tension, never one in compression.
    const roofHook = isTop && input.roofTermination ? 90 : undefined;
    // At the roof a straight bar rises to the beams' top cover; a hooked one turns at the middle
    // of the joint, where its tail lies between the beams' bottom and top mats — the node only
    // where the beams are centred on it (a top-flush beam's joint is centred h/2 under it).
    const topZ = !isTop ? above.hi + lap
      : above.hi === above.lo ? lift.topZ : roofHook ? (above.lo + above.hi) / 2 : above.hi - lift.cover;

    // §25.4.9: compression development, ldc = max(0,24·fy/√f'c·db, 0,043·fy·db, 200 mm).
    // Checked against what the joint above actually offers, so a shortfall is reported
    // rather than silently swapped for a hook the code will not credit.
    if (isTop && !input.roofTermination) {
      const ldc = deriveCompressionDevelopment({ diameterMm: lift.bars.diameterMm, fy: input.fy, fc: input.fc, edition: input.edition }).ldcM;
      // Embedded from the joint's soffit to where the bar ends.
      const available = above.hi > above.lo ? topZ - above.lo : 0;
      refs.push(clause('cirsoc-201', input.edition, '25.4.9.1',
        'longitud de anclaje en compresión'));
      refs.push(clause('cirsoc-201', input.edition, '25.4.1.2',
        'los ganchos no se deben emplear para anclar barras en compresión'));
      if (available > 0 && available < ldc - 1e-9) {
        unsupported.push(
          `Tramo ${i}: la armadura de columna Ø${lift.bars.diameterMm} termina en cubierta ` +
          `con ${(available * 1000).toFixed(0)} mm de embebido, menos que la longitud de ` +
          `anclaje en compresión ldc = ${(ldc * 1000).toFixed(0)} mm (25.4.9.1).`);
      } else {
        trace.push(
          `Terminación en cubierta recta: ldc = ${(ldc * 1000).toFixed(0)} mm ` +
          `(25.4.9.1) contra ${(available * 1000).toFixed(0)} mm disponibles; ` +
          'el gancho no corresponde en compresión (25.4.1.2).');
      }
    }
    if (roofHook) {
      refs.push(...standardHook(lift.bars.diameterMm, 90, 'longitudinal').refs);
      trace.push('Terminación en cubierta: las barras longitudinales rematan con gancho a 90°.');
    }

    // ── §10.7.4.1: the lap above, the lower bars cranked into contact with the upper ones ──
    //
    // Where the lift above puts a bar on the same plan point, the two cannot share a centreline:
    // the lower bar is cranked inward, toward the section's centre, by the distance of two bars
    // in contact, at the code's steepest slope (1 in 6). It runs straight through the joint, on
    // the plan point the beams' bars were threaded past, and bends above it, at the foot of the
    // column above; the upper bar starts where the bend ends, and the two run side by side in
    // contact for the lap (§25.5.1.2). The column's ties hold the bend (§10.7.4.1, within 150
    // mm). Drawn straight, both bars sat on one axis and every lap was reported unarranged; bent
    // inside the joint, the cranked bars crossed the beams' bars there.
    /** Where this lift's bar `k` starts: above the bend of the bar below it, where that one is cranked. */
    const raiseOf = (k: number) => { const c = i > 0 ? crankBetween(i - 1, i, k) : null; return c ? 6 * c.off : 0; };
    let cranked = 0;

    for (let k = 0; k < Math.min(positions.length, lift.bars.count); k++) {
      const p = positions[k];
      const crank = crankBetween(i, i + 1, k);
      if (crank) {
        const x0 = lift.centre.x + p.x, y0 = lift.centre.y + p.y;
        const zStart = above.hi;
        const zEnd = zStart + 6 * crank.off;
        // The lap runs from the end of the bend, where the upper bar starts.
        const zTop = zEnd + lap;
        const zBase = baseZ + raiseOf(k);
        if (zStart > zBase + 1e-6 && zTop > zEnd + 1e-6) {
          const a: Point3 = { x: x0, y: y0, z: zBase };
          const b: Point3 = { x: x0, y: y0, z: zStart };
          const c: Point3 = { x: x0 + crank.dx, y: y0 + crank.dy, z: zEnd };
          const d: Point3 = { x: x0 + crank.dx, y: y0 + crank.dy, z: zTop };
          const segments = [straightSegment(a, b), straightSegment(b, c), straightSegment(c, d)];
          bars.push({
            id: `${input.stackId}-L${i}-v${k}`, diameterMm: lift.bars.diameterMm, role: 'longitudinal',
            segments, startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
            cuttingLength: developedLength(segments), ownerElementIds: [lift.elementId],
            source: 'generated', locked: false, refs: [],
          });
          cranked++;
          continue;
        }
      }
      const face = roofHook ? faceOf(p, halfB, halfH) : null;
      // Each face's hooks get their own elevation, so extensions that run along the same
      // axis never share a plane. See `faceOf` and `HOOK_TIER_GAP`.
      const tierLift = face
        ? face.tier * (lift.bars.diameterMm / 1000
          + hookTierGap(lift.bars.diameterMm, input.edition, input.maxAggregateSizeMm ?? 19))
        : 0;
      const start: Point3 = { x: lift.centre.x + p.x, y: lift.centre.y + p.y, z: baseZ + raiseOf(k) };
      const end: Point3 = {
        x: lift.centre.x + p.x, y: lift.centre.y + p.y, z: topZ - tierLift,
      };
      bars.push(buildStraightBarWithHooks({
        id: `${input.stackId}-L${i}-v${k}`,
        diameterMm: lift.bars.diameterMm, role: 'longitudinal',
        start, end,
        axis: { x: 0, y: 0, z: 1 },
        // Roof hooks turn inward, PERPENDICULAR TO THE BAR'S OWN FACE.
        hookNormal: face ? face.inward : { x: 1, y: 0, z: 0 },
        endHook: roofHook,
        ownerElementIds: [lift.elementId], edition: input.edition,
      }));
    }

    if (cranked > 0) {
      refs.push(clause('cirsoc-201', input.edition, '10.7.4.1', 'barras acodadas: pendiente no mayor que 1 en 6'));
      trace.push(`Tramo ${i}: ${cranked} barra(s) acodada(s) sobre el nudo superior, en contacto con las del tramo de arriba en el empalme.`);
    }

    const ts = tieSpacing(lift.bars.diameterMm, lift.tieDia, Math.min(lift.b, lift.h), input.edition);
    refs.push(...ts.refs);
    const ez = lift.endZone;
    // The ties run the clear height, soffit of the joint above to the floor of the one below:
    // each joint has its own cage (`run-detailing`). The end zones run in from both.
    const clearBase = below.hi;
    const clearTop = above.lo;
    if (ez && ez.length > 0 && clearTop - clearBase > 2 * ez.length + 1e-6) {
      const sp = Math.min(ez.spacing, ts.spacing);
      ties.push(
        { liftIndex: i, from: clearBase, to: clearBase + ez.length, spacing: sp, diameterMm: lift.tieDia },
        { liftIndex: i, from: clearBase + ez.length, to: clearTop - ez.length, spacing: ts.spacing, diameterMm: lift.tieDia },
        { liftIndex: i, from: clearTop - ez.length, to: clearTop, spacing: sp, diameterMm: lift.tieDia },
      );
      trace.push(`Tramo ${i}: estribos densificados cada ${(sp * 1000).toFixed(0)} mm en ${(ez.length * 1000).toFixed(0)} mm desde cada extremo (opción del proyecto).`);
    } else {
      ties.push({
        liftIndex: i, from: clearBase, to: clearTop,
        spacing: ez ? Math.min(ez.spacing, ts.spacing) : ts.spacing, diameterMm: lift.tieDia,
      });
    }
    trace.push(
      `Tramo ${i}: ${lift.bars.count}Ø${lift.bars.diameterMm}, estribos Ø${lift.tieDia} cada ` +
      `${(ts.spacing * 1000).toFixed(0)} mm (gobierna ${ts.governedBy}).`);
  }

  return {
    bars: [...bars, ...dowels],
    transitions, splices, ties, trace, refs, unsupported,
  };
}

// ─── Joint coordination ──────────────────────────────────────────

export type JointKind = 'interior' | 'exterior' | 'corner' | 'roof';

export interface IncidentBeamAtJoint {
  elementId: number;
  /** Plan direction of the beam axis, unit vector. */
  direction: { x: number; y: number };
  /** Overall beam depth, m. */
  depth: number;
  /** Top bar diameter, mm. */
  topDiameterMm: number;
  /** True when the beam continues past the joint. */
  continuous: boolean;
}

export interface JointCoordination {
  kind: JointKind;
  /** Number of beams framing in, in plan. */
  beamCount: number;
  /** Layer index per beam: 0 is the outermost (highest) top-bar layer. */
  layers: Array<{ elementId: number; layer: number; topOffset: number }>;
  /** True when the joint is confined by transverse beams per §15.2.8. */
  confined: boolean;
  /** Beam bars requiring a hooked anchorage because they do not continue. */
  hookedAnchorages: number[];
  trace: string[];
  refs: ClauseRef[];
  unsupported: string[];
}

/**
 * Classify a joint from how many beams frame in and whether a column continues above.
 *
 * A roof joint is one with no column above: its beam top bars must hook down into the
 * joint because there is nothing to continue into.
 */
export function classifyJoint(beamCount: number, columnAbove: boolean): JointKind {
  if (!columnAbove) return 'roof';
  if (beamCount >= 4) return 'interior';
  if (beamCount === 3) return 'exterior';
  return 'corner';
}

/**
 * Allocate top-bar layers so perpendicular beams do not occupy the same depth.
 *
 * Deterministic: deepest beam first (it has the most to lose from being pushed down),
 * ties broken by element id. Arbitrary allocation would make two runs of the same model
 * produce two different schedules.
 */
export function allocateBeamLayers(
  beams: readonly IncidentBeamAtJoint[], cover: number, tieDia: number,
): JointCoordination['layers'] {
  // Group by plan axis: beams on the same axis share a layer, perpendicular ones stack.
  const axisKey = (b: IncidentBeamAtJoint) =>
    Math.abs(b.direction.x) >= Math.abs(b.direction.y) ? 'X' : 'Y';

  const axes = [...new Set(beams.map(axisKey))].sort();
  const order = axes
    .map((ax) => ({
      ax,
      members: beams.filter((b) => axisKey(b) === ax)
        .sort((p, q) => q.depth - p.depth || p.elementId - q.elementId),
    }))
    // The axis carrying the deepest beam gets the outer layer.
    .sort((a, b) =>
      (b.members[0]?.depth ?? 0) - (a.members[0]?.depth ?? 0) || a.ax.localeCompare(b.ax));

  const out: JointCoordination['layers'] = [];
  let offset = cover + tieDia / 1000;
  order.forEach((group, layer) => {
    const dia = Math.max(...group.members.map((m) => m.topDiameterMm)) / 1000;
    for (const m of group.members) {
      out.push({ elementId: m.elementId, layer, topOffset: offset + dia / 2 });
    }
    offset += dia + 0.025;   // §25.2.2 clear distance between layers
  });
  return out.sort((a, b) => a.layer - b.layer || a.elementId - b.elementId);
}

/**
 * Coordinate one beam-column joint.
 *
 * §15.2.8 confinement: a joint is confined when beams frame in on all four faces and
 * each beam covers at least three quarters of the joint face. With fewer than four
 * beams the joint is not confined, which reduces its shear strength — see the joint
 * shear module's Table 15.4.2.3 lookup.
 */
export function coordinateJoint(opts: {
  beams: readonly IncidentBeamAtJoint[];
  columnAbove: boolean;
  columnB: number;
  columnH: number;
  cover: number;
  tieDia: number;
  edition: RegulationEdition;
}): JointCoordination {
  const trace: string[] = [];
  const unsupported: string[] = [];
  const refs: ClauseRef[] = [
    clause('cirsoc-201', opts.edition, '15.2', 'nudos viga-columna'),
  ];

  const kind = classifyJoint(opts.beams.length, opts.columnAbove);
  const layers = allocateBeamLayers(opts.beams, opts.cover, opts.tieDia);

  const confined = opts.beams.length >= 4;
  refs.push(clause('cirsoc-201', opts.edition, '15.2.8', 'confinamiento por vigas transversales'));

  const hookedAnchorages = opts.beams.filter((b) => !b.continuous).map((b) => b.elementId);

  trace.push(
    `Nudo ${kind} con ${opts.beams.length} viga(s). ` +
    `${confined ? 'Confinado' : 'No confinado'} según 15.2.8.`);
  const byLayer = new Map<number, number[]>();
  for (const l of layers) {
    const g = byLayer.get(l.layer);
    if (g) g.push(l.elementId); else byLayer.set(l.layer, [l.elementId]);
  }
  for (const [layer, ids] of [...byLayer.entries()].sort((a, b) => a[0] - b[0])) {
    trace.push(`Capa ${layer}: elemento(s) ${ids.join(', ')}.`);
  }
  if (hookedAnchorages.length > 0) {
    trace.push(
      `Vigas que no continúan (${hookedAnchorages.join(', ')}): la armadura superior ` +
      'requiere anclaje con gancho dentro del nudo.');
  }
  if (kind === 'roof') {
    trace.push('Nudo de cubierta: sin columna superior, las barras de viga rematan dentro del nudo.');
  }
  if (opts.beams.length > 4) {
    unsupported.push(
      `El nudo recibe ${opts.beams.length} vigas en planta. La asignación de capas está ` +
      'definida para hasta cuatro vigas en dos ejes ortogonales; por encima de eso la ' +
      'distribución no se genera automáticamente.');
  }

  return { kind, beamCount: opts.beams.length, layers, confined, hookedAnchorages, trace, refs, unsupported };
}
