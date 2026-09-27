/**
 * A section drawn from parts: rectangles, tubes, circles, polygons, bent plates and catalogue
 * profiles, placed and rotated in the section plane, each with its own material.
 *
 * ── What the engine needs, measured ────────────────────────────────
 *
 * The section engine integrates bending over any set of polygons, disjoint or not. Torsion and
 * shear are a different matter: they solve a field on a mesh of ONE region. Two rectangles that
 * touch but arrive as two polygons are refused ("every node is prescribed"), and two disjoint
 * ones give a torsion constant of 1.4e10 and an asymmetric shear centre on a symmetric section.
 * So the parts are merged here before they reach it: every set of touching parts becomes one
 * outline with its holes, and each connected piece is solved on its own.
 *
 * ── Frames ─────────────────────────────────────────────────────────
 *
 * Coordinates are metres, `[y, z]`, with y horizontal and z up, which is the engine's own
 * convention. A template part (rectangle, tube, profile) is built around its bounding box
 * centre, so `at` is where that centre goes. A polygon or a bent plate keeps the coordinates it
 * was typed or imported with, so `at` is an offset from them. Mirroring happens first (about the
 * part's vertical axis), then the rotation, then the offset.
 */

import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping';

export type Pt = [number, number];

export type DrawnShape =
  | { kind: 'rect'; b: number; h: number }
  | { kind: 'hollowRect'; b: number; h: number; t: number }
  | { kind: 'circle'; d: number }
  | { kind: 'tube'; d: number; t: number }
  /** Closed outline, in the part's own coordinates. */
  | { kind: 'polygon'; points: Pt[] }
  /** Open centreline with a wall thickness, as a bent plate or a cold-formed section is drawn. */
  | { kind: 'polyline'; points: Pt[]; t: number }
  /** A catalogue profile's outline, by exact catalogue name. */
  | { kind: 'profile'; name: string };

export interface DrawnPart {
  id: number;
  shape: DrawnShape;
  /** Offset of the part, metres. */
  at: Pt;
  rotationDeg: number;
  mirror?: boolean;
  /** Removes material instead of adding it. */
  void?: boolean;
  /** Model material of the part. Absent means the section's reference material. */
  materialId?: number;
  /**
   * E and G of the part's material over the reference material's.
   *
   * Recorded when the part is given its material, because a section is resolved without the
   * model's material table at hand. The editor recomputes them from the materials whenever it
   * opens the section.
   */
  ratio?: { e: number; g: number };
}

export interface DrawnSection {
  version: 1;
  parts: DrawnPart[];
  /** The material the transformed properties are expressed in. */
  refMaterialId?: number;
}

/** How a catalogue profile's outline is looked up. Injected so this module stays pure. */
export type ProfileOutline = (name: string) => Polygon[] | null;

export type DrawnIssue =
  | { kind: 'degenerate'; partId: number }
  | { kind: 'unknownProfile'; partId: number; name: string }
  | { kind: 'overlap'; partIds: [number, number]; area: number; sameMaterial: boolean }
  | { kind: 'loose'; pieces: number }
  | { kind: 'holeOutside'; partId: number; fully: boolean }
  | { kind: 'empty' };

export interface DrawnIssueReport {
  issue: DrawnIssue;
  /** An error means the drawn section is not the section the numbers would describe. */
  severity: 'error' | 'warning';
}

/** One material's solid region after merging and subtracting holes. */
export interface MaterialRegion {
  /** `null` is the reference material. */
  materialId: number | null;
  ratio: { e: number; g: number };
  region: MultiPolygon;
}

export interface AssembledSection {
  regions: MaterialRegion[];
  /** Every solid merged regardless of material: one entry per connected piece. */
  pieces: MultiPolygon;
  /** Each part's outline in section coordinates, for drawing and for the per-part table. */
  parts: Array<{ id: number; outline: Polygon[]; void: boolean }>;
  issues: DrawnIssueReport[];
}

/** Below a square millimetre an intersection is rounding in the clipping, not an overlap. */
const AREA_TOL = 1e-6;
const CIRCLE_SIDES = 64;

// ─── Shapes to polygons ──────────────────────────────────────────

const rectRing = (b: number, h: number): Ring => [
  [-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, h / 2], [-b / 2, h / 2],
];

const circleRing = (d: number, sides = CIRCLE_SIDES): Ring =>
  Array.from({ length: sides }, (_, i) => {
    const a = (2 * Math.PI * i) / sides;
    return [(d / 2) * Math.cos(a), (d / 2) * Math.sin(a)] as Pt;
  });

/**
 * The outline of a centreline drawn with a thickness, with mitred joints.
 *
 * Each vertex is offset by t/2 to both sides along the bisector of its two segments, so a bend
 * keeps the full wall thickness through the corner. The miter is capped at four thicknesses:
 * a centreline that folds back on itself would otherwise throw its corner off to infinity.
 */
export function thickPolyline(points: Pt[], t: number): Ring | null {
  const pts = points.filter((p, i) => i === 0 || Math.hypot(p[0] - points[i - 1]![0], p[1] - points[i - 1]![1]) > 1e-9);
  if (pts.length < 2 || !(t > 0)) return null;
  const normal = (a: Pt, b: Pt): Pt => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    return [-dy / L, dx / L];
  };
  const left: Pt[] = [], right: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const nPrev = i > 0 ? normal(pts[i - 1]!, pts[i]!) : null;
    const nNext = i < pts.length - 1 ? normal(pts[i]!, pts[i + 1]!) : null;
    let off: Pt;
    if (nPrev && nNext) {
      const mx = nPrev[0] + nNext[0], my = nPrev[1] + nNext[1], mL = Math.hypot(mx, my);
      if (mL < 1e-9) return null;
      const cos = (mx / mL) * nNext[0] + (my / mL) * nNext[1];
      const len = Math.min((t / 2) / Math.max(cos, 1e-9), 2 * t);
      off = [(mx / mL) * len, (my / mL) * len];
    } else {
      const n = (nPrev ?? nNext)!;
      off = [n[0] * t / 2, n[1] * t / 2];
    }
    const p = pts[i]!;
    left.push([p[0] + off[0], p[1] + off[1]]);
    right.push([p[0] - off[0], p[1] - off[1]]);
  }
  return [...left, ...right.reverse()];
}

/** The polygons of one shape in its own frame, before placement. */
function localPolygons(shape: DrawnShape, profile: ProfileOutline): Polygon[] | null {
  const pos = (...v: number[]) => v.every((x) => Number.isFinite(x) && x > 0);
  switch (shape.kind) {
    case 'rect':
      return pos(shape.b, shape.h) ? [[rectRing(shape.b, shape.h)]] : null;
    case 'hollowRect':
      return pos(shape.b, shape.h, shape.t) && 2 * shape.t < Math.min(shape.b, shape.h)
        ? [[rectRing(shape.b, shape.h), rectRing(shape.b - 2 * shape.t, shape.h - 2 * shape.t)]]
        : null;
    case 'circle':
      return pos(shape.d) ? [[circleRing(shape.d)]] : null;
    case 'tube':
      return pos(shape.d, shape.t) && 2 * shape.t < shape.d
        ? [[circleRing(shape.d), circleRing(shape.d - 2 * shape.t)]]
        : null;
    case 'polygon':
      return shape.points.length >= 3 && Math.abs(signedArea(shape.points)) > AREA_TOL ? [[shape.points.map((p) => [p[0], p[1]] as Pt)]] : null;
    case 'polyline': {
      const ring = thickPolyline(shape.points, shape.t);
      return ring ? [[ring]] : null;
    }
    case 'profile': {
      const polys = profile(shape.name);
      if (!polys || polys.length === 0) return null;
      // Around the bounding box centre, like the other templates.
      const bb = bboxOf(polys);
      const cy = (bb[0] + bb[2]) / 2, cz = (bb[1] + bb[3]) / 2;
      return polys.map((poly) => poly.map((ring) => ring.map(([y, z]) => [y - cy, z - cz] as Pt)));
    }
  }
}

function place(polys: Polygon[], part: DrawnPart): Polygon[] {
  const th = (part.rotationDeg * Math.PI) / 180;
  const c = Math.cos(th), s = Math.sin(th);
  const [dy, dz] = part.at;
  const map = ([y0, z]: Pt): Pt => {
    const y = part.mirror ? -y0 : y0;
    return [c * y - s * z + dy, s * y + c * z + dz];
  };
  return polys.map((poly) => poly.map((ring) => {
    const r = ring.map((p) => map(p as Pt));
    // A mirror reverses the winding; the clipping library does not care, but the ring
    // orientation is kept consistent for anyone drawing these directly.
    return part.mirror ? r.reverse() : r;
  }));
}

/** The part's polygons in section coordinates, or null when it describes no area. */
export function partOutline(part: DrawnPart, profile: ProfileOutline): Polygon[] | null {
  const local = localPolygons(part.shape, profile);
  return local ? place(local, part) : null;
}

// ─── Measures on multipolygons ───────────────────────────────────

export function signedArea(ring: readonly (readonly [number, number])[]): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i]!, q = ring[(i + 1) % n]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Area of a multipolygon: outer rings minus their holes. */
export function areaOf(mp: MultiPolygon | Polygon[]): number {
  let a = 0;
  for (const poly of mp) {
    poly.forEach((ring, i) => { a += (i === 0 ? 1 : -1) * Math.abs(signedArea(ring)); });
  }
  return a;
}

export function bboxOf(mp: MultiPolygon | Polygon[]): [number, number, number, number] {
  let y0 = Infinity, z0 = Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const poly of mp) for (const ring of poly) for (const [y, z] of ring) {
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  return [y0, z0, y1, z1];
}

/**
 * Area, first and second moments of a multipolygon about the origin.
 *
 * Green's theorem over each ring, holes subtracted. Used for the transformed properties of a
 * section of several materials, which the engine cannot weigh: its polygons carry a material id
 * that no property reads.
 */
export function momentsOf(mp: MultiPolygon | Polygon[]): { a: number; sy: number; sz: number; iyy: number; izz: number; iyz: number } {
  let a = 0, sy = 0, sz = 0, iyy = 0, izz = 0, iyz = 0;
  for (const poly of mp) {
    poly.forEach((ring0, k) => {
      // Outer rings counted positive and holes negative, whatever their winding.
      const sign = (k === 0 ? 1 : -1) * Math.sign(signedArea(ring0) || 1);
      const ring = ring0;
      for (let i = 0, n = ring.length; i < n; i++) {
        const [y1, z1] = ring[i]!, [y2, z2] = ring[(i + 1) % n]!;
        const cr = y1 * z2 - y2 * z1;
        a += (sign * cr) / 2;
        // ∫z dA and ∫y dA.
        sz += (sign * cr * (z1 + z2)) / 6;
        sy += (sign * cr * (y1 + y2)) / 6;
        // ∫z² dA (bending about the horizontal axis), ∫y² dA, ∫yz dA.
        iyy += (sign * cr * (z1 * z1 + z1 * z2 + z2 * z2)) / 12;
        izz += (sign * cr * (y1 * y1 + y1 * y2 + y2 * y2)) / 12;
        iyz += (sign * cr * (y1 * z2 + 2 * y1 * z1 + 2 * y2 * z2 + y2 * z1)) / 24;
      }
    });
  }
  return { a, sy, sz, iyy, izz, iyz };
}

const safeUnion = (polys: Polygon[]): MultiPolygon =>
  polys.length === 0 ? [] : polygonClipping.union(polys[0]!, ...polys.slice(1));

// ─── Assembly ────────────────────────────────────────────────────

/**
 * Merge the parts into material regions and connected pieces, and say what is wrong with them.
 *
 * Nothing is repaired silently. Parts of one material that overlap are merged, so the overlap
 * counts once, and the report says so; parts of two materials that overlap are an error,
 * because the drawing does not say which material fills the shared area.
 */
export function assembleDrawn(sec: DrawnSection, profile: ProfileOutline): AssembledSection {
  const issues: DrawnIssueReport[] = [];
  const parts: AssembledSection['parts'] = [];
  const solids: Array<{ part: DrawnPart; polys: Polygon[] }> = [];
  const voids: Array<{ part: DrawnPart; polys: Polygon[] }> = [];

  for (const part of sec.parts) {
    const outline = partOutline(part, profile);
    if (!outline) {
      issues.push(part.shape.kind === 'profile' && !profile(part.shape.name)
        ? { issue: { kind: 'unknownProfile', partId: part.id, name: part.shape.name }, severity: 'error' }
        : { issue: { kind: 'degenerate', partId: part.id }, severity: 'error' });
      continue;
    }
    parts.push({ id: part.id, outline, void: !!part.void });
    (part.void ? voids : solids).push({ part, polys: outline });
  }
  if (solids.length === 0) {
    issues.push({ issue: { kind: 'empty' }, severity: 'error' });
    return { regions: [], pieces: [], parts, issues };
  }

  // Overlaps, pairwise. Tens of parts at most, so the square is nothing.
  const merged = solids.map((s) => safeUnion(s.polys));
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const bi = bboxOf(merged[i]!), bj = bboxOf(merged[j]!);
      if (bi[2] < bj[0] || bj[2] < bi[0] || bi[3] < bj[1] || bj[3] < bi[1]) continue;
      const area = areaOf(polygonClipping.intersection(merged[i]!, merged[j]!));
      if (area > AREA_TOL) {
        const same = (solids[i]!.part.materialId ?? null) === (solids[j]!.part.materialId ?? null);
        issues.push({
          issue: { kind: 'overlap', partIds: [solids[i]!.part.id, solids[j]!.part.id], area, sameMaterial: same },
          severity: same ? 'warning' : 'error',
        });
      }
    }
  }

  const allSolid = safeUnion(merged.flat());
  const voidRegion = safeUnion(voids.flatMap((v) => v.polys));
  for (const v of voids) {
    const vr = safeUnion(v.polys);
    const va = areaOf(vr), inside = areaOf(polygonClipping.intersection(vr, allSolid));
    if (inside < va - AREA_TOL) {
      issues.push({ issue: { kind: 'holeOutside', partId: v.part.id, fully: inside <= AREA_TOL }, severity: inside <= AREA_TOL ? 'error' : 'warning' });
    }
  }

  // One region per material, holes taken out of each.
  const byMaterial = new Map<number | null, { ratio: { e: number; g: number }; polys: Polygon[] }>();
  solids.forEach((s, i) => {
    const key = s.part.materialId ?? null;
    const entry = byMaterial.get(key) ?? { ratio: key === null ? { e: 1, g: 1 } : (s.part.ratio ?? { e: 1, g: 1 }), polys: [] };
    entry.polys.push(...merged[i]!);
    byMaterial.set(key, entry);
  });
  const regions: MaterialRegion[] = [];
  for (const [materialId, { ratio, polys }] of byMaterial) {
    let region = safeUnion(polys);
    if (voidRegion.length > 0) region = polygonClipping.difference(region, voidRegion);
    if (areaOf(region) > AREA_TOL) regions.push({ materialId, ratio, region });
  }
  const pieces = voidRegion.length > 0 ? polygonClipping.difference(allSolid, voidRegion) : allSolid;
  if (pieces.length > 1) issues.push({ issue: { kind: 'loose', pieces: pieces.length }, severity: 'warning' });

  return { regions, pieces, parts, issues };
}

/** A ring as the engine takes it: no repeated closing vertex. */
export function openRing(ring: Ring): Pt[] {
  const r = ring.map((p) => [p[0], p[1]] as Pt);
  const f = r[0], l = r[r.length - 1];
  if (r.length > 1 && f && l && Math.abs(f[0] - l[0]) < 1e-12 && Math.abs(f[1] - l[1]) < 1e-12) r.pop();
  return r;
}

// ─── Snapping ────────────────────────────────────────────────────

export type Side = 'top' | 'bottom' | 'left' | 'right';
export type Align = 'start' | 'centre' | 'end';

/**
 * The offset that puts `part` against a side of `target`, aligned along it.
 *
 * Bounding boxes, which is exact for the rectangles, plates and profiles an assembly is made of:
 * a cover plate on a flange, a web between two flanges, an angle at a corner.
 */
export function attachOffset(
  part: DrawnPart, target: DrawnPart, side: Side, align: Align, profile: ProfileOutline,
): Pt | null {
  const po = partOutline(part, profile), to = partOutline(target, profile);
  if (!po || !to) return null;
  const pb = bboxOf(po), tb = bboxOf(to);
  const pw = pb[2] - pb[0], ph = pb[3] - pb[1];
  // Where the part's box goes (its lower-left corner), then back to an offset.
  let y0: number, z0: number;
  const along = (lo: number, hi: number, size: number) =>
    align === 'start' ? lo : align === 'end' ? hi - size : (lo + hi) / 2 - size / 2;
  switch (side) {
    case 'top': z0 = tb[3]; y0 = along(tb[0], tb[2], pw); break;
    case 'bottom': z0 = tb[1] - ph; y0 = along(tb[0], tb[2], pw); break;
    case 'right': y0 = tb[2]; z0 = along(tb[1], tb[3], ph); break;
    case 'left': y0 = tb[0] - pw; z0 = along(tb[1], tb[3], ph); break;
  }
  return [part.at[0] + (y0 - pb[0]), part.at[1] + (z0 - pb[1])];
}

/**
 * Snap a dragged offset so the part's box edges land on other parts' edges.
 *
 * Each axis snaps on its own to the nearest candidate within `tol`: an edge to an edge, a centre
 * to a centre. Returns the offset unchanged when nothing is near.
 */
export function snapOffset(
  part: DrawnPart, at: Pt, others: DrawnPart[], tol: number, profile: ProfileOutline,
): Pt {
  const po = partOutline({ ...part, at }, profile);
  if (!po) return at;
  const pb = bboxOf(po);
  const ys = [pb[0], (pb[0] + pb[2]) / 2, pb[2]], zs = [pb[1], (pb[1] + pb[3]) / 2, pb[3]];
  let best: [number, number] = [tol, tol];
  const shift: Pt = [0, 0];
  for (const o of others) {
    const oo = partOutline(o, profile);
    if (!oo) continue;
    const ob = bboxOf(oo);
    const oys = [ob[0], (ob[0] + ob[2]) / 2, ob[2]], ozs = [ob[1], (ob[1] + ob[3]) / 2, ob[3]];
    for (const a of ys) for (const b of oys) {
      const d = b - a;
      if (Math.abs(d) < Math.abs(best[0])) { best[0] = Math.abs(d); shift[0] = d; }
    }
    for (const a of zs) for (const b of ozs) {
      const d = b - a;
      if (Math.abs(d) < Math.abs(best[1])) { best[1] = Math.abs(d); shift[1] = d; }
    }
  }
  return [at[0] + shift[0], at[1] + shift[1]];
}

/** The next free part id. */
export const nextPartId = (sec: DrawnSection) => sec.parts.reduce((m, p) => Math.max(m, p.id), 0) + 1;
