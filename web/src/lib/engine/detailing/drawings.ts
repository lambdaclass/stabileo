/**
 * Geometry-driven reinforcement drawings.
 *
 * The existing `reinforcement-svg.ts` builds schematics from counts and diameters — it
 * draws a picture of what the numbers say. This module draws the actual `BarPath`
 * geometry: the same arcs, the same hook extensions, the same cut lengths that the
 * collision engine tested and the schedule will order. A bar that appears on the sheet
 * is by construction the bar that was checked.
 *
 * Four sheet types, all from one projection helper:
 *   beam-line elevation   the line unrolled along its axis, bars in true length
 *   column-stack elevation  the stack unrolled vertically
 *   cross-section         a cut at a station, bars as circles in true position
 *   joint detail          an enlarged section through a beam-column joint
 *
 * Plus a floor plan, which is the only view assembled from several assemblies at once.
 *
 * ── Honesty on the sheet ───────────────────────────────────────
 *
 * Every sheet carries a title block with the regulation edition, the assembly revision,
 * the review state and — when anything on it is provisional — the provisional note. A
 * sheet whose review has been superseded gets a SUPERSEDED watermark. A drawing that
 * does not say what it was designed to, and how far that was validated, is not a
 * construction document.
 *
 * Pure: no store, no runes, no DOM. Emits SVG/DXF/table data as strings and objects.
 */

import type { BarPath, Point3 } from '../../codes/cirsoc201/bar-geometry';
import { samplePath } from '../../codes/cirsoc201/bar-geometry';
import { PROVISIONAL_DRAWING_NOTE, type Maturity } from '../../codes/maturity';
import type { EngineMessage } from '../../codes/message';
import { teAt } from '../../i18n/engine-text';
import { tAt } from '../../i18n/store.svelte';
import { formatClause, type ClauseRef } from '../../codes/regulation';
import type { BarConflict } from './collision';
import type { BarMark, DetailingAssembly, UnsupportedCondition } from './assembly';

// ─── Projection ──────────────────────────────────────────────────

export interface Projection {
  /** Unit vector mapped to the sheet's +x. */
  right: Point3;
  /** Unit vector mapped to the sheet's +y (up on the sheet). */
  up: Point3;
  /** Model point mapped to sheet (0, 0). */
  origin: Point3;
}

export interface Pt2 { x: number; y: number }

export function project(p: Point3, proj: Projection): Pt2 {
  const dx = p.x - proj.origin.x;
  const dy = p.y - proj.origin.y;
  const dz = p.z - proj.origin.z;
  return {
    x: dx * proj.right.x + dy * proj.right.y + dz * proj.right.z,
    y: dx * proj.up.x + dy * proj.up.y + dz * proj.up.z,
  };
}

/** Standard projections. */
export const ELEVATION_X: Projection = {
  right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, origin: { x: 0, y: 0, z: 0 },
};
export const ELEVATION_Y: Projection = {
  right: { x: 0, y: 1, z: 0 }, up: { x: 0, y: 0, z: 1 }, origin: { x: 0, y: 0, z: 0 },
};
export const PLAN: Projection = {
  right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, origin: { x: 0, y: 0, z: 0 },
};

// ─── Sheet model ─────────────────────────────────────────────────

export type SheetKind = 'beamElevation' | 'columnElevation' | 'section' | 'jointDetail' | 'floorPlan';

export interface TitleBlock {
  sheetNumber: string;
  title: string;
  /** e.g. 'CIRSOC 201 2025'. */
  codeEdition: string;
  /** Clauses the content on this sheet was produced under. */
  clauses: string[];
  revision: number;
  reviewState: string;
  reviewer?: string;
  reviewedAt?: string;
  /** True when the review no longer matches the revision. */
  superseded: boolean;
  maturity: Maturity;
  /** Shown when maturity is provisional. */
  /**
   * The provisional-calculation warning, structured.
   *
   * A drawing is a document: an Argentine engineer wants it in Spanish even when reading
   * the app in English, so every writer below takes an explicit `locale` and renders this
   * at the point of emission rather than receiving finished text.
   */
  provisionalNote?: EngineMessage;
  /** Scale denominator, e.g. 50 for 1:50. */
  scale: number;
}

export interface DrawnPolyline {
  layer: string;
  points: Pt2[];
  closed: boolean;
}

export interface DrawnCircle { layer: string; centre: Pt2; radius: number }
export interface DrawnText { layer: string; at: Pt2; height: number; text: string }
export interface DrawnDimension { layer: string; from: Pt2; to: Pt2; label: string; offset: number }

export interface Sheet {
  kind: SheetKind;
  title: TitleBlock;
  polylines: DrawnPolyline[];
  circles: DrawnCircle[];
  texts: DrawnText[];
  dimensions: DrawnDimension[];
  /** Notes printed in the sheet's note block — conflicts, unsupported conditions. */
  notes: string[];
  /** Bounding box in model units. */
  extents: { min: Pt2; max: Pt2 };
}

export const LAYERS = {
  outline: 'RC-OUTLINE',
  bar: 'RC-BAR',
  stirrup: 'RC-STIRRUP',
  dim: 'RC-DIM',
  text: 'RC-TEXT',
  mark: 'RC-MARK',
  conflict: 'RC-CONFLICT',
  title: 'RC-TITLE',
  /**
   * The punching control perimeter, on its own layer.
   *
   * Not `dim` and not `outline`: it is neither a dimension nor concrete. A reviewer checking
   * two-way shear isolates it, and a fabricator building the cage turns it off — putting it on
   * a shared layer denies both.
   */
  punching: 'RC-PUNCHING',
  /** A slab or wall opening. Its own layer for the same reason. */
  opening: 'RC-OPENING',
} as const;

function extentsOf(polylines: DrawnPolyline[], circles: DrawnCircle[]): Sheet['extents'] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const eat = (p: Pt2) => {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  };
  for (const pl of polylines) for (const p of pl.points) eat(p);
  for (const c of circles) {
    eat({ x: c.centre.x - c.radius, y: c.centre.y - c.radius });
    eat({ x: c.centre.x + c.radius, y: c.centre.y + c.radius });
  }
  if (!Number.isFinite(minX)) return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

/** Build the title block from the assembly, so it cannot disagree with the content. */
export function buildTitleBlock(opts: {
  sheetNumber: string;
  title: string;
  assembly: DetailingAssembly;
  clauses: readonly ClauseRef[];
  scale?: number;
}): TitleBlock {
  const a = opts.assembly;
  const superseded = a.review !== undefined && a.review.revision !== a.detailingRevision;
  const unique = [...new Set(opts.clauses.map(formatClause))].sort();
  return {
    sheetNumber: opts.sheetNumber,
    title: opts.title,
    codeEdition: `CIRSOC 201 ${a.provenance.edition}`,
    clauses: unique,
    revision: a.detailingRevision,
    reviewState: a.state,
    reviewer: a.review?.engineer,
    reviewedAt: a.review?.at,
    superseded,
    maturity: a.maturity,
    provisionalNote: a.maturity === 'IMPLEMENTED_PROVISIONAL' ? PROVISIONAL_DRAWING_NOTE : undefined,
    scale: opts.scale ?? 50,
  };
}

function noteLines(
  conflicts: readonly BarConflict[], unsupported: readonly UnsupportedCondition[],
): string[] {
  const out: string[] = [];
  for (const u of unsupported) {
    out.push(`NO VERIFICADO — ${u.key}: ${u.message}`);
  }
  for (const c of conflicts) {
    if (c.severity === 'marginal') continue;
    out.push(
      `CONFLICTO ${c.severity === 'overlap' ? 'SOLAPE' : 'SEPARACIÓN'} — barras ${c.barA}/${c.barB}: ` +
      `${(c.clearance * 1000).toFixed(0)} mm libres contra ${(c.required * 1000).toFixed(0)} mm ` +
      'requeridos.');
  }
  return out;
}

// ─── Elevations ──────────────────────────────────────────────────

export interface ElevationInput {
  assembly: DetailingAssembly;
  /** Member outlines to draw, as polylines already in model coordinates. */
  outlines: Array<{ points: Point3[]; closed: boolean }>;
  projection: Projection;
  clauses: readonly ClauseRef[];
  sheetNumber: string;
  title: string;
  scale?: number;
  /** Stirrup zones to dimension, in projected x. */
  stirrupZones?: Array<{ from: number; to: number; label: string }>;
}

/**
 * A member elevation with every bar drawn from its real path.
 *
 * Bars are drawn as their sampled polylines, so a hook appears as an arc of the correct
 * radius rather than as a right angle. That is the whole point: the drawing and the
 * clash check are reading the same geometry.
 */
export function drawElevation(input: ElevationInput): Sheet {
  const polylines: DrawnPolyline[] = [];
  const texts: DrawnText[] = [];
  const dimensions: DrawnDimension[] = [];

  for (const o of input.outlines) {
    polylines.push({
      layer: LAYERS.outline,
      points: o.points.map((p) => project(p, input.projection)),
      closed: o.closed,
    });
  }

  const markOf = new Map<string, string>();
  for (const m of input.assembly.marks) for (const id of m.barIds) markOf.set(id, m.mark);

  for (const bar of input.assembly.bars) {
    const pts = samplePath(bar).map((p) => project(p, input.projection));
    polylines.push({
      layer: bar.role === 'transverse' ? LAYERS.stirrup : LAYERS.bar,
      points: pts, closed: false,
    });
    const mark = markOf.get(bar.id);
    if (mark && pts.length > 0) {
      const mid = pts[Math.floor(pts.length / 2)];
      texts.push({
        layer: LAYERS.mark, at: { x: mid.x, y: mid.y + 0.04 }, height: 0.05,
        text: `${mark} Ø${bar.diameterMm}`,
      });
    }
  }

  for (const z of input.stirrupZones ?? []) {
    dimensions.push({
      layer: LAYERS.dim,
      from: { x: z.from, y: 0 }, to: { x: z.to, y: 0 },
      label: z.label, offset: -0.35,
    });
  }

  const circles: DrawnCircle[] = [];
  return {
    kind: input.projection === PLAN ? 'floorPlan' : 'beamElevation',
    title: buildTitleBlock({
      sheetNumber: input.sheetNumber, title: input.title,
      assembly: input.assembly, clauses: input.clauses, scale: input.scale,
    }),
    polylines, circles, texts, dimensions,
    notes: noteLines(input.assembly.conflicts, input.assembly.unsupported),
    extents: extentsOf(polylines, circles),
  };
}

// ─── Cross-sections ──────────────────────────────────────────────

export interface SectionInput {
  assembly: DetailingAssembly;
  /** Where to cut, as a distance along the projection's right axis. */
  atX: number;
  /** Section outline in the cut plane, as (u, v) pairs in metres. */
  outline: Pt2[];
  /** Tolerance for deciding a bar crosses the cut, m. */
  tolerance?: number;
  projection: Projection;
  clauses: readonly ClauseRef[];
  sheetNumber: string;
  title: string;
  scale?: number;
}

/**
 * Cut a section and draw the bars that cross it as circles in true position.
 *
 * A bar counts as crossing when any sampled segment spans the cut plane. Sampling
 * matters here: a hook that turns just short of the cut must not appear in the section.
 */
export function drawSection(input: SectionInput): Sheet {
  const tol = input.tolerance ?? 0.01;
  const circles: DrawnCircle[] = [];
  const texts: DrawnText[] = [];

  const polylines: DrawnPolyline[] = [{
    layer: LAYERS.outline, points: input.outline, closed: true,
  }];

  const markOf = new Map<string, string>();
  for (const m of input.assembly.marks) for (const id of m.barIds) markOf.set(id, m.mark);

  for (const bar of input.assembly.bars) {
    const pts = samplePath(bar);
    let crossing: Point3 | null = null;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = project(pts[i], input.projection).x;
      const b = project(pts[i + 1], input.projection).x;
      if ((a - input.atX) * (b - input.atX) <= 0 && Math.abs(a - b) > 1e-12) {
        const t = (input.atX - a) / (b - a);
        crossing = {
          x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
          y: pts[i].y + (pts[i + 1].y - pts[i].y) * t,
          z: pts[i].z + (pts[i + 1].z - pts[i].z) * t,
        };
        break;
      }
      if (Math.abs(a - input.atX) <= tol) { crossing = pts[i]; break; }
    }
    if (!crossing) continue;

    // In-plane position: the section's own axes are the projection's up and the
    // remaining orthogonal direction.
    const p = project(crossing, input.projection);
    const third = {
      x: input.projection.right.y * input.projection.up.z - input.projection.right.z * input.projection.up.y,
      y: input.projection.right.z * input.projection.up.x - input.projection.right.x * input.projection.up.z,
      z: input.projection.right.x * input.projection.up.y - input.projection.right.y * input.projection.up.x,
    };
    const u = (crossing.x - input.projection.origin.x) * third.x
      + (crossing.y - input.projection.origin.y) * third.y
      + (crossing.z - input.projection.origin.z) * third.z;

    circles.push({
      layer: bar.role === 'transverse' ? LAYERS.stirrup : LAYERS.bar,
      centre: { x: u, y: p.y },
      radius: bar.diameterMm / 2000,
    });
    const mark = markOf.get(bar.id);
    if (mark) {
      texts.push({
        layer: LAYERS.mark, at: { x: u + 0.02, y: p.y + 0.02 }, height: 0.02, text: mark,
      });
    }
  }

  return {
    kind: 'section',
    title: buildTitleBlock({
      sheetNumber: input.sheetNumber, title: input.title,
      assembly: input.assembly, clauses: input.clauses, scale: input.scale ?? 20,
    }),
    polylines, circles, texts, dimensions: [],
    notes: noteLines(input.assembly.conflicts, input.assembly.unsupported),
    extents: extentsOf(polylines, circles),
  };
}

// ─── DXF with real arcs ──────────────────────────────────────────

function num(v: number): string {
  return (Math.abs(v) < 1e-12 ? 0 : v).toFixed(6);
}

/**
 * Emit a sheet as DXF.
 *
 * R12 (AC1009), matching the rest of the app's DXF output. Bar polylines are emitted as
 * POLYLINE/VERTEX/SEQEND; bar cross-sections as CIRCLE; and true arcs are emitted as ARC
 * entities where the geometry is a circular arc, so a hook opens in CAD as an arc rather
 * than as a chain of chords.
 */
export function sheetToDxf(sheet: Sheet, arcs: DrawnArc[] = [], locale = 'es'): string {
  const out: string[] = [
    '0', 'SECTION', '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1009',
    '9', '$INSUNITS', '70', '6',   // metres
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
  ];

  for (const pl of sheet.polylines) {
    if (pl.points.length < 2) continue;
    out.push('0', 'POLYLINE', '8', pl.layer, '66', '1', '70', pl.closed ? '1' : '0');
    for (const p of pl.points) {
      out.push('0', 'VERTEX', '8', pl.layer, '10', num(p.x), '20', num(p.y), '30', '0.0');
    }
    out.push('0', 'SEQEND', '8', pl.layer);
  }

  for (const c of sheet.circles) {
    out.push('0', 'CIRCLE', '8', c.layer,
      '10', num(c.centre.x), '20', num(c.centre.y), '30', '0.0', '40', num(c.radius));
  }

  for (const a of arcs) {
    out.push('0', 'ARC', '8', a.layer,
      '10', num(a.centre.x), '20', num(a.centre.y), '30', '0.0',
      '40', num(a.radius),
      '50', num(a.startAngleDeg), '51', num(a.endAngleDeg));
  }

  for (const t of sheet.texts) {
    out.push('0', 'TEXT', '8', t.layer,
      '10', num(t.at.x), '20', num(t.at.y), '30', '0.0',
      '40', num(t.height), '1', t.text);
  }

  for (const d of sheet.dimensions) {
    // R12 has no simple associative dimension; emit the witness line and the label,
    // which is what a fabricator reads anyway.
    out.push('0', 'LINE', '8', d.layer,
      '10', num(d.from.x), '20', num(d.from.y + d.offset), '30', '0.0',
      '11', num(d.to.x), '21', num(d.to.y + d.offset), '31', '0.0');
    out.push('0', 'TEXT', '8', d.layer,
      '10', num((d.from.x + d.to.x) / 2), '20', num(d.from.y + d.offset - 0.05), '30', '0.0',
      '40', '0.05', '1', d.label);
  }

  // Title block and notes as text, so the sheet is self-describing in CAD too.
  let ty = sheet.extents.min.y - 0.6;
  const put = (s: string) => {
    out.push('0', 'TEXT', '8', LAYERS.title,
      '10', num(sheet.extents.min.x), '20', num(ty), '30', '0.0', '40', '0.06', '1', s);
    ty -= 0.12;
  };
  put(`${sheet.title.sheetNumber} — ${sheet.title.title}`);
  put(`Reglamento: ${sheet.title.codeEdition}   Escala 1:${sheet.title.scale}`);
  put(`Revisión ${sheet.title.revision} — estado ${sheet.title.reviewState}`);
  if (sheet.title.reviewer) put(`Revisado por: ${sheet.title.reviewer} (${sheet.title.reviewedAt ?? ''})`);
  if (sheet.title.clauses.length > 0) put(`Artículos: ${sheet.title.clauses.join('; ')}`);
  if (sheet.title.superseded) put('*** SUPERSEDED — la revisión revisada ya no es la vigente ***');
  if (sheet.title.provisionalNote) put(teAt(sheet.title.provisionalNote, locale));
  for (const n of sheet.notes) put(n);

  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\n') + '\n';
}

export interface DrawnArc {
  layer: string;
  centre: Pt2;
  radius: number;
  startAngleDeg: number;
  endAngleDeg: number;
}

/**
 * Extract true arcs from a bar's segments, for DXF ARC output.
 *
 * A hook drawn as chords is visually fine and geometrically wrong — a fabricator
 * measuring off the DXF would read the chord, not the arc. Where the segment IS an arc,
 * emit it as one.
 */
export function barArcs(bar: BarPath, proj: Projection, layer = LAYERS.bar): DrawnArc[] {
  const out: DrawnArc[] = [];
  for (const seg of bar.segments) {
    if (seg.kind !== 'arc' || !seg.radius) continue;
    const a = project(seg.start, proj);
    const b = project(seg.end, proj);
    // Centre is offset perpendicular to the chord by the sagitta direction.
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const chord = Math.hypot(dx, dy);
    if (chord < 1e-9) continue;
    const r = Math.max(seg.radius, chord / 2);
    const h = Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2));
    const cx = mx - (dy / chord) * h;
    const cy = my + (dx / chord) * h;
    const startAngleDeg = (Math.atan2(a.y - cy, a.x - cx) * 180) / Math.PI;
    const endAngleDeg = (Math.atan2(b.y - cy, b.x - cx) * 180) / Math.PI;
    out.push({
      layer, centre: { x: cx, y: cy }, radius: r,
      startAngleDeg: (startAngleDeg + 360) % 360,
      endAngleDeg: (endAngleDeg + 360) % 360,
    });
  }
  return out;
}

// ─── Schedule ────────────────────────────────────────────────────

export interface ScheduleRow {
  mark: string;
  /**
   * What the item is, and where it belongs — carried from the mark, not re-derived.
   *
   * Optional because a caller outside coordinated detailing can legitimately hand-build a row
   * from a bill that has no assembly behind it. The exporter renders a blank rather than
   * throwing: a missing column is a thinner workbook, a thrown exporter is no workbook.
   */
  role?: BarPath['role'];
  ownerElementIds?: number[];
  zoneIds?: string[];
  diameterMm: number;
  shape: string;
  quantity: number;
  cuttingLengthM: number;
  totalLengthM: number;
  massKg: number;
  stockBars: number;
  offcutM: number;
}

export interface ScheduleTable {
  rows: ScheduleRow[];
  totals: { quantity: number; totalLengthM: number; massKg: number; stockBars: number; wasteM: number };
  /** Per-diameter subtotals, for ordering. */
  byDiameter: Array<{ diameterMm: number; quantity: number; massKg: number; stockBars: number }>;
  notes: string[];
}

/**
 * Build the bar bending schedule from the marks.
 *
 * Stock and offcut are computed per mark, matching how a shop cuts: identical bars are
 * nested together, different marks are not mixed on one stock length. Presenting an
 * optimal cross-mark nesting the shop will not follow would understate the order.
 */
export function buildSchedule(
  marks: readonly BarMark[], stockLength = 12,
  extraNotes: readonly string[] = [],
): ScheduleTable {
  const rows: ScheduleRow[] = [];
  const notes = [...extraNotes];

  for (const m of marks) {
    const perStock = m.cuttingLength > stockLength ? 0 : Math.max(1, Math.floor(stockLength / m.cuttingLength));
    const stockBars = perStock === 0 ? m.quantity : Math.ceil(m.quantity / perStock);
    const offcut = perStock === 0 ? 0 : stockLength - perStock * m.cuttingLength;
    if (perStock === 0) {
      notes.push(
        `La marca ${m.mark} (${m.cuttingLength.toFixed(2)} m) excede la barra comercial de ` +
        `${stockLength} m y requiere empalme.`);
    }
    rows.push({
      mark: m.mark, diameterMm: m.diameterMm, shape: m.shape, quantity: m.quantity,
      role: m.role, ownerElementIds: m.ownerElementIds, zoneIds: m.zoneIds,
      cuttingLengthM: m.cuttingLength,
      totalLengthM: m.cuttingLength * m.quantity,
      massKg: m.massKg,
      stockBars,
      offcutM: offcut * stockBars,
    });
  }

  const byDia = new Map<number, { quantity: number; massKg: number; stockBars: number }>();
  for (const r of rows) {
    const g = byDia.get(r.diameterMm) ?? { quantity: 0, massKg: 0, stockBars: 0 };
    g.quantity += r.quantity; g.massKg += r.massKg; g.stockBars += r.stockBars;
    byDia.set(r.diameterMm, g);
  }

  return {
    rows,
    totals: {
      quantity: rows.reduce((s, r) => s + r.quantity, 0),
      totalLengthM: rows.reduce((s, r) => s + r.totalLengthM, 0),
      massKg: rows.reduce((s, r) => s + r.massKg, 0),
      stockBars: rows.reduce((s, r) => s + r.stockBars, 0),
      wasteM: rows.reduce((s, r) => s + r.offcutM, 0),
    },
    byDiameter: [...byDia.entries()]
      .map(([diameterMm, g]) => ({ diameterMm, ...g }))
      .sort((a, b) => a.diameterMm - b.diameterMm),
    notes,
  };
}

/** Schedule as rows of strings, ready for XLSX or CSV. */
export function scheduleToAoa(s: ScheduleTable, title: TitleBlock, locale = 'es'): (string | number)[][] {
  const out: (string | number)[][] = [
    [title.title],
    ['Reglamento', title.codeEdition],
    ['Revisión', title.revision, 'Estado', title.reviewState],
  ];
  if (title.reviewer) out.push(['Revisado por', title.reviewer, title.reviewedAt ?? '']);
  if (title.superseded) out.push(['*** SUPERSEDED ***']);
  if (title.provisionalNote) out.push([teAt(title.provisionalNote, locale)]);
  out.push([]);
  // Every heading through the dictionary. They were Spanish string literals with a `locale`
  // parameter sitting unused two lines above them, so an English export produced a Spanish
  // workbook — and the i18n purity gate cannot see a literal inside an exporter.
  const h = (k: string) => tAt(`detailing.schedule.${k}`, locale);
  out.push([h('mark'), h('role'), h('owner'), h('zone'), h('diameter'), h('shape'),
    h('quantity'), h('cuttingLength'), h('totalLength'), h('mass'), h('stockBars'),
    h('offcut')]);
  for (const r of s.rows) {
    out.push([r.mark, r.role ? tAt(`detailing.schedule.role.${r.role}`, locale) : '',
      (r.ownerElementIds ?? []).join(', '), (r.zoneIds ?? []).join(', '),
      r.diameterMm, r.shape, r.quantity,
      +r.cuttingLengthM.toFixed(3), +r.totalLengthM.toFixed(2),
      +r.massKg.toFixed(1), r.stockBars, +r.offcutM.toFixed(2)]);
  }
  out.push([]);
  out.push([h('total'), '', '', '', '', '', s.totals.quantity, '',
    +s.totals.totalLengthM.toFixed(2), +s.totals.massKg.toFixed(1),
    s.totals.stockBars, +s.totals.wasteM.toFixed(2)]);
  out.push([]);
  out.push([h('byDiameter')]);
  out.push([h('diameter'), h('quantity'), h('mass'), h('stockBars')]);
  for (const d of s.byDiameter) {
    out.push([d.diameterMm, d.quantity, +d.massKg.toFixed(1), d.stockBars]);
  }
  if (s.notes.length > 0) {
    out.push([]);
    out.push([h('notes')]);
    for (const n of s.notes) out.push([n]);
  }
  return out;
}

// ─── SVG, for on-screen preview and the PDF print path ───────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Render a sheet as SVG.
 *
 * Model y is up; SVG y is down, so the whole drawing is emitted inside a flip transform
 * rather than negating every coordinate at the point of use — one place to get right.
 */
export function sheetToSvg(sheet: Sheet, widthPx = 1200, locale = 'es'): string {
  const { min, max } = sheet.extents;
  const pad = 0.5;
  const w = Math.max(1e-6, max.x - min.x + 2 * pad);
  const h = Math.max(1e-6, max.y - min.y + 2 * pad);
  const noteH = 0.16 * (sheet.notes.length + 7);
  const totalH = h + noteH;
  const heightPx = Math.round((widthPx * totalH) / w);

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${totalH}" ` +
    `width="${widthPx}" height="${heightPx}" role="img" ` +
    `aria-label="${esc(sheet.title.title)}">`,
    '<rect width="100%" height="100%" fill="#ffffff"/>',
    `<g transform="translate(${pad - min.x} ${h - pad + min.y}) scale(1 -1)">`,
  ];

  for (const pl of sheet.polylines) {
    if (pl.points.length < 2) continue;
    const d = pl.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(4)} ${p.y.toFixed(4)}`).join(' ')
      + (pl.closed ? ' Z' : '');
    const stroke = pl.layer === LAYERS.outline ? '#333' : pl.layer === LAYERS.stirrup ? '#0a7' : '#c33';
    const wdt = pl.layer === LAYERS.outline ? 0.012 : 0.008;
    parts.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${wdt}"/>`);
  }
  for (const c of sheet.circles) {
    const fill = c.layer === LAYERS.stirrup ? '#0a7' : '#c33';
    parts.push(`<circle cx="${c.centre.x.toFixed(4)}" cy="${c.centre.y.toFixed(4)}" ` +
      `r="${Math.max(c.radius, 0.006).toFixed(4)}" fill="${fill}"/>`);
  }
  for (const d of sheet.dimensions) {
    parts.push(`<path d="M${d.from.x.toFixed(4)} ${(d.from.y + d.offset).toFixed(4)} ` +
      `L${d.to.x.toFixed(4)} ${(d.to.y + d.offset).toFixed(4)}" stroke="#666" ` +
      'stroke-width="0.006" fill="none"/>');
  }
  parts.push('</g>');

  // Text is emitted outside the flip so glyphs are not mirrored.
  const ty = (y: number) => (h - pad + min.y) - y;
  for (const t of sheet.texts) {
    parts.push(`<text x="${(t.at.x + pad - min.x).toFixed(4)}" y="${ty(t.at.y).toFixed(4)}" ` +
      `font-size="${t.height}" fill="#111" font-family="sans-serif">${esc(t.text)}</text>`);
  }
  for (const d of sheet.dimensions) {
    parts.push(`<text x="${((d.from.x + d.to.x) / 2 + pad - min.x).toFixed(4)}" ` +
      `y="${ty(d.from.y + d.offset - 0.06).toFixed(4)}" font-size="0.05" ` +
      `fill="#444" font-family="sans-serif" text-anchor="middle">${esc(d.label)}</text>`);
  }

  // Title block and notes.
  let by = h + 0.18;
  const line = (s: string, weight = 'normal', fill = '#111', size = 0.09) => {
    parts.push(`<text x="0.1" y="${by.toFixed(4)}" font-size="${size}" fill="${fill}" ` +
      `font-weight="${weight}" font-family="sans-serif">${esc(s)}</text>`);
    by += 0.16;
  };
  line(`${sheet.title.sheetNumber} — ${sheet.title.title}`, 'bold');
  line(`${sheet.title.codeEdition} · Escala 1:${sheet.title.scale} · Revisión ${sheet.title.revision} · ${sheet.title.reviewState}`);
  if (sheet.title.reviewer) line(`Revisado por: ${sheet.title.reviewer} — ${sheet.title.reviewedAt ?? ''}`);
  if (sheet.title.clauses.length > 0) line(`Artículos: ${sheet.title.clauses.join('; ')}`, 'normal', '#444', 0.07);
  if (sheet.title.provisionalNote) line(teAt(sheet.title.provisionalNote, locale), 'bold', '#8a5a00', 0.07);
  for (const n of sheet.notes) line(n, 'normal', '#a11', 0.07);

  if (sheet.title.superseded) {
    parts.push(
      `<text x="${(w / 2).toFixed(3)}" y="${(h / 2).toFixed(3)}" font-size="${(w / 8).toFixed(3)}" ` +
      'fill="#c00" fill-opacity="0.22" font-family="sans-serif" font-weight="bold" ' +
      `text-anchor="middle" transform="rotate(-30 ${(w / 2).toFixed(3)} ${(h / 2).toFixed(3)})">` +
      'SUPERSEDED</text>');
  }

  parts.push('</svg>');
  return parts.join('\n');
}
