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
import { wallBase, wallStripAnchors } from './wall-strip';
import { wallFoundation } from './wall-foundation';
import { modelStore } from '../../store/model.svelte';
import type { Footing } from '../footing';
import type { PhysicalData } from '../physical/types';
import { levelAt } from '../physical/recognize';
import { declare, nextName } from '../building/declare';
import { sheetAnchors } from './sheet-anchors';
import { axisAnchors, inwardFooting, type PropertyLines } from './support-axes';

export type { PropertyLines };

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
  if (sheetAnchors) return sheetAnchors(nodeIds, lines);
  return axisAnchors(nodeIds.flatMap(id => {
    const point = modelStore.nodes.get(id);
    return point ? [point] : [];
  }), lines);
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
  return wallBase(modelStore.model, g, () => wallFoundation?.outline(g) ?? []);
}

/** A wall stood on the ground: its base nodes fixed where they have no support, and its base held all along with every mesh. A model step. */
export function supportWallBase(wallGroupId: number): number {
  const base = wallBaseNodes(wallGroupId);
  if (!base.length) return 0;
  const existing = new Set([...modelStore.supports.values()].map(s => s.nodeId));
  if (!wallFoundation && base.every(node => existing.has(node))) return 0;
  const before = modelStore.supports.size;
  modelStore.batch(() => {
    wallFoundation?.hold(wallGroupId, modelStore.nodes.get(base[0]!)!.z ?? 0);
    const held = new Set([...modelStore.supports.values()].map(s => s.nodeId));
    for (const n of base) if (!held.has(n)) modelStore.addSupport(n, 'fixed3d');
  });
  return modelStore.supports.size - before;
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
  const anchors = wallStripAnchors(modelStore.model, wallGroupId, sorted.map(point => point.id));
  let id: number | null = null;
  modelStore.batchFoundation(() => {
    id = modelStore.addFooting(sorted[0]!.id);
    modelStore.updateFooting(id, {
      kind: 'strip', thickness, wallGroupId, rotationDeg: (Math.atan2(sorted.at(-1)!.y - sorted[0]!.y, sorted.at(-1)!.x - sorted[0]!.x) * 180) / Math.PI,
      supportedNodeIds: anchors.slice(1),
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
  const pts = fs.map((g) => ({ id: g.id, nodeId: g.nodeId, x: P(g.nodeId).x, y: P(g.nodeId).y }));
  for (const f of fs) {
    const [ax, ay] = f.anchor ?? [0, 0];
    const p = pts.find((q) => q.id === f.id)!;
    for (const dir of [[ax, 0], [0, ay]] as Array<[number, number]>) {
      if (!dir[0] && !dir[1]) continue;
      const best = inwardFooting(p, dir, pts);
      if (best && !out.some((s) => (s.a === f.nodeId && s.b === best.nodeId) || (s.b === f.nodeId && s.a === best.nodeId))) out.push({ a: f.nodeId, b: best.nodeId, kind: 'strap' });
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
      // A strap balances the footing it leaves: its design reads it so (`strap-footing.ts`).
      if (p.kind === 'strap') {
        const fs = [...modelStore.model.footings.values()];
        const f = fs.find((x) => x.nodeId === p.a), g = fs.find((x) => x.nodeId === p.b);
        const sec = modelStore.model.sections.get(o.sectionId);
        if (f && g && !f.straps?.some((x) => x.toFootingId === g.id)) modelStore.updateFooting(f.id, { straps: [...(f.straps ?? []), { toFootingId: g.id, ...(sec?.b ? { b: sec.b } : {}), ...(sec?.h ? { h: sec.h } : {}) }] });
      }
      n++;
    }
  });
  return n;
}

