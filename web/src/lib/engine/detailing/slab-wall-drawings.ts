/**
 * Slab plans and wall elevations, from the design record and the real bars.
 *
 * ── The gap these close ─────────────────────────────────────────────
 *
 * A footing has had its own plan and two sections since the family records landed. A slab and
 * a wall had neither: their bars reached the DXF only through `renderDrawings`'s GENERIC
 * elevation, which frames any assembly by its longest bar and calls that direction "right".
 * For a beam line that is exactly right — a beam is its longest bars. For a floor it is wrong
 * in the way that matters: the longest bar in a coordinated floor might be a wall vertical or
 * a footing dowel, so the sheet came out looking along whichever member happened to win, and
 * the plan an engineer actually needs — the panel with its two mats across it — did not exist.
 *
 * A reader holding the footing's three sheets could reasonably assume every family had them.
 *
 * ── Record for the outline, BarPaths for the steel ──────────────────
 *
 * Deliberately both, exactly as `family-drawings.ts` does it for footings. The outline and the
 * control perimeters come from the RECORD, because that is what was designed. Every bar comes
 * from the `BarPath`s, because that is what will be placed — after fusion, lap materialisation
 * and coordination, which can move a bar the design did not expect to move.
 *
 * Nothing here regenerates reinforcement. If the record and the cage disagree, the drawing
 * shows the disagreement instead of hiding it, which is the entire reason the two sources are
 * not collapsed into one.
 *
 * ── One drawing model, three consumers ─────────────────────────────
 *
 * These return `Sheet` values, so the preview, the DXF and the SVG are three renderings of ONE
 * model rather than three drawings of one panel.
 *
 * Pure: no store, no runes, no i18n — notes carry KEYS and the renderer translates them.
 * Lengths m.
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

type SlabRecord = Extract<FloorFamilyDesignRecord, { family: 'slab' }>;
type WallRecord = Extract<FloorFamilyDesignRecord, { family: 'wall' }>;

export type SlabSheetKind = 'plan';
export type WallSheetKind = 'elevation' | 'section';

export interface FamilySheetInput {
  /** The assembly, for the title block and for the marks the bars carry. */
  assembly: DetailingAssembly;
  /**
   * The bars to draw — this record's own.
   *
   * The caller filters the floor's cage to the record's `barIds`. Passing the whole floor would
   * draw a neighbouring panel's mat inside this one's outline.
   */
  bars: readonly BarPath[];
  clauses: readonly ClauseRef[];
  sheetNumber: string;
  /** Printed on the sheet. The caller composes the readiness banner into it. */
  title: string;
  scale?: number;
}

// ─── Shared helpers ─────────────────────────────────────────────

/** Marks, keyed by bar id, so a drawn bar is labelled with the schedule's own mark. */
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
 * The notes every family sheet carries, as KEYS.
 *
 * This module is pure and has no locale, so the note block carries keys and the renderer
 * translates them — exactly as the footing sheets and the report do. Pasting a Spanish
 * sentence here would produce a drawing that cannot be issued in English.
 *
 * Maturity, certificate status and revision are on every sheet on purpose: a reader holding
 * only the plan must still be able to see what it claims.
 */
function familyNotes(r: SlabRecord | WallRecord): string[] {
  const notes: string[] = [
    `record:${r.recordId}`,
    `status:${r.status}`,
    `maturity:${r.maturity}`,
    `certificate:${r.certificate.status}`,
    `revision.analysis:${r.revisions.analysis}`,
    `revision.loads:${r.revisions.loads}`,
    `revision.regulation:${r.revisions.regulation}`,
    `revision.entity:${r.revisions.entity}`,
  ];
  // Every unverified condition and every assumption on the FACE of the sheet. A limitation
  // that lives only in the report is a limitation the person holding the drawing does not
  // know about.
  for (const m of r.unsupported) notes.push(m.key);
  for (const m of r.assumptions) notes.push(m.key);
  return notes;
}

/**
 * Conflict annotations for the bars on this sheet.
 *
 * Only the conflicts that involve a bar actually drawn here — a floor's conflict list spans
 * every family, and marking a wall's clash on a slab plan would send a reader to the wrong
 * drawing.
 */
function conflictMarks(
  input: FamilySheetInput, project: (p: { x: number; y: number; z: number }) => Pt2,
): { circles: DrawnCircle[]; texts: DrawnText[]; notes: string[] } {
  const own = new Set(input.bars.map((b) => b.id));
  const circles: DrawnCircle[] = [];
  const texts: DrawnText[] = [];
  const notes: string[] = [];
  for (const c of input.assembly.conflicts ?? []) {
    if (!own.has(c.barA) && !own.has(c.barB)) continue;
    const at = project(c.at);
    circles.push({ layer: LAYERS.conflict, centre: at, radius: 0.08 });
    texts.push({
      layer: LAYERS.conflict, height: 0.05, at,
      text: `${c.severity}: ${c.barA}/${c.barB}`,
    });
    notes.push(`conflict:${c.severity}:${c.barA}:${c.barB}`);
  }
  return { circles, texts, notes };
}

// ─── The slab PLAN ──────────────────────────────────────────────

/**
 * The slab plan: outline, supports, columns, both mats in both directions, the punching
 * control perimeters with their status, marks, spacings and the readiness notes.
 *
 * ── The mats are drawn from the bars, not from the spacing ──────────
 *
 * A plan generated from "Ø12 c/150" shows the mat the DESIGN asked for. What has to be checked
 * on site is the mat that exists, and after coordination those can differ by a bar. So every
 * bar line here is the projection of a real `BarPath`, and the spacing appears only as a NOTE
 * beside the region it came from.
 *
 * ── Top and bottom are distinguished by elevation, not by role ──────
 *
 * A bar's face is decided from its own z against the panel's mid-depth rather than from a
 * label, so a bar the coordination step moved reads as the layer it now occupies. Both faces
 * are drawn on one plan — which is how a slab plan is issued — and each mat's direction is
 * measured from the bar's own run.
 */
export function drawSlabPlan(input: FamilySheetInput & { record: SlabRecord }): Sheet {
  const g = input.record.geometry;
  const marks = markOf(input.assembly);
  const polylines: DrawnPolyline[] = [];
  const circles: DrawnCircle[] = [];
  const texts: DrawnText[] = [];
  const dimensions: DrawnDimension[] = [];

  const x0 = g.origin.x;
  const y0 = g.origin.y;
  const x1 = x0 + g.lx;
  const y1 = y0 + g.ly;

  const outline: Pt2[] = [
    { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 },
  ];
  polylines.push({ layer: LAYERS.outline, points: outline, closed: true });

  // The cover line, so a reader can see the mats sit inside it.
  const c = g.cover;
  polylines.push({
    layer: LAYERS.dim,
    points: [
      { x: x0 + c, y: y0 + c }, { x: x1 - c, y: y0 + c },
      { x: x1 - c, y: y1 - c }, { x: x0 + c, y: y1 - c },
    ],
    closed: true,
  });

  // ── Columns and their control perimeters ────────────────────────
  //
  // Both, and on separate layers. The column footprint is concrete; the perimeter is a check
  // surface at d/2 from its faces. A reader who cannot tell them apart cannot check either.
  for (const p of input.record.punching) {
    const at = p.at;
    if (!at) continue;
    const per = p.perimeter;

    // The column footprint, from the perimeter's own half-dimensions less d/2. Derived from
    // the record rather than re-read from the model: the drawing must show the column the
    // CHECK was run against, or the perimeter beside it means nothing.
    if (per) {
      const halfB = Math.max(0, per.halfX - per.d / 2);
      const halfH = Math.max(0, per.halfY - per.d / 2);
      polylines.push({
        layer: LAYERS.outline,
        points: [
          { x: at.x - halfB, y: at.y - halfH }, { x: at.x + halfB, y: at.y - halfH },
          { x: at.x + halfB, y: at.y + halfH }, { x: at.x - halfB, y: at.y + halfH },
        ],
        closed: true,
      });
      // The control perimeter itself. Truncation is drawn where the position says the
      // perimeter is truncated: an edge or corner perimeter closed all the way round would
      // show a length the check did not use.
      polylines.push({
        layer: LAYERS.punching,
        points: controlPerimeter(at, per.halfX, per.halfY, p.position, p.openBearingDeg ?? null),
        closed: p.position === 'interior',
      });
    }

    // The status ON the joint. A perimeter with no verdict beside it is a line a reader has to
    // go and look up, and an unverified joint is the one they most need to see.
    texts.push({
      layer: LAYERS.punching, height: 0.07,
      at: { x: at.x, y: at.y },
      text: p.status === 'UNSUPPORTED'
        ? `#${p.nodeId} ${p.status}`
        : `#${p.nodeId} ${p.status} ${p.utilization.toFixed(2)}`,
    });
  }

  // ── Openings ────────────────────────────────────────────────────
  //
  // Slab openings are a DELIBERATELY unsupported condition in this branch — an opening
  // redistributes the moment field and a solid design is wrong exactly where it matters most.
  // The record therefore carries no opening geometry, and this plan draws none. That is stated
  // in the notes rather than left as a blank the reader might read as "no openings here".
  const hasOpeningCondition = input.record.unsupported
    .some((m) => m.key.toLowerCase().includes('opening'));
  const notes = familyNotes(input.record);
  notes.push(hasOpeningCondition ? 'openings:notDesigned' : 'openings:noneRepresented');

  // ── The steel ───────────────────────────────────────────────────
  //
  // A bar running in plan draws as its line; a bar running vertically — a dowel, a stirrup leg
  // — draws as a circle, because that is what a plan cut shows. Decided per bar from its own
  // geometry rather than from its role, so a hooked bar whose tail runs in plan is drawn as
  // the shape it is.
  const midZ = g.origin.z;
  const labelled = new Set<string>();
  for (const bar of input.bars) {
    const pts = samplePoints(bar);
    const zs = pts.map((p) => p.z);
    const dz = Math.max(...zs) - Math.min(...zs);
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

    /**
     * One label per MARK AND FACE — not per bar, and not per mark alone.
     *
     * Per bar would put thirty copies of one mark on a thirty-bar mat, which is not a drawing
     * anyone can read. Per mark alone is subtly worse: a top and a bottom bar of the same
     * diameter and length carry the SAME mark, so the schedule cannot tell the two mats apart
     * and one label per mark would silently show whichever mat happened to be iterated first —
     * leaving the other undrawn on exactly the question a placer asks.
     *
     * The face comes from the bar's own elevation against the panel mid-plane, which is what
     * `origin.z` is, rather than from a label — so a bar the coordination step moved reads as
     * the layer it now occupies.
     */
    const mark = marks.get(bar.id);
    const meanZ = zs.reduce((s, v) => s + v, 0) / zs.length;
    const face = meanZ >= midZ ? 'sup' : 'inf';
    if (mark && !labelled.has(`${mark}:${face}`)) {
      labelled.add(`${mark}:${face}`);
      texts.push({
        layer: LAYERS.mark, height: 0.06,
        at: { x: pts[0].x, y: pts[0].y },
        text: `${mark} ${face}`,
      });
    }
  }

  // ── Reinforcement regions, as notes beside the panel ────────────
  //
  // The spacing and the governing rule per region. On the sheet rather than only in the
  // report, because the person placing the mat is holding the drawing.
  let row = 0;
  for (const z of input.record.reinforcement) {
    texts.push({
      layer: LAYERS.text, height: 0.07,
      at: { x: x0, y: y1 + 0.25 + row * 0.14 },
      text: `${z.face} ${z.direction}: Ø${z.diameterMm} c/${(z.spacing * 1000).toFixed(0)} `
        + `— As ${z.asProvided.toFixed(0)}/${z.asRequired.toFixed(0)} mm²/m (${z.governedBy})`
        + ` [${z.barIds.length}]`,
    });
    row++;
  }

  dimensions.push(
    {
      layer: LAYERS.dim, label: `lx = ${(g.lx * 1000).toFixed(0)}`,
      from: { x: x0, y: y0 }, to: { x: x1, y: y0 }, offset: -0.25,
    },
    {
      layer: LAYERS.dim, label: `ly = ${(g.ly * 1000).toFixed(0)}`,
      from: { x: x1, y: y0 }, to: { x: x1, y: y1 }, offset: 0.25,
    },
  );
  texts.push({
    layer: LAYERS.text, height: 0.08,
    at: { x: x0, y: y0 - 0.45 },
    text: `${g.panelId} — h ${(g.thickness * 1000).toFixed(0)} — NPT ${g.origin.z.toFixed(2)} m`
      + ` — ${g.behaviour} — ${g.supportedSides} ${'lados'}`,
  });

  const cf = conflictMarks(input, (p) => ({ x: p.x, y: p.y }));
  circles.push(...cf.circles);
  texts.push(...cf.texts);
  notes.push(...cf.notes);

  return {
    kind: 'floorPlan',
    title: buildTitleBlock({
      sheetNumber: input.sheetNumber, title: input.title,
      assembly: input.assembly, clauses: input.clauses, scale: input.scale,
    }),
    polylines, circles, texts, dimensions,
    notes,
    extents: extentsOf([...outline, ...polylines.flatMap((p) => p.points)], 0.4),
  };
}

/**
 * The punching control perimeter as a polyline, truncated where the position says it is.
 *
 * An interior perimeter is the closed rectangle at d/2 from the faces. An edge perimeter is
 * three sides and a corner perimeter two, and WHICH sides are dropped is decided from the
 * bearing of the free edge — `openBearingDeg` — rather than assumed. A perimeter of the right
 * length drawn on the wrong side is worse than no perimeter: it reads as a checked geometry.
 */
export function controlPerimeter(
  at: { x: number; y: number },
  halfX: number, halfY: number,
  position: 'interior' | 'edge' | 'corner' | null,
  openBearingDeg: number | null,
): Pt2[] {
  const sw = { x: at.x - halfX, y: at.y - halfY };
  const se = { x: at.x + halfX, y: at.y - halfY };
  const ne = { x: at.x + halfX, y: at.y + halfY };
  const nw = { x: at.x - halfX, y: at.y + halfY };

  if (position === 'interior' || openBearingDeg === null) return [sw, se, ne, nw];

  // Which quadrant the free edge faces, snapped to the nearest axis.
  const b = ((openBearingDeg % 360) + 360) % 360;
  const facing: 'east' | 'north' | 'west' | 'south' =
    b < 45 || b >= 315 ? 'east' : b < 135 ? 'north' : b < 225 ? 'west' : 'south';

  if (position === 'edge') {
    // Three sides: the side facing the free edge is dropped.
    switch (facing) {
      case 'north': return [nw, sw, se, ne];
      case 'south': return [sw, nw, ne, se];
      case 'east': return [se, sw, nw, ne];
      default: return [nw, ne, se, sw];
    }
  }
  // Corner: two adjacent sides, meeting at the corner AWAY from the open quadrant. The
  // bearing bisects the missing 270°, so the retained corner is diagonally opposite it.
  switch (facing) {
    case 'north': return [se, sw, nw];
    case 'south': return [nw, ne, se];
    case 'east': return [nw, sw, se];
    default: return [ne, se, sw];
  }
}

// ─── The wall ELEVATION ─────────────────────────────────────────

/**
 * The wall elevation, drawn in the wall's own plane.
 *
 * ── Why a projected plane and not global x-z ────────────────────────
 *
 * A wall runs in an arbitrary plan direction. Drawing it against global x would compress a
 * wall running along y to zero width — the same class of error as framing a footing by its
 * longest bar. The in-plane axis here is the wall's own start→end direction, so the elevation
 * is at true length whatever the wall's orientation.
 *
 * Vertical and horizontal curtains, boundary zones, dowels and continuity are drawn from the
 * `BarPath`s; the outline, the levels and the boundary-zone extent come from the record.
 */
export function drawWallElevation(input: FamilySheetInput & { record: WallRecord }): Sheet {
  const g = input.record.geometry;
  const marks = markOf(input.assembly);
  const polylines: DrawnPolyline[] = [];
  const circles: DrawnCircle[] = [];
  const texts: DrawnText[] = [];
  const dimensions: DrawnDimension[] = [];

  const dx = g.end.x - g.start.x;
  const dy = g.end.y - g.start.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  /** Distance along the wall from its start, m. */
  const u = (p: { x: number; y: number }) =>
    (p.x - g.start.x) * ux + (p.y - g.start.y) * uy;
  /** Perpendicular offset from the wall plane, m — a bar's curtain. */
  const v = (p: { x: number; y: number }) =>
    -(p.x - g.start.x) * uy + (p.y - g.start.y) * ux;

  const z0 = g.start.z;
  const z1 = z0 + g.height;
  const outline: Pt2[] = [
    { x: 0, y: z0 }, { x: g.length, y: z0 }, { x: g.length, y: z1 }, { x: 0, y: z1 },
  ];
  polylines.push({ layer: LAYERS.outline, points: outline, closed: true });

  // ── Boundary zones ──────────────────────────────────────────────
  //
  // Three distinct states, and they must read differently:
  //   required with detailing   — the zone is drawn at its real length
  //   required WITHOUT detailing — 103-II work, not implemented: the zone is NOT drawn, and
  //                                the sheet says so. Drawing a zone with no reinforcement in
  //                                it would look like a designed boundary element.
  //   null                       — the question was never asked
  const be = input.record.boundaryElement;
  const notes = familyNotes(input.record);
  if (be?.required && be.detailing) {
    for (const end of [0, g.length - be.detailing.lengthM]) {
      polylines.push({
        layer: LAYERS.outline,
        points: [
          { x: end, y: z0 }, { x: end + be.detailing.lengthM, y: z0 },
          { x: end + be.detailing.lengthM, y: z1 }, { x: end, y: z1 },
        ],
        closed: true,
      });
    }
    notes.push(`boundary:designed:${be.detailing.lengthM.toFixed(3)}`);
  } else if (be?.required) {
    notes.push('boundary:requiredNotImplemented');
    notes.push(be.reason.key);
  } else if (be) {
    notes.push('boundary:notRequired');
    notes.push(be.reason.key);
  } else {
    notes.push('boundary:notAsked');
  }

  // Wall openings are a deliberately unsupported condition in this branch, so no opening
  // geometry is carried and none is drawn. Said out loud, for the same reason as the slab's.
  const openingCondition = input.record.unsupported
    .some((m) => /opening|coupl/i.test(m.key));
  notes.push(openingCondition ? 'openings:notDesigned' : 'openings:noneRepresented');

  // ── The steel ───────────────────────────────────────────────────
  //
  // Every bar projected into the wall's plane. A bar running mostly VERTICALLY is a vertical;
  // one running along the wall is a horizontal; one running THROUGH the thickness — a tie or a
  // dowel crossing the curtains — appears as the circle it is in this view. Measured from each
  // bar's own extent, so a coordinated bar reads as what it became.
  const labelled = new Set<string>();
  for (const bar of input.bars) {
    const pts = samplePoints(bar);
    const us = pts.map(u);
    const vs = pts.map(v);
    const zs = pts.map((p) => p.z);
    const spanU = Math.max(...us) - Math.min(...us);
    const spanV = Math.max(...vs) - Math.min(...vs);
    const spanZ = Math.max(...zs) - Math.min(...zs);
    const layer = bar.role === 'transverse' ? LAYERS.stirrup : LAYERS.bar;

    if (spanV > spanU && spanV > spanZ) {
      circles.push({
        layer, centre: { x: us[0], y: zs[0] }, radius: bar.diameterMm / 2000,
      });
    } else {
      polylines.push({
        layer,
        points: pts.map((p) => ({ x: u(p), y: p.z })),
        closed: false,
      });
    }

    // Vertical or horizontal, from the bar's own run: a wall mark with no direction is
    // ambiguous on the question a placer asks first. Keyed on mark AND direction for the same
    // reason the slab plan keys on mark and face — a vertical and a horizontal of equal length
    // and diameter carry ONE mark, so per-mark labelling would leave one curtain unlabelled.
    const mark = marks.get(bar.id);
    const dir = spanZ >= spanU ? 'vert' : 'horiz';
    if (mark && !labelled.has(`${mark}:${dir}`)) {
      labelled.add(`${mark}:${dir}`);
      texts.push({
        layer: LAYERS.mark, height: 0.06,
        at: { x: us[0], y: zs[0] },
        text: `${mark} ${dir}`,
      });
    }
  }

  // The designed curtains, as a note beside the elevation: what the placer must reproduce.
  const rz = input.record.reinforcement;
  texts.push(
    {
      layer: LAYERS.text, height: 0.07, at: { x: 0, y: z1 + 0.25 },
      text: `vert: Ø${rz.verticalDiameterMm} c/${(rz.verticalSpacing * 1000).toFixed(0)} `
        + `ρ ${rz.rhoVertical.toFixed(4)} (${rz.verticalGovernedBy})`,
    },
    {
      layer: LAYERS.text, height: 0.07, at: { x: 0, y: z1 + 0.39 },
      text: `horiz: Ø${rz.horizontalDiameterMm} c/${(rz.horizontalSpacing * 1000).toFixed(0)} `
        + `ρ ${rz.rhoHorizontal.toFixed(4)} (${rz.horizontalGovernedBy})`,
    },
    {
      layer: LAYERS.text, height: 0.07, at: { x: 0, y: z1 + 0.53 },
      text: `${rz.curtains} ${rz.curtains === 1 ? 'cortina' : 'cortinas'} — `
        + `e ${(g.thickness * 1000).toFixed(0)} — ${g.twoCurtains ? '11.7.2.3' : '11.6.1'}`,
    },
  );

  dimensions.push(
    {
      layer: LAYERS.dim, label: `L = ${(g.length * 1000).toFixed(0)}`,
      from: { x: 0, y: z0 }, to: { x: g.length, y: z0 }, offset: -0.3,
    },
    {
      layer: LAYERS.dim, label: `H = ${(g.height * 1000).toFixed(0)}`,
      from: { x: g.length, y: z0 }, to: { x: g.length, y: z1 }, offset: 0.3,
    },
  );
  texts.push({
    layer: LAYERS.text, height: 0.08, at: { x: 0, y: z0 - 0.5 },
    text: `${g.wallId} — NPT ${z0.toFixed(2)} / ${z1.toFixed(2)} m`,
  });

  const cf = conflictMarks(input, (p) => ({ x: u(p), y: p.z }));
  circles.push(...cf.circles);
  texts.push(...cf.texts);
  notes.push(...cf.notes);

  return {
    kind: 'section',
    title: buildTitleBlock({
      sheetNumber: input.sheetNumber, title: input.title,
      assembly: input.assembly, clauses: input.clauses, scale: input.scale,
    }),
    polylines, circles, texts, dimensions,
    notes,
    extents: extentsOf([...outline, ...polylines.flatMap((p) => p.points)], 0.5),
  };
}

/**
 * A horizontal SECTION through the wall, cut at mid-height.
 *
 * The one view that shows what an elevation cannot: how many curtains there are, where they
 * sit across the thickness, and what the cover is on each face. A wall issued with only an
 * elevation leaves the two-curtain decision — §11.7.2.3, the reason the thickness matters —
 * undrawn, and a placer cannot infer it from a spacing note.
 *
 * Drawn in (u, v): along the wall across the sheet, through the thickness up it. Bars appear as
 * circles at their real curtain offsets, taken from the `BarPath`s, so a curtain that
 * coordination moved is drawn where it now is.
 */
export function drawWallSection(input: FamilySheetInput & { record: WallRecord }): Sheet {
  const g = input.record.geometry;
  const marks = markOf(input.assembly);
  const polylines: DrawnPolyline[] = [];
  const circles: DrawnCircle[] = [];
  const texts: DrawnText[] = [];
  const dimensions: DrawnDimension[] = [];

  const dx = g.end.x - g.start.x;
  const dy = g.end.y - g.start.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const u = (p: { x: number; y: number }) =>
    (p.x - g.start.x) * ux + (p.y - g.start.y) * uy;
  const v = (p: { x: number; y: number }) =>
    -(p.x - g.start.x) * uy + (p.y - g.start.y) * ux;

  const half = g.thickness / 2;
  const outline: Pt2[] = [
    { x: 0, y: -half }, { x: g.length, y: -half },
    { x: g.length, y: half }, { x: 0, y: half },
  ];
  polylines.push({ layer: LAYERS.outline, points: outline, closed: true });
  polylines.push({
    layer: LAYERS.dim,
    points: [
      { x: g.cover, y: -half + g.cover }, { x: g.length - g.cover, y: -half + g.cover },
      { x: g.length - g.cover, y: half - g.cover }, { x: g.cover, y: half - g.cover },
    ],
    closed: true,
  });

  // The cut plane: mid-height of the storey. Named on the sheet, because a section whose
  // elevation is not stated cannot be located on the elevation.
  const cutZ = g.start.z + g.height / 2;
  const band = Math.max(0.05, g.height * 0.05);

  // Bars crossing the cut appear as circles at their true (u, v). A bar that does not reach the
  // cut elevation is NOT drawn: showing it would put steel in a section it is not in.
  const labelled = new Set<string>();
  let crossing = 0;
  for (const bar of input.bars) {
    const pts = samplePoints(bar);
    const zs = pts.map((p) => p.z);
    const reaches = Math.min(...zs) <= cutZ + band && Math.max(...zs) >= cutZ - band;
    if (!reaches) continue;
    crossing++;
    const layer = bar.role === 'transverse' ? LAYERS.stirrup : LAYERS.bar;
    const us = pts.map(u);
    const vs = pts.map(v);
    const spanZ = Math.max(...zs) - Math.min(...zs);
    const spanU = Math.max(...us) - Math.min(...us);

    if (spanZ >= spanU) {
      // A vertical: it pierces the cut, so it is one circle at its own curtain offset.
      const i = zs.findIndex((z) => z >= cutZ - band);
      const k = i >= 0 ? i : 0;
      circles.push({
        layer, centre: { x: us[k], y: vs[k] }, radius: bar.diameterMm / 2000,
      });
    } else {
      // A horizontal at this elevation lies IN the cut: draw its run.
      polylines.push({
        layer, points: pts.map((p) => ({ x: u(p), y: v(p) })), closed: false,
      });
    }
    const mark = marks.get(bar.id);
    if (mark && !labelled.has(mark)) {
      labelled.add(mark);
      texts.push({
        layer: LAYERS.mark, height: 0.05,
        at: { x: us[0], y: vs[0] }, text: mark,
      });
    }
  }

  dimensions.push(
    {
      layer: LAYERS.dim, label: `e = ${(g.thickness * 1000).toFixed(0)}`,
      from: { x: 0, y: -half }, to: { x: 0, y: half }, offset: -0.2,
    },
    {
      layer: LAYERS.dim, label: `rec. ${(g.cover * 1000).toFixed(0)}`,
      from: { x: g.cover, y: -half }, to: { x: g.cover, y: -half + g.cover }, offset: -0.1,
    },
  );
  texts.push({
    layer: LAYERS.text, height: 0.07, at: { x: 0, y: half + 0.2 },
    text: `${g.wallId} — corte a NPT ${cutZ.toFixed(2)} m — `
      + `${input.record.reinforcement.curtains} cortina(s)`,
  });

  const notes = familyNotes(input.record);
  // How many of the record's bars actually cross this cut. A section drawn from a cage that
  // reaches no bar at this elevation is an empty sheet, and it must say so rather than look
  // like a wall with no steel.
  notes.push(`section.barsCrossing:${crossing}`);
  if (crossing === 0) notes.push('section.noBarsAtCut');

  const cf = conflictMarks(input, (p) => ({ x: u(p), y: v(p) }));
  circles.push(...cf.circles);
  texts.push(...cf.texts);
  notes.push(...cf.notes);

  return {
    kind: 'section',
    title: buildTitleBlock({
      sheetNumber: input.sheetNumber, title: input.title,
      assembly: input.assembly, clauses: input.clauses, scale: input.scale,
    }),
    polylines, circles, texts, dimensions,
    notes,
    extents: extentsOf([...outline, ...polylines.flatMap((p) => p.points)], 0.3),
  };
}

/** The slab's sheets, in issue order. */
export function drawSlab(
  input: FamilySheetInput & { record: SlabRecord },
): Array<{ kind: SlabSheetKind; sheet: Sheet }> {
  return [
    { kind: 'plan', sheet: drawSlabPlan({ ...input, sheetNumber: `${input.sheetNumber}-P` }) },
  ];
}

/** The wall's sheets, in issue order. */
export function drawWall(
  input: FamilySheetInput & { record: WallRecord },
): Array<{ kind: WallSheetKind; sheet: Sheet }> {
  return [
    {
      kind: 'elevation',
      sheet: drawWallElevation({ ...input, sheetNumber: `${input.sheetNumber}-E` }),
    },
    {
      kind: 'section',
      sheet: drawWallSection({ ...input, sheetNumber: `${input.sheetNumber}-S` }),
    },
  ];
}
