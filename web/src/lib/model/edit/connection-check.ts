/**
 * What an edit left touching without being connected, and the connection.
 *
 * A node dropped on another node, a node dropped on a member, a member drawn
 * across others or over a node: each analyses as two parts passing through
 * each other, which is sometimes meant (two frames that touch, a brace that
 * crosses a column in another plane) and usually not. The editor asks right
 * after the edit; these find what to ask about and make the connection with
 * the commands the model already has (cut-members, cleanup), so every load
 * and property follows their rules.
 *
 * The finders only read. The connectors edit, inside whatever undo step the
 * caller runs them in.
 */
import { modelStore } from '../../store/model.svelte';
import { crossing, intersectMembers, splitAtNodes, CUT_TOL } from './cut-members';
import { mergeNodesInto, removeDuplicateMembers, removeZeroLengthMembers, MERGE_TOL } from './cleanup';

type Vec3 = [number, number, number];
const v = (n: { x: number; y: number; z?: number }): Vec3 => [n.x, n.y, n.z ?? 0];
const END_T = 1e-6;

function ends(elementId: number): { a: Vec3; b: Vec3; i: number; j: number } | null {
  const e = modelStore.elements.get(elementId);
  if (!e) return null;
  const ni = modelStore.nodes.get(e.nodeI), nj = modelStore.nodes.get(e.nodeJ);
  return ni && nj ? { a: v(ni), b: v(nj), i: e.nodeI, j: e.nodeJ } : null;
}

/** Where p lies along a→b (t) and how far it is from that line. */
function along(a: Vec3, b: Vec3, p: Vec3): { t: number; dist: number } {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  if (!(L2 > 0)) return { t: NaN, dist: Infinity };
  const t = ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2;
  return { t, dist: Math.hypot(a[0] + t * ab[0] - p[0], a[1] + t * ab[1] - p[1], a[2] + t * ab[2] - p[2]) };
}

/** Another node at the same place as `nodeId`, if any (lowest id). */
export function nodeCoincidentWith(nodeId: number, tol = MERGE_TOL): number | null {
  const n = modelStore.nodes.get(nodeId);
  if (!n) return null;
  let found: number | null = null;
  for (const o of modelStore.nodes.values()) {
    if (o.id === nodeId) continue;
    if (Math.hypot(o.x - n.x, o.y - n.y, (o.z ?? 0) - (n.z ?? 0)) <= tol && (found === null || o.id < found)) found = o.id;
  }
  return found;
}

/** Members that `nodeId` lies on, away from their ends, without being one of their ends. */
export function membersThroughNode(nodeId: number): number[] {
  const n = modelStore.nodes.get(nodeId);
  if (!n) return [];
  const p = v(n);
  const out: number[] = [];
  for (const e of modelStore.elements.values()) {
    if (e.nodeI === nodeId || e.nodeJ === nodeId) continue;
    const s = ends(e.id);
    if (!s) continue;
    const { t, dist } = along(s.a, s.b, p);
    if (dist <= CUT_TOL && t > END_T && t < 1 - END_T) out.push(e.id);
  }
  return out;
}

/** Nodes lying on `elementId`, away from its ends. */
export function nodesOnMember(elementId: number): number[] {
  const s = ends(elementId);
  if (!s) return [];
  const out: number[] = [];
  for (const n of modelStore.nodes.values()) {
    if (n.id === s.i || n.id === s.j) continue;
    const { t, dist } = along(s.a, s.b, v(n));
    if (dist <= CUT_TOL && t > END_T && t < 1 - END_T) out.push(n.id);
  }
  return out;
}

/** Members crossing `elementId` away from both members' ends, without sharing a node with it. */
export function membersCrossing(elementId: number): number[] {
  const s = ends(elementId);
  if (!s) return [];
  const out: number[] = [];
  for (const e of modelStore.elements.values()) {
    if (e.id === elementId) continue;
    if (e.nodeI === s.i || e.nodeI === s.j || e.nodeJ === s.i || e.nodeJ === s.j) continue;
    const o = ends(e.id);
    if (!o) continue;
    const c = crossing(s.a, s.b, o.a, o.b);
    if (c && c.s > END_T && c.s < 1 - END_T && c.t > END_T && c.t < 1 - END_T) out.push(e.id);
  }
  return out;
}

/** Join `nodeId` into `targetId`: everything on it moves to the target. Members left with both ends there, or doubled, go. */
export function joinNodes(nodeId: number, targetId: number): { droppedSupports: number } {
  let droppedSupports = 0;
  modelStore.batch(() => {
    droppedSupports = mergeNodesInto(new Map([[nodeId, targetId]])).droppedSupports;
    removeZeroLengthMembers();
    removeDuplicateMembers();
  });
  return { droppedSupports };
}

/** Cut every member `nodeId` lies on there, so it connects to them. */
export function connectNodeToMembers(nodeId: number): void {
  splitAtNodes(membersThroughNode(nodeId), [nodeId]);
}

/** Cut `elementId` and the members it crosses at each crossing, and cut it at the nodes lying on it. */
export function connectMember(elementId: number): void {
  modelStore.batch(() => {
    const crossed = membersCrossing(elementId);
    const on = nodesOnMember(elementId);
    let segments = [elementId];
    if (crossed.length) {
      const r = intersectMembers([elementId, ...crossed]);
      segments = r.cut.find((c) => c.elementId === elementId)?.segments ?? segments;
    }
    if (on.length) splitAtNodes(segments, on);
  });
}
