import { modelStore } from '../../store/model.svelte';
import { rectSection } from '../../store/design-resize';
import { computeLocalAxes3D } from '../../engine/local-axes-3d';
import { NodeIndex } from '../edit/node-index';
import { splitAtNodes } from '../edit/cut-members';
import type { Vec3 } from '../edit/affine';
import type { Level } from '../grid';
import { PHYSICAL_GROUP_KIND } from '../physical/types';
import { declare, nextName } from './declare';

export type P2 = { x: number; y: number };

const WELD_M = 1e-3;
const INSIDE_M = 0.01;

export interface Footprint { center: P2; u: P2; v: P2; b: number; h: number }

/** A column's footprint from two opposite corners, its sides along X and Y. */
export function footprintFromCorners(p: P2, q: P2): Footprint {
  return { center: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, u: { x: 1, y: 0 }, v: { x: 0, y: 1 }, b: Math.abs(q.x - p.x), h: Math.abs(q.y - p.y) };
}

/** A footprint from one side, `p` to `q`, and a point `r` on the opposite side: any angle. */
export function footprintFromSide(p: P2, q: P2, r: P2): Footprint | null {
  const b = Math.hypot(q.x - p.x, q.y - p.y);
  if (b < 1e-6) return null;
  const u = { x: (q.x - p.x) / b, y: (q.y - p.y) / b };
  let v = { x: -u.y, y: u.x };
  let h = (r.x - p.x) * v.x + (r.y - p.y) * v.y;
  if (h < 0) { v = { x: -v.x, y: -v.y }; h = -h; }
  if (h < 1e-6) return null;
  return { center: { x: p.x + u.x * b / 2 + v.x * h / 2, y: p.y + u.y * b / 2 + v.y * h / 2 }, u, v, b, h };
}

/** A footprint of b × h turned `angleDeg`, with its fixed point (each of x, y in −1, 0, 1) on `at`. */
export function footprintAt(at: P2, b: number, h: number, angleDeg: number, fixedPoint: [number, number]): Footprint {
  const a = angleDeg * Math.PI / 180;
  const u = { x: Math.cos(a), y: Math.sin(a) }, v = { x: -Math.sin(a), y: Math.cos(a) };
  const [fx, fy] = fixedPoint;
  return { center: { x: at.x - u.x * fx * b / 2 - v.x * fy * h / 2, y: at.y - u.y * fx * b / 2 - v.y * fy * h / 2 }, u, v, b, h };
}

/** Where a footprint's fixed point is. */
export function fixedPointOf(f: Footprint, fixedPoint: [number, number]): P2 {
  const [fx, fy] = fixedPoint;
  return { x: f.center.x + f.u.x * fx * f.b / 2 + f.v.x * fy * f.h / 2, y: f.center.y + f.u.y * fx * f.b / 2 + f.v.y * fy * f.h / 2 };
}

export const footprintCorners = (f: Footprint): P2[] => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => ({
  x: f.center.x + f.u.x * i! * f.b / 2 + f.v.x * j! * f.h / 2,
  y: f.center.y + f.u.y * i! * f.b / 2 + f.v.y * j! * f.h / 2,
}));

/** The angle of a footprint's first side, in degrees, in (−90, 90]. */
export function footprintAngle(f: Footprint): number {
  let a = Math.atan2(f.u.y, f.u.x) * 180 / Math.PI;
  if (a <= -90) a += 180;
  if (a > 90) a -= 180;
  return Math.abs(a) < 1e-9 ? 0 : a;
}

export interface PlanPlaced { created: number; bars: number[]; groupId?: number; refused?: 'levels' | 'size' | 'length' }

const levelsBetween = (levels: readonly Level[], from: string, to: string): Level[] => {
  const a = levels.find((l) => l.id === from), b = levels.find((l) => l.id === to);
  if (!a || !b) return [];
  const [lo, hi] = a.z <= b.z ? [a.z, b.z] : [b.z, a.z];
  return levels.filter((l) => l.z >= lo - 1e-9 && l.z <= hi + 1e-9).sort((p, q) => p.z - q.z);
};

function nodeFinder() {
  const index = new NodeIndex(WELD_M);
  const pos = (id: number): Vec3 | undefined => { const n = modelStore.nodes.get(id); return n ? [n.x, n.y, n.z ?? 0] : undefined; };
  for (const [id, n] of modelStore.nodes) index.add(id, [n.x, n.y, n.z ?? 0]);
  return (x: number, y: number, z: number): number => {
    const hit = index.find([x, y, z], pos);
    if (hit !== null) return hit;
    const id = modelStore.addNode(x, y, z);
    index.add(id, [x, y, z]);
    return id;
  };
}

const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

function barBetween(i: number, j: number): number | undefined {
  for (const e of modelStore.elements.values()) if (pairKey(e.nodeI, e.nodeJ) === pairKey(i, j)) return e.id;
  return undefined;
}

function heldByPhysical(): Set<number> {
  const held = new Set<number>();
  for (const g of modelStore.model.groups.values()) if (g.kind === PHYSICAL_GROUP_KIND) for (const id of g.members.elements ?? []) held.add(id);
  return held;
}

function axesOf(id: number) {
  const e = modelStore.elements.get(id)!;
  const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!;
  return computeLocalAxes3D({ id: a.id, x: a.x, y: a.y, z: a.z ?? 0 }, { id: b.id, x: b.x, y: b.y, z: b.z ?? 0 }, undefined, e.rollAngle ?? 0);
}

/**
 * Turn a vertical bar about its axis so its local y runs along the footprint's first side, and
 * give it the b × h section that footprint has (b along local y, as `planHalf` reads it).
 */
function seatColumnSection(id: number, f: Footprint): void {
  const want = footprintAngle(f);
  for (const roll of [want, -want, want + 90, -want + 90, want - 90, -want - 90]) {
    modelStore.updateElement(id, { rollAngle: roll });
    const ax = axesOf(id);
    const alongU = Math.abs(ax.ey[0] * f.u.x + ax.ey[1] * f.u.y);
    if (alongU > 1 - 1e-6) { modelStore.updateElement(id, { sectionId: rectSection(f.b, f.h) }); return; }
    const alongV = Math.abs(ax.ey[0] * f.v.x + ax.ey[1] * f.v.y);
    if (alongV > 1 - 1e-6) { modelStore.updateElement(id, { sectionId: rectSection(f.h, f.b) }); return; }
  }
}

export interface ColumnOnPlan {
  footprint: Footprint;
  fixedPoint: [number, number];
  levels: readonly Level[];
  levelFrom: string;
  levelTo: string;
  materialId: number;
  typology?: string;
  fixBase?: boolean;
}

/**
 * A column drawn on the plan: its nodes on the fixed point at every level from one to the other,
 * one bar per storey offset to the footprint's centre (`Element.offset`), so it grows from that
 * point when its section changes. Declared one physical column, with its fixed point kept.
 */
export function placeColumnOnPlan(c: ColumnOnPlan): PlanPlaced {
  const lv = levelsBetween(c.levels, c.levelFrom, c.levelTo);
  if (lv.length < 2) return { created: 0, bars: [], refused: 'levels' };
  if (c.footprint.b < 0.01 || c.footprint.h < 0.01) return { created: 0, bars: [], refused: 'size' };
  const out: PlanPlaced = { created: 0, bars: [] };
  modelStore.batch(() => {
    const nodeAt = nodeFinder();
    const held = heldByPhysical();
    const at = fixedPointOf(c.footprint, c.fixedPoint);
    const shift = { x: c.footprint.center.x - at.x, y: c.footprint.center.y - at.y, z: 0 };
    const offset = Math.hypot(shift.x, shift.y) > 1e-9 ? { offset: { frame: 'global' as const, i: shift, j: shift } } : {};
    const ids = lv.map((l) => nodeAt(at.x, at.y, l.z));
    const mine: number[] = [];
    for (let k = 0; k + 1 < ids.length; k++) {
      const there = barBetween(ids[k]!, ids[k + 1]!);
      if (there !== undefined && held.has(there)) continue;
      const id = there ?? modelStore.addElement(ids[k]!, ids[k + 1]!);
      modelStore.updateElement(id, { materialId: c.materialId, ...offset } as never);
      seatColumnSection(id, c.footprint);
      mine.push(id);
    }
    if (mine.length === 0) return;
    const base = ids[0]!;
    if (c.fixBase && ![...modelStore.supports.values()].some((s) => s.nodeId === base)) modelStore.addSupport(base, 'fixed3d');
    out.groupId = declare(nextName('C')(), { elements: mine }, {
      kind: 'column', provenance: 'declared', levelFrom: lv[0]!.id, levelTo: lv[lv.length - 1]!.id,
      fixedPoint: [...c.fixedPoint], ...(c.typology ? { typology: c.typology } : {}),
    });
    out.created = 1;
    out.bars = mine;
  });
  return out;
}

/** The columns standing on or arriving at level `z`: their node there and their footprint. */
export function columnsAtLevel(z: number): Array<{ node: number; footprint: Footprint; element: number }> {
  const out: Array<{ node: number; footprint: Footprint; element: number }> = [];
  const seen = new Set<number>();
  for (const e of modelStore.elements.values()) {
    const a = modelStore.nodes.get(e.nodeI), b = modelStore.nodes.get(e.nodeJ);
    if (!a || !b || Math.hypot(b.x - a.x, b.y - a.y) > 1e-6 || Math.abs((b.z ?? 0) - (a.z ?? 0)) < 1e-6) continue;
    const at = Math.abs((a.z ?? 0) - z) < 1e-6 ? a : Math.abs((b.z ?? 0) - z) < 1e-6 ? b : null;
    if (!at || seen.has(at.id)) continue;
    const sec = modelStore.sections.get(e.sectionId);
    if (!sec?.b || !sec.h) continue;
    const ax = axesOf(e.id);
    const off = e.offset?.frame === 'global' ? (at.id === e.nodeI ? e.offset.i : e.offset.j) : undefined;
    const len = Math.hypot(ax.ey[0], ax.ey[1]) || 1;
    const u = { x: ax.ey[0] / len, y: ax.ey[1] / len };
    seen.add(at.id);
    out.push({ node: at.id, element: e.id, footprint: { center: { x: at.x + (off?.x ?? 0), y: at.y + (off?.y ?? 0) }, u, v: { x: -u.y, y: u.x }, b: sec.b, h: sec.h } });
  }
  return out;
}

function inside(f: Footprint, p: P2, tol: number): boolean {
  const dx = p.x - f.center.x, dy = p.y - f.center.y;
  return Math.abs(dx * f.u.x + dy * f.u.y) <= f.b / 2 + tol && Math.abs(dx * f.v.x + dy * f.v.y) <= f.h / 2 + tol;
}

/** A beam from one face line, `p` to `q`, and a point `r` on the other face: its axis and width. */
export function beamFromFaces(p: P2, q: P2, r: P2): { a: P2; b: P2; width: number } | null {
  const L = Math.hypot(q.x - p.x, q.y - p.y);
  if (L < 1e-6) return null;
  const n = { x: -(q.y - p.y) / L, y: (q.x - p.x) / L };
  const w = (r.x - p.x) * n.x + (r.y - p.y) * n.y;
  if (Math.abs(w) < 0.01) return null;
  const s = { x: n.x * w / 2, y: n.y * w / 2 };
  return { a: { x: p.x + s.x, y: p.y + s.y }, b: { x: q.x + s.x, y: q.y + s.y }, width: Math.abs(w) };
}

/** The beam's axis from the line drawn: on it, or half a width to its left (+1) or right (−1). */
export function beamAxis(a: P2, b: P2, width: number, align: -1 | 0 | 1): { a: P2; b: P2 } {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
  const d = align * width / 2;
  return { a: { x: a.x + n.x * d, y: a.y + n.y * d }, b: { x: b.x + n.x * d, y: b.y + n.y * d } };
}

export interface BeamOnPlan {
  a: P2; b: P2;
  width: number; height: number;
  level: Level;
  materialId: number;
  typology?: string;
  /** The top face on the level (the slab's top), the axis half a depth below. */
  topFlush?: boolean;
}

/**
 * A beam drawn on the plan, by its axis: an end inside a column's footprint frames into the
 * column's node, a column it crosses splits it, and a node already on its line joins it. Each bar
 * is offset from its nodes onto the axis drawn, so the beam stays where it was drawn (flush with a
 * column's face, say) while it frames into the columns. Declared one physical beam.
 */
export function placeBeamOnPlan(d: BeamOnPlan): PlanPlaced {
  const L = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
  if (L < 0.05) return { created: 0, bars: [], refused: 'length' };
  if (d.width < 0.01 || d.height < 0.01) return { created: 0, bars: [], refused: 'size' };
  const z = d.level.z;
  const t = { x: (d.b.x - d.a.x) / L, y: (d.b.y - d.a.y) / L };
  const param = (p: P2) => (p.x - d.a.x) * t.x + (p.y - d.a.y) * t.y;
  const onAxis = (s: number): P2 => ({ x: d.a.x + t.x * s, y: d.a.y + t.y * s });
  const out: PlanPlaced = { created: 0, bars: [] };
  modelStore.batch(() => {
    const nodeAt = nodeFinder();
    const columns = columnsAtLevel(z);
    type Station = { s: number; node: number };
    const stations: Station[] = [];
    const endNode = (s: number): number => {
      const p = onAxis(s);
      const col = columns.find((c) => inside(c.footprint, p, INSIDE_M));
      return col ? col.node : nodeAt(p.x, p.y, z);
    };
    const n0 = endNode(0), n1 = endNode(L);
    stations.push({ s: 0, node: n0 }, { s: L, node: n1 });
    for (const c of columns) {
      if (c.node === n0 || c.node === n1) continue;
      const s = param(c.footprint.center);
      if (s <= 0 || s >= L) continue;
      if (inside(c.footprint, onAxis(s), INSIDE_M)) stations.push({ s, node: c.node });
    }
    for (const [id, n] of modelStore.nodes) {
      if (Math.abs((n.z ?? 0) - z) > 1e-6 || stations.some((st) => st.node === id)) continue;
      const s = param(n);
      const p = onAxis(s);
      if (s > 1e-6 && s < L - 1e-6 && Math.hypot(p.x - n.x, p.y - n.y) < WELD_M) stations.push({ s, node: id });
    }
    stations.sort((p, q) => p.s - q.s);
    const levelBars = [...modelStore.elements.values()].filter((e) => [e.nodeI, e.nodeJ].every((n) => Math.abs((modelStore.nodes.get(n)?.z ?? NaN) - z) < 1e-6)).map((e) => e.id);
    if (levelBars.length) splitAtNodes(levelBars, [n0, n1]);
    const held = heldByPhysical();
    const sectionId = rectSection(d.width, d.height);
    const mine: number[] = [];
    for (let k = 0; k + 1 < stations.length; k++) {
      const p = stations[k]!, q = stations[k + 1]!;
      if (p.node === q.node) continue;
      const there = barBetween(p.node, q.node);
      if (there !== undefined && held.has(there)) continue;
      const id = there ?? modelStore.addElement(p.node, q.node);
      const shift = (st: Station) => {
        const n = modelStore.nodes.get(st.node)!, a = onAxis(st.s);
        return { x: a.x - n.x, y: a.y - n.y, z: d.topFlush ? -d.height / 2 : 0 };
      };
      const i = shift(p), j = shift(q);
      const any = [i, j].some((v) => Math.hypot(v.x, v.y, v.z) > 1e-9);
      modelStore.updateElement(id, { sectionId, materialId: d.materialId, ...(any ? { offset: { frame: 'global', i, j } } : {}) } as never);
      mine.push(id);
    }
    if (mine.length === 0) return;
    out.groupId = declare(nextName('V')(), { elements: mine }, {
      kind: 'beam', provenance: 'declared', levelFrom: d.level.id, levelTo: d.level.id,
      ...(d.typology ? { typology: d.typology } : {}),
    });
    out.created = 1;
    out.bars = mine;
  });
  return out;
}

/** Corners, face midpoints and centres of the columns on a level: where a beam or a wall meets them. */
export function columnSnapPoints(z: number): Array<P2 & { kind: 'corner' | 'face' | 'center' }> {
  const out: Array<P2 & { kind: 'corner' | 'face' | 'center' }> = [];
  for (const { footprint: f } of columnsAtLevel(z)) {
    for (const p of footprintCorners(f)) out.push({ ...p, kind: 'corner' });
    for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) out.push({ x: f.center.x + f.u.x * i * f.b / 2 + f.v.x * j * f.h / 2, y: f.center.y + f.u.y * i * f.b / 2 + f.v.y * j * f.h / 2, kind: 'face' });
    out.push({ ...f.center, kind: 'center' });
  }
  return out;
}
