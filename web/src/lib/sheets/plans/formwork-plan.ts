/**
 * The formwork plan of a level: the slab edges and openings, the beams under it (hidden lines,
 * with their designation and b × h), the columns cut below the level (filled, with their
 * designation and section), the walls, the named axes with their chained dimensions and the
 * level mark. Read from the model's physical members, so it can be issued before any steel is
 * detailed. Model millimetres in, metres converted here.
 */
import type { DrawingInput } from '../compose';
import type { P, Primitive } from '../primitives';
import { boxOf, drawAxes, levelMark, rectAt, type PlanAxis } from './plan-common';

export interface PlanColumn { name: string; at: { x: number; y: number }; section: { kind: 'rect'; b: number; h: number; rotDeg?: number } | { kind: 'circle'; D: number } | { kind: 'other'; label: string; b: number; h: number } }
export interface PlanBeam { name: string; a: { x: number; y: number }; b: { x: number; y: number }; width: number; depth: number }
export interface PlanSlab { name: string; outline: Array<{ x: number; y: number }>; thickness: number }
export interface PlanWall { name: string; a: { x: number; y: number }; b: { x: number; y: number }; thickness: number }

export interface FormworkInput {
  level: { name: string; z: number };
  axes: readonly PlanAxis[];
  columns: readonly PlanColumn[];
  beams: readonly PlanBeam[];
  slabs: readonly PlanSlab[];
  walls: readonly PlanWall[];
  scale: number;
}

const k = 1000;
const mm = (p: { x: number; y: number }): P => ({ x: p.x * k, y: p.y * k });
const cm = (v: number) => String(Math.round(v * 100));

export function columnOutline(c: PlanColumn): Primitive {
  const at = mm(c.at);
  if (c.section.kind === 'circle') return { kind: 'circle', layer: 'FW-OUTLINE', c: at, r: (c.section.D * k) / 2, fill: true };
  const rot = c.section.kind === 'rect' ? c.section.rotDeg ?? 0 : 0;
  return { kind: 'polyline', layer: 'FW-OUTLINE', closed: true, fill: true, points: rectAt(at, c.section.b * k, c.section.h * k, rot) };
}

export const sectionLabel = (s: PlanColumn['section']) => s.kind === 'circle' ? `Ø${cm(s.D)}` : s.kind === 'rect' ? `${cm(s.b)}×${cm(s.h)}` : s.label;

export function formworkPlan(i: FormworkInput, title: string, fmt: (v: number) => string): DrawingInput {
  const out: Primitive[] = [], s = i.scale, th = 2.5;
  const pts: P[] = [
    ...i.columns.flatMap((c) => { const o = columnOutline(c); return o.kind === 'polyline' ? o.points : o.kind === 'circle' ? [{ x: o.c.x - o.r, y: o.c.y - o.r }, { x: o.c.x + o.r, y: o.c.y + o.r }] : []; }), ...i.beams.flatMap((b) => [mm(b.a), mm(b.b)]),
    ...i.slabs.flatMap((sl) => sl.outline.map(mm)), ...i.walls.flatMap((w) => [mm(w.a), mm(w.b)]),
  ];
  for (const a of i.axes) pts.push(a.axis === 'x' ? { x: a.at * k, y: pts[0]?.y ?? 0 } : { x: pts[0]?.x ?? 0, y: a.at * k });
  const box = boxOf(pts.length ? pts : [{ x: 0, y: 0 }]);

  for (const sl of i.slabs) {
    const o = sl.outline.map(mm);
    out.push({ kind: 'polyline', layer: 'FW-OUTLINE', closed: true, points: o });
    const c = o.reduce((a, p) => ({ x: a.x + p.x / o.length, y: a.y + p.y / o.length }), { x: 0, y: 0 });
    out.push({ kind: 'text', layer: 'FW-TAG', at: c, text: `${sl.name} — h ${cm(sl.thickness)}`, height: th * 1.1, align: 'center' });
  }
  for (const b of i.beams) {
    const A = mm(b.a), B = mm(b.b), L = Math.hypot(B.x - A.x, B.y - A.y) || 1;
    const n = { x: -(B.y - A.y) / L, y: (B.x - A.x) / L }, w = (b.width * k) / 2;
    for (const sg of [1, -1]) out.push({ kind: 'line', layer: 'FW-HIDDEN', a: { x: A.x + n.x * w * sg, y: A.y + n.y * w * sg }, b: { x: B.x + n.x * w * sg, y: B.y + n.y * w * sg } });
    const ang = (Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI, up = ang > 90 || ang <= -90 ? ang + 180 : ang;
    out.push({ kind: 'text', layer: 'FW-TAG', at: { x: (A.x + B.x) / 2 + n.x * (w + 1.5 * s), y: (A.y + B.y) / 2 + n.y * (w + 1.5 * s) }, text: `${b.name} ${cm(b.width)}×${cm(b.depth)}`, height: th, align: 'center', rotation: up });
  }
  for (const w of i.walls) {
    const A = mm(w.a), B = mm(w.b), L = Math.hypot(B.x - A.x, B.y - A.y) || 1;
    const n = { x: -(B.y - A.y) / L, y: (B.x - A.x) / L }, t = (w.thickness * k) / 2;
    out.push({ kind: 'polyline', layer: 'FW-OUTLINE', closed: true, fill: true, points: [{ x: A.x + n.x * t, y: A.y + n.y * t }, { x: B.x + n.x * t, y: B.y + n.y * t }, { x: B.x - n.x * t, y: B.y - n.y * t }, { x: A.x - n.x * t, y: A.y - n.y * t }] });
    out.push({ kind: 'text', layer: 'FW-TAG', at: { x: (A.x + B.x) / 2 + n.x * (t + 2 * s), y: (A.y + B.y) / 2 + n.y * (t + 2 * s) }, text: `${w.name} e ${cm(w.thickness)}`, height: th });
  }
  for (const c of i.columns) {
    out.push(columnOutline(c));
    const at = mm(c.at), half = c.section.kind === 'circle' ? (c.section.D * k) / 2 : (Math.max(c.section.b, c.section.h) * k) / 2;
    out.push({ kind: 'text', layer: 'FW-TAG', at: { x: at.x + half + 1.2 * s, y: at.y + half + 0.8 * s }, text: `${c.name} ${sectionLabel(c.section)}`, height: th });
  }
  out.push(...drawAxes(i.axes, box, s));
  // The level mark under the first slab's tag, or beyond the top right corner without one.
  const first = i.slabs[0]?.outline.map(mm);
  const markAt = first ? { x: first.reduce((a, p) => a + p.x, 0) / first.length, y: first.reduce((a, p) => a + p.y, 0) / first.length - 5 * s } : { x: box.x1 + 8 * s, y: box.y1 + 8 * s };
  out.push(...levelMark(markAt, i.level.z, s, fmt));
  const all = boxOf([...pts, { x: box.x0 - 20 * s, y: box.y0 - 20 * s }, { x: box.x1 + 20 * s, y: box.y1 + 20 * s }]);
  return { key: `formwork-${i.level.name}`, title, primitives: out, width: all.x1 - all.x0, height: all.y1 - all.y0, origin: { x: all.x0, y: all.y0 }, scale: s };
}
