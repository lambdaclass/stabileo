/**
 * The concrete on a sheet: its outline, its cover, and the dimensions that make it a drawing.
 *
 * ── What the sheets were before this ───────────────────────────────
 *
 * `drawElevation` was called with `outlines: []` and `drawSection` with a rectangle written
 * into the store by hand — `±0.15 × ±0.30`, the same 300 × 600 box for a 200 × 400 beam, for a
 * 500 mm column, for every member in every project. So the elevation was bars floating in
 * white space with no member round them, and the section was a box of invented dimensions
 * standing in a different place from the steel it was supposed to contain: the bars are placed
 * in ABSOLUTE section coordinates measured from the projection's origin, and that rectangle was
 * centred on zero. It only looked right for a member that happened to sit at the origin.
 *
 * A drawing with no concrete on it is not a reinforcement drawing. It is a bar diagram, and the
 * three things §8 item 7 asks for — contour, cover, dimensions — are exactly the three that
 * turn one into the other.
 *
 * ── Where the geometry comes from, and where it does not ───────────
 *
 * From `MemberGeometry`, the same snapshot `membersFromModel` builds and the 3-D scene is
 * given, and through `memberBase` — the scene's OWN section frame, exported rather than
 * reimplemented. Two copies of that arithmetic would be two conventions for which way a rolled
 * section faces, and they would agree until the first raking column.
 *
 * Nothing here reaches for a store or a section table. A member the caller did not supply is
 * REFUSED and reported, exactly as `membersFromModel` refuses one with no rectangle: a member
 * missing from the sheet has to be visible as missing, because a plausible box nobody specified
 * is worse than a gap.
 *
 * ── The two covers, and why the sheet shows both ───────────────────
 *
 * The SPECIFIED cover is a design input — `MemberContext.material.cover`, what the verification
 * was run with. The DRAWN cover is a measurement: the clear distance from the concrete face to
 * the outermost bar of the geometry that actually got generated. They should agree and the
 * sheet does not assume they do. The section carries the specified cover as a line and a
 * dimension; the elevation dimensions the measured one. A drawing on which the two disagree is
 * a drawing that has just told you something, which is the whole point of putting a number on
 * a line instead of trusting the input.
 *
 * Pure: no store, no runes, no DOM.
 */

import type { Point3 } from '../../codes/cirsoc201/bar-geometry';
import { memberBase, type MemberGeometry } from './scene-model';
import { project, type Projection, type Pt2 } from './drawings';

// ─── Small vector helpers, local and unexported ──────────────────

function cross(a: Point3, b: Point3): Point3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Point3, b: Point3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function sub(a: Point3, b: Point3): Point3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/**
 * The projection's third axis — the one the section is cut across.
 *
 * `right × up`, which is the same expression `drawSection` computes inline to place a bar in
 * its section. Named here so the outline and the bars inside it are resolved in one basis
 * rather than in two that happen to match.
 */
export function sectionAxis(proj: Projection): Point3 {
  return cross(proj.right, proj.up);
}

/** A model point in the cut plane's own (across, up) coordinates, measured from the origin. */
export function toSectionPlane(p: Point3, proj: Projection): Pt2 {
  const d = sub(p, proj.origin);
  return { x: dot(d, sectionAxis(proj)), y: dot(d, proj.up) };
}

// ─── The concrete outline ────────────────────────────────────────

/** The eight corners of a member's concrete prism, in model coordinates. */
export function memberCorners(m: MemberGeometry): Point3[] {
  const { base, extrude } = memberBase(m);
  return [
    ...base,
    ...base.map((p) => ({ x: p.x + extrude.x, y: p.y + extrude.y, z: p.z + extrude.z })),
  ];
}

/**
 * The outline the projection actually sees, as model points.
 *
 * ── Why a hull and not "the axis, offset by half the depth" ────────
 *
 * Because that answer is only right for one of the two members on a beam-line sheet. Under
 * `ELEVATION_X` a beam's silhouette is its length by its depth, and a column's — its axis is
 * the sheet's UP — is its width by its length. A formula that offset the axis perpendicular to
 * itself would draw the column as a line. The convex hull of the eight projected corners is
 * the silhouette of a box under any projection, including a raking column, and it costs
 * fifteen lines.
 *
 * Returns MODEL points, not sheet points: `drawElevation` projects its outlines itself and
 * handing it pre-projected ones would give the sheet two coordinate conventions. Each hull
 * vertex is the original corner, so the projection of what this returns is exactly the hull.
 */
export function memberSilhouette(m: MemberGeometry, proj: Projection): Point3[] {
  const corners = memberCorners(m);
  const hull = convexHull(corners.map((p, i) => ({ i, ...project(p, proj) })));
  return hull.map((p) => corners[p.i]);
}

/**
 * The convex hull of tagged 2-D points, counter-clockwise.
 *
 * Monotone chain, sorted by (x, y) so the result is deterministic — two builds of one sheet
 * that differ only in vertex order are two DXFs with the same drawing on them and no way to
 * diff them. The tag rides through so a caller can recover the point it started from.
 */
function convexHull<T extends Pt2>(points: readonly T[]): T[] {
  const pts = [...points].sort((a, b) => (a.x - b.x) || (a.y - b.y));
  if (pts.length < 3) return pts;
  const turn = (o: Pt2, a: Pt2, b: Pt2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (input: readonly T[]) => {
    const out: T[] = [];
    for (const p of input) {
      while (out.length >= 2 && turn(out[out.length - 2], out[out.length - 1], p) <= 1e-12) {
        out.pop();
      }
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(pts), ...half([...pts].reverse())];
}

/** The twelve edges of `memberCorners`' box, as index pairs. Base ring, top ring, then risers. */
const PRISM_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

/** A member that could not be outlined, and why. Reported, never dropped in silence. */
export interface SheetOutlineRefusal {
  elementId: number;
  reason: 'noGeometry' | 'degenerate';
}

export interface SheetOutlines {
  outlines: Array<{ elementId: number; points: Point3[]; closed: true }>;
  refused: SheetOutlineRefusal[];
}

/**
 * Outlines for the members named, in the order named.
 *
 * `elementIds` is the assembly's own list, so this module never decides what belongs on the
 * sheet. A member with no geometry is refused rather than skipped: the caller turns the
 * refusals into a note, and a sheet that is missing a beam says which beam.
 */
export function memberOutlines(
  elementIds: readonly number[],
  members: readonly MemberGeometry[],
  proj: Projection,
): SheetOutlines {
  const byId = new Map(members.map((m) => [m.elementId, m]));
  const outlines: SheetOutlines['outlines'] = [];
  const refused: SheetOutlineRefusal[] = [];
  for (const id of elementIds) {
    const m = byId.get(id);
    if (!m) {
      refused.push({ elementId: id, reason: 'noGeometry' });
      continue;
    }
    const points = memberSilhouette(m, proj);
    // Fewer than three hull vertices means the box projected to a line or a point: a member
    // seen exactly end-on. There is no outline to draw and pretending otherwise would put a
    // zero-area polygon on the sheet.
    if (points.length < 3) {
      refused.push({ elementId: id, reason: 'degenerate' });
      continue;
    }
    outlines.push({ elementId: id, points, closed: true });
  }
  return { outlines, refused };
}

// ─── The section ─────────────────────────────────────────────────

/**
 * The member a cut at `atX` passes through, and where along it the cut lands.
 *
 * `null` when the cut misses every member supplied — which is a real answer and the reason
 * this returns one instead of falling back to the first member in the list. A section drawn
 * through a member the cut does not touch is a section of something else.
 */
export function memberAtStation(
  elementIds: readonly number[],
  members: readonly MemberGeometry[],
  atX: number,
  proj: Projection,
): MemberGeometry | null {
  const byId = new Map(members.map((m) => [m.elementId, m]));
  for (const id of elementIds) {
    const m = byId.get(id);
    if (!m) continue;
    const xs = memberCorners(m).map((p) => project(p, proj).x);
    // Inclusive on both ends: a cut exactly at a member's face is a cut through that member,
    // and excluding it is how a section at a support comes out empty.
    if (atX >= Math.min(...xs) - 1e-9 && atX <= Math.max(...xs) + 1e-9) return m;
  }
  return null;
}

/**
 * The stations a section may be cut at, and the one to cut at when nobody has said.
 *
 * ── Why a default had to be computed ───────────────────────────────
 *
 * `sectionAt` was initialised to 0 and no control ever set it, so every section sheet in the
 * app was a cut at x = 0 — the model's origin, which on a framed building is a column line if
 * it is anything at all. That is why the section sheet came out as a tall narrow slice down a
 * column instead of the beam section a reviewer opened it for.
 *
 * The default is the MIDDLE of the member with the greatest extent along the sheet. On a beam
 * line that is mid-span of the longest beam, which is the station an engineer asks for first,
 * and it is a member rather than a gap — a midpoint of the whole sheet's extent would sit
 * between two members as often as inside one.
 *
 * `null` when nothing on the sheet has geometry: there is no station to prefer, and returning
 * zero would be the old behaviour wearing a function's name.
 */
export function sectionStations(
  elementIds: readonly number[],
  members: readonly MemberGeometry[],
  proj: Projection,
): { min: number; max: number; preferred: number } | null {
  const byId = new Map(members.map((m) => [m.elementId, m]));
  let min = Infinity;
  let max = -Infinity;
  let widest = -1;
  let preferred = 0;
  for (const id of elementIds) {
    const m = byId.get(id);
    if (!m) continue;
    const xs = memberCorners(m).map((p) => project(p, proj).x);
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    min = Math.min(min, lo);
    max = Math.max(max, hi);
    if (hi - lo > widest) {
      widest = hi - lo;
      preferred = (lo + hi) / 2;
    }
  }
  if (!Number.isFinite(min)) return null;
  return { min, max, preferred };
}

/**
 * The concrete outline of one member's section, in the cut plane's own coordinates.
 *
 * ── The bug this replaces ──────────────────────────────────────────
 *
 * The store passed a rectangle centred on (0, 0). `drawSection` places each bar at its
 * ABSOLUTE position measured from `projection.origin`, so on any member not sitting at the
 * origin the concrete and the steel were drawn metres apart, and the sheet showed a box beside
 * a cage rather than a box round one. This returns the member's real rectangle in the same
 * absolute basis the bars are placed in.
 *
 * The four corners are the section frame's, translated along the axis to the station, so a
 * rolled section comes out rolled — `memberBase` already decided which way, and this reads
 * that decision rather than making it again.
 */
export function sectionOutline(
  m: MemberGeometry, atX: number, proj: Projection,
): Pt2[] | null {
  const corners = memberCorners(m);
  const xs = corners.map((p) => project(p, proj).x);

  /*
    The concrete the cut plane actually meets, found the way `drawSection` finds the bars it
    meets: an edge crosses when its two ends straddle the plane.

    ── Why not "translate the section frame to the station" ───────────

    Because that answer is only right when the member's axis crosses the plane. A COLUMN in a
    beam elevation has its axis in the sheet's up direction, so the plane x = 6 runs ALONG it —
    the cut is longitudinal, and the outline is a 400 × 3000 slice, not the 400 × 400 base.
    Translating the base gave a flat line with no height at all, and it would have looked
    perfectly correct on every beam.

    Clipping the twelve edges gives the true intersection polygon for any member at any angle,
    which is the same shape a CAD section command produces.
  */
  const cut: Pt2[] = [];
  const inPlane = (i: number) => Math.abs(xs[i] - atX) <= 1e-9;
  for (const [a, b] of PRISM_EDGES) {
    if (inPlane(a)) cut.push(toSectionPlane(corners[a], proj));
    if (inPlane(b)) cut.push(toSectionPlane(corners[b], proj));
    if (inPlane(a) || inPlane(b)) continue;
    if ((xs[a] - atX) * (xs[b] - atX) > 0) continue;
    const t = (atX - xs[a]) / (xs[b] - xs[a]);
    cut.push(toSectionPlane({
      x: corners[a].x + (corners[b].x - corners[a].x) * t,
      y: corners[a].y + (corners[b].y - corners[a].y) * t,
      z: corners[a].z + (corners[b].z - corners[a].z) * t,
    }, proj));
  }

  const hull = convexHull(cut);
  // Fewer than three vertices is a cut that grazed an edge or a corner. There is no section
  // there, and a two-point "outline" drawn closed is a line pretending to be concrete.
  return hull.length >= 3 ? hull : null;
}

/**
 * A convex outline offset inwards by `by`.
 *
 * ── Why the general form for a rectangle ───────────────────────────
 *
 * Because the rectangle is rolled. A section at 30° inset by "shrink x and y by the cover" is
 * not the cover line — it is a smaller axis-aligned box that crosses the concrete face on two
 * corners. Offsetting each EDGE along its own inward normal and intersecting the neighbours is
 * the same amount of code and is right for any convex outline, including the day a section
 * that is not a rectangle reaches this module.
 *
 * Returns null when the offset would consume the outline: a 25 mm cover inside a 40 mm member
 * has no inside, and an inverted polygon drawn as a cover line would show cover where there is
 * none.
 */
export function insetOutline(outline: readonly Pt2[], by: number): Pt2[] | null {
  const n = outline.length;
  if (n < 3 || by <= 0) return null;
  // Signed area decides which side is in, so a polygon wound either way insets inwards.
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    area2 += a.x * b.y - b.x * a.y;
  }
  if (Math.abs(area2) < 1e-12) return null;
  const sign = area2 > 0 ? 1 : -1;

  /** Each edge, moved inward by `by`, as a point and a direction. */
  const lines = outline.map((a, i) => {
    const b = outline[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    // Inward normal for the winding this polygon has.
    const nx = (-dy / l) * sign;
    const ny = (dx / l) * sign;
    return { px: a.x + nx * by, py: a.y + ny * by, dx: dx / l, dy: dy / l };
  });

  const out: Pt2[] = [];
  for (let i = 0; i < n; i++) {
    const p = lines[(i + n - 1) % n];
    const q = lines[i];
    const det = p.dx * -q.dy - p.dy * -q.dx;
    // Parallel neighbours: a degenerate outline, not an inset.
    if (Math.abs(det) < 1e-12) return null;
    const rx = q.px - p.px;
    const ry = q.py - p.py;
    const s = (rx * -q.dy - ry * -q.dx) / det;
    out.push({ x: p.px + p.dx * s, y: p.py + p.dy * s });
  }

  /*
    Whether the inset left anything behind.

    A winding check is NOT enough, and that is worth stating because it is the obvious answer
    and it is wrong: insetting a 40 mm square by 25 mm turns it inside out on both axes at
    once, which preserves the vertex cycle and therefore the sign of the area. The polygon
    comes out positive, small, and inverted.

    The definition is the test. The offset polygon is the intersection of the half-planes each
    edge was moved to, so it exists exactly when every vertex satisfies every one of them.
  */
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * sign;
    const ny = (dx / l) * sign;
    for (const v of out) {
      if ((v.x - a.x) * nx + (v.y - a.y) * ny < by - 1e-9) return null;
    }
  }
  return out;
}

// ─── Dimensions ──────────────────────────────────────────────────

/** The extent of a set of sheet points along each axis. */
export function extentOf(points: readonly Pt2[]): { min: Pt2; max: Pt2 } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

/**
 * How many members a sheet dimensions before the rest become a count.
 *
 * `MAX_CONFLICT_NOTES`'s reasoning, applied to witness lines. Past a dozen members the
 * dimension lines overlap each other and the drawing under them, and a sheet nobody can read
 * has not dimensioned anything. The number NOT bounded is the number of members drawn, which
 * is always stated — the outlines are all there, it is the witness lines that stop.
 */
export const MAX_DIMENSIONED_MEMBERS = 12;

/** Metres as the millimetres a fabricator reads. */
export function mm(v: number): string {
  return `${Math.round(v * 1000)}`;
}

/**
 * How far a dimension line sits off the geometry it measures, m.
 *
 * One constant for both axes so a sheet's dimensions form a frame rather than a scatter, and
 * comfortably inside `sheetToSvg`'s 0.5 m padding — a witness line outside the extents is a
 * witness line cropped off the preview.
 */
const DIM_OFFSET = 0.3;

/** The layer dimensions go on. Named here so this module never imports `LAYERS` for one field. */
export interface DimensionSpec {
  layer: string;
  from: Pt2;
  to: Pt2;
  label: string;
  offset: number;
  axis?: 'x' | 'y';
}

/** A bar as this module needs it: where it runs, how thick, and whose it is. */
export interface SheetBarLike {
  diameterMm: number;
  ownerElementIds: readonly number[];
  /** The centreline, already sampled — `samplePath`'s output, not a second sampling. */
  polyline: readonly Point3[];
}

/**
 * The clear cover a member's steel was actually DRAWN with, top and bottom, m.
 *
 * ── Measured, not restated ─────────────────────────────────────────
 *
 * The specified cover is an input to the design. This is a measurement of the output: the gap
 * between the concrete face on the sheet and the outermost surface of the outermost bar on the
 * same sheet, taken from the same sampled polylines the clash check measured. Putting the
 * measured number on the line is the only version of this that can ever disagree with the
 * input — and a drawing that cannot disagree with its inputs has not checked anything.
 *
 * `null` on either face when the member carries no bar reaching it.
 */
export function drawnCover(
  outline: readonly Pt2[],
  elementId: number,
  bars: readonly SheetBarLike[],
  proj: Projection,
): { top: number | null; bottom: number | null } {
  const box = extentOf(outline);
  let hi = -Infinity;
  let lo = Infinity;
  for (const b of bars) {
    if (!b.ownerElementIds.includes(elementId)) continue;
    const r = b.diameterMm / 2000;
    for (const p of b.polyline) {
      const q = project(p, proj);
      // Only the part of the bar inside this member's own silhouette: a continuous bar runs on
      // into the next span, and its cover THERE is that member's dimension, not this one's.
      if (q.x < box.min.x - 1e-9 || q.x > box.max.x + 1e-9) continue;
      hi = Math.max(hi, q.y + r);
      lo = Math.min(lo, q.y - r);
    }
  }
  return {
    top: Number.isFinite(hi) ? box.max.y - hi : null,
    bottom: Number.isFinite(lo) ? lo - box.min.y : null,
  };
}

/**
 * The dimensions an elevation carries, per member: its length, its depth, and its cover.
 *
 * Bounded at `MAX_DIMENSIONED_MEMBERS`, and the caller is told how many were left out so the
 * sheet can say so. The OUTLINES are never bounded — every member keeps its concrete; it is
 * only the witness lines that stop, because past a dozen they overlap the drawing they measure.
 */
export function elevationDimensions(input: {
  layer: string;
  outlines: ReadonlyArray<{ elementId: number; points: readonly Point3[] }>;
  bars: readonly SheetBarLike[];
  projection: Projection;
  /** Specified cover per member, m, from the design. Absent when the design never stated one. */
  coverOf?: (elementId: number) => number | undefined;
}): { dimensions: DimensionSpec[]; undimensioned: number[] } {
  const dimensions: DimensionSpec[] = [];
  const shown = input.outlines.slice(0, MAX_DIMENSIONED_MEMBERS);
  const undimensioned = input.outlines.slice(MAX_DIMENSIONED_MEMBERS).map((o) => o.elementId);

  for (const o of shown) {
    const sheetPts = o.points.map((p) => project(p, input.projection));
    const box = extentOf(sheetPts);
    const w = box.max.x - box.min.x;
    const h = box.max.y - box.min.y;
    if (w > 1e-6) {
      dimensions.push({
        layer: input.layer, axis: 'x',
        from: { x: box.min.x, y: box.min.y }, to: { x: box.max.x, y: box.min.y },
        label: mm(w), offset: -DIM_OFFSET,
      });
    }
    if (h > 1e-6) {
      dimensions.push({
        layer: input.layer, axis: 'y',
        from: { x: box.min.x, y: box.min.y }, to: { x: box.min.x, y: box.max.y },
        label: mm(h), offset: -DIM_OFFSET,
      });
    }

    /*
      The cover, as a dimension on the face it belongs to.

      Labelled `r` for recubrimiento, the measured value, and the specified one beside it when
      the two differ by more than a millimetre. A sheet that printed only the specified number
      would be repeating its own input back; one that printed only the measured number would
      leave a reader unable to tell a tight detail from a wrong one.
    */
    const spec = input.coverOf?.(o.elementId);
    const cov = drawnCover(sheetPts, o.elementId, input.bars, input.projection);
    const cover = (v: number | null, atY: number, toY: number) => {
      if (v === null || v <= 0) return;
      const disagrees = spec !== undefined && Math.abs(v - spec) > 0.001;
      dimensions.push({
        layer: input.layer, axis: 'y',
        from: { x: box.max.x, y: atY }, to: { x: box.max.x, y: toY },
        label: disagrees ? `r ${mm(v)} (esp. ${mm(spec)})` : `r ${mm(v)}`,
        offset: DIM_OFFSET,
      });
    };
    cover(cov.top, box.max.y, box.max.y - (cov.top ?? 0));
    cover(cov.bottom, box.min.y, box.min.y + (cov.bottom ?? 0));
  }

  return { dimensions, undimensioned };
}

/**
 * What the sheet could not draw, as notes for its note block.
 *
 * ── Why this is a note and not a silence ───────────────────────────
 *
 * `membersFromModel` refuses a member with no rectangle rather than inventing a square of the
 * right area, and states why: "a plausible wrong box is worse than a visible gap". A gap is
 * only visible if something says it is there. The sheet is the surface where that matters
 * most — a reader looking at an elevation with one beam missing has no way to know whether
 * that beam has no concrete defined or simply is not on this level.
 *
 * The undimensioned members are the second half. Their outlines ARE drawn; it is only the
 * witness lines that stop at `MAX_DIMENSIONED_MEMBERS`, and a bounded list that did not say it
 * was bounded would read as "these are the dimensions" rather than "these are the first
 * twelve" — the same distinction the conflict note block already draws.
 */
export function sheetGeometryNotes(
  refused: readonly SheetOutlineRefusal[],
  undimensioned: readonly number[],
): string[] {
  const out: string[] = [];
  const noGeometry = refused.filter((r) => r.reason === 'noGeometry').map((r) => r.elementId);
  const degenerate = refused.filter((r) => r.reason === 'degenerate').map((r) => r.elementId);
  if (noGeometry.length > 0) {
    out.push(
      `SIN CONTORNO — ${noGeometry.length} elemento(s) de esta lámina `
      + `(${noGeometry.join(', ')}) no tienen sección rectangular definida en el modelo, así que `
      + 'su hormigón no se dibuja. Las barras sí están en su posición real. No es un hueco del '
      + 'armado: es hormigón que el modelo no declara.');
  }
  if (degenerate.length > 0) {
    out.push(
      `DE CANTO — ${degenerate.length} elemento(s) (${degenerate.join(', ')}) se ven de punta en `
      + 'esta proyección y no tienen contorno con área. Verlos requiere la lámina del eje '
      + 'perpendicular.');
  }
  if (undimensioned.length > 0) {
    out.push(
      `ACOTACIÓN PARCIAL — se acotan los primeros ${MAX_DIMENSIONED_MEMBERS} elementos; los `
      + `otros ${undimensioned.length} (${undimensioned.join(', ')}) están dibujados con su `
      + 'contorno y sin cotas. Sus medidas están en la planilla y en el modelo.');
  }
  return out;
}

/**
 * The two dimensions a section is read for — b and h — and its cover line.
 *
 * The cover here IS the specified one, drawn as a closed line inside the concrete. That is what
 * a section is for: the elevation measures what the bars ended up at, and the section states
 * what the design asked for, so a bar sitting outside the line is visible as one.
 */
export function sectionDimensions(input: {
  layer: string;
  outline: readonly Pt2[];
  cover?: number;
}): { dimensions: DimensionSpec[]; coverLine: Pt2[] | null } {
  const box = extentOf(input.outline);
  const dimensions: DimensionSpec[] = [];
  const w = box.max.x - box.min.x;
  const h = box.max.y - box.min.y;
  if (w > 1e-6) {
    dimensions.push({
      layer: input.layer, axis: 'x',
      from: { x: box.min.x, y: box.min.y }, to: { x: box.max.x, y: box.min.y },
      label: mm(w), offset: -DIM_OFFSET / 2,
    });
  }
  if (h > 1e-6) {
    dimensions.push({
      layer: input.layer, axis: 'y',
      from: { x: box.min.x, y: box.min.y }, to: { x: box.min.x, y: box.max.y },
      label: mm(h), offset: -DIM_OFFSET / 2,
    });
  }
  const coverLine = input.cover !== undefined
    ? insetOutline(input.outline, input.cover) : null;
  if (coverLine && input.cover !== undefined) {
    const cb = extentOf(coverLine);
    dimensions.push({
      layer: input.layer, axis: 'y',
      from: { x: box.max.x, y: box.max.y }, to: { x: box.max.x, y: cb.max.y },
      label: `r ${mm(input.cover)}`, offset: DIM_OFFSET / 2,
    });
  }
  return { dimensions, coverLine };
}
