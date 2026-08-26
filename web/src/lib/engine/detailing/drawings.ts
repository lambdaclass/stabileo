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

export type SheetKind =
  | 'beamElevation' | 'columnElevation' | 'section' | 'jointDetail' | 'floorPlan'
  /** The whole structure in plan, one sheet. */
  | 'generalPlan'
  /** One storey in plan, carrying only that storey's members. */
  | 'levelPlan'
  /** A horizontal cut at a stated elevation. */
  | 'horizontalSection'
  /** One column lift: section, longitudinals and every transverse piece. */
  | 'columnDetail';

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
export interface DrawnDimension {
  layer: string;
  from: Pt2;
  to: Pt2;
  label: string;
  /** How far off the measured line the witness line sits, in the axis it is NOT measuring. */
  offset: number;
  /**
   * Which sheet axis this dimension measures. `'x'` when absent.
   *
   * ── Why the field had to exist ─────────────────────────────────
   *
   * Both writers assumed horizontal: the witness line was emitted from `from.y + offset` to
   * `to.y + offset` and the label centred between the two x's. A member's DEPTH and a
   * section's HEIGHT are the two numbers a reinforcement drawing is read for, and either one
   * came out as a horizontal line of zero length with the label stacked on top of it.
   */
  axis?: 'x' | 'y';
}

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
  /**
   * The specified cover line inside a section.
   *
   * Its own layer for `punching`'s reason: it is neither concrete nor a dimension. It is the
   * design's requirement drawn where the steel can be checked against it, and a reviewer wants
   * it isolated while a fabricator building the cage wants it off.
   */
  cover: 'RC-COVER',
} as const;

/**
 * The sheet's bounding box.
 *
 * Dimensions count towards it. They did not, and the moment a sheet carried any they were
 * cropped: `sheetToSvg` builds its viewBox from the extents plus a fixed 0.5 m pad, and a
 * witness line sitting 0.3 m off the concrete with a label below it lands outside that pad on
 * the side it is drawn on. A dimension a reader cannot see is not a dimension.
 */
function extentsOf(
  polylines: DrawnPolyline[], circles: DrawnCircle[],
  dimensions: readonly DrawnDimension[] = [],
): Sheet['extents'] {
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
  for (const d of dimensions) {
    const w = witness(d);
    eat(w.a); eat(w.b); eat(w.label);
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

/**
 * Members on this assembly whose top steel is the §25.7.1.2 pair, ascending.
 *
 * Derived from the bars the generator marked rather than carried on the assembly beside
 * `provisionalMembers`: the marking is already on every bar, for exactly the reason that a
 * member-level list has to be re-joined at each drawing site and one of those joins is
 * eventually forgotten.
 */
function hangerTopMembersOf(a: DetailingAssembly): number[] {
  return [...new Set(a.bars
    .filter((b) => b.purpose === 'stirrupHanger')
    .flatMap((b) => b.ownerElementIds))].sort((x, y) => x - y);
}

function noteLines(
  conflicts: readonly BarConflict[], unsupported: readonly UnsupportedCondition[],
  provisionalMembers: readonly number[] = [],
  torsionUnevaluatedMembers: readonly number[] = [],
  hangerTopMembers: readonly number[] = [],
): string[] {
  const out: string[] = [];
  /**
   * The provisional note goes FIRST, above the conflicts and the unsupported conditions.
   *
   * Note order is read order. A conflict is a defect in one detail of an otherwise real
   * design; a provisional member means the sheet is not documentation at all, and a reader who
   * stops after two lines must have read that one.
   */
  if (provisionalMembers.length > 0) {
    out.push(
      `PROPUESTA PROVISIONAL — NO APTO PARA EMISIÓN CONSTRUCTIVA. `
      + `${provisionalMembers.length} elemento(s) de esta lámina (${provisionalMembers.join(', ')}) `
      + 'llevan armadura del diseño del eje principal; su eje secundario no lo verifica ninguna '
      + 'comprobación de esta aplicación. Diseñar ese eje antes de emitir.');
  }
  /**
   * The torsion warning, immediately after it, and for the same reason.
   *
   * It is a WARNING and not a refusal: the geometry on this sheet is real, the reinforcement is
   * the reinforcement the design produced, and nothing about either was changed by the fact
   * that the torsion was never checked. What the reader must not be able to do is take the
   * sheet as a complete verification. See `torsion-notice.ts`.
   */
  if (torsionUnevaluatedMembers.length > 0) {
    out.push(
      'TORSIÓN NO EVALUADA — función en desarrollo. '
      + `${torsionUnevaluatedMembers.length} elemento(s) de esta lámina `
      + `(${torsionUnevaluatedMembers.join(', ')}) reciben torsión según el análisis, y ninguna `
      + 'comprobación de esta aplicación la verifica. La armadura indicada NO contempla torsión. '
      + 'No usar como verificación final; verificar la torsión aparte antes de emitir. '
      + 'Se corregirá en PR21.');
  }
  /**
   * The assembly bars, third, and a note rather than a refusal.
   *
   * The steel IS there and it IS legal — §25.7.1.2 asks for a bar in the bend and there is one.
   * What a reader must not be able to do is read `2Ø10` at the top of a beam and take it for
   * hogging reinforcement, because the sheet gives them no other way to tell: a hanger and a
   * designed top bar are drawn with the same line at the same elevation.
   */
  if (hangerTopMembers.length > 0) {
    out.push(
      'ARMADURA SUPERIOR DE ARMADO — '
      + `${hangerTopMembers.length} elemento(s) de esta lámina (${hangerTopMembers.join(', ')}) `
      + 'no tienen momento negativo de envolvente en ningún apoyo. Sus barras superiores cumplen '
      + '25.7.1.2 (cada doblez del estribo contiene una barra longitudinal) y NO son armadura '
      + 'resistente: no se les verificó capacidad a momento negativo. El Reglamento no fija su '
      + 'diámetro; el indicado es un criterio de esta aplicación.');
  }
  for (const u of unsupported) {
    out.push(`NO VERIFICADO — ${u.key}: ${u.message}`);
  }
  /**
   * Conflicts: a legend, then a bounded list.
   *
   * This used to emit one line per conflict, unbounded. On `Edificio H.A. 7 pisos — PRO` that
   * is 40 065 lines, which is not a note block — it is a sheet with no drawing on it, and the
   * one line that mattered is on page 300.
   *
   * Bounding it is not hiding it. The count is stated first, the breakdown by severity is
   * stated, the warning that the cage is not constructible is stated, and then the worst
   * `MAX_CONFLICT_NOTES` are listed in full with both bar ids, the measured clearance and the
   * requirement. The remainder is named as a remainder — `… y N más` — never silently
   * dropped, and the complete list is what the detailing panel and the conflict inventory are
   * for. Worst first, by shortfall, so the bounded list is the useful end of it.
   */
  const reportable = conflicts.filter((c) => c.severity !== 'marginal');
  if (reportable.length > 0) {
    const overlaps = reportable.filter((c) => c.severity === 'overlap').length;
    out.push(
      `CONFLICTOS: ${reportable.length} sin resolver (${overlaps} interpenetración, `
      + `${reportable.length - overlaps} separación). NO CONSTRUIBLE SIN REVISIÓN — esta lámina `
      + 'documenta el armado y sus conflictos, no autoriza su ejecución.');
    const worst = [...reportable].sort((a, b) => b.shortfall - a.shortfall);
    for (const c of worst.slice(0, MAX_CONFLICT_NOTES)) {
      out.push(
        `CONFLICTO ${c.severity === 'overlap' ? 'SOLAPE' : 'SEPARACIÓN'} — barras ${c.barA}/${c.barB}`
        + `${c.elementIds.length > 0 ? ` (elem. ${c.elementIds.join(', ')})` : ''}: `
        + `${(c.clearance * 1000).toFixed(0)} mm libres contra ${(c.required * 1000).toFixed(0)} mm `
        + `requeridos${c.pairClass ? ` — ${c.pairClass}` : ''}.`);
    }
    if (worst.length > MAX_CONFLICT_NOTES) {
      out.push(`… y ${worst.length - MAX_CONFLICT_NOTES} conflicto(s) más, en la planilla de conflictos.`);
    }
  }
  return out;
}

/**
 * How many conflicts are listed line by line on a sheet before the rest become a count.
 *
 * Twelve because a note block is read, not searched: past a dozen lines a reader is scanning
 * for the end of it rather than taking any of them in. The number that is NOT bounded is the
 * total, which is always stated.
 */
export const MAX_CONFLICT_NOTES = 12;

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
  /**
   * Dimensions the caller has already resolved — lengths, depths, covers.
   *
   * Built by `sheet-geometry.ts` and passed in rather than computed here, so this module stays
   * a renderer of a `Sheet` and one module owns where a witness line goes. It also keeps the
   * arithmetic assertable without constructing an assembly.
   */
  dimensions?: readonly DrawnDimension[];
  /** Lines that are neither concrete nor steel — the cover line, and anything like it. */
  extraPolylines?: readonly DrawnPolyline[];
  /** Notes to print under the standard ones: what could not be drawn, what was not dimensioned. */
  extraNotes?: readonly string[];
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

  /**
   * Marks already labelled on this sheet.
   *
   * ── One label per mark, not one per bar ────────────────────────
   *
   * A mark is a fabrication TYPE — `assignMarks` groups identical items under it — so every
   * stirrup in a zone carries the same one. Labelling each bar put `B4 Ø8` on screen once per
   * stirrup: on `rc-design-qa-8` that is a solid band of overlapping text across the top of
   * the beam, and it got worse the more steel the design produced. The text was legible only
   * on the sheets with the least reinforcement on them.
   *
   * Nothing is lost, because nothing was said twice: the second `B4 Ø8` carried no information
   * the first did not. The quantity behind a mark is the schedule's job, and it states it.
   */
  const labelled = new Set<string>();

  for (const bar of input.assembly.bars) {
    const pts = samplePath(bar).map((p) => project(p, input.projection));
    polylines.push({
      layer: bar.role === 'transverse' ? LAYERS.stirrup : LAYERS.bar,
      points: pts, closed: false,
    });
    const mark = markOf.get(bar.id);
    if (mark && pts.length > 0 && !labelled.has(mark)) {
      labelled.add(mark);
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
  dimensions.push(...(input.dimensions ?? []));
  polylines.push(...(input.extraPolylines ?? []));

  const circles: DrawnCircle[] = [];
  return {
    kind: input.projection === PLAN ? 'floorPlan' : 'beamElevation',
    title: buildTitleBlock({
      sheetNumber: input.sheetNumber, title: input.title,
      assembly: input.assembly, clauses: input.clauses, scale: input.scale,
    }),
    polylines, circles, texts, dimensions,
    notes: [
      ...noteLines(input.assembly.conflicts, input.assembly.unsupported,
        input.assembly.provisionalMembers ?? [],
        input.assembly.torsionUnevaluatedMembers ?? [],
        hangerTopMembersOf(input.assembly)),
      ...(input.extraNotes ?? []),
    ],
    extents: extentsOf(polylines, circles, dimensions),
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
  /**
   * Draw only the steel belonging to these members. Every crossing bar when absent.
   *
   * ── Why a section needs this ───────────────────────────────────
   *
   * The plane is cut through the whole assembly, and an assembly is a LEVEL: a beam line, the
   * columns under it, and every transverse beam framing into it. So the bars that cross
   * `atX` include steel from members metres away across the sheet's third axis — measured on
   * `rc-design-qa-8`, a bar at u = −4,84 m inside an outline 300 mm wide.
   *
   * Drawn against one member's outline that reads as reinforcement bursting out of the
   * concrete. It is not: it is another beam's steel, correctly placed, in a drawing that
   * never said which member it was a section of. A section is a section OF something, and
   * this is that something.
   *
   * Ownership, not proximity: a bar continuous over a support belongs to the beam and to the
   * column, and it appears in both their sections because it is in both.
   */
  restrictToMembers?: readonly number[];
  /** b, h and the cover, resolved by `sheet-geometry.ts`. */
  dimensions?: readonly DrawnDimension[];
  /** The specified cover line, in the same section coordinates as `outline`. */
  coverLine?: readonly Pt2[];
  extraNotes?: readonly string[];
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
  if (input.coverLine && input.coverLine.length >= 3) {
    polylines.push({ layer: LAYERS.cover, points: [...input.coverLine], closed: true });
  }

  const markOf = new Map<string, string>();
  for (const m of input.assembly.marks) for (const id of m.barIds) markOf.set(id, m.mark);

  const wanted = input.restrictToMembers ? new Set(input.restrictToMembers) : null;

  for (const bar of input.assembly.bars) {
    if (wanted && !bar.ownerElementIds.some((id) => wanted.has(id))) continue;
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

  const dimensions = [...(input.dimensions ?? [])];
  return {
    kind: 'section',
    title: buildTitleBlock({
      sheetNumber: input.sheetNumber, title: input.title,
      assembly: input.assembly, clauses: input.clauses, scale: input.scale ?? 20,
    }),
    polylines, circles, texts, dimensions,
    notes: [
      ...noteLines(input.assembly.conflicts, input.assembly.unsupported,
        input.assembly.provisionalMembers ?? [],
        input.assembly.torsionUnevaluatedMembers ?? [],
        hangerTopMembersOf(input.assembly)),
      ...(input.extraNotes ?? []),
    ],
    extents: extentsOf(polylines, circles, dimensions),
  };
}

// ─── DXF with real arcs ──────────────────────────────────────────

function num(v: number): string {
  return (Math.abs(v) < 1e-12 ? 0 : v).toFixed(6);
}

/**
 * Where a dimension's witness line and its label go, for both writers.
 *
 * One function because the SVG and the DXF have to place the same line in the same place. They
 * placed it with two copies of the same three expressions, and only one of those copies would
 * have been taught about `axis` — which is how a sheet and the DXF exported from it come to
 * carry different drawings.
 *
 * `'y'` offsets in x and labels to the side; `'x'` offsets in y and labels below. The label
 * clearance is a tenth of the text height below the line for a horizontal one and a small gap
 * beyond the line for a vertical one, because a vertical label centred ON the line sits on top
 * of the geometry it is measuring.
 */
function witness(d: DrawnDimension): { a: Pt2; b: Pt2; label: Pt2; anchor: 'start' | 'end' | 'middle' } {
  // The label goes on the FAR side of the witness line from the geometry, which is the side the
  // offset points to. Anchoring it inwards is how `r 25` came to be printed across the concrete
  // it was measuring — the one dimension on the sheet drawn on the right.
  const away = Math.sign(d.offset) || -1;
  const gap = 0.06 * away;
  if (d.axis === 'y') {
    const x = d.from.x + d.offset;
    return {
      a: { x, y: d.from.y },
      b: { x, y: d.to.y },
      label: { x: x + gap, y: (d.from.y + d.to.y) / 2 },
      anchor: away > 0 ? 'start' : 'end',
    };
  }
  const y = d.from.y + d.offset;
  return {
    a: { x: d.from.x, y },
    b: { x: d.to.x, y },
    label: { x: (d.from.x + d.to.x) / 2, y: y + gap },
    anchor: 'middle',
  };
}

/**
 * Text height for a dimension label, in model units, scaled to the sheet.
 *
 * A fixed 0.05 m is a sensible caption on a 7 m elevation and a banner across a 300 mm
 * section: it was 17 % of the section's width, and `550` came out taller than the bars it was
 * measuring. Clamped at both ends so a very long sheet does not get microscopic labels and a
 * very small one does not get a stroke-thin caption.
 */
function labelHeight(sheet: Sheet): number {
  const w = Math.max(1e-6, sheet.extents.max.x - sheet.extents.min.x);
  return Math.min(0.05, Math.max(0.012, w / 40));
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
    const w = witness(d);
    out.push('0', 'LINE', '8', d.layer,
      '10', num(w.a.x), '20', num(w.a.y), '30', '0.0',
      '11', num(w.b.x), '21', num(w.b.y), '31', '0.0');
    out.push('0', 'TEXT', '8', d.layer,
      '10', num(w.label.x), '20', num(w.label.y), '30', '0.0',
      '40', num(labelHeight(sheet)), '1', d.label);
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
  /**
   * What the item is FOR — see `BarPath.purpose`. Absent means resistant reinforcement.
   *
   * Its own column rather than a suffix on `role`, because a bender reads `role` to know what
   * to fabricate and an engineer reads this to know what the bar answers for. Merging them
   * would make the fabrication column carry an engineering claim.
   */
  purpose?: BarPath['purpose'];
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
      role: m.role, purpose: m.purpose,
      ownerElementIds: m.ownerElementIds, zoneIds: m.zoneIds,
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
  out.push([h('mark'), h('role'), h('purpose'), h('owner'), h('zone'), h('diameter'),
    h('shape'), h('quantity'), h('cuttingLength'), h('totalLength'), h('mass'),
    h('stockBars'), h('offcut')]);
  for (const r of s.rows) {
    out.push([r.mark, r.role ? tAt(`detailing.schedule.role.${r.role}`, locale) : '',
      // Absent is not blank: every bar has a purpose and the ordinary one is "resistant".
      // A blank cell here would read as "unknown", which is the one thing it never is.
      r.role === 'longitudinal'
        ? tAt(`detailing.schedule.purpose.${r.purpose ?? 'resistant'}`, locale) : '',
      (r.ownerElementIds ?? []).join(', '), (r.zoneIds ?? []).join(', '),
      r.diameterMm, r.shape, r.quantity,
      +r.cuttingLengthM.toFixed(3), +r.totalLengthM.toFixed(2),
      +r.massKg.toFixed(1), r.stockBars, +r.offcutM.toFixed(2)]);
  }
  out.push([]);
  out.push([h('total'), '', '', '', '', '', '', s.totals.quantity, '',
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
    const stroke = pl.layer === LAYERS.outline ? '#333'
      : pl.layer === LAYERS.cover ? '#888'
        : pl.layer === LAYERS.stirrup ? '#0a7' : '#c33';
    const wdt = pl.layer === LAYERS.outline ? 0.012 : 0.008;
    /*
      The cover line is DASHED, and that is the whole of what distinguishes it from concrete.

      It is a requirement, not a face. Drawn solid at this weight it reads as a second, inner
      member — which is exactly how a reviewer comes to measure the wrong edge. Grey and dashed
      is the convention every hand-drawn section already uses for it.
    */
    const dash = pl.layer === LAYERS.cover ? ' stroke-dasharray="0.03 0.02"' : '';
    parts.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${wdt}"${dash}/>`);
  }
  for (const c of sheet.circles) {
    const fill = c.layer === LAYERS.stirrup ? '#0a7' : '#c33';
    parts.push(`<circle cx="${c.centre.x.toFixed(4)}" cy="${c.centre.y.toFixed(4)}" ` +
      `r="${Math.max(c.radius, 0.006).toFixed(4)}" fill="${fill}"/>`);
  }
  for (const d of sheet.dimensions) {
    const w = witness(d);
    parts.push(`<path d="M${w.a.x.toFixed(4)} ${w.a.y.toFixed(4)} ` +
      `L${w.b.x.toFixed(4)} ${w.b.y.toFixed(4)}" stroke="#666" ` +
      'stroke-width="0.006" fill="none"/>');
    /*
      Extension lines, from the geometry out to the witness line.

      A witness line floating beside a member does not say WHICH edges it measures, and on a
      sheet with a dozen members that is the difference between a dimension and a stray line.
      Two short ticks are what a hand drawing puts there and they cost one path each.
    */
    const tick = (from: Pt2, to: Pt2) =>
      parts.push(`<path d="M${from.x.toFixed(4)} ${from.y.toFixed(4)} ` +
        `L${to.x.toFixed(4)} ${to.y.toFixed(4)}" stroke="#999" ` +
        'stroke-width="0.004" fill="none"/>');
    tick(d.from, w.a);
    tick(d.to, w.b);
  }
  parts.push('</g>');

  // Text is emitted outside the flip so glyphs are not mirrored.
  const ty = (y: number) => (h - pad + min.y) - y;
  for (const t of sheet.texts) {
    parts.push(`<text x="${(t.at.x + pad - min.x).toFixed(4)}" y="${ty(t.at.y).toFixed(4)}" ` +
      `font-size="${t.height}" fill="#111" font-family="sans-serif">${esc(t.text)}</text>`);
  }
  const dimText = labelHeight(sheet);
  for (const d of sheet.dimensions) {
    const w = witness(d);
    // A vertical dimension's label reads across the page rather than along its own line:
    // rotating it would be truer to a CAD sheet and unreadable in a 34 rem panel, which is the
    // surface this SVG exists for. The DXF keeps the same placement, and CAD is where a reader
    // who wants the rotated form opens it.
    parts.push(`<text x="${(w.label.x + pad - min.x).toFixed(4)}" ` +
      `y="${ty(w.label.y).toFixed(4)}" font-size="${dimText.toFixed(4)}" ` +
      `fill="#444" font-family="sans-serif" ` +
      `text-anchor="${w.anchor}">${esc(d.label)}</text>`);
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
