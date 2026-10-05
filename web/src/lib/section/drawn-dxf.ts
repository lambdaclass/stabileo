/**
 * A section outline from a DXF drawing: closed loops become parts, loops inside loops holes.
 *
 * Read with the plan importer's parser (`cad/parse.ts`), which keeps what a section needs: a
 * closed polyline stays one loop, arcs and circles stay curves, entities drawn mirrored are
 * brought back into the drawing's frame, and a file it cannot read is told apart from a file with
 * nothing in it. Lines, open polylines and arcs are chained into loops by their endpoints, the
 * arcs — polyline bulges among them — as 64 chords to the turn like the circles. Nesting decides
 * what is material: a loop inside an odd number of others is a hole. The drawing is moved so its
 * bounding box is centred on the origin, since a section drawn somewhere on a sheet has no
 * meaningful absolute position.
 *
 * A block reference is drawn: its block's contents, placed, scaled, turned and mirrored as the
 * INSERT says — a section from a profile library usually arrives as one. The import says how
 * many loops and circles it read, and which entity types it could not draw, so the user can
 * compare.
 */

import { parseCadDxf, cadImportProblem } from '../cad/parse';
import { unitScale, type DxfUnit } from '../dxf/types';
import { chainSegmentsIntoLoops, pointInPolygon, signedArea } from '../cad/geometry';
import type { CadBlock, CadEntity } from '../cad/types';
import type { DrawnPart, Pt } from './drawn';

type P = { x: number; y: number };

/** Chords to a full turn, for arcs, bulges and circles that cannot stay circles. */
const CHORDS_PER_TURN = 64;

/** `n` chords of the counter-clockwise (sweep > 0) or clockwise arc about `c` from angle `a0`. */
function arcPoints(c: P, r: number, a0: number, sweep: number): P[] {
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / (2 * Math.PI / CHORDS_PER_TURN)));
  return Array.from({ length: n + 1 }, (_, i) => {
    const th = a0 + (sweep * i) / n;
    return { x: c.x + r * Math.cos(th), y: c.y + r * Math.sin(th) };
  });
}

/**
 * A polyline's vertices with each bulged segment replaced by its arc's chords.
 *
 * A bulge is tan(θ/4) for the arc's included angle θ, positive counter-clockwise. The centre sits
 * off the chord's midpoint, to its left for a counter-clockwise arc under a half turn, by
 * (c/2)/tan(θ/2). Read as chords, a polyline circle (two vertices, bulge 1 each) was a degenerate
 * two-point loop and nothing at all, and every rounded corner lost its fillet's area.
 */
function polylinePoints(pts: P[], bulges: number[] | undefined, closed: boolean): P[] {
  if (!bulges) return pts;
  const out: P[] = [];
  const segs = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < segs; i++) {
    const p = pts[i]!, q = pts[(i + 1) % pts.length]!, b = bulges[i] ?? 0;
    const half = Math.hypot(q.x - p.x, q.y - p.y) / 2;
    if (b === 0 || half === 0) { out.push(p); continue; }
    const theta = 4 * Math.atan(b);
    const off = half / Math.tan(theta / 2);
    const ux = (q.x - p.x) / (2 * half), uy = (q.y - p.y) / (2 * half);
    const c = { x: (p.x + q.x) / 2 - uy * off, y: (p.y + q.y) / 2 + ux * off };
    // Every chord point but the arc's last, which is the next segment's first.
    out.push(...arcPoints(c, Math.hypot(p.x - c.x, p.y - c.y), Math.atan2(p.y - c.y, p.x - c.x), theta).slice(0, -1));
  }
  if (!closed) out.push(pts[pts.length - 1]!);
  return out;
}

/** x' = a·x + b·y + e, y' = c·x + d·y + f. */
type Affine = { a: number; b: number; c: number; d: number; e: number; f: number };
const apply = (t: Affine, p: P): P => ({ x: t.a * p.x + t.b * p.y + t.e, y: t.c * p.x + t.d * p.y + t.f });
/** `outer` after `inner`. */
const compose = (outer: Affine, inner: Affine): Affine => ({
  a: outer.a * inner.a + outer.b * inner.c, b: outer.a * inner.b + outer.b * inner.d,
  c: outer.c * inner.a + outer.d * inner.c, d: outer.c * inner.b + outer.d * inner.d,
  e: outer.a * inner.e + outer.b * inner.f + outer.e, f: outer.c * inner.e + outer.d * inner.f + outer.f,
});
/** The scale of a transform that keeps circles circles, or null when it stretches one way. */
function similarityScale(t: Affine): number | null {
  const sx = Math.hypot(t.a, t.c), sy = Math.hypot(t.b, t.d);
  const orthogonal = Math.abs(t.a * t.b + t.c * t.d) <= 1e-12 * sx * sy;
  return orthogonal && Math.abs(sx - sy) <= 1e-12 * sx ? sx : null;
}

/** Nested inserts deeper than this are a cycle or a file nobody draws sections in. */
const MAX_BLOCK_DEPTH = 8;

export interface DxfSectionImport {
  parts: DrawnPart[];
  loops: number;
  circles: number;
  /** Segments that closed no loop; the outline may be incomplete. */
  open: number;
  /** Why nothing could be read at all, or null: a damaged file is not an empty one. */
  problem: 'parseError' | 'allMalformed' | 'emptyFile' | null;
  /** Entity types in the file that the import cannot draw (SPLINE, ELLIPSE, HATCH, ...). */
  skipped: string[];
  /** The unit the file declares in `$INSUNITS`, when it declares one this import knows. */
  declaredUnit: DxfUnit | null;
}

/** Whether an entity type the import skips is worth reporting: annotation is not an outline. */
const drawable = (type: string) => !['DIMENSION', 'TEXT', 'MTEXT', 'POINT', 'ATTDEF'].includes(type);

export function dxfSectionParts(text: string, unit: DxfUnit, firstId = 1): DxfSectionImport {
  const doc = parseCadDxf(text, 'section.dxf');
  const k = unitScale(unit);
  const meta = {
    problem: cadImportProblem(doc),
    skipped: Object.keys(doc.unsupported).filter(drawable),
    declaredUnit: doc.suggestedUnit,
  };
  const segs: Array<{ a: P; b: P }> = [];
  const closed: P[][] = [];
  const circles: Array<{ c: P; r: number }> = [];
  const skipped = new Set(meta.skipped);
  const chain = (pts: P[]) => pts.slice(1).forEach((q, i) => segs.push({ a: pts[i]!, b: q }));
  /** Every entity, in the drawing's frame under `t` (the unit scale, then any inserts). */
  const draw = (entities: CadEntity[], t: Affine, depth: number) => {
    for (const e of entities) {
      if (e.kind === 'line') segs.push({ a: apply(t, e.a), b: apply(t, e.b) });
      else if (e.kind === 'polyline') {
        const pts = polylinePoints(e.pts, e.bulges, e.closed).map((p) => apply(t, p));
        if (e.closed && pts.length >= 3) closed.push(pts);
        else chain(pts);
      } else if (e.kind === 'circle') {
        const s = similarityScale(t);
        if (s !== null) circles.push({ c: apply(t, e.center), r: e.r * s });
        else closed.push(arcPoints(e.center, e.r, 0, 2 * Math.PI).slice(0, -1).map((p) => apply(t, p)));
      } else if (e.kind === 'arc') {
        // Counter-clockwise from start to end, as DXF draws an arc.
        let sweep = e.endAngle - e.startAngle;
        while (sweep <= 0) sweep += 2 * Math.PI;
        chain(arcPoints(e.center, e.r, e.startAngle, sweep).map((p) => apply(t, p)));
      } else if (e.kind === 'insert') {
        const block: CadBlock | undefined = doc.blocks?.[e.blockName];
        if (!block || depth >= MAX_BLOCK_DEPTH) { skipped.add('INSERT'); continue; }
        Object.keys(block.unsupported).filter(drawable).forEach((u) => skipped.add(u));
        const th = ((e.rotationDeg ?? 0) * Math.PI) / 180, sx = e.xScale ?? 1, sy = e.yScale ?? 1;
        const cos = Math.cos(th), sin = Math.sin(th);
        const place: Affine = {
          a: cos * sx, b: -sin * sy, c: sin * sx, d: cos * sy,
          e: e.at.x - (cos * sx * block.base.x - sin * sy * block.base.y),
          f: e.at.y - (sin * sx * block.base.x + cos * sy * block.base.y),
        };
        draw(block.entities, compose(t, place), depth + 1);
      }
    }
  };
  draw(doc.entities, { a: k, b: 0, c: 0, d: k, e: 0, f: 0 }, 0);
  meta.skipped = [...skipped];
  // A tenth of a millimetre welds endpoints; drawings are rarely cleaner than that.
  const { loops: chained, unchained } = chainSegmentsIntoLoops(segs, 1e-4);
  const loops = [...closed, ...chained];
  const shapes: Array<{ kind: 'loop'; pts: P[] } | { kind: 'circle'; c: P; r: number }> = [
    ...loops.map((pts) => ({ kind: 'loop' as const, pts })),
    ...circles.map((c) => ({ kind: 'circle' as const, ...c })),
  ];
  if (shapes.length === 0) return { parts: [], loops: 0, circles: 0, open: unchained.length, ...meta };

  let y0 = Infinity, z0 = Infinity, y1 = -Infinity, z1 = -Infinity;
  const grow = (x: number, y: number) => { y0 = Math.min(y0, x); y1 = Math.max(y1, x); z0 = Math.min(z0, y); z1 = Math.max(z1, y); };
  for (const s of shapes) {
    if (s.kind === 'loop') s.pts.forEach((p) => grow(p.x, p.y));
    else { grow(s.c.x - s.r, s.c.y - s.r); grow(s.c.x + s.r, s.c.y + s.r); }
  }
  const cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;

  const probe = (s: (typeof shapes)[number]) => (s.kind === 'loop' ? s.pts[0]! : s.c);
  const areaOf = (s: (typeof shapes)[number]) => (s.kind === 'loop' ? Math.abs(signedArea(s.pts)) : Math.PI * s.r * s.r);
  // Circles contain too: a tube drawn as two concentric circles is a ring, not two
  // discs. Containment must be one-way — concentric shapes hold each other's probe —
  // so only a strictly larger shape counts as a container.
  const contains = (o: (typeof shapes)[number], p: P) =>
    o.kind === 'loop' ? pointInPolygon(p, o.pts) : Math.hypot(p.x - o.c.x, p.y - o.c.y) < o.r;
  const depth = (i: number) => shapes.filter((o, j) => j !== i && areaOf(o) > areaOf(shapes[i]!) && contains(o, probe(shapes[i]!))).length;

  const parts: DrawnPart[] = shapes.map((s, i) => {
    const isVoid = depth(i) % 2 === 1;
    const base = { id: firstId + i, rotationDeg: 0, ...(isVoid ? { void: true } : {}) };
    if (s.kind === 'circle') return { ...base, shape: { kind: 'circle', d: 2 * s.r }, at: [s.c.x - cy, s.c.y - cz] as Pt };
    return { ...base, shape: { kind: 'polygon', points: s.pts.map((p) => [p.x - cy, p.y - cz] as Pt) }, at: [0, 0] as Pt };
  });
  return { parts, loops: loops.length, circles: circles.length, open: unchained.length, ...meta };
}
