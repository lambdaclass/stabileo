/**
 * Merge chains of collinear members into one member each — the inverse of cutting.
 *
 * A beam split at every joist is analysed correctly, but it is forty members where the engineer
 * sees one, and its design and drawings are forty short pieces. Merging makes it one again.
 *
 * ── When two members may merge through a node ──────────────────────
 *
 * Only when the node is nothing but the place they meet, and the two are one member already in
 * everything but name:
 *
 *   · the node has exactly these two members and nothing else — no third member, no shell corner,
 *     no support, no nodal load, no constraint, connector or footing. Removing it must lose
 *     nothing;
 *   · they are collinear and drawn head to tail, so the merged member's I→J is theirs;
 *   · same type, material and section, and the same local frame (same explicit reference and roll);
 *   · no release, joint or offset at the shared ends — an interior hinge is a structure, not a
 *     drawing artefact.
 *
 * A pair that fails any of these is left as it is, and counted.
 *
 * ── What the merged member carries ────────────────────────────────
 *
 * Its I end is the first segment's, its J end the last's — releases, joints and offsets included.
 * Loads are re-measured from the new node I: a load on segment k at a becomes a load at s_k + a.
 * A thermal load becomes one only when every segment carries the same one; otherwise the chain is
 * not merged, because a partial thermal load cannot be stated. Groups that held any segment hold
 * the merged member. Reinforcement is dropped, as in a split.
 *
 * One undo step.
 */

import { modelStore } from '../../store/model.svelte';
import type { Element, Load } from '../../store/model.svelte';
import { dot, type Vec3 } from './affine';

const ANGLE_TOL = 1e-6;

export interface MergeReport {
  /** The member each merged chain became, and how many it absorbed. */
  merged: Array<{ elementId: number; absorbed: number }>;
  /** Nodes removed. */
  removedNodes: number;
  /** Shared nodes where two collinear members could NOT merge, and why. */
  refused: Partial<Record<RefuseReason, number>>;
  reinforcementDropped: number;
}

export type RefuseReason = 'nodeBusy' | 'differentProperties' | 'endConditions' | 'reversed' | 'thermal';

type N = { x: number; y: number; z?: number };
const pv = (n: N): Vec3 => [n.x, n.y, n.z ?? 0];

function direction(e: Element): Vec3 {
  const a = pv(modelStore.nodes.get(e.nodeI)!), b = pv(modelStore.nodes.get(e.nodeJ)!);
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(...d);
  return [d[0] / L, d[1] / L, d[2] / L];
}
const lengthOf = (e: Element) => {
  const a = pv(modelStore.nodes.get(e.nodeI)!), b = pv(modelStore.nodes.get(e.nodeJ)!);
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
};
const released = (r: Element['releaseI']) => !!r && (r.my || r.mz || r.t || !!r.slide);

/** Every node a constraint ties, whatever its kind. */
function constraintNodes(c: unknown): number[] {
  const x = c as { masterNode?: number; slaveNode?: number; slaveNodes?: number[]; terms?: Array<{ nodeId: number }> };
  return [x.masterNode, x.slaveNode, ...(x.slaveNodes ?? []), ...(x.terms ?? []).map((t) => t.nodeId)]
    .filter((n): n is number => typeof n === 'number');
}

/** Everything that makes a node more than the meeting point of two members. */
function nodeIsBusy(nodeId: number): boolean {
  let members = 0;
  for (const e of modelStore.elements.values()) if (e.nodeI === nodeId || e.nodeJ === nodeId) members++;
  if (members !== 2) return true;
  if ([...modelStore.supports.values()].some((s) => s.nodeId === nodeId)) return true;
  if ([...modelStore.quads.values()].some((q) => q.nodes.includes(nodeId))) return true;
  if ([...modelStore.plates.values()].some((p) => p.nodes.includes(nodeId))) return true;
  if (modelStore.loads.some((l) => (l.data as { nodeId?: number }).nodeId === nodeId)) return true;
  if ([...(modelStore.model.connectors?.values() ?? [])].some((c) => c.nodeI === nodeId || c.nodeJ === nodeId)) return true;
  if ((modelStore.model.constraints ?? []).some((c) => constraintNodes(c).includes(nodeId))) return true;
  if ([...(modelStore.model.footings?.values() ?? [])].some((f) => f.nodeId === nodeId)) return true;
  return false;
}

/** Why two collinear, head-to-tail members may not merge, or null. */
function whyNot(a: Element, b: Element): RefuseReason | null {
  if (a.type !== b.type || a.materialId !== b.materialId || a.sectionId !== b.sectionId) return 'differentProperties';
  if (a.localYx !== b.localYx || a.localYy !== b.localYy || a.localYz !== b.localYz || (a.rollAngle ?? 0) !== (b.rollAngle ?? 0)) return 'differentProperties';
  if (released(a.releaseJ) || released(b.releaseI) || a.jointJ || b.jointI || a.offset?.j || b.offset?.i) return 'endConditions';
  return null;
}

function thermalKey(elementId: number): string {
  return modelStore.loads.filter((l) => l.type === 'thermal' && (l.data as { elementId: number }).elementId === elementId)
    .map((l) => { const d = l.data as { dtUniform: number; dtGradient: number; caseId?: number }; return `${d.caseId ?? 1}:${d.dtUniform}:${d.dtGradient}`; })
    .sort().join('|');
}

export function mergeCollinear(elementIds: Iterable<number>): MergeReport {
  const report: MergeReport = { merged: [], removedNodes: 0, refused: {}, reinforcementDropped: 0 };
  const refuse = (r: RefuseReason) => { report.refused[r] = (report.refused[r] ?? 0) + 1; };
  const pool = new Set([...elementIds].filter((id) => modelStore.elements.has(id)));

  // Chains, head to tail, through mergeable nodes only.
  const byStart = new Map<number, number>(), byEnd = new Map<number, number>();
  for (const id of pool) { const e = modelStore.elements.get(id)!; byStart.set(e.nodeI, id); byEnd.set(e.nodeJ, id); }
  const next = (id: number): number | null => {
    const e = modelStore.elements.get(id)!;
    const cand = byStart.get(e.nodeJ);
    if (cand === undefined || cand === id) {
      // A collinear neighbour drawn the other way is not merged; say so.
      for (const other of pool) {
        const o = modelStore.elements.get(other)!;
        if (other !== id && o.nodeJ === e.nodeJ && 1 + dot(direction(e), direction(o)) < ANGLE_TOL) { refuse('reversed'); break; }
      }
      return null;
    }
    const f = modelStore.elements.get(cand)!;
    // Not collinear: a corner, not a refusal.
    if (1 - dot(direction(e), direction(f)) > ANGLE_TOL) return null;
    const why = whyNot(e, f) ?? (nodeIsBusy(e.nodeJ) ? 'nodeBusy' : null) ?? (thermalKey(e.id) !== thermalKey(f.id) ? 'thermal' : null);
    if (why) { refuse(why); return null; }
    return cand;
  };
  const hasPrev = new Set<number>();
  const links = new Map<number, number>();
  for (const id of pool) { const n = next(id); if (n !== null) { links.set(id, n); hasPrev.add(n); } }
  const chains: number[][] = [];
  for (const id of pool) {
    if (hasPrev.has(id) || !links.has(id)) continue;
    const chain = [id];
    let cur = id;
    while (links.has(cur)) { cur = links.get(cur)!; chain.push(cur); }
    chains.push(chain);
  }
  if (chains.length === 0) return report;

  modelStore.batch(() => {
    for (const chain of chains) {
      const segs = chain.map((id) => JSON.parse(JSON.stringify(modelStore.elements.get(id)!)) as Element);
      const lengths = segs.map(lengthOf);
      const starts: number[] = [];
      for (let k = 0; k < lengths.length; k++) starts.push(k === 0 ? 0 : starts[k - 1]! + lengths[k - 1]!);
      const keep = segs[0]!, last = segs[segs.length - 1]!;
      const ids = new Set(chain);

      // Loads of the chain, re-measured from the new node I.
      const moved: Load[] = [];
      for (const l of modelStore.loads) {
        const eid = (l.data as { elementId?: number }).elementId;
        if (eid === undefined || !ids.has(eid)) continue;
        const k = chain.indexOf(eid);
        const s0 = starts[k]!, Lk = lengths[k]!;
        const d = JSON.parse(JSON.stringify(l.data)) as Record<string, number>;
        if (l.type === 'distributed' || l.type === 'distributed3d') {
          d.a = s0 + (d.a ?? 0);
          d.b = s0 + (d.b ?? Lk);
        } else if (l.type === 'pointOnElement' || l.type === 'pointOnElement3d') {
          d.a = s0 + d.a!;
        } else if (l.type === 'thermal') {
          if (k !== 0) continue; // identical on every segment: kept once
        }
        d.elementId = keep.id;
        moved.push({ type: l.type, data: d } as unknown as Load);
      }
      const total = starts[starts.length - 1]! + lengths[lengths.length - 1]!;
      // A load now spanning the whole merged member is stated as full-length again.
      for (const l of moved) {
        const d = l.data as unknown as { a?: number; b?: number };
        if ((l.type === 'distributed' || l.type === 'distributed3d')) {
          if (d.a !== undefined && d.a < 1e-9) delete d.a;
          if (d.b !== undefined && Math.abs(d.b - total) < 1e-9) delete d.b;
        }
      }
      modelStore.replaceLoads(modelStore.loads.filter((l) => {
        const eid = (l.data as { elementId?: number }).elementId;
        return eid === undefined || !ids.has(eid);
      }));

      // Groups that held any segment hold the merged member.
      for (const g of modelStore.model.groups.values()) {
        const list = g.members.elements ?? [];
        if (list.some((x) => ids.has(x)) && !list.includes(keep.id)) {
          modelStore.setGroupMembers(g.id, { ...g.members, elements: [...list, keep.id] });
        }
      }
      // References to absorbed segments move to the merged member.
      for (const s of modelStore.supports.values()) {
        if (s.dofLocalElementId !== undefined && ids.has(s.dofLocalElementId)) modelStore.updateSupport(s.id, { dofLocalElementId: keep.id });
      }

      const interior = segs.slice(1).map((e) => e.nodeI);
      for (const e of segs.slice(1)) modelStore.removeElement(e.id);
      const offset = keep.offset || last.offset
        ? { frame: (keep.offset ?? last.offset)!.frame, ...(keep.offset?.i ? { i: keep.offset.i } : {}), ...(last.offset?.j ? { j: last.offset.j } : {}) }
        : undefined;
      const patch: Partial<Element> = {
        nodeJ: last.nodeJ, releaseJ: { ...(last.releaseJ ?? { my: false, mz: false, t: false }) },
        jointJ: last.jointJ, offset: offset && (offset.i || offset.j) ? offset : undefined, reinforcement: undefined,
      };
      if (segs.some((e) => e.reinforcement)) report.reinforcementDropped++;
      modelStore.updateElement(keep.id, patch);
      for (const n of interior) { modelStore.removeNode(n); report.removedNodes++; }
      for (const l of moved) modelStore.addLoadEntry(l);
      report.merged.push({ elementId: keep.id, absorbed: chain.length - 1 });
    }
  });
  return report;
}
