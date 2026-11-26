/**
 * Piers: the walls of a storey that meet, and the columns modelled inside them, read as one
 * element. Walls meet where the end of one reaches another (within half that one's thickness of
 * its centre line) or where their footprints cross; a column belongs to a pier where its section
 * overlaps a wall's footprint (centre line ± t/2) at the same storey. Its outline is the union of
 * the walls' footprints, each run on past an end that meets another wall by half that wall's
 * thickness so a corner is filled as it is cast, and of the columns' sections.
 *
 * A wall with no column inside is designed as before; a pier with a column in it is designed as
 * one section (`pier-design.ts`), the column marking where its concentrated bars go. At the
 * foundation every group of walls that meet, columns inside or not, stands on one footing.
 */
import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';

/** What the storey below puts on a cut, global axes: N up on the part above (compression), the moments about X and Y and the horizontal forces; kN, kN·m. */
export interface CutForces { n: number; mx: number; my: number; vx: number; vy: number }

export type P = { x: number; y: number };

export interface PierWall { key: string; name: string; plan: { x1: number; y1: number; x2: number; y2: number }; thickness: number; z: number; height: number }

/** A column storey: its foot, section and the plan directions of its b and h. */
export interface PierColumn { key: string; name: string; x: number; y: number; z: number; height: number; b: number; h: number; ey: [number, number]; ez: [number, number] }

export interface PierColumnPart {
  key: string; name: string;
  /** Its section's corners in plan, m. */
  corners: P[];
  /** Plan area it shares with the walls, m². */
  overlap: number;
  /** The walls it overlaps, by key. */
  legs: string[];
}

export interface Pier {
  key: string; name: string;
  z: number; height: number;
  walls: Array<{ key: string; name: string; corners: P[] }>;
  columns: PierColumnPart[];
  /** The section in plan, m: one outer ring and the holes of a closed core. */
  outline: { outer: P[]; holes: P[][] };
  area: number; centroid: P;
}

/** Walls meet within this of each other, m; a storey's elevation matches within it. */
export const PIER_TOL = 0.01;
const LEVEL_TOL = 0.05;
/** A column shares less than this with a wall, m², and stands beside it rather than in it. */
export const PIER_AREA_TOL = 1e-4;

const ring = (c: readonly P[]): Polygon => [[...c.map((p) => [p.x, p.y] as [number, number]), [c[0]!.x, c[0]!.y]]];

function axisOf(w: PierWall): { u: P; n: P; L: number } {
  const dx = w.plan.x2 - w.plan.x1, dy = w.plan.y2 - w.plan.y1, L = Math.hypot(dx, dy) || 1;
  return { u: { x: dx / L, y: dy / L }, n: { x: -dy / L, y: dx / L }, L };
}

/** A wall's footprint, its ends run on by `e1` and `e2`, m. */
export function wallCorners(w: PierWall, e1 = 0, e2 = 0): P[] {
  const { u, n } = axisOf(w), t = w.thickness / 2;
  const a = { x: w.plan.x1 - e1 * u.x, y: w.plan.y1 - e1 * u.y }, b = { x: w.plan.x2 + e2 * u.x, y: w.plan.y2 + e2 * u.y };
  return [{ x: a.x - t * n.x, y: a.y - t * n.y }, { x: b.x - t * n.x, y: b.y - t * n.y }, { x: b.x + t * n.x, y: b.y + t * n.y }, { x: a.x + t * n.x, y: a.y + t * n.y }];
}

export function columnCorners(c: Pick<PierColumn, 'x' | 'y' | 'b' | 'h' | 'ey' | 'ez'>): P[] {
  const lb = Math.hypot(...c.ey) || 1, lh = Math.hypot(...c.ez) || 1;
  const ey = { x: c.ey[0] / lb, y: c.ey[1] / lb }, ez = { x: c.ez[0] / lh, y: c.ez[1] / lh };
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, r]) => ({ x: c.x + (s! * c.b * ey.x + r! * c.h * ez.x) / 2, y: c.y + (s! * c.b * ey.y + r! * c.h * ez.y) / 2 }));
}

function ringArea(r: ReadonlyArray<readonly [number, number] | number[]>): { a: number; sx: number; sy: number } {
  let a = 0, sx = 0, sy = 0;
  for (let i = 0; i + 1 < r.length; i++) {
    const [x1, y1] = r[i]!, [x2, y2] = r[i + 1]!;
    const k = x1! * y2! - x2! * y1!;
    a += k; sx += (x1! + x2!) * k; sy += (y1! + y2!) * k;
  }
  return { a: a / 2, sx: sx / 6, sy: sy / 6 };
}

/** Area and first moments of a union's polygons, holes taken off, m², m³. */
export function multiArea(m: MultiPolygon): { a: number; sx: number; sy: number } {
  let a = 0, sx = 0, sy = 0;
  for (const poly of m) poly.forEach((r, i) => {
    const q = ringArea(r), s = Math.sign(q.a) * (i === 0 ? 1 : -1);
    a += s * q.a; sx += s * q.sx; sy += s * q.sy;
  });
  return { a: Math.abs(a), sx: Math.sign(a) * sx, sy: Math.sign(a) * sy };
}

export const overlapArea = (a: readonly P[], b: readonly P[]): number => multiArea(polygonClipping.intersection(ring(a), ring(b))).a;

/** The distance from a point to a segment, m. */
function toSegment(p: P, a: P, b: P): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

const ends = (w: PierWall): [P, P] => [{ x: w.plan.x1, y: w.plan.y1 }, { x: w.plan.x2, y: w.plan.y2 }];

/** How far each end of `w` runs on into the walls it meets, m: half the thickness of the thickest it meets there. */
function runOn(w: PierWall, others: readonly PierWall[]): [number, number] {
  return ends(w).map((e) => Math.max(0, ...others.filter((o) => o !== w).filter((o) => toSegment(e, ...ends(o)) <= o.thickness / 2 + PIER_TOL).map((o) => o.thickness / 2))) as [number, number];
}

/** The polygon of the union, its ring closing points dropped; null where it is not one piece. */
function single(m: MultiPolygon): { outer: P[]; holes: P[][] } | null {
  if (m.length !== 1) return null;
  const open = (r: Polygon[number]) => r.slice(0, -1).map(([x, y]) => ({ x: x!, y: y! }));
  return { outer: open(m[0]![0]!), holes: m[0]!.slice(1).map(open) };
}

/**
 * The storey's groups of walls that meet, with the columns overlapping them. Each group is a pier;
 * those with no column are kept apart by `columns.length` for the caller. A group whose outline is
 * not one piece is left out.
 */
export function recognizePiers(walls: readonly PierWall[], columns: readonly PierColumn[]): Pier[] {
  const out: Pier[] = [];
  const levels: number[] = [];
  for (const w of walls) if (!levels.some((z) => Math.abs(z - w.z) < LEVEL_TOL)) levels.push(w.z);
  for (const z of levels.sort((a, b) => a - b)) {
    const ws = walls.filter((w) => Math.abs(w.z - z) < LEVEL_TOL);
    const cs = columns.filter((c) => Math.abs(c.z - z) < LEVEL_TOL);
    const foot = new Map(ws.map((w) => [w.key, wallCorners(w)]));
    const parent = new Map<string, string>([...ws.map((w) => [w.key, w.key] as const), ...cs.map((c) => [c.key, c.key] as const)]);
    const root = (k: string): string => (parent.get(k) === k ? k : root(parent.get(k)!));
    const join = (a: string, b: string) => parent.set(root(a), root(b));
    for (const a of ws) for (const b of ws) {
      if (a.key >= b.key) continue;
      const meet = ends(a).some((e) => toSegment(e, ...ends(b)) <= b.thickness / 2 + PIER_TOL) || ends(b).some((e) => toSegment(e, ...ends(a)) <= a.thickness / 2 + PIER_TOL)
        || overlapArea(foot.get(a.key)!, foot.get(b.key)!) > PIER_AREA_TOL;
      if (meet) join(a.key, b.key);
    }
    const legsOf = new Map<string, string[]>();
    for (const c of cs) {
      const corners = columnCorners(c);
      const legs = ws.filter((w) => overlapArea(corners, foot.get(w.key)!) > PIER_AREA_TOL).map((w) => w.key);
      legsOf.set(c.key, legs);
      for (const k of legs) join(c.key, k);
    }
    const groups = new Map<string, PierWall[]>();
    for (const w of ws) groups.set(root(w.key), [...(groups.get(root(w.key)) ?? []), w]);
    for (const [r, list] of groups) {
      const pieces = list.map((w) => { const [e1, e2] = runOn(w, list); return { key: w.key, name: w.name, corners: wallCorners(w, e1, e2) }; });
      const mine = cs.filter((c) => root(c.key) === r && (legsOf.get(c.key) ?? []).length);
      const parts = mine.map((c) => columnCorners(c));
      const union = polygonClipping.union(ring(pieces[0]!.corners), ...pieces.slice(1).map((p) => ring(p.corners)), ...parts.map(ring));
      const outline = single(union);
      if (!outline) continue;
      const m = multiArea(union);
      const wallsUnion = polygonClipping.union(ring(pieces[0]!.corners), ...pieces.slice(1).map((p) => ring(p.corners)));
      const sorted = [...list].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
      out.push({
        key: `pier:${sorted.map((w) => w.key).join('+')}`,
        name: [...sorted.map((w) => w.name), ...mine.map((c) => c.name)].join(' + '),
        z, height: Math.max(...list.map((w) => w.height)),
        walls: pieces,
        columns: mine.map((c, i) => ({ key: c.key, name: c.name, corners: parts[i]!, overlap: multiArea(polygonClipping.intersection(ring(parts[i]!), wallsUnion)).a, legs: legsOf.get(c.key)! })),
        outline, area: m.a, centroid: { x: m.sx / m.a, y: m.sy / m.a },
      });
    }
  }
  return out;
}

/** Whether a point lies inside a convex polygon, `margin` m inside its sides at least. */
export function insideConvex(p: P, poly: readonly P[], margin = 0): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const d = ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / l;
    if (!sign) sign = Math.sign(d) || 0;
    if (sign * d < margin - 1e-12) return false;
  }
  return true;
}

/** Second moments of an outline about its centroid, m⁴: Ix about the axis along X, Iy about the axis along Y. */
export function outlineInertia(o: Pier['outline'], c: P): { ix: number; iy: number } {
  let ix = 0, iy = 0;
  const add = (r: readonly P[], s: number) => {
    let a = 0, jx = 0, jy = 0;
    for (let i = 0; i < r.length; i++) {
      const p = { x: r[i]!.x - c.x, y: r[i]!.y - c.y }, q = { x: r[(i + 1) % r.length]!.x - c.x, y: r[(i + 1) % r.length]!.y - c.y };
      const k = p.x * q.y - q.x * p.y;
      a += k; jx += (p.y * p.y + p.y * q.y + q.y * q.y) * k; jy += (p.x * p.x + p.x * q.x + q.x * q.x) * k;
    }
    const sg = Math.sign(a) * s;
    ix += sg * jx / 12; iy += sg * jy / 12;
  };
  add(o.outer, 1);
  for (const h of o.holes) add(h, -1);
  return { ix: Math.abs(ix), iy: Math.abs(iy) };
}
