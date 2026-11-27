/**
 * The project's placement written into the model: each horizontal beam's and slab's vertical
 * offset from the level reference, each column storey's offset in plan so its fixed point stands
 * on its axis, and with `edges` each beam with slab on one side moved toward it. Only what the
 * placement owns is written: without `edges` a beam keeps its offset across, and a stack with no
 * fixed point of its own (and none from `edges`) keeps its own.
 */
import { modelStore } from './model.svelte';
import { designData, patchDesignData, storedDesignData } from './design-data';
import { physicalPlates, setPlateOffset } from './physical-plates';
import { plateLoops } from '../model/physical/plate';
import { beamDrop, columnShift, outerKind, slabDrop, type LevelReference, type Placement } from '../model/placement';
import { stackKey, type FixedPointKind } from '../rc-sheets/fixed-points';
import { memberRoll } from '../engine/local-axes-3d';
import { materialFamilyOf } from '../model/material-family';
import { catalogueGradeFamily } from '../engine/steel/grade-family';
import type { MemberOffset } from '../model/element-3d-metadata';

const TOL = 1e-6;
type P3 = { x: number; y: number; z: number };

export const placementData = (): Placement => { void modelStore.designData; return designData().placement ?? {}; };

/** The fixed point a column stack stands by: its own, else its outer face or corner where the edges are flush, else the centre. */
export const columnFixedPoint = (stack: string): FixedPointKind => columnFixedPoints().get(stack) ?? 'c';

/** Every stack's fixed point at once, the floor's edge read a single time. */
export function columnFixedPoints(): Map<string, FixedPointKind> {
  const p = placementData(), auto = p.edges ? edgeKinds() : new Map<string, FixedPointKind>();
  return new Map(columnStacks().map((s) => [s.key, p.columns?.[s.key] ?? auto.get(s.key) ?? 'c']));
}

/** Whether a stack's fixed point is its own or read from the edge. */
export const columnPointIsOwn = (stack: string): boolean => placementData().columns?.[stack] !== undefined;

function savePlacement(next: Placement): void {
  const columns = next.columns && Object.keys(next.columns).length ? next.columns : undefined;
  const p: Placement = { ...(next.reference ? { reference: next.reference } : {}), ...(columns ? { columns } : {}), ...(next.edges ? { edges: true } : {}) };
  const stored = storedDesignData() as Record<string, unknown>;
  const sheets = stored.rcSheets as { fixedPoints?: unknown } | undefined;
  const rcSheets = sheets && 'fixedPoints' in sheets ? (({ fixedPoints: _gone, ...rest }) => rest)(sheets) : sheets;
  patchDesignData({ placement: Object.keys(p).length ? p : undefined, ...(rcSheets ? { rcSheets: rcSheets as never } : {}) });
}

/** State the level reference and move the beams and slabs to it; one undo step. */
export function setLevelReference(reference: LevelReference): void {
  modelStore.batch(() => { savePlacement({ ...placementData(), reference }); applyPlacement(); });
}

/** Flush, or not, the columns and beams on the floor's edge with the slab's edge; one undo step. */
export function setEdgesFlush(on: boolean): void {
  modelStore.batch(() => {
    if (!on && placementData().edges) backOnAxes();
    savePlacement({ ...placementData(), edges: on });
    applyPlacement();
  });
}

/** What the edges moved, back on its axis: the beams and walls standing where the edge put them, the stacks with no fixed point of their own; an offset set by hand stays. */
function backOnAxes(): void {
  const p = placementData(), slabs = levelSlabs();
  const flat = (v: P3) => ({ ...v, x: 0, y: 0 });
  for (const e of [...modelStore.elements.values()]) {
    if (e.type === 'truss' || !e.offset || e.offset.frame !== 'global') continue;
    const d = edgeShift(e, slabs);
    if (d && atShift(vecOf(e.offset, 'i'), d) && atShift(vecOf(e.offset, 'j'), d)) writeOffset(e.id, flat(vecOf(e.offset, 'i')), flat(vecOf(e.offset, 'j')));
  }
  for (const w of edgeWalls(slabs)) if (w.offset && (w.shift[0] || w.shift[1]) && atShift(w.offset, w.shift)) setPlateOffset(w.id, w.offset.z ? { frame: 'global', x: 0, y: 0, z: w.offset.z } : undefined);
  const auto = edgeKinds(slabs);
  for (const stack of columnStacks()) {
    const kind = auto.get(stack.key);
    if (p.columns?.[stack.key] || !kind) continue;
    for (const id of stack.storeys) {
      const e = modelStore.elements.get(id)!, s = sectionOf(e);
      if (e.offset?.frame !== 'global' || !s?.b || !s.h) continue;
      const d = columnShift(kind, { b: s.b, h: s.h, rotDeg: memberRoll(e, modelStore.sections as never) });
      if (atShift(vecOf(e.offset, 'i'), d) && atShift(vecOf(e.offset, 'j'), d)) writeOffset(id, flat(vecOf(e.offset, 'i')), flat(vecOf(e.offset, 'j')));
    }
  }
}

const atShift = (v: { x: number; y: number }, d: readonly [number, number]) => Math.abs(v.x - d[0]) < 1e-9 && Math.abs(v.y - d[1]) < 1e-9;

/** Puts the storeys of the stacks whose own fixed point is dropped back on their axis, for the placement to place them again. */
function dropOwnPoints(stacks: readonly string[]): void {
  const own = new Set(stacks);
  for (const stack of columnStacks()) {
    if (!own.has(stack.key)) continue;
    for (const id of stack.storeys) {
      const e = modelStore.elements.get(id)!;
      if (e.offset?.frame === 'global') writeOffset(id, { ...vecOf(e.offset, 'i'), x: 0, y: 0 }, { ...vecOf(e.offset, 'j'), x: 0, y: 0 });
    }
  }
}

/** State the fixed point of one stack, or of every stack when `stack` is null, and move its storeys to it; `kind` null leaves the stack to its edge again. One undo step. */
export function setColumnFixedPoint(stack: string | null, kind: FixedPointKind | null): void {
  modelStore.batch(() => {
    const p = placementData();
    const columns = stack === null
      ? (kind === null ? {} : Object.fromEntries(columnStacks().map((s) => [s.key, kind])))
      : (({ [stack]: _old, ...rest }) => (kind === null ? rest : { ...rest, [stack]: kind }))(p.columns ?? {});
    dropOwnPoints(Object.keys(p.columns ?? {}).filter((k) => !(k in columns)));
    savePlacement({ ...p, columns });
    applyPlacement();
  });
}

const isSteel = (id: number | undefined) => id !== undefined && materialFamilyOf(modelStore.materials.get(id) as never, catalogueGradeFamily).family === 'steel';

const at = (id: number): P3 | null => { const n = modelStore.nodes.get(id); return n ? { x: n.x, y: n.y, z: n.z ?? 0 } : null; };
const sectionOf = (e: { sectionId: number }) => modelStore.sections.get(e.sectionId) as { b?: number; h?: number } | undefined;

/** Every column stack: its storeys from the lowest up, keyed by where they stand in plan. */
export function columnStacks(): Array<{ key: string; storeys: number[] }> {
  const by = new Map<string, Array<{ id: number; z: number }>>();
  for (const e of modelStore.elements.values()) {
    if (e.type === 'truss') continue;
    const a = at(e.nodeI), b = at(e.nodeJ);
    if (!a || !b || Math.hypot(b.x - a.x, b.y - a.y) > 1e-3 || Math.abs(b.z - a.z) < TOL) continue;
    const lo = a.z < b.z ? a : b, key = stackKey([lo.x, lo.y]);
    (by.get(key) ?? by.set(key, []).get(key)!).push({ id: e.id, z: lo.z });
  }
  return [...by].map(([key, list]) => ({ key, storeys: list.sort((p, q) => p.z - q.z).map((s) => s.id) })).sort((p, q) => p.key.localeCompare(q.key));
}

function inside(pt: P3, poly: readonly P3[], rim = true): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / L2)) : 0;
    if (Math.hypot(a.x + t * dx - pt.x, a.y + t * dy - pt.y) < 1e-3) return rim;
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** The level slabs: each plate declared a slab and lying flat, its outline, openings and thickness. */
function levelSlabs(): Array<{ id: number; z: number; outline: P3[]; holes: P3[][]; t: number; offset?: { x: number; y: number; z: number } }> {
  return physicalPlates().flatMap((pl) => {
    if (pl.physical.kind !== 'slab' || pl.physical.stair) return [];
    const loops = plateLoops(pl.group), outline = loops.outer.map(at);
    if (outline.length < 3 || outline.some((p) => !p) || outline.some((p) => Math.abs(p!.z - outline[0]!.z) > TOL)) return [];
    const holes = loops.holes.map((h) => h.map(at)).filter((h): h is P3[] => h.length >= 3 && h.every((p) => p));
    return [{ id: pl.id, z: outline[0]!.z, outline: outline as P3[], holes, t: pl.surface.thickness, ...(pl.surface.offset?.frame === 'global' ? { offset: pl.surface.offset } : {}) }];
  });
}

/** Whether a slab covers a point in plan: inside its outline or on it, and not inside an opening (its rim is still slab). */
const covers = (s: ReturnType<typeof levelSlabs>[number], p: P3) => inside(p, s.outline) && !s.holes.some((h) => inside(p, h, false));

const vecOf = (o: MemberOffset | undefined, end: 'i' | 'j') => (o?.frame === 'global' ? o[end] : undefined) ?? { x: 0, y: 0, z: 0 };
const same = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) => Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9 && Math.abs(p.z - q.z) < 1e-9;

function writeOffset(id: number, i: P3, j: P3, setOffset = modelStore.setElementOffset): void {
  const e = modelStore.elements.get(id)!;
  if (same(vecOf(e.offset, 'i'), i) && same(vecOf(e.offset, 'j'), j)) return;
  const zero = (v: P3) => same(v, { x: 0, y: 0, z: 0 });
  setOffset(id, zero(i) && zero(j) ? null : { frame: 'global', ...(zero(i) ? {} : { i }), ...(zero(j) ? {} : { j }) });
}

const turned = (e: { sectionId: number; rollAngle?: number }) => Math.abs(((memberRoll(e as never, modelStore.sections as never) % 180) + 180) % 180 - 90) < 45;
/** A horizontal member's section width in plan, and its depth, with its roll. */
const across = (e: { sectionId: number; rollAngle?: number }, s: { b?: number; h?: number }) => (turned(e) ? s.h : s.b) ?? 0;
const deep = (e: { sectionId: number; rollAngle?: number }, s: { b?: number; h?: number }) => (turned(e) ? s.b : s.h) ?? 0;

/** The slabs at a height containing a point in plan. */
const slabAt = (slabs: ReturnType<typeof levelSlabs>, p: P3) => slabs.some((s) => Math.abs(s.z - p.z) < TOL && covers(s, p));

/** How far the edges move a horizontal member across, m in plan: toward the slab on its one side by half its width; null with slab on both sides or none. */
function edgeShift(e: { nodeI: number; nodeJ: number; sectionId: number; rollAngle?: number }, slabs: ReturnType<typeof levelSlabs>): [number, number] | null {
  const a = at(e.nodeI), b = at(e.nodeJ), sec = sectionOf(e);
  if (!a || !b || !sec || Math.abs(a.z - b.z) > TOL) return null;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < TOL) return null;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: a.z }, w = across(e, sec);
  const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L, probe = Math.max(0.1, w / 2 + 0.05);
  const left = slabAt(slabs, { x: mid.x + nx * probe, y: mid.y + ny * probe, z: a.z }), right = slabAt(slabs, { x: mid.x - nx * probe, y: mid.y - ny * probe, z: a.z });
  const side = left && !right ? 1 : right && !left ? -1 : 0;
  if (!side || !w) return null;
  const d = (side * w) / 2;
  return [Math.round(nx * d * 1e9) / 1e9 + 0, Math.round(ny * d * 1e9) / 1e9 + 0];
}

/** Each stack's outer face or corner, from where its floors have no slab beside it; none for a stack inside the floor or with no slab at its nodes. */
function edgeKinds(slabs = levelSlabs()): Map<string, FixedPointKind> {
  const out = new Map<string, FixedPointKind>();
  const probe = 0.1;
  for (const stack of columnStacks()) {
    const base = modelStore.elements.get(stack.storeys[0]!)!;
    for (const id of stack.storeys) {
      const e = modelStore.elements.get(id)!, a = at(e.nodeI), b = at(e.nodeJ);
      if (!a || !b) continue;
      const top = a.z > b.z ? a : b;
      if (!slabAt(slabs, top)) continue;
      const has = (dx: number, dy: number) => slabAt(slabs, { x: top.x + dx * probe, y: top.y + dy * probe, z: top.z });
      const ox = !has(-1, 0) && has(1, 0) ? -1 : !has(1, 0) && has(-1, 0) ? 1 : 0, oy = !has(0, -1) && has(0, 1) ? -1 : !has(0, 1) && has(0, -1) ? 1 : 0;
      if (ox || oy) out.set(stack.key, outerKind([ox, oy], memberRoll(base, modelStore.sections as never)));
      break;
    }
  }
  return out;
}

/** The walls standing on the floor's edge, each with how far its mid-plane moves to put its outer face on the slab's edge (half its thickness toward the slab), m in plan. */
function edgeWalls(slabs: ReturnType<typeof levelSlabs>): Array<{ id: number; shift: [number, number]; offset?: { x: number; y: number; z: number } }> {
  return physicalPlates().flatMap((pl) => {
    if (pl.physical.kind !== 'wall') return [];
    const pts = plateLoops(pl.group).outer.map(at);
    if (pts.length < 3 || pts.some((q) => !q)) return [];
    const ps = pts as P3[], zTop = Math.max(...ps.map((q) => q.z));
    const top = ps.filter((q) => Math.abs(q.z - zTop) < TOL);
    let a = top[0]!, b = top[0]!;
    for (const q of top) for (const r of top) if (Math.hypot(r.x - q.x, r.y - q.y) > Math.hypot(b.x - a.x, b.y - a.y)) { a = q; b = r; }
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < TOL) return [];
    const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L, t = pl.surface.thickness, probe = t / 2 + 0.1;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: zTop };
    const levels = [...new Set(slabs.map((s) => s.z))].filter((z) => z <= zTop + TOL && z >= Math.min(...ps.map((q) => q.z)) - TOL);
    const side = levels.map((z) => {
      const l = slabAt(slabs, { x: mid.x + nx * probe, y: mid.y + ny * probe, z }), r = slabAt(slabs, { x: mid.x - nx * probe, y: mid.y - ny * probe, z });
      return l && !r ? 1 : r && !l ? -1 : 0;
    }).find((v) => v !== 0) ?? 0;
    const d = (side * t) / 2;
    return [{ id: pl.id, shift: [Math.round(nx * d * 1e9) / 1e9 + 0, Math.round(ny * d * 1e9) / 1e9 + 0] as [number, number], ...(pl.surface.offset?.frame === 'global' ? { offset: pl.surface.offset } : {}) }];
  });
}

/**
 * Write the placement into the model: the members it owns moved to where it puts them, nothing
 * else touched. A member offset along its own axes is left alone, the placement owning global
 * offsets only. Returns how many members and plates moved.
 */
export function applyPlacement(): number {
  const p = placementData();
  const changes: Array<() => void> = [];
  const queueOffset = (id: number, offset: MemberOffset | null) => {
    changes.push(() => modelStore.setElementOffset(id, offset));
  };
  const slabs = levelSlabs();
  if (p.reference) for (const s of slabs) {
    const z = slabDrop(p.reference, s.t), cur = s.offset ?? { x: 0, y: 0, z: 0 };
    if (Math.abs(cur.z - z) < 1e-9) continue;
    const next = { frame: 'global' as const, x: cur.x, y: cur.y, z };
    changes.push(() => setPlateOffset(s.id, next.x || next.y || next.z ? next : undefined));
  }
  if (p.reference || p.edges) for (const e of [...modelStore.elements.values()]) {
    if (e.type === 'truss' || (e.offset && e.offset.frame !== 'global')) continue;
    const a = at(e.nodeI), b = at(e.nodeJ), sec = sectionOf(e), h = sec && deep(e, sec);
    if (!a || !b || !sec || !h || Math.abs(a.z - b.z) > TOL || Math.hypot(b.x - a.x, b.y - a.y) < TOL) continue;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: a.z };
    const t = Math.max(0, ...slabs.filter((s) => Math.abs(s.z - a.z) < TOL && covers(s, mid)).map((s) => s.t));
    const ci = vecOf(e.offset, 'i'), cj = vecOf(e.offset, 'j');
    const z = p.reference ? Math.round(beamDrop(p.reference, h, t, isSteel(e.materialId)) * 1e9) / 1e9 + 0 : null;
    const d = p.edges ? edgeShift(e, slabs) : null;
    const end = (c: P3): P3 => ({ x: d ? d[0] : c.x, y: d ? d[1] : c.y, z: z ?? c.z });
    writeOffset(e.id, end(ci), end(cj), queueOffset);
  }
  if (p.edges) for (const w of edgeWalls(slabs)) {
    const cur = w.offset ?? { x: 0, y: 0, z: 0 }, [x, y] = w.shift;
    if ((!x && !y) || (Math.abs(cur.x - x) < 1e-9 && Math.abs(cur.y - y) < 1e-9)) continue;
    changes.push(() => setPlateOffset(w.id, x || y || cur.z ? { frame: 'global', x, y, z: cur.z } : undefined));
  }
  const auto = p.edges ? edgeKinds(slabs) : new Map<string, FixedPointKind>();
  for (const stack of columnStacks()) {
    const kind = p.columns?.[stack.key] ?? auto.get(stack.key);
    if (!kind) continue;
    for (const id of stack.storeys) {
      const e = modelStore.elements.get(id)!, s = sectionOf(e);
      if (!s?.b || !s.h || (e.offset && e.offset.frame !== 'global')) continue;
      const [x, y] = columnShift(kind, { b: s.b, h: s.h, rotDeg: memberRoll(e, modelStore.sections as never) });
      writeOffset(id, { ...vecOf(e.offset, 'i'), x, y }, { ...vecOf(e.offset, 'j'), x, y }, queueOffset);
    }
  }
  if (changes.length) modelStore.batch(() => { for (const change of changes) change(); });
  return changes.length;
}
