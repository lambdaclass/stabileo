/**
 * Members as whole pieces (`model/curve-entity.ts`): picked whole, loaded along their length as
 * one thing, and a curved member's discretisation remade without losing what it is.
 *
 * ── Loads along a curve ───────────────────────────────────────────
 *
 * A load per metre of arc in a global direction, kept as a definition (`curveLoad`) and written
 * onto the arc's segments as global loads per metre of member (`frame: 'global'`), each scaled by
 * the arc length its chord stands for over the chord's length. The total force is the definition's
 * on any number of segments; its moment converges to the arc's as the segments shorten. Written by
 * the same rewrite as the floor loads (`store/defined-loads.ts`), so remaking the arc remakes them
 * and nothing is added twice.
 *
 * ── Remaking an arc ───────────────────────────────────────────────
 *
 * Its segments and the nodes between them that nothing else holds go; the arc is built again
 * from its ends with the new count or shape, keeping its id, its section, material and type, and
 * the releases at its two ends. Loads put by hand on single segments cannot follow, and are
 * counted before anything changes.
 */
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { clearPlateMesh, physicalPlates } from './physical-plates';
import { plateLoops } from '../model/physical/plate';
import { arcMembers, pieceOf, type Piece } from '../model/curve-entity';
import { arcThroughThree, buildArc, NODE_MERGE_TOL, type ArcSpec, type Vec3 } from '../model/curved-member';
import { addFloorLoadDef, removeFloorLoadDef } from './defined-loads';
import type { ModelGroup } from './model.svelte';

/** The nodes the plates' meshes created: where a mesh cut a member. */
export function meshNodes(): Set<number> {
  const out = new Set<number>();
  for (const p of physicalPlates()) for (const n of plateLoops(p.group).owned) out.add(n);
  return out;
}

/** The whole piece a member belongs to. */
export function piece(elementId: number): Piece | null {
  return pieceOf(modelStore.model as never, elementId, meshNodes());
}

/** Select a member as PRO picks it: the whole piece it belongs to, or the segment alone. */
export function selectPiece(elementId: number, add = false): void {
  if (uiStore.analysisMode !== 'pro' || uiStore.memberPickScope === 'segment') { uiStore.selectElement(elementId, add); return; }
  const p = piece(elementId);
  if (!p || p.segments.length <= 1) { uiStore.selectElement(elementId, add); return; }
  uiStore.selectElements(p.segments.map((s) => s.elementId), add);
}

/** The arcs of the model: id, segments and geometry. */
export function arcs(): Array<{ arcId: number; spec: ArcSpec; members: number[]; radius: number; length: number }> {
  const seen = new Map<number, ArcSpec>();
  for (const e of modelStore.elements.values()) if (e.arc && !seen.has(e.arc.id)) seen.set(e.arc.id, e.arc.spec);
  return [...seen].map(([arcId, spec]) => {
    const g = arcThroughThree(spec.start, spec.through, spec.end);
    return { arcId, spec, members: arcMembers(modelStore.model as never, arcId), radius: g?.radius ?? Infinity, length: g?.length ?? 0 };
  });
}

// ─── Loads along a curve ─────────────────────────────────────────

export interface CurveLoadDef {
  arcId: number;
  caseId: number;
  /** kN per metre of arc, along `dir`. */
  q: number;
  /** Global direction, a unit vector. */
  dir: [number, number, number];
}

export function curveLoadDefs(arcId: number): ModelGroup[] {
  return [...modelStore.model.groups.values()].filter((g) => g.kind === 'curveLoad' && (g.data as unknown as CurveLoadDef | undefined)?.arcId === arcId);
}

/** A load along an arc, kept as a definition; one undo step. */
export function addCurveLoad(def: CurveLoadDef, name?: string): number | null {
  const l = Math.hypot(...def.dir);
  if (!(l > 0) || !Number.isFinite(def.q)) return null;
  const d = { ...def, dir: def.dir.map((v) => v / l) as [number, number, number] };
  return addFloorLoadDef(name ?? `Arc ${def.arcId} · q`, d as never, {}, 'curveLoad');
}

export const removeCurveLoad = (id: number) => removeFloorLoadDef(id);

// ─── Making an arc ───────────────────────────────────────────────

const nodeAtPoint = (x: number, y: number, z: number): number | null => {
  for (const [id, n] of modelStore.nodes) if (Math.hypot(n.x - x, n.y - y, (n.z ?? 0) - z) <= NODE_MERGE_TOL) return id;
  return null;
};
const posOf = (id: number): Vec3 | undefined => { const n = modelStore.nodes.get(id); return n ? { x: n.x, y: n.y, z: n.z ?? 0 } : undefined; };

/** The next free arc id: one more than the largest in the model. */
export const nextArcId = (): number => Math.max(0, ...[...modelStore.elements.values()].map((e) => e.arc?.id ?? 0)) + 1;

/**
 * A curved member from its two end nodes and a point it passes through, as `segments` members
 * tagged with one arc. The ends are the nodes picked (an arch springs from what is there); a point
 * of the arc on an existing node takes that node. One undo step; the members made.
 */
export function createArc(startNode: number, through: Vec3, endNode: number, segments: number): number[] {
  const a = posOf(startNode), b = posOf(endNode);
  if (!a || !b) return [];
  const arcId = nextArcId();
  let made: number[] = [];
  modelStore.batch(() => {
    made = buildArc({ start: a, through, end: b, segments }, {
      addNode: (x, y, z) => modelStore.addNode(x, y, z),
      nodeAt: nodeAtPoint,
      addElement: (i, j) => modelStore.addElement(i, j),
      setLocalY: (id, v) => modelStore.updateElementLocalY(id, v.x, v.y, v.z),
      nodePosition: posOf,
      tag: (elementId, tag) => modelStore.updateElement(elementId, { arc: { id: tag.arcId, spec: tag.spec, axes: 1 } } as never),
    }, arcId, startNode, endNode);
  });
  return made;
}

// ─── Remaking an arc ─────────────────────────────────────────────

export interface ArcRemake { segments?: number; through?: Vec3 }

/** What remaking an arc would drop: loads put by hand on its segments. */
export function arcHandLoads(arcId: number): number {
  const ids = new Set(arcMembers(modelStore.model as never, arcId));
  return modelStore.loads.filter((l) => {
    const d = l.data as { elementId?: number; fromDef?: number };
    return d.elementId !== undefined && ids.has(d.elementId) && d.fromDef === undefined;
  }).length;
}

/**
 * Build an arc again from its ends: another number of segments, or another point it passes
 * through. Keeps its id and what its members share. One undo step. Null when the arc is gone.
 */
export function remakeArc(arcId: number, change: ArcRemake): { members: number[]; droppedLoads: number; keptNodes: number; platesCleared: number } | null {
  if (!arcMembers(modelStore.model as never, arcId).length) return null;
  // The plates meshed on this arc's nodes lose their mesh first: it is out of date with the new
  // arc, and its shells would keep the old nodes in the model. They are meshed again on demand.
  const arcNodes = new Set(arcMembers(modelStore.model as never, arcId).flatMap((id) => { const e = modelStore.elements.get(id)!; return [e.nodeI, e.nodeJ]; }));
  const onArc = physicalPlates().filter((pl) => [...(pl.group.members.quads ?? []).map((q) => modelStore.quads.get(q)?.nodes ?? []), ...(pl.group.members.plates ?? []).map((q) => modelStore.plates.get(q)?.nodes ?? [])].some((ns) => ns.some((n) => arcNodes.has(n))));
  let result: ReturnType<typeof remakeArcNow> = null;
  modelStore.batch(() => {
    for (const pl of onArc) clearPlateMesh(pl.id);
    result = remakeArcNow(arcId, change);
  });
  const r = result as ReturnType<typeof remakeArcNow>;
  return r ? { ...r, platesCleared: onArc.length } : null;
}

function remakeArcNow(arcId: number, change: ArcRemake): { members: number[]; droppedLoads: number; keptNodes: number } | null {
  const ids = arcMembers(modelStore.model as never, arcId);
  if (!ids.length) return null;
  const p = pieceOf(modelStore.model as never, ids[0]!);
  if (!p) return null;
  const first = modelStore.elements.get(p.segments[0]!.elementId)!;
  const last = modelStore.elements.get(p.segments[p.segments.length - 1]!.elementId)!;
  const spec0 = first.arc!.spec;
  const pos = (n: number): Vec3 => { const x = modelStore.nodes.get(n)!; return { x: x.x, y: x.y, z: x.z ?? 0 }; };
  const spec: ArcSpec = {
    start: pos(p.start), end: pos(p.end),
    through: change.through ?? spec0.through,
    segments: Math.max(1, Math.min(64, Math.round(change.segments ?? spec0.segments))),
  };
  const keep = {
    type: first.type, materialId: first.materialId, sectionId: first.sectionId,
    releaseI: p.segments[0]!.reversed ? first.releaseJ : first.releaseI,
    releaseJ: p.segments[p.segments.length - 1]!.reversed ? last.releaseI : last.releaseJ,
  };
  const droppedLoads = arcHandLoads(arcId);
  const interior = new Set(ids.flatMap((id) => { const e = modelStore.elements.get(id)!; return [e.nodeI, e.nodeJ]; }));
  interior.delete(p.start); interior.delete(p.end);
  let made: number[] = [];
  let keptNodes = 0;
  modelStore.batch(() => {
    for (const id of ids) modelStore.removeElement(id);
    for (const n of interior) {
      if (!modelStore.nodes.has(n)) continue;
      if (nodeHeld(n)) { keptNodes++; continue; }
      modelStore.removeNode(n);
    }
    made = buildArc(spec, {
      addNode: (x, y, z) => modelStore.addNode(x, y, z),
      nodeAt: nodeAtPoint,
      addElement: (i, j) => modelStore.addElement(i, j, keep.type === 'truss' ? 'truss' : 'frame'),
      setLocalY: (id, v) => modelStore.updateElementLocalY(id, v.x, v.y, v.z),
      nodePosition: posOf,
      tag: (elementId, tag) => modelStore.updateElement(elementId, { arc: { id: arcId, spec: tag.spec, axes: 1 } } as never),
    }, arcId, p.start, p.end);
    for (const id of made) modelStore.updateElement(id, { materialId: keep.materialId, sectionId: keep.sectionId } as never);
    if (made.length) {
      if (keep.releaseI) modelStore.updateElement(made[0]!, { releaseI: keep.releaseI } as never);
      if (keep.releaseJ) modelStore.updateElement(made[made.length - 1]!, { releaseJ: keep.releaseJ } as never);
    }
  });
  return { members: made, droppedLoads, keptNodes };
}

function nodeHeld(n: number): boolean {
  for (const e of modelStore.elements.values()) if (e.nodeI === n || e.nodeJ === n) return true;
  for (const q of modelStore.quads.values()) if (q.nodes.includes(n)) return true;
  for (const q of modelStore.plates.values()) if (q.nodes.includes(n)) return true;
  for (const s of modelStore.supports.values()) if (s.nodeId === n) return true;
  for (const l of modelStore.loads) if ((l.data as { nodeId?: number }).nodeId === n) return true;
  for (const g of modelStore.model.groups.values()) if (g.members.nodes?.includes(n)) return true;
  return false;
}

/** The piece the selection is, when it is exactly the members of one piece of two or more. */
export function selectedPiece(): Piece | null {
  const sel = [...uiStore.selectedElements];
  if (sel.length < 2) return null;
  const p = piece(sel[0]!);
  if (!p || p.segments.length !== sel.length) return null;
  const set = new Set(sel);
  return p.segments.every((s) => set.has(s.elementId)) ? p : null;
}
