/**
 * The PHYSICAL bottom mat of an isolated footing — bars, not numbers.
 *
 * ── What this closes ───────────────────────────────────────────
 *
 * `footing-flexure.ts` designs the mat completely: demand, required steel, integer bar counts,
 * spacings, the §13.3.3 distribution regions, and — since the layer order was resolved — the
 * real effective depth and bar elevation of each direction. Its own header says what it does
 * not do: "It does NOT generate bars. No physical mat geometry exists after this runs, and the
 * record's `geometry` stays REQUIRED_NOT_MODELED so a footing with a designed-but-undrawn mat
 * cannot read as a verified footing."
 *
 * This module generates them. Every number it places comes FROM that design — region width,
 * centre offset, bar count, centre spacing, bar elevation, diameter. It re-derives none of it.
 * A generator that recomputed a spacing would be a second design authority, and the two would
 * eventually disagree about the same footing while both looked right.
 *
 * So the only arithmetic here is placement: turning "12 Ø16 at 190 mm across a 2,30 m region
 * centred 0,00 m from the centroid, sitting 58 mm above the soffit" into twelve bar
 * centrelines in model coordinates, and then MEASURING the result against the schedule that
 * asked for it.
 *
 * ── The reconciliation, and why it is a failure rather than a fix ──
 *
 * Integer bar placement can disagree with the approved schedule — a region too narrow for its
 * cover-anchored layout, a spacing that does not close, a count that does not fit. When that
 * happens this module returns RECONCILIATION_FAILED and no bars, rather than moving a bar or
 * changing a count. The schedule is the design; geometry that cannot reproduce it is a
 * geometry problem, and quietly redistributing steel to make the drawing come out is how a
 * drawing comes to show a mat nobody designed.
 *
 * ── Coordinate authority, stated once ──────────────────────────
 *
 * Local footing axes, from `footing-actions.ts`: `u` along B, `v` along L, origin at the
 * footing CENTROID. A rotated footing is refused upstream in `run-footing-design.ts`, so for
 * every footing that reaches here the local axes coincide with the global ones:
 *
 *     u → world x        v → world y        w → world z, up
 *
 * The centroid sits at `node + (eccentricityB, eccentricityL)`, which is the same reading
 * `footing-actions.ts` uses: `eccentricityB` is the offset of the CENTROID from the node, so
 * the node — and with it the column — is at `−eccentricityB` in centroid coordinates.
 *
 * The mat convention is the one `footing-flexure.ts` established and this module does not get
 * to reinterpret: X bars run parallel to B and are distributed across L; Y bars run parallel
 * to L and are distributed across B.
 *
 * Pure: no store, no runes. Lengths m, areas m², masses kg.
 */

import { clause, type ClauseRef } from '../../codes/regulation';
import { msg, type EngineMessage } from '../../codes/message';
import { barMass, buildStraightBarWithHooks, type BarPath, type Point3 }
  from '../../codes/cirsoc201/bar-geometry';
import type { FootingBottomMatLayerOrder } from '../../model/footing';
import {
  barArea, matBarLength,
  type FootingDirectionDesign, type FootingMatAxis, type FootingMatDesign,
  type FootingMatRegion, type FootingRegionKind,
} from './footing-flexure';

// ─── Clause references ───────────────────────────────────────────

const R_COVER = clause('cirsoc-201', '2025', '20.5.1.3',
  'recubrimiento mínimo del hormigón colado en contacto con el suelo');
const R_SQUARE = clause('cirsoc-201', '2025', '13.3.3.2',
  'bases cuadradas: armadura uniforme en todo el ancho en ambas direcciones');
const R_RECTANGULAR = clause('cirsoc-201', '2025', '13.3.3.3',
  'bases rectangulares: faja central y zonas exteriores');
const R_CROSSING = clause('cirsoc-201', '2025', '25.2.1',
  'separación libre mínima entre barras PARALELAS de una capa');
const R_LAYERS = clause('cirsoc-201', '2025', '25.2.2',
  'separación libre entre capas de barras PARALELAS');

/**
 * Tolerance for calling a measured placement equal to the scheduled one, m.
 *
 * One micrometre. It exists because the placement arithmetic and the design arithmetic reach
 * the same quantity by different routes — the design divides a span by a gap count, the
 * placement accumulates a pitch — so binary rounding can separate them in the last bits. It
 * is emphatically NOT a construction tolerance: a real disagreement is orders of magnitude
 * larger than this and must fail rather than round away.
 */
export const PLACEMENT_TOLERANCE_M = 1e-6;

// ─── Types ───────────────────────────────────────────────────────

/** Which physical layer a direction's bars occupy. */
export type FootingMatLayer = 'LOWER' | 'UPPER';

/**
 * The `layerId` every bottom-mat bar carries.
 *
 * One function rather than a template literal at the point of use, because consumers need to
 * ask the opposite question — "is this bar footing-mat steel?" — and the only alternative is
 * matching a pattern. `isFootingMatBar` is that question, answered from the same string this
 * builds.
 *
 * It matters outside this module. A footing's bars are attributed to the COLUMN element, since
 * its dowels are column bars, so ownership alone cannot separate the mat from the transfer
 * cage: the RcCadHandoffV1 exporter scopes by ownership and, once the mat became physical,
 * silently absorbed twenty mat bars into its `columnDowel` family — a manifest that declares in
 * three places that it carries the transfer cage and NOT the mats.
 */
export function footingMatLayerId(footingId: string, axis: FootingMatAxis): string {
  return `${footingId}:bottom:${axis}`;
}

/**
 * Is this bar part of a footing's bottom mat?
 *
 * Asked of the layer identity, not of the bar id: an id prefix is a naming convention and this
 * is a structural fact about which layer the bar belongs to.
 */
export function isFootingMatBar(bar: { layerId?: string }): boolean {
  return bar.layerId !== undefined && /:bottom:(X|Y)$/.test(bar.layerId);
}

/**
 * Whether a physical mat exists.
 *
 * `NOT_MODELED` and `RECONCILIATION_FAILED` are separate because they call for different
 * actions. The first means an input was missing — no resolved layer order, a direction that
 * was never designed — and the remedy is upstream. The second means the design is complete and
 * its geometry does not close, and the remedy is the footing.
 */
export type FootingMatGeometryStatus = 'MODELED' | 'NOT_MODELED' | 'RECONCILIATION_FAILED';

/** What a geometry finding IS. Each kind has one remedy, which is why they are not one kind. */
export type FootingMatFindingKind =
  /** Some part of a bar lies outside the footing concrete. */
  | 'BAR_OUTSIDE_CONCRETE'
  /** A bar surface is closer than the cover to a plan face. */
  | 'SIDE_COVER_SHORT'
  /** A bar surface is closer than the cover to the soffit, or breaks the top face. */
  | 'BOTTOM_COVER_SHORT'
  /** Two bars of one direction occupy the same position. */
  | 'DUPLICATE_BAR'
  /**
   * Two ADJACENT bars of one direction are closer than §25.2.1 permits.
   *
   * Reported separately from the duplicate case because it is a different defect with a
   * different cause: the design lays each §13.3.3.3 region out independently and never sees
   * the pair of bars that end up either side of a band boundary. That gap belongs to no
   * region, so nothing upstream could have checked it.
   */
  | 'CLEAR_SPACING_SHORT'
  /** Generated geometry does not reproduce the approved schedule. */
  | 'SCHEDULE_MISMATCH'
  /** A bar elevation does not match the depth the direction was designed at. */
  | 'ELEVATION_MISMATCH';

export interface FootingMatFinding {
  kind: FootingMatFindingKind;
  /** True when this finding alone blocks a MODELED status. */
  blocking: boolean;
  message: EngineMessage;
  /** The bars involved, by stable id. */
  barIds: string[];
  refs: ClauseRef[];
}

/**
 * Everything that identifies one physical mat bar, beside its geometry.
 *
 * Carried apart from `BarPath` rather than crammed onto it: `BarPath` is the shared physical
 * type consumed by the viewport, the DXF writer, the collision engine and the schedule, and
 * a footing-specific provenance block on it would be dead weight for the other three. The two
 * are bound by `id`.
 */
export interface FootingMatBarProvenance {
  /** Stable id, identical to the `BarPath.id`. */
  id: string;
  /** The owning footing, e.g. `F3`. */
  footingId: string;
  axis: FootingMatAxis;
  region: FootingRegionKind;
  /** Index of the region within its direction — stable, from the design's own order. */
  regionIndex: number;
  layer: FootingMatLayer;
  diameterMm: number;
  /**
   * Schedule mark.
   *
   * Null here and filled by the assembly's mark pass, which is the only place that has every
   * family's steel and can therefore group identical fabricated items across them. A mark
   * invented per footing would collide with the assembly's.
   */
  mark: string | null;
  /** Position within its region, from 0. */
  sequence: number;
  /** The footing revision the DESIGN read. */
  designRevision: number;
  /** The assembly revision this geometry belongs to. */
  detailingRevision: number;
  /** The design record this steel answers to. */
  sourceScheduleRef: string;
  /** Bar-axis elevation above the footing soffit, m. */
  centreElevation: number;
  /** Clear distance from the soffit to the bar SURFACE, m. */
  clearCoverToSoffit: number;
  /** Offset of the bar axis from the centroid along the DISTRIBUTION axis, m. */
  distributionOffset: number;
  start: Point3;
  end: Point3;
  /** Physical straight length, m — also the cutting length for a straight bar. */
  length: number;
}

/** One schedule row: a region of a direction. Reconciles with the bars by construction. */
export interface FootingMatScheduleRow {
  axis: FootingMatAxis;
  region: FootingRegionKind;
  regionIndex: number;
  layer: FootingMatLayer;
  diameterMm: number;
  barCount: number;
  /** Centre-to-centre and clear spacing, m — copied from the design, then verified. */
  spacingCentre: number;
  spacingClear: number;
  /** One bar's cutting length, m. */
  cuttingLength: number;
  /** `barCount × cuttingLength`, m. */
  totalLength: number;
  /** Total mass, kg, through the project's one mass authority. */
  totalMassKg: number;
  /** Steel the region must provide and does, m². */
  asRequired: number;
  asProvided: number;
  /** Marks covering this row. Filled by the assembly's mark pass. */
  marks: string[];
  barIds: string[];
  designRevision: number;
  detailingRevision: number;
}

export interface FootingMatGeometry {
  status: FootingMatGeometryStatus;
  /** The resolved order this geometry was built at. Null when none was established. */
  layerOrder: FootingBottomMatLayerOrder | null;
  /** Which direction is physically lower. */
  lowerLayerAxis: FootingMatAxis | null;
  bars: BarPath[];
  provenance: FootingMatBarProvenance[];
  schedule: FootingMatScheduleRow[];
  findings: FootingMatFinding[];
  /** Why no geometry was produced. Empty when `status` is MODELED. */
  notModeled: EngineMessage[];
  /**
   * The orthogonal crossings this mat contains by design.
   *
   * Recorded as INTENTIONAL contacts rather than discovered later: §25.2.1 and §25.2.2 set
   * clear distances between PARALLEL bars — in one layer and between parallel layers — and an
   * orthogonal grid is neither case, so the upper mat resting on the lower one at every
   * crossing is the ordinary placement and not a clash. `footing-flexure.ts` already records
   * `contactAtCrossingsPermitted` per direction; this is the count of contacts that permission
   * covers, so the constructibility pass can reconcile what it finds against what was declared.
   */
  intendedCrossings: number;
  steps: string[];
  refs: ClauseRef[];
}

/** Where a footing sits, and what its geometry is, in model coordinates. */
export interface FootingMatPlacement {
  /** Assembly-facing id, e.g. `F3`. */
  footingId: string;
  /** Plan centre of the footing CENTROID, m. */
  centroid: { x: number; y: number };
  /** Elevation of the footing UNDERSIDE, m. */
  soffitZ: number;
  /** Plan dimensions, m. */
  B: number;
  L: number;
  thickness: number;
  /** Clear cover to the bottom mat, m. */
  cover: number;
  /** Members these bars belong to — the supported column, as the dowels do. */
  elementIds: number[];
  designRevision: number;
  detailingRevision: number;
  sourceScheduleRef: string;
}

// ─── Placement ───────────────────────────────────────────────────

/** Region id fragment, so an id says what the bar is without a lookup. */
const REGION_SLUG: Readonly<Record<FootingRegionKind, string>> = Object.freeze({
  FULL_WIDTH: 'fw', CENTRAL_BAND: 'cb', OUTSIDE_BAND: 'ob',
});

/**
 * Bar-axis offsets from the footing centroid along the distribution axis, m.
 *
 * Two layout models, and the difference between them is one gap — exactly the distinction
 * `layoutRegion` makes when it chooses a bar count, restated here as positions rather than as
 * a count. Restated, not re-decided: `spacingCentre` is the design's, and the assertion in
 * `placeDirection` requires the positions this produces to reproduce it.
 *
 *   EDGE_ANCHORED   the outermost bar stands one cover plus one half diameter in from the
 *                   formwork and `n` bars leave `n − 1` equal gaps across what is left. That
 *                   is how a footing schedule is written and how it is hand-checked.
 *   TRIBUTARY_PITCH one bar per tributary strip of width `w/n`, so the first sits half a pitch
 *                   in from the region boundary. A §13.3.3.3 band boundary is not formwork and
 *                   there is no cover to take there.
 */
function regionOffsets(
  region: FootingMatRegion, diameterMm: number, cover: number,
): number[] {
  const db = diameterMm / 1000;
  const n = region.barCount;
  const low = region.centreOffset - region.width / 2;
  if (region.layoutModel === 'EDGE_ANCHORED') {
    if (n < 2) return n === 1 ? [region.centreOffset] : [];
    const first = low + cover + db / 2;
    return Array.from({ length: n }, (_, i) => first + i * region.spacingCentre);
  }
  return Array.from({ length: n }, (_, i) => low + (i + 0.5) * region.spacingCentre);
}

interface DirectionPlacement {
  bars: BarPath[];
  provenance: FootingMatBarProvenance[];
  schedule: FootingMatScheduleRow[];
  findings: FootingMatFinding[];
  steps: string[];
}

/**
 * Place one direction's bars.
 *
 * `span` is the dimension the bars RUN along and `width` the one they are distributed across —
 * the same split every per-axis quantity in the footing code uses. For direction X those are
 * `B` and `L`; for Y they are `L` and `B`.
 */
function placeDirection(
  place: FootingMatPlacement, dir: FootingDirectionDesign, layer: FootingMatLayer,
  minClear: number,
): DirectionPlacement {
  const bars: BarPath[] = [];
  const provenance: FootingMatBarProvenance[] = [];
  const schedule: FootingMatScheduleRow[] = [];
  const findings: FootingMatFinding[] = [];
  const steps: string[] = [];

  const alongX = dir.axis === 'X';
  const span = alongX ? place.B : place.L;
  const width = alongX ? place.L : place.B;
  const db = dir.diameterMm / 1000;
  const cover = place.cover;
  const length = matBarLength(span, cover);
  // The bar runs the full span less one cover at EACH end, because §20.5.1's cover is measured
  // from the concrete face to the bar SURFACE and a straight bar end is a surface. One
  // definition, shared with the AUTO steel comparison — `matBarLength` — so the mass the layer
  // order was chosen by and the mass the schedule states cannot differ.
  const halfSpan = length / 2;
  const z = place.soffitZ + dir.centreElevation;

  /**
   * The elevation identity, asserted rather than assumed.
   *
   * `thickness − centreElevation` IS the effective depth by construction:
   * `centreElevation = cover + barsBelow + d_b/2` and `d = thickness − cover − barsBelow −
   * d_b/2`. If a future edit to either expression breaks that, the bar is drawn at an
   * elevation the design did not use, and the two would agree on paper and not in the model.
   */
  const impliedDepth = place.thickness - dir.centreElevation;
  if (Math.abs(impliedDepth - dir.d) > PLACEMENT_TOLERANCE_M) {
    findings.push({
      kind: 'ELEVATION_MISMATCH', blocking: true,
      message: msg('footing.geometry.elevationMismatch', {
        axis: dir.axis, implied: +impliedDepth.toFixed(6), designed: +dir.d.toFixed(6),
      }),
      barIds: [], refs: [],
    });
  }

  const axisVector: Point3 = alongX ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const allOffsets: Array<{ offset: number; id: string }> = [];

  dir.regions.forEach((region, regionIndex) => {
    const offsets = regionOffsets(region, dir.diameterMm, cover);
    const zoneId = `${place.footingId}:mat:${dir.axis}:${region.kind}:${regionIndex}`;
    const layerId = footingMatLayerId(place.footingId, dir.axis);
    const idPrefix =
      `${place.footingId}-mat${dir.axis}-${REGION_SLUG[region.kind]}${regionIndex}`;

    // ── The count, before anything is placed ─────────────────
    if (offsets.length !== region.barCount) {
      findings.push({
        kind: 'SCHEDULE_MISMATCH', blocking: true,
        message: msg('footing.geometry.countMismatch', {
          axis: dir.axis, region: region.kind,
          scheduled: region.barCount, placed: offsets.length,
        }),
        barIds: [], refs: [],
      });
      return;
    }

    // ── The pitch the placement actually produced ────────────
    //
    // Measured from the positions rather than copied from the design, which is the only way
    // the comparison proves anything: a placement that read `spacingCentre` and then asserted
    // it would be comparing a number with itself.
    for (let i = 1; i < offsets.length; i++) {
      const pitch = offsets[i] - offsets[i - 1];
      if (Math.abs(pitch - region.spacingCentre) > PLACEMENT_TOLERANCE_M) {
        findings.push({
          kind: 'SCHEDULE_MISMATCH', blocking: true,
          message: msg('footing.geometry.spacingMismatch', {
            axis: dir.axis, region: region.kind,
            placed: +(pitch * 1000).toFixed(3),
            scheduled: +(region.spacingCentre * 1000).toFixed(3),
          }),
          barIds: [], refs: [],
        });
        break;
      }
    }

    const barIds: string[] = [];
    offsets.forEach((offset, sequence) => {
      const id = `${idPrefix}-${sequence}`;
      barIds.push(id);
      allOffsets.push({ offset, id });

      const along = alongX ? place.centroid.x : place.centroid.y;
      const across = alongX ? place.centroid.y : place.centroid.x;
      const start: Point3 = alongX
        ? { x: along - halfSpan, y: across + offset, z }
        : { x: across + offset, y: along - halfSpan, z };
      const end: Point3 = alongX
        ? { x: along + halfSpan, y: across + offset, z }
        : { x: across + offset, y: along + halfSpan, z };

      const bar = buildStraightBarWithHooks({
        id, diameterMm: dir.diameterMm, role: 'longitudinal',
        start, end, axis: axisVector,
        // No hook is generated, so the normal only has to be a valid unit vector. Stated
        // rather than left to a default: a mat bar that needed a hook would be a §13.2.8
        // decision this pass does not make, and `footing-mat-anchorage.ts` reports the
        // shortfall instead of bending the bar.
        hookNormal: { x: 0, y: 0, z: 1 },
        ownerElementIds: place.elementIds,
        layerId,
      });
      bar.zoneId = zoneId;
      bars.push(bar);

      // ── Cover, measured to the bar SURFACE ────────────────
      //
      // Not to the centreline. That distinction is the whole reason `clearCoverToSoffit` and
      // `centreElevation` differ by a half diameter in the design, and a check written against
      // the centreline would pass a bar whose steel is one half diameter into the cover.
      const sideLow = width / 2 + offset - db / 2;
      const sideHigh = width / 2 - offset - db / 2;
      const worstSide = Math.min(sideLow, sideHigh);
      if (worstSide < cover - PLACEMENT_TOLERANCE_M) {
        findings.push({
          kind: 'SIDE_COVER_SHORT', blocking: true,
          message: msg('footing.geometry.sideCoverShort', {
            axis: dir.axis, region: region.kind, bar: id,
            measured: +(worstSide * 1000).toFixed(1), required: +(cover * 1000).toFixed(1),
          }),
          barIds: [id], refs: [R_COVER],
        });
      }
      if (worstSide < -PLACEMENT_TOLERANCE_M) {
        findings.push({
          kind: 'BAR_OUTSIDE_CONCRETE', blocking: true,
          message: msg('footing.geometry.outsideConcrete', {
            axis: dir.axis, bar: id, over: +(-worstSide * 1000).toFixed(1),
          }),
          barIds: [id], refs: [],
        });
      }
      // The top of the bar must stay inside the section. `d > d_b/2` is the same statement,
      // and a footing thin enough to break it is one whose mat does not fit at all.
      const toTopFace = place.thickness - dir.centreElevation - db / 2;
      if (dir.clearCoverToSoffit < cover - PLACEMENT_TOLERANCE_M
        || toTopFace < -PLACEMENT_TOLERANCE_M) {
        findings.push({
          kind: 'BOTTOM_COVER_SHORT', blocking: true,
          message: msg('footing.geometry.bottomCoverShort', {
            axis: dir.axis, bar: id,
            measured: +(dir.clearCoverToSoffit * 1000).toFixed(1),
            required: +(cover * 1000).toFixed(1),
            toTop: +(toTopFace * 1000).toFixed(1),
          }),
          barIds: [id], refs: [R_COVER],
        });
      }

      provenance.push({
        id, footingId: place.footingId, axis: dir.axis,
        region: region.kind, regionIndex, layer,
        diameterMm: dir.diameterMm, mark: null, sequence,
        designRevision: place.designRevision,
        detailingRevision: place.detailingRevision,
        sourceScheduleRef: place.sourceScheduleRef,
        centreElevation: dir.centreElevation,
        clearCoverToSoffit: dir.clearCoverToSoffit,
        distributionOffset: offset,
        start, end, length: bar.cuttingLength,
      });
    });

    schedule.push({
      axis: dir.axis, region: region.kind, regionIndex, layer,
      diameterMm: dir.diameterMm, barCount: region.barCount,
      spacingCentre: region.spacingCentre, spacingClear: region.spacingClear,
      cuttingLength: length,
      totalLength: region.barCount * length,
      totalMassKg: region.barCount * barMass(length, dir.diameterMm),
      asRequired: region.asRequired, asProvided: region.asProvided,
      marks: [], barIds,
      designRevision: place.designRevision,
      detailingRevision: place.detailingRevision,
    });
  });

  // ── Adjacent bars, across the whole direction ──────────────
  //
  // Sorted globally rather than region by region. A §13.3.3.3 band boundary is a gap that
  // belongs to NO region, so the design — which lays each region out independently — never
  // examined the pair of bars either side of it. That gap is checked here or nowhere.
  allOffsets.sort((a, b) => a.offset - b.offset || a.id.localeCompare(b.id));
  for (let i = 1; i < allOffsets.length; i++) {
    const gap = allOffsets[i].offset - allOffsets[i - 1].offset;
    const pair = [allOffsets[i - 1].id, allOffsets[i].id];
    if (gap < PLACEMENT_TOLERANCE_M) {
      findings.push({
        kind: 'DUPLICATE_BAR', blocking: true,
        message: msg('footing.geometry.duplicateBar', {
          axis: dir.axis, a: pair[0], b: pair[1],
        }),
        barIds: pair, refs: [],
      });
      continue;
    }
    const clear = gap - db;
    if (clear < minClear - PLACEMENT_TOLERANCE_M) {
      findings.push({
        kind: 'CLEAR_SPACING_SHORT', blocking: true,
        message: msg('footing.geometry.clearSpacingShort', {
          axis: dir.axis, a: pair[0], b: pair[1],
          measured: +(clear * 1000).toFixed(1), required: +(minClear * 1000).toFixed(1),
        }),
        barIds: pair, refs: [R_CROSSING],
      });
    }
  }

  const placedAs = bars.length * barArea(dir.diameterMm);
  steps.push(
    `Dirección ${dir.axis} (capa ${layer === 'LOWER' ? 'INFERIOR' : 'SUPERIOR'}): ` +
    `${bars.length} barra(s) Ø${dir.diameterMm} paralelas a ${dir.barsParallelTo}, ` +
    `repartidas en ${width.toFixed(2)} m, de ${length.toFixed(3)} m de largo físico ` +
    `(${span.toFixed(2)} m − 2 × ${(cover * 1000).toFixed(0)} mm de recubrimiento), ` +
    `con el eje a ${(dir.centreElevation * 1000).toFixed(1)} mm sobre la cara inferior y ` +
    `${(dir.clearCoverToSoffit * 1000).toFixed(1)} mm de recubrimiento libre medido a la ` +
    'SUPERFICIE de la barra.',
    `As materializada = ${(placedAs * 1e4).toFixed(2)} cm² contra ` +
    `${(dir.asProvided * 1e4).toFixed(2)} cm² del cómputo y ` +
    `${(dir.asGoverning * 1e4).toFixed(2)} cm² requeridos.`);

  // ── Provided steel, measured from the bars that exist ──────
  if (Math.abs(placedAs - dir.asProvided) > 1e-12) {
    findings.push({
      kind: 'SCHEDULE_MISMATCH', blocking: true,
      message: msg('footing.geometry.providedAsMismatch', {
        axis: dir.axis,
        placed: +(placedAs * 1e4).toFixed(4),
        scheduled: +(dir.asProvided * 1e4).toFixed(4),
      }),
      barIds: [], refs: [],
    });
  }

  return { bars, provenance, schedule, findings, steps };
}

// ─── The mat ─────────────────────────────────────────────────────

/**
 * Generate the physical bottom mat from the authoritative design.
 *
 * Returns NOT_MODELED — with reasons and no bars — when the design does not support geometry:
 * no resolved layer order, or a direction that is not DESIGNED. Both are honest absences
 * rather than partial mats: a footing with one direction drawn is not a footing with a mat,
 * and §13.3.3 requires reinforcement in both.
 */
export function generateFootingMat(
  place: FootingMatPlacement, design: FootingMatDesign,
  /** §25.2.1 minimum clear distance the design was laid out to, m. Per direction. */
  minClear: { x: number; y: number },
): FootingMatGeometry {
  const notModeled: EngineMessage[] = [];
  const refs: ClauseRef[] = [R_COVER, R_CROSSING, R_LAYERS];
  const order = design.layerOrder.resolved;

  const empty = (status: FootingMatGeometryStatus): FootingMatGeometry => ({
    status, layerOrder: order, lowerLayerAxis: design.layerOrder.lowerLayerAxis,
    bars: [], provenance: [], schedule: [], findings: [], notModeled,
    intendedCrossings: 0,
    steps: [], refs,
  });

  if (design.layerOrder.status !== 'ESTABLISHED' || order === null) {
    // No order means no elevations. The design already reports both directions at the
    // conservative envelope depth and says why; drawing bars at an envelope depth would put
    // steel in the model at an elevation nobody chose.
    notModeled.push(msg('footing.geometry.noLayerOrder', {
      rationale: design.layerOrder.rationale,
    }));
    return empty('NOT_MODELED');
  }
  for (const dir of [design.x, design.y]) {
    if (dir.status !== 'DESIGNED') {
      notModeled.push(msg('footing.geometry.directionNotDesigned', {
        axis: dir.axis, status: dir.status,
      }));
    }
  }
  if (notModeled.length > 0) return empty('NOT_MODELED');

  const lowerAxis = design.layerOrder.lowerLayerAxis as FootingMatAxis;
  const layerOf = (axis: FootingMatAxis): FootingMatLayer =>
    axis === lowerAxis ? 'LOWER' : 'UPPER';

  // The design's own per-direction role is the authority, not a second reading of the order.
  // They must agree; if they ever did not, the bar would sit at one depth and be designed at
  // another, which is the exact defect the elevation assertion in `placeDirection` catches.
  const x = placeDirection(place, design.x, layerOf('X'), minClear.x);
  const y = placeDirection(place, design.y, layerOf('Y'), minClear.y);

  const findings = [...x.findings, ...y.findings];
  const bars = [...x.bars, ...y.bars];
  const steps = [
    `Orden de capas resuelto: ${order} — la parrilla ${lowerAxis} va en la capa INFERIOR ` +
    `(${design.layerOrder.rationale}).`,
    ...x.steps, ...y.steps,
    `Cruces ortogonales previstos: ${design.x.barCount * design.y.barCount}. El contacto ` +
    'directo en cada cruce está permitido y se registra como INTENCIONAL: los artículos ' +
    '25.2.1 y 25.2.2 fijan distancias libres entre barras PARALELAS —de una capa y entre ' +
    'capas paralelas— y una parrilla ortogonal no es ninguno de los dos casos.',
  ];
  refs.push(design.x.distribution === 'UNIFORM_FULL_WIDTH'
    && design.y.distribution === 'UNIFORM_FULL_WIDTH'
    ? R_SQUARE : R_RECTANGULAR);

  const blocking = findings.some((f) => f.blocking);
  return {
    status: blocking ? 'RECONCILIATION_FAILED' : 'MODELED',
    layerOrder: order,
    lowerLayerAxis: lowerAxis,
    // A failed reconciliation returns NO bars. The geometry is still described by the
    // findings, which is what a reader needs; putting the bars in the model would put steel
    // there that does not match the schedule, and every consumer downstream — the collision
    // pass, the drawing, the export — would then be describing a mat nobody approved.
    bars: blocking ? [] : bars,
    provenance: blocking ? [] : [...x.provenance, ...y.provenance],
    schedule: blocking ? [] : [...x.schedule, ...y.schedule],
    findings,
    notModeled,
    intendedCrossings: blocking ? 0 : design.x.barCount * design.y.barCount,
    steps, refs,
  };
}
