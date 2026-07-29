/**
 * Footing drawings: a plan and two orthogonal sections, from the record and the real bars.
 *
 * ── Why the generic elevation was not enough ────────────────────────
 *
 * `renderDrawings` frames every assembly the same way: it takes the longest bar, calls its
 * direction "right", and draws an elevation of the bounding box of the steel. For a beam
 * line that is exactly right — a beam IS its longest bars. For a footing it is wrong in a way
 * that matters: the longest bar in a pad footing is a dowel, so the "elevation" came out
 * looking down the column, the base outline was the box around the dowel cage rather than the
 * footing, and the plan an engineer actually needs — B × L with the mat laid across it — did
 * not exist at all.
 *
 * So a footing gets its own three sheets, built from the geometry in its DESIGN RECORD and
 * the `BarPath`s in the assembly. Both, deliberately: the outline comes from the record
 * because that is what was designed, and the steel comes from the paths because that is what
 * will be placed. If they disagree, the drawing shows the disagreement instead of hiding it.
 *
 * ── One drawing model, three consumers ─────────────────────────────
 *
 * These return `Sheet` values — the same type `drawElevation` and `drawSection` return — so
 * the preview, the DXF and the SVG all consume ONE drawing model. A footing plan rendered
 * one way for the screen and another for the DXF is the drift the DocumentModel exists to
 * prevent, one layer down.
 *
 * Pure: no store, no runes, no i18n. Lengths m.
 */

import type { BarPath } from '../../codes/cirsoc201/bar-geometry';
import type { ClauseRef } from '../../codes/regulation';
import {
  LAYERS, buildTitleBlock,
  type DrawnCircle, type DrawnDimension, type DrawnPolyline, type DrawnText,
  type Pt2, type Sheet,
} from './drawings';
import type { DetailingAssembly } from './assembly';
import type { FloorFamilyDesignRecord } from './family-record';

type FootingRecord = Extract<FloorFamilyDesignRecord, { family: 'footing' }>;

/** Which of a footing's three sheets. */
export type FootingSheetKind = 'plan' | 'sectionB' | 'sectionL';

export interface FootingDrawingInput {
  record: FootingRecord;
  /** The assembly, for the title block and for the marks the bars carry. */
  assembly: DetailingAssembly;
  /**
   * The bars to draw.
   *
   * The caller filters the assembly to this record's own `barIds`. Passing the whole floor
   * would draw a neighbouring footing's dowels inside this one's outline.
   */
  bars: readonly BarPath[];
  /** Plan centre of the footing in model coordinates. */
  centre: { x: number; y: number };
  clauses: readonly ClauseRef[];
  sheetNumber: string;
  /** Printed on the sheet. The caller composes the readiness banner into it. */
  title: string;
  scale?: number;
}

/** Marks, keyed by bar id, so a drawn bar can be labelled with the schedule's own mark. */
function markOf(assembly: DetailingAssembly): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of assembly.marks) for (const id of m.barIds) out.set(id, m.mark);
  return out;
}

/** Sample a bar's polyline as (x, y, z) triples in model space. */
function samplePoints(bar: BarPath): Array<{ x: number; y: number; z: number }> {
  const pts: Array<{ x: number; y: number; z: number }> = [];
  for (const s of bar.segments) {
    if (pts.length === 0) pts.push({ ...s.start });
    pts.push({ ...s.end });
  }
  return pts;
}

/** Bounding box of a set of 2D points, with a margin. */
function extentsOf(points: readonly Pt2[], margin: number): Sheet['extents'] {
  if (points.length === 0) return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    min: { x: Math.min(...xs) - margin, y: Math.min(...ys) - margin },
    max: { x: Math.max(...xs) + margin, y: Math.max(...ys) + margin },
  };
}

/**
 * The footing PLAN.
 *
 * Outline, column or pedestal footprint, the bottom and top mats in true position, the
 * dowels in section, cover, both plan dimensions, the marks and the readiness note.
 *
 * ── The mat is drawn from the bars, not from the spacing ────────────
 *
 * A plan generated from "Ø16 c/150" would show the mat the DESIGN asked for. What has to be
 * checked on site is the mat that exists, and after coordination those can differ by a bar.
 * So every line here is a projection of a real `BarPath`.
 */
export function drawFootingPlan(input: FootingDrawingInput): Sheet {
  const g = input.record.geometry;
  const marks = markOf(input.assembly);
  const polylines: DrawnPolyline[] = [];
  const circles: DrawnCircle[] = [];
  const texts: DrawnText[] = [];
  const dimensions: DrawnDimension[] = [];

  // Plan coordinates are model x/y with the footing centroid at its stated eccentricity from
  // the supported node — the eccentricity is a real design device, not a modelling offset, so
  // the drawing has to show the base where it will be poured.
  const cx = input.centre.x + g.eccentricityB;
  const cy = input.centre.y + g.eccentricityL;
  const halfB = g.B / 2;
  const halfL = g.L / 2;

  const outline: Pt2[] = [
    { x: cx - halfB, y: cy - halfL },
    { x: cx + halfB, y: cy - halfL },
    { x: cx + halfB, y: cy + halfL },
    { x: cx - halfB, y: cy + halfL },
  ];
  polylines.push({ layer: LAYERS.outline, points: outline, closed: true });

  // The cover line, so a reader can see the mat sits inside it.
  const c = g.cover;
  polylines.push({
    layer: LAYERS.dim,
    points: [
      { x: cx - halfB + c, y: cy - halfL + c },
      { x: cx + halfB - c, y: cy - halfL + c },
      { x: cx + halfB - c, y: cy + halfL - c },
      { x: cx - halfB + c, y: cy + halfL - c },
    ],
    closed: true,
  });

  // The column footprint, at the supported node rather than at the base centroid: that offset
  // IS the eccentricity, and drawing the column concentric would erase the reason the base is
  // eccentric in the first place.
  const colB = input.record.support.columnB;
  const colH = input.record.support.columnH;
  if (colB !== null && colH !== null) {
    polylines.push({
      layer: LAYERS.outline,
      points: [
        { x: input.centre.x - colB / 2, y: input.centre.y - colH / 2 },
        { x: input.centre.x + colB / 2, y: input.centre.y - colH / 2 },
        { x: input.centre.x + colB / 2, y: input.centre.y + colH / 2 },
        { x: input.centre.x - colB / 2, y: input.centre.y + colH / 2 },
      ],
      closed: true,
    });
  }
  if (g.pedestal) {
    polylines.push({
      layer: LAYERS.outline,
      points: [
        { x: input.centre.x - g.pedestal.B / 2, y: input.centre.y - g.pedestal.L / 2 },
        { x: input.centre.x + g.pedestal.B / 2, y: input.centre.y - g.pedestal.L / 2 },
        { x: input.centre.x + g.pedestal.B / 2, y: input.centre.y + g.pedestal.L / 2 },
        { x: input.centre.x - g.pedestal.B / 2, y: input.centre.y + g.pedestal.L / 2 },
      ],
      closed: true,
    });
  }

  // Steel in plan: a HORIZONTAL bar draws as its line, a VERTICAL bar (a dowel or a tie leg)
  // draws as a circle, because that is what a plan cut shows. Decided per bar from its own
  // geometry rather than from its role, so a hooked dowel whose tail runs horizontally is
  // drawn as the shape it is.
  const labelled = new Set<string>();
  for (const bar of input.bars) {
    const pts = samplePoints(bar);
    const dz = Math.max(...pts.map((p) => p.z)) - Math.min(...pts.map((p) => p.z));
    const dxy = Math.hypot(
      Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)),
      Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y)));
    const layer = bar.role === 'transverse' ? LAYERS.stirrup : LAYERS.bar;
    if (dxy >= dz) {
      polylines.push({
        layer, points: pts.map((p) => ({ x: p.x, y: p.y })), closed: false,
      });
    } else {
      circles.push({
        layer, centre: { x: pts[0].x, y: pts[0].y }, radius: bar.diameterMm / 2000,
      });
    }
    // One label per MARK, not per bar: a mat of thirty bars carries one mark, and thirty
    // copies of it is not a drawing anyone can read.
    const mark = marks.get(bar.id);
    if (mark && !labelled.has(mark)) {
      labelled.add(mark);
      texts.push({
        layer: LAYERS.mark, height: 0.06,
        at: { x: pts[0].x, y: pts[0].y },
        text: mark,
      });
    }
  }

  dimensions.push(
    {
      layer: LAYERS.dim, label: `B = ${(g.B * 1000).toFixed(0)}`,
      from: { x: cx - halfB, y: cy - halfL }, to: { x: cx + halfB, y: cy - halfL },
      offset: -0.25,
    },
    {
      layer: LAYERS.dim, label: `L = ${(g.L * 1000).toFixed(0)}`,
      from: { x: cx + halfB, y: cy - halfL }, to: { x: cx + halfB, y: cy + halfL },
      offset: 0.25,
    },
  );

  return {
    kind: 'floorPlan',
    title: buildTitleBlock({
      sheetNumber: input.sheetNumber, title: input.title,
      assembly: input.assembly, clauses: input.clauses, scale: input.scale,
    }),
    polylines, circles, texts, dimensions,
    notes: planNotes(input.record),
    extents: extentsOf([...outline, ...polylines.flatMap((p) => p.points)], 0.3),
  };
}

/**
 * A footing SECTION, cut along B or along L.
 *
 * Two orthogonal sections rather than one, because a footing is not symmetric once it has a
 * plan eccentricity, and the cantilever that governs flexure differs between the two axes.
 * One section would leave the other axis undrawn and the reader guessing whether it is the
 * same.
 */
export function drawFootingSection(
  input: FootingDrawingInput & { along: 'B' | 'L' },
): Sheet {
  const g = input.record.geometry;
  const marks = markOf(input.assembly);
  const polylines: DrawnPolyline[] = [];
  const circles: DrawnCircle[] = [];
  const texts: DrawnText[] = [];
  const dimensions: DrawnDimension[] = [];

  const alongB = input.along === 'B';
  // The in-plane axis of the cut, and the centre coordinate on it.
  const width = alongB ? g.B : g.L;
  const centreU = alongB
    ? input.centre.x + g.eccentricityB
    : input.centre.y + g.eccentricityL;
  const nodeU = alongB ? input.centre.x : input.centre.y;
  // Sheet coordinates: u across, z up. Model z is used directly, so the founding level and
  // the top of the footing read as real elevations rather than as a local zero.
  const z0 = g.foundingElevation;
  const z1 = g.foundingElevation + g.thickness;

  const outline: Pt2[] = [
    { x: centreU - width / 2, y: z0 },
    { x: centreU + width / 2, y: z0 },
    { x: centreU + width / 2, y: z1 },
    { x: centreU - width / 2, y: z1 },
  ];
  polylines.push({ layer: LAYERS.outline, points: outline, closed: true });

  // The column or pedestal above, drawn for one storey-ish height so the section reads as a
  // foundation rather than as a floating slab.
  const colWidth = alongB ? input.record.support.columnB : input.record.support.columnH;
  if (colWidth !== null) {
    const stub = Math.max(0.3, g.thickness);
    polylines.push({
      layer: LAYERS.outline,
      points: [
        { x: nodeU - colWidth / 2, y: z1 },
        { x: nodeU + colWidth / 2, y: z1 },
        { x: nodeU + colWidth / 2, y: z1 + stub },
        { x: nodeU - colWidth / 2, y: z1 + stub },
      ],
      closed: false,
    });
  }

  // Steel: a bar in the cut plane draws as its own polyline; a bar crossing it draws as a
  // circle. The test is the bar's extent along the OUT-OF-PLANE axis, so a mat bar running
  // perpendicular to the cut appears as the dot it is.
  const labelled = new Set<string>();
  for (const bar of input.bars) {
    const pts = samplePoints(bar);
    const u = (p: { x: number; y: number }) => (alongB ? p.x : p.y);
    const v = (p: { x: number; y: number }) => (alongB ? p.y : p.x);
    const spanU = Math.max(...pts.map(u)) - Math.min(...pts.map(u));
    const spanV = Math.max(...pts.map(v)) - Math.min(...pts.map(v));
    const spanZ = Math.max(...pts.map((p) => p.z)) - Math.min(...pts.map((p) => p.z));
    const layer = bar.role === 'transverse' ? LAYERS.stirrup : LAYERS.bar;

    if (spanV > spanU && spanV > spanZ) {
      // Runs across the cut: one circle at its crossing depth.
      circles.push({
        layer, centre: { x: u(pts[0]), y: pts[0].z }, radius: bar.diameterMm / 2000,
      });
    } else {
      polylines.push({
        layer, points: pts.map((p) => ({ x: u(p), y: p.z })), closed: false,
      });
    }
    const mark = marks.get(bar.id);
    if (mark && !labelled.has(mark)) {
      labelled.add(mark);
      texts.push({
        layer: LAYERS.mark, height: 0.06,
        at: { x: u(pts[0]), y: pts[0].z }, text: mark,
      });
    }
  }

  dimensions.push(
    {
      layer: LAYERS.dim,
      label: `${input.along} = ${(width * 1000).toFixed(0)}`,
      from: { x: centreU - width / 2, y: z0 }, to: { x: centreU + width / 2, y: z0 },
      offset: -0.25,
    },
    {
      layer: LAYERS.dim, label: `h = ${(g.thickness * 1000).toFixed(0)}`,
      from: { x: centreU + width / 2, y: z0 }, to: { x: centreU + width / 2, y: z1 },
      offset: 0.25,
    },
    {
      layer: LAYERS.dim, label: `rec. ${(g.cover * 1000).toFixed(0)}`,
      from: { x: centreU - width / 2, y: z0 },
      to: { x: centreU - width / 2, y: z0 + g.cover },
      offset: -0.12,
    },
  );

  texts.push({
    layer: LAYERS.text, height: 0.08,
    at: { x: centreU - width / 2, y: z0 - 0.4 },
    text: `NF ${g.foundingElevation.toFixed(2)} m`,
  });

  return {
    kind: 'section',
    title: buildTitleBlock({
      sheetNumber: input.sheetNumber, title: input.title,
      assembly: input.assembly, clauses: input.clauses, scale: input.scale,
    }),
    polylines, circles, texts, dimensions,
    notes: planNotes(input.record),
    extents: extentsOf([...outline, ...polylines.flatMap((p) => p.points)], 0.3),
  };
}

/**
 * The notes every footing sheet carries.
 *
 * ── Keys, not sentences ────────────────────────────────────────────
 *
 * The record's `unsupported` and `assumptions` are `EngineMessage`s, and this module is pure
 * — it has no locale. So the note block carries the KEYS and the renderer translates them,
 * exactly as the report does. Pasting a Spanish sentence here would produce a drawing that
 * cannot be issued in English, and the readiness banner is composed into `title` by the
 * caller for the same reason.
 *
 * The maturity and the ground provenance are on every sheet on purpose: an assumed bearing
 * pressure has no regulatory source, and a reader holding only the section must still be able
 * to see that.
 */
function planNotes(r: FootingRecord): string[] {
  const notes: string[] = [
    `record:${r.recordId}`,
    `status:${r.status}`,
    `maturity:${r.maturity}`,
    `certificate:${r.certificate.status}`,
  ];
  if (r.ground) {
    notes.push(`ground:${r.ground.name}`);
    notes.push(r.ground.allowableBearingKPa === null
      ? 'ground.allowable:notStated'
      : `ground.allowable:${r.ground.allowableBearingKPa}`);
    notes.push(`ground.source:${r.ground.source}`);
    if (r.ground.reference) notes.push(`ground.reference:${r.ground.reference}`);
  } else {
    notes.push('ground:notResolved');
  }
  if (r.demand) notes.push(`combination:${r.demand.governingCombination}`);
  // Every unverified condition on the face of the sheet. A limitation that lives only in the
  // report is a limitation the person holding the drawing does not know about.
  for (const m of r.unsupported) notes.push(m.key);
  for (const m of r.assumptions) notes.push(m.key);
  return notes;
}

/** All three sheets for one footing record, in issue order. */
export function drawFooting(input: FootingDrawingInput): Array<{
  kind: FootingSheetKind; sheet: Sheet;
}> {
  return [
    { kind: 'plan', sheet: drawFootingPlan({ ...input, sheetNumber: `${input.sheetNumber}-P` }) },
    {
      kind: 'sectionB',
      sheet: drawFootingSection({ ...input, along: 'B', sheetNumber: `${input.sheetNumber}-SB` }),
    },
    {
      kind: 'sectionL',
      sheet: drawFootingSection({ ...input, along: 'L', sheetNumber: `${input.sheetNumber}-SL` }),
    },
  ];
}
