/**
 * Elevations across assemblies, from the detailing's own bars: a frame line (its beams and
 * columns in one vertical plane), a column stack (every lift of a column line), and a joint
 * (the close-up where a column meets its beams).
 *
 * The bars are the scene's (`scene-model.ts`), the same polylines the 3-D view and the plans
 * draw, so these sheets show the steel that will be placed and cannot disagree with the rest of
 * the set. The concrete is each member's solid, outlined in the sheet's plane. Frame steel only:
 * a slab's or a wall's bars belong to their own sheets.
 *
 * ── How lines, stacks and joints are found ────────────────────────
 *
 *   · A frame line is the level beams on one line in plan (same direction to 1°, same offset to
 *     5 cm), with the columns standing on that line. Two beams or more: one beam alone is its
 *     own assembly's elevation already.
 *   · A column stack is the vertical columns at one plan position (to 5 cm), two lifts or more:
 *     one lift is its column detail already.
 *   · A joint is a column end with a level beam ending within 0.8 m of it in plan and 1 m in
 *     height, drawn in a window around it in the plane of that beam.
 */
import { LAYERS, project, type DrawnPolyline, type DrawnText, type Projection, type Sheet, type TitleBlock } from './drawings';
import type { SceneModel, SceneSolid, SceneBar } from './scene-model';
import { solidOutline, extentsOf, statusNotes, barPolyline, type StatusLookup } from './structure-drawings';

type P3 = { x: number; y: number; z: number };

interface Axis { start: P3; end: P3; dir: P3; length: number }

function axisOf(s: SceneSolid): Axis {
  const n = s.base.length;
  const start = { x: s.base.reduce((a, p) => a + p.x, 0) / n, y: s.base.reduce((a, p) => a + p.y, 0) / n, z: s.base.reduce((a, p) => a + p.z, 0) / n };
  const L = Math.hypot(s.extrude.x, s.extrude.y, s.extrude.z) || 1;
  return { start, end: { x: start.x + s.extrude.x, y: start.y + s.extrude.y, z: start.z + s.extrude.z }, dir: { x: s.extrude.x / L, y: s.extrude.y / L, z: s.extrude.z / L }, length: L };
}
const isLevel = (a: Axis) => Math.abs(a.dir.z) < 0.1;
const isVertical = (a: Axis) => Math.abs(a.dir.z) > 0.9;

/** The vertical plane through `origin` along plan direction `dir`, as a projection. */
export function verticalPlane(origin: P3, dir: { x: number; y: number }): Projection {
  const L = Math.hypot(dir.x, dir.y) || 1;
  return { right: { x: dir.x / L, y: dir.y / L, z: 0 }, up: { x: 0, y: 0, z: 1 }, origin };
}

export interface FrameLine { id: string; origin: P3; dir: { x: number; y: number }; solids: SceneSolid[] }
export interface ColumnStack { id: string; at: { x: number; y: number }; solids: SceneSolid[] }
export interface Joint { id: string; at: P3; dir: { x: number; y: number }; solids: SceneSolid[] }

export function frameLines(scene: SceneModel): FrameLine[] {
  const lines = new Map<string, FrameLine>();
  for (const s of scene.solids) {
    if (s.kind !== 'beam') continue;
    const a = axisOf(s);
    if (!isLevel(a)) continue;
    // Direction folded to [0°, 180°), and the signed offset of the line from the origin.
    let ang = Math.atan2(a.dir.y, a.dir.x);
    if (ang < 0) ang += Math.PI;
    if (ang >= Math.PI - 1e-9) ang -= Math.PI;
    const d = { x: Math.cos(ang), y: Math.sin(ang) };
    const offset = a.start.x * -d.y + a.start.y * d.x;
    const key = `${Math.round((ang * 180) / Math.PI)}:${Math.round(offset / 0.05)}`;
    const line = lines.get(key) ?? { id: `frame-${lines.size + 1}`, origin: { x: -d.y * offset, y: d.x * offset, z: 0 }, dir: d, solids: [] };
    line.solids.push(s);
    lines.set(key, line);
  }
  const out = [...lines.values()].filter((l) => l.solids.length >= 2);
  for (const l of out) {
    for (const s of scene.solids) {
      if (s.kind !== 'column') continue;
      const a = axisOf(s);
      if (!isVertical(a)) continue;
      const off = Math.abs((a.start.x - l.origin.x) * -l.dir.y + (a.start.y - l.origin.y) * l.dir.x);
      if (off < 0.3) l.solids.push(s);
    }
  }
  return out;
}

export function columnStacks(scene: SceneModel): ColumnStack[] {
  const stacks = new Map<string, ColumnStack>();
  for (const s of scene.solids) {
    if (s.kind !== 'column') continue;
    const a = axisOf(s);
    if (!isVertical(a)) continue;
    const key = `${Math.round(a.start.x / 0.05)}:${Math.round(a.start.y / 0.05)}`;
    const st = stacks.get(key) ?? { id: `stack-${stacks.size + 1}`, at: { x: a.start.x, y: a.start.y }, solids: [] };
    st.solids.push(s);
    stacks.set(key, st);
  }
  return [...stacks.values()].filter((s) => s.solids.length >= 2)
    .map((s) => ({ ...s, solids: s.solids.sort((p, q) => axisOf(p).start.z - axisOf(q).start.z) }));
}

export function joints(scene: SceneModel): Joint[] {
  const beams = scene.solids.filter((s) => s.kind === 'beam').map((s) => ({ s, a: axisOf(s) })).filter((b) => isLevel(b.a));
  const out = new Map<string, Joint>();
  for (const c of scene.solids) {
    if (c.kind !== 'column') continue;
    const ca = axisOf(c);
    if (!isVertical(ca)) continue;
    for (const end of [ca.start, ca.end]) {
      const near = beams.filter(({ a }) => [a.start, a.end].some((p) => Math.hypot(p.x - end.x, p.y - end.y) < 0.8 && Math.abs(p.z - end.z) < 1));
      if (near.length === 0) continue;
      const key = `${Math.round(end.x / 0.05)}:${Math.round(end.y / 0.05)}:${Math.round(end.z / 0.05)}`;
      const j = out.get(key) ?? { id: `joint-${out.size + 1}`, at: end, dir: { x: near[0]!.a.dir.x, y: near[0]!.a.dir.y }, solids: [] };
      for (const s of [c, ...near.map((b) => b.s)]) if (!j.solids.includes(s)) j.solids.push(s);
      out.set(key, j);
    }
  }
  return [...out.values()];
}

/** Clip a polyline to a box, Liang–Barsky per segment; the pieces inside, in order. */
export function clipPolyline(pts: readonly { x: number; y: number }[], box: { minX: number; maxX: number; minY: number; maxY: number }): Array<Array<{ x: number; y: number }>> {
  const out: Array<Array<{ x: number; y: number }>> = [];
  let cur: Array<{ x: number; y: number }> = [];
  const flush = () => { if (cur.length >= 2) out.push(cur); cur = []; };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!;
    const dx = b.x - a.x, dy = b.y - a.y;
    let t0 = 0, t1 = 1, ok = true;
    for (const [p, q] of [[-dx, a.x - box.minX], [dx, box.maxX - a.x], [-dy, a.y - box.minY], [dy, box.maxY - a.y]] as const) {
      if (p === 0) { if (q < 0) { ok = false; break; } continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; }
      else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
    }
    if (!ok) { flush(); continue; }
    const pa = { x: a.x + t0 * dx, y: a.y + t0 * dy }, pb = { x: a.x + t1 * dx, y: a.y + t1 * dy };
    if (cur.length === 0 || t0 > 0) { flush(); cur.push(pa); }
    cur.push(pb);
    if (t1 < 1) flush();
  }
  flush();
  return out;
}

interface ElevationInput { scene: SceneModel; title: TitleBlock; statusOf: StatusLookup }

/** Solids and their frame bars, outlined and drawn in a plane; one mark label per mark. */
function elevationSheet(
  kind: Sheet['kind'], input: ElevationInput, solids: readonly SceneSolid[], proj: Projection,
  heading: string, window?: { minX: number; maxX: number; minY: number; maxY: number },
): Sheet {
  const ids = new Set(solids.flatMap((s) => s.elementIds));
  const bars: SceneBar[] = input.scene.bars.filter((b) => b.ownerScope === 'frame' && b.elementIds.some((id) => ids.has(id)));
  const polylines: DrawnPolyline[] = [];
  const texts: DrawnText[] = [];
  const add = (p: DrawnPolyline) => {
    if (!window) { polylines.push(p); return; }
    const pts = p.closed ? [...p.points, p.points[0]!] : p.points;
    for (const piece of clipPolyline(pts, window)) polylines.push({ layer: p.layer, points: piece, closed: false });
  };
  for (const s of solids) add(solidOutline(s, proj, LAYERS.outline));
  const labelled = new Set<string>();
  for (const b of bars) {
    const pl = barPolyline(b, proj);
    const before = polylines.length;
    add(pl);
    if (b.mark && !labelled.has(b.mark) && polylines.length > before) {
      const drawn = polylines[before]!.points;
      const mid = drawn[Math.floor(drawn.length / 2)]!;
      labelled.add(b.mark);
      texts.push({ layer: LAYERS.mark, at: { x: mid.x, y: mid.y + 0.04 }, height: 0.05, text: `${b.mark} Ø${b.diameterMm}` });
    }
  }
  const notes = [heading, `${ids.size} elementos, ${bars.length} barras`, ...statusNotes([...ids], input.statusOf)];
  if (bars.length === 0) notes.push('Sin armadura en el modelo para estos elementos.');
  return { kind, title: input.title, polylines, circles: [], texts, dimensions: [], notes, extents: extentsOf(polylines) };
}

export function drawFrameElevation(input: ElevationInput & { line: FrameLine }): Sheet {
  const { line } = input;
  return elevationSheet('frameElevation', input, line.solids, verticalPlane(line.origin, line.dir),
    `Pórtico ${line.id}: dirección (${line.dir.x.toFixed(2)}, ${line.dir.y.toFixed(2)})`);
}

export function drawColumnStack(input: ElevationInput & { stack: ColumnStack }): Sheet {
  const { stack } = input;
  return elevationSheet('columnElevation', input, stack.solids, verticalPlane({ x: stack.at.x, y: stack.at.y, z: 0 }, { x: 1, y: 0 }),
    `Columna apilada en (${stack.at.x.toFixed(2)}; ${stack.at.y.toFixed(2)}): ${stack.solids.length} tramos`);
}

/** Half-sizes of the joint window, m: along the beam, and in height. */
export const JOINT_WINDOW = { half: 1.2, halfHeight: 1.0 };

export function drawJointDetail(input: ElevationInput & { joint: Joint }): Sheet {
  const { joint } = input;
  const proj = verticalPlane(joint.at, joint.dir);
  const c = project(joint.at, proj);
  const window = { minX: c.x - JOINT_WINDOW.half, maxX: c.x + JOINT_WINDOW.half, minY: c.y - JOINT_WINDOW.halfHeight, maxY: c.y + JOINT_WINDOW.halfHeight };
  return elevationSheet('jointDetail', input, joint.solids, proj,
    `Nudo en (${joint.at.x.toFixed(2)}; ${joint.at.y.toFixed(2)}; ${joint.at.z.toFixed(2)})`, window);
}
