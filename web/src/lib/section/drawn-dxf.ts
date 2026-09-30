/**
 * A section outline from a DXF drawing: closed loops become parts, loops inside loops holes.
 *
 * Lines and polylines are chained into loops by their endpoints, the same chaining the plan
 * import uses, and circles come in as circles. Nesting decides what is material: a loop inside an
 * odd number of others is a hole. The drawing is moved so its bounding box is centred on the
 * origin, since a section drawn somewhere on a sheet has no meaningful absolute position.
 *
 * Polyline arcs arrive as their chords: the DXF reader keeps a polyline's vertices and not its
 * bulges. The import says how many loops and circles it read so the user can compare.
 */

import { parseDxf } from '../dxf/parser';
import { unitScale, type DxfUnit } from '../dxf/types';
import { chainSegmentsIntoLoops, pointInPolygon, signedArea } from '../cad/geometry';
import type { DrawnPart, Pt } from './drawn';

export interface DxfSectionImport {
  parts: DrawnPart[];
  loops: number;
  circles: number;
  /** Segments that closed no loop; the outline may be incomplete. */
  open: number;
}

export function dxfSectionParts(text: string, unit: DxfUnit, firstId = 1): DxfSectionImport {
  const dxf = parseDxf(text);
  const k = unitScale(unit);
  const segs = dxf.lines.map((l) => ({ a: { x: l.start.x * k, y: l.start.y * k }, b: { x: l.end.x * k, y: l.end.y * k } }));
  // A tenth of a millimetre welds endpoints; drawings are rarely cleaner than that.
  const { loops, unchained } = chainSegmentsIntoLoops(segs, 1e-4);
  const shapes: Array<{ kind: 'loop'; pts: Array<{ x: number; y: number }> } | { kind: 'circle'; c: { x: number; y: number }; r: number }> = [
    ...loops.map((pts) => ({ kind: 'loop' as const, pts })),
    ...dxf.circles.map((c) => ({ kind: 'circle' as const, c: { x: c.center.x * k, y: c.center.y * k }, r: c.radius * k })),
  ];
  if (shapes.length === 0) return { parts: [], loops: 0, circles: 0, open: unchained.length };

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
  return { parts, loops: loops.length, circles: dxf.circles.length, open: unchained.length };
}
