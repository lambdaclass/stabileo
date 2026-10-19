/**
 * Footings and foundation beams placed as the other elements are.
 *
 * Footings go under the supported nodes that have none, held centred, or against a property line
 * or a corner where the building meets the sides said to be property lines. Two or more columns
 * can share a combined footing, and a wall stands on a strip. Tie beams join footings within a
 * distance, each footing to its nearest neighbours in directions at least an angle apart (the
 * visibility angle), so a tie never runs alongside another from the same footing. A footing held
 * at a property line gets a strap beam to the nearest footing inwards.
 *
 * Footings go on the foundation undo channel, which keeps the solve. Beams are bars between the
 * footings' nodes and change the model, so placing them is a model undo step.
 */
import { modelStore } from '../../store/model.svelte';
import type { Footing } from '../footing';
import type { PhysicalData } from '../physical/types';
import { levelAt } from '../physical/recognize';
import { declare, nextName } from '../building/declare';

export type PropertyLines = { minX?: boolean; maxX?: boolean; minY?: boolean; maxY?: boolean };

const TOL = 1e-3;

/** The supported nodes, and those of them with no footing yet. */
export function supportedNodes(): { all: number[]; bare: number[] } {
  const all = [...new Set([...modelStore.supports.values()].map((s) => s.nodeId))].filter((id) => modelStore.nodes.has(id));
  const held = new Set<number>();
  for (const f of modelStore.model.footings.values()) { held.add(f.nodeId); for (const n of f.supportedNodeIds ?? []) held.add(n); }
  return { all, bare: all.filter((id) => !held.has(id)) };
}

/** The column standing on a node: the bar from it that rises most steeply. */
export function columnOn(nodeId: number): number | undefined {
  let best: { id: number; s: number } | undefined;
  const n = modelStore.nodes.get(nodeId);
  if (!n) return undefined;
  for (const e of modelStore.elements.values()) {
    if (e.nodeI !== nodeId && e.nodeJ !== nodeId) continue;
    const o = modelStore.nodes.get(e.nodeI === nodeId ? e.nodeJ : e.nodeI);
    if (!o) continue;
    const dz = (o.z ?? 0) - (n.z ?? 0), h = Math.hypot(o.x - n.x, o.y - n.y);
    const s = dz / (h + 1e-9);
    if (dz > 0 && s > 2 && (!best || s > best.s)) best = { id: e.id, s };
  }
  return best?.id;
}

/** Where each node's footing is held: against the property lines it stands on, inward. */
export function anchorsFor(nodeIds: number[], lines: PropertyLines): Map<number, [number, number]> {
  const pts = nodeIds.map((id) => modelStore.nodes.get(id)!).filter(Boolean);
  const out = new Map<number, [number, number]>();
  if (pts.length === 0) return out;
  const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
  for (const p of pts) {
    const ax = lines.minX && Math.abs(p.x - minX) < TOL ? -1 : lines.maxX && Math.abs(p.x - maxX) < TOL ? 1 : 0;
    const ay = lines.minY && Math.abs(p.y - minY) < TOL ? -1 : lines.maxY && Math.abs(p.y - maxY) < TOL ? 1 : 0;
    out.set(p.id, [ax, ay]);
  }
  return out;
}

/** Footings under the nodes given, one each, in one undo step. Returns their ids. */
export function placeFootings(nodeIds: number[], o: {
  kind: 'isolated' | 'pileCap'; thickness: number; anchors?: Map<number, [number, number]>;
  piles?: Footing['piles'];
}): number[] {
  const ids: number[] = [];
  modelStore.batchFoundation(() => {
    for (const nodeId of nodeIds) {
      const id = modelStore.addFooting(nodeId);
      const col = columnOn(nodeId);
      const anchor = o.anchors?.get(nodeId);
      modelStore.updateFooting(id, {
        kind: o.kind, thickness: o.thickness,
        ...(col !== undefined ? { columnElementId: col } : {}),
        ...(anchor && (anchor[0] || anchor[1]) ? { anchor } : {}),
        ...(o.kind === 'pileCap' && o.piles ? { piles: { ...o.piles } } : {}),
      });
      ids.push(id);
    }
  });
  return ids;
}

/** One combined footing under these nodes, in place of the footings each had. */
export function combineFootings(nodeIds: number[], thickness: number): number | null {
  if (nodeIds.length < 2) return null;
  let id: number | null = null;
  modelStore.batchFoundation(() => {
    for (const f of [...modelStore.model.footings.values()]) {
      if (nodeIds.includes(f.nodeId) || f.supportedNodeIds?.some((n) => nodeIds.includes(n))) modelStore.removeFooting(f.id);
    }
    id = modelStore.addFooting(nodeIds[0]!);
    const col = columnOn(nodeIds[0]!);
    modelStore.updateFooting(id, { kind: 'combined', thickness, supportedNodeIds: nodeIds.slice(1), ...(col !== undefined ? { columnElementId: col } : {}) });
  });
  return id;
}

/** The nodes along a wall's base, those of its lowest edge. */
export function wallBaseNodes(wallGroupId: number): number[] {
  const g = modelStore.model.groups.get(wallGroupId);
  if (!g) return [];
  const nodes = new Set<number>();
  for (const q of g.members.quads ?? []) for (const n of modelStore.quads.get(q)?.nodes ?? []) nodes.add(n);
  for (const p of g.members.plates ?? []) for (const n of modelStore.plates.get(p)?.nodes ?? []) nodes.add(n);
  const pts = [...nodes].map((id) => modelStore.nodes.get(id)!).filter(Boolean);
  if (pts.length === 0) return [];
  const zMin = Math.min(...pts.map((p) => p.z ?? 0));
  return pts.filter((p) => Math.abs((p.z ?? 0) - zMin) < TOL).map((p) => p.id);
}

/** A wall stood on the ground: its base nodes fixed where they have no support. A model step. */
export function supportWallBase(wallGroupId: number): number {
  const held = new Set([...modelStore.supports.values()].map((s) => s.nodeId));
  const add = wallBaseNodes(wallGroupId).filter((n) => !held.has(n));
  if (add.length) modelStore.batch(() => { for (const n of add) modelStore.addSupport(n, 'fixed3d'); });
  return add.length;
}

/** A strip footing under a wall: along its base, carrying every node of it. */
export function stripUnderWall(wallGroupId: number, thickness: number): number | null {
  const base = wallBaseNodes(wallGroupId).map((id) => modelStore.nodes.get(id)!);
  if (base.length < 2) return null;
  // Along the wall, from one end.
  const a = base[0]!, far = base.reduce((f, p) => (Math.hypot(p.x - a.x, p.y - a.y) > Math.hypot(f.x - a.x, f.y - a.y) ? p : f), a);
  const th = Math.atan2(far.y - a.y, far.x - a.x);
  const along = (p: { x: number; y: number }) => (p.x - a.x) * Math.cos(th) + (p.y - a.y) * Math.sin(th);
  const sorted = [...base].sort((p, q) => along(p) - along(q));
  let id: number | null = null;
  modelStore.batchFoundation(() => {
    id = modelStore.addFooting(sorted[0]!.id);
    modelStore.updateFooting(id, {
      kind: 'strip', thickness, wallGroupId, rotationDeg: (Math.atan2(sorted.at(-1)!.y - sorted[0]!.y, sorted.at(-1)!.x - sorted[0]!.x) * 180) / Math.PI,
      supportedNodeIds: sorted.slice(1).map((p) => p.id),
    });
  });
  return id;
}

// ─── Foundation beams ─────────────────────────────────────────────

export interface BeamProposal { a: number; b: number; kind: 'tie' | 'strap' }

const footingNodes = () => [...modelStore.model.footings.values()].map((f) => f.nodeId);

/**
 * Ties between footings within `maxDistance`: each footing to its nearest neighbours, a new tie
 * kept only when its direction is at least `visibilityDeg` from the ties that footing already has.
 * Pairs already joined by a bar are left.
 */
export function proposeTies(maxDistance: number, visibilityDeg: number): BeamProposal[] {
  const ids = [...new Set(footingNodes())];
  const P = (id: number) => modelStore.nodes.get(id)!;
  const joined = new Set([...modelStore.elements.values()].map((e) => [e.nodeI, e.nodeJ].sort((x, y) => x - y).join('-')));
  const dirs = new Map<number, number[]>();
  const out: BeamProposal[] = [];
  const key = (a: number, b: number) => [a, b].sort((x, y) => x - y).join('-');
  const taken = new Set<string>();
  const angleOf = (a: number, b: number) => Math.atan2(P(b).y - P(a).y, P(b).x - P(a).x);
  const apart = (list: number[], th: number) => list.every((t) => {
    let d = Math.abs(t - th) % (2 * Math.PI);
    if (d > Math.PI) d = 2 * Math.PI - d;
    return d >= (visibilityDeg * Math.PI) / 180 - 1e-9;
  });
  const pairs: Array<{ a: number; b: number; d: number }> = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i]!, b = ids[j]!;
    if (Math.abs((P(a).z ?? 0) - (P(b).z ?? 0)) > TOL) continue;
    const d = Math.hypot(P(a).x - P(b).x, P(a).y - P(b).y);
    if (d > TOL && d <= maxDistance + 1e-9) pairs.push({ a, b, d });
  }
  pairs.sort((p, q) => p.d - q.d || p.a - q.a || p.b - q.b);
  for (const { a, b } of pairs) {
    const k = key(a, b);
    if (taken.has(k) || joined.has(k)) continue;
    const ta = angleOf(a, b), tb = angleOf(b, a);
    if (!apart(dirs.get(a) ?? [], ta) || !apart(dirs.get(b) ?? [], tb)) continue;
    taken.add(k);
    (dirs.get(a) ?? dirs.set(a, []).get(a)!).push(ta);
    (dirs.get(b) ?? dirs.set(b, []).get(b)!).push(tb);
    out.push({ a, b, kind: 'tie' });
  }
  return out;
}

/** A strap beam from each footing held at a property line to the nearest footing inwards. */
export function proposeStraps(): BeamProposal[] {
  const fs = [...modelStore.model.footings.values()];
  const P = (id: number) => modelStore.nodes.get(id)!;
  const out: BeamProposal[] = [];
  for (const f of fs) {
    const [ax, ay] = f.anchor ?? [0, 0];
    for (const [dx, dy] of [[ax, 0], [0, ay]] as Array<[number, number]>) {
      if (!dx && !dy) continue;
      const p = P(f.nodeId);
      // Inwards is away from the property line: the footing's centre lies that way.
      const inward = [-dx, -dy];
      let best: { id: number; d: number } | null = null;
      for (const g of fs) {
        if (g.id === f.id) continue;
        const q = P(g.nodeId);
        const v = [q.x - p.x, q.y - p.y], d = Math.hypot(v[0]!, v[1]!);
        if (d < TOL) continue;
        const cos = (v[0]! * inward[0]! + v[1]! * inward[1]!) / d;
        if (cos > Math.cos(Math.PI / 12) && (!best || d < best.d)) best = { id: g.nodeId, d };
      }
      if (best && !out.some((s) => (s.a === f.nodeId && s.b === best!.id) || (s.b === f.nodeId && s.a === best!.id))) out.push({ a: f.nodeId, b: best.id, kind: 'strap' });
    }
  }
  return out;
}

/** The beams proposed, as bars between the footings' nodes and foundation beam elements. */
export function placeFoundationBeams(list: BeamProposal[], o: { sectionId: number; materialId: number }): number {
  const levels = modelStore.grid?.levels ?? [];
  const names = nextName('VF');
  let n = 0;
  modelStore.batch(() => {
    for (const p of list) {
      if ([...modelStore.elements.values()].some((e) => (e.nodeI === p.a && e.nodeJ === p.b) || (e.nodeI === p.b && e.nodeJ === p.a))) continue;
      const id = modelStore.addElement(p.a, p.b, 'frame');
      modelStore.updateElementSection(id, o.sectionId);
      modelStore.updateElementMaterial(id, o.materialId);
      const lv = levelAt(modelStore.nodes.get(p.a)?.z ?? 0, levels);
      declare(names(), { elements: [id] }, { kind: 'beam', provenance: 'declared', typology: p.kind === 'strap' ? 'strap' : 'tie', levelFrom: lv, levelTo: lv } satisfies PhysicalData);
      n++;
    }
  });
  return n;
}

