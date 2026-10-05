/**
 * Cutting members where the model says they meet something: at nodes lying on them, and where
 * they cross each other.
 *
 * A node drawn on a beam is not connected to it. Neither is a brace that crosses a column. Both
 * analyse as if the two passed through each other without touching, which is sometimes intended
 * and usually not — and nothing on screen tells the two apart. These commands make the
 * connection explicit by cutting the member there, through `splitMember`, so every load and
 * property is carried by the rules in `member-split.ts`.
 *
 * Each command is one undo step.
 */

import { modelStore } from '../../store/model.svelte';
import { nodesOnMembers } from '../../engine/nodes-on-members';
import { variableCutRefused } from '../../section/variable';
import { dot, type Vec3 } from './affine';
import { tp } from '../../i18n';

/** Positions closer than this are the same point, m. */
export const CUT_TOL = 1e-4;
/** A cut this close to a member end is at the end, as a fraction of its length. */
const END_T = 1e-6;

type N = { x: number; y: number; z?: number };
const v = (n: N): Vec3 => [n.x, n.y, n.z ?? 0];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export interface CutReport {
  /** Members cut, with the segments each became. */
  cut: Array<{ elementId: number; segments: number[] }>;
  /** Nodes created at crossings. */
  nodes: number[];
  /** Cut members whose reinforcement was dropped. */
  reinforcementDropped: number;
  /** Members of variable section left whole: no section can name their cuts (`variableCutRefused`). */
  variableNotCut: number;
}

function applyCuts(cuts: Map<number, number[]>): CutReport {
  const report: CutReport = { cut: [], nodes: [], reinforcementDropped: 0, variableNotCut: 0 };
  const before = new Set(modelStore.nodes.keys());
  modelStore.batch(() => {
    for (const [elementId, ts] of cuts) {
      const unique = [...new Set(ts.map((t) => Math.round(t / 1e-9) * 1e-9))].sort((a, b) => a - b);
      const r = modelStore.splitMember(elementId, unique, { reuseNodeTol: CUT_TOL });
      if (!r) {
        const e = modelStore.elements.get(elementId);
        if (e && variableCutRefused(modelStore.sections, e)) report.variableNotCut++;
        continue;
      }
      report.cut.push({ elementId, segments: r.segmentIds });
      if (r.droppedReinforcement) report.reinforcementDropped++;
    }
  });
  for (const id of modelStore.nodes.keys()) if (!before.has(id)) report.nodes.push(id);
  return report;
}

/**
 * Cut each of `elementIds` at every node of `nodeIds` (all nodes when omitted) that lies on it,
 * away from its ends. The node is reused: the member now connects to it.
 */
export function splitAtNodes(elementIds: Iterable<number>, nodeIds?: Iterable<number>): CutReport {
  const cuts = new Map<number, number[]>();
  const hits = nodesOnMembers(modelStore.nodes, modelStore.elements.values(), {
    elementIds: new Set(elementIds), ...(nodeIds ? { nodeIds } : {}), tol: CUT_TOL,
  });
  for (const h of hits) (cuts.get(h.elementId) ?? cuts.set(h.elementId, []).get(h.elementId)!).push(h.t);
  return applyCuts(cuts);
}

/**
 * Where two segments pass within `tol` of each other, the parameter on each, or null.
 *
 * The closest points of two lines; parallel segments never cross at a point and are left to
 * the overlap check.
 */
export function crossing(a0: Vec3, a1: Vec3, b0: Vec3, b1: Vec3, tol = CUT_TOL): { s: number; t: number } | null {
  const u = sub(a1, a0), w = sub(b1, b0), r = sub(a0, b0);
  const A = dot(u, u), B = dot(u, w), C = dot(w, w), D = dot(u, r), E = dot(w, r);
  const den = A * C - B * B;
  if (den <= 1e-12 * A * C) return null;
  const s = (B * E - C * D) / den, t = (A * E - B * D) / den;
  if (s < -END_T || s > 1 + END_T || t < -END_T || t > 1 + END_T) return null;
  const p: Vec3 = [a0[0] + s * u[0], a0[1] + s * u[1], a0[2] + s * u[2]];
  const q: Vec3 = [b0[0] + t * w[0], b0[1] + t * w[1], b0[2] + t * w[2]];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) <= tol ? { s, t } : null;
}

/**
 * Every pair of the given members that cross without sharing an end node, with where on each
 * (0…1). With an anchor, only the pairs that member is in. Swept on x so a few thousand members
 * are not compared pairwise.
 */
export function crossingPairs(elementIds: Iterable<number>, anchorId?: number): Array<{ a: number; b: number; s: number; t: number }> {
  const ids = [...new Set(elementIds)].filter((id) => modelStore.elements.has(id));
  const seg = new Map(ids.map((id) => {
    const e = modelStore.elements.get(id)!;
    return [id, { a: v(modelStore.nodes.get(e.nodeI)!), b: v(modelStore.nodes.get(e.nodeJ)!), e }];
  }));
  const out: Array<{ a: number; b: number; s: number; t: number }> = [];
  const pair = (a: number, b: number) => {
    const P = seg.get(a)!, Q = seg.get(b)!;
    if ([P.e.nodeI, P.e.nodeJ].some((n) => n === Q.e.nodeI || n === Q.e.nodeJ)) return;
    const c = crossing(P.a, P.b, Q.a, Q.b);
    if (c) out.push({ a, b, s: c.s, t: c.t });
  };
  if (anchorId !== undefined) {
    if (seg.has(anchorId)) for (const id of ids) if (id !== anchorId) pair(anchorId, id);
    return out;
  }
  const order = ids.map((id) => ({ id, lo: Math.min(seg.get(id)!.a[0], seg.get(id)!.b[0]), hi: Math.max(seg.get(id)!.a[0], seg.get(id)!.b[0]) }))
    .sort((p, q) => p.lo - q.lo);
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length && order[j]!.lo <= order[i]!.hi + CUT_TOL; j++) pair(order[i]!.id, order[j]!.id);
  }
  return out;
}

/**
 * Cut the given members wherever two of them cross, so they share a node there.
 * With an anchor, only cut crossings involving that member.
 *
 * A crossing at a member's END already has a node on that member and only cuts the other one;
 * two members meeting end to end are not a crossing at all.
 */
export function intersectMembers(elementIds: Iterable<number>, anchorId?: number): CutReport {
  const cuts = new Map<number, number[]>();
  const push = (id: number, t: number) => { if (t > END_T && t < 1 - END_T) (cuts.get(id) ?? cuts.set(id, []).get(id)!).push(t); };
  // All the cuts are gathered before any split: the anchor may cross several members.
  for (const c of crossingPairs(elementIds, anchorId)) { push(c.a, c.s); push(c.b, c.t); }
  return applyCuts(cuts);
}

/**
 * Cut every member at the nodes on it, as one undoable edit, and say what was done.
 *
 * What the solve's "disconnected structure" message offers with one click: the same command as
 * Edit › Cut › "Split at the nodes on them" over the whole model.
 */
export function splitAllAtNodes(): { report: CutReport; message: string } {
  let report!: CutReport;
  modelStore.batch(() => { report = splitAtNodes([...modelStore.elements.keys()]); });
  const message = [
    tp('edit.cutDone', { n: report.cut.length, segments: report.cut.reduce((s, c) => s + c.segments.length, 0), nodes: report.nodes.length }),
    report.reinforcementDropped > 0 ? tp('edit.reinforcementDropped', { n: report.reinforcementDropped }) : '',
  ].filter(Boolean).join(' ');
  return { report, message };
}
