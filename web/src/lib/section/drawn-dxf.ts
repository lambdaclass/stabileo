/**
 * A section outline from a DXF drawing: closed loops become parts, loops inside loops holes.
 *
 * Read with the plan importer's parser (`cad/parse.ts`), which keeps what a section needs: a
 * closed polyline stays one loop, arcs and circles stay curves, and a file it cannot read is
 * told apart from a file with nothing in it. Lines, open polylines and arcs are chained into
 * loops by their endpoints, the arcs as 64 chords to the turn like the circles. Nesting decides
 * what is material: a loop inside an odd number of others is a hole. The drawing is moved so its
 * bounding box is centred on the origin, since a section drawn somewhere on a sheet has no
 * meaningful absolute position.
 *
 * Polyline arcs arrive as their chords: the parser keeps a polyline's vertices and not its
 * bulges. The import says how many loops and circles it read so the user can compare.
 */

import { parseCadDxf, cadImportProblem } from '../cad/parse';
import { unitScale, type DxfUnit } from '../dxf/types';
import { chainSegmentsIntoLoops, pointInPolygon, signedArea } from '../cad/geometry';
import type { DrawnPart, Pt } from './drawn';

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

export function dxfSectionParts(text: string, unit: DxfUnit, firstId = 1): DxfSectionImport {
  const doc = parseCadDxf(text, 'section.dxf');
  const k = unitScale(unit);
  const sc = (p: { x: number; y: number }) => ({ x: p.x * k, y: p.y * k });
  const meta = {
    problem: cadImportProblem(doc),
    skipped: Object.keys(doc.unsupported).filter((t) => !['DIMENSION', 'TEXT', 'MTEXT', 'POINT'].includes(t)),
    declaredUnit: doc.suggestedUnit,
  };
  const segs: Array<{ a: { x: number; y: number }; b: { x: number; y: number } }> = [];
  const closed: Array<Array<{ x: number; y: number }>> = [];
  const circles: Array<{ c: { x: number; y: number }; r: number }> = [];
  for (const e of doc.entities) {
    if (e.kind === 'line') segs.push({ a: sc(e.a), b: sc(e.b) });
    else if (e.kind === 'polyline' && e.closed && e.pts.length >= 3) closed.push(e.pts.map(sc));
    else if (e.kind === 'polyline') e.pts.slice(1).forEach((q, i) => segs.push({ a: sc(e.pts[i]!), b: sc(q) }));
    else if (e.kind === 'circle') circles.push({ c: sc(e.center), r: e.r * k });
    else if (e.kind === 'arc') {
      // Counter-clockwise from start to end, as DXF draws an arc.
      let sweep = e.endAngle - e.startAngle;
      while (sweep <= 0) sweep += 2 * Math.PI;
      const n = Math.max(1, Math.ceil(sweep / (2 * Math.PI / 64)));
      const at = (i: number) => {
        const th = e.startAngle + (sweep * i) / n;
        return sc({ x: e.center.x + e.r * Math.cos(th), y: e.center.y + e.r * Math.sin(th) });
      };
      for (let i = 0; i < n; i++) segs.push({ a: at(i), b: at(i + 1) });
    }
  }
  // A tenth of a millimetre welds endpoints; drawings are rarely cleaner than that.
  const { loops: chained, unchained } = chainSegmentsIntoLoops(segs, 1e-4);
  const loops = [...closed, ...chained];
  const shapes: Array<{ kind: 'loop'; pts: Array<{ x: number; y: number }> } | { kind: 'circle'; c: { x: number; y: number }; r: number }> = [
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
  const contains = (o: (typeof shapes)[number], p: { x: number; y: number }) =>
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
