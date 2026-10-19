/**
 * The slab-column joint indicator of the design run (`engine/design/analysis-validity.ts`), set
 * on the contexts the design reads and read back by everything that states a member or the model
 * as verified: the desk, the memoria (and through it the workbook and the IFC), the certificates
 * and the document's readiness and banner. It is a model-adequacy indicator: where the slab is
 * joined to a column at one node the split of its load between beams and columns is not
 * established, and the members are not presented as verified.
 */
import { modelStore } from './model.svelte';
import { verificationStore } from './verification.svelte';
import {
  slabColumnJoints, floorPaths, modelSlabColumnJoint,
  type SlabColumnJoint, type FloorPath, type ModelSlabColumnJoint, type JointMember, type JointModel,
} from '../engine/design/analysis-validity';
import type { MemberContext } from '../engine/design/member-context';
import { planHalf } from '../model/building/build-on-grid';

/**
 * Give every context its member's verdict, in place. A span's pieces share the span's: the
 * indicator reads the member from support to support, as the design does.
 */
export function applySlabColumnJoints(contexts: Map<number, MemberContext>): void {
  const { model, members } = jointInputs(contexts);
  const per = slabColumnJoints(model, members);
  for (const [id, c] of contexts) {
    const v = per.get(c.span?.representative ?? id);
    if (v) contexts.set(id, { ...c, slabColumnJoint: v });
  }
}

/** Each floor's load path as the indicator reads it, from the contexts the design reads. */
export function currentFloorPaths(contexts: ReadonlyMap<number, MemberContext> = verificationStore.contexts): FloorPath[] {
  const { model, members } = jointInputs(contexts);
  return floorPaths(model, members);
}

/** The model and the design members, one per span, as the indicator reads them. */
function jointInputs(contexts: ReadonlyMap<number, MemberContext>): { model: JointModel; members: JointMember[] } {
  const members: JointMember[] = [];
  const seen = new Set<string>();
  for (const c of contexts.values()) {
    const key = c.span?.key ?? `e${c.elementId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const e = modelStore.elements.get(c.elementId);
    if (!e) continue;
    // A column's section as placed in plan: its local axes, its roll, its insertion left aside
    // (an offset column's section is not centred on its node, and is read as not tied).
    const half = c.elementType === 'column' && !e.offset ? planHalf(c.elementId) : null;
    members.push({
      elementId: c.span?.representative ?? c.elementId, type: c.elementType,
      start: c.span?.start ?? e.nodeI, end: c.span?.end ?? e.nodeJ,
      ...(c.stations ? { stations: c.stations } : {}),
      shear: c.axes.shear.toLowerCase() as 'vy' | 'vz',
      ...(half ? { halfX: half[0], halfY: half[1] } : {}),
    });
  }
  const vertical = new Set<number>();
  for (const e of modelStore.elements.values()) {
    const a = modelStore.nodes.get(e.nodeI), b = modelStore.nodes.get(e.nodeJ);
    if (a && b && Math.abs((a.z ?? 0) - (b.z ?? 0)) > 1e-6) { vertical.add(e.nodeI); vertical.add(e.nodeJ); }
  }
  // A rigid tie on all six DOFs: a rigid link naming them all, or an eccentric connection at the
  // slave's own position with nothing released.
  const rigidTies = new Map<number, number>();
  for (const k of modelStore.model.constraints ?? []) {
    if (k.type === 'rigidLink' && [0, 1, 2, 3, 4, 5].every((d) => k.dofs?.includes(d))) rigidTies.set(k.slaveNode, k.masterNode);
    else if (k.type === 'eccentricConnection' && !(k.offsetX || k.offsetY || k.offsetZ) && !(k.releases ?? []).some(Boolean)) rigidTies.set(k.slaveNode, k.masterNode);
  }
  return {
    model: {
      nodes: modelStore.nodes, quads: modelStore.quads,
      supportNodes: new Set([...modelStore.supports.values()].map((s) => s.nodeId)), verticalNodes: vertical, rigidTies,
    },
    members,
  };
}

/** A member's verdict as the last design run set it; absent when it was not read. */
export function slabColumnJointOf(id: number): SlabColumnJoint | undefined {
  return verificationStore.contextFor(id)?.slabColumnJoint;
}

/** Whether the member was designed from a split of the slab's load the model does not establish. */
export const loadSplitNotEstablished = (id: number): boolean => slabColumnJointOf(id)?.verdict === 'pointJoint';

/** The model's verdict over the contexts the design reads, one entry per design member. */
export function currentSlabColumnJoint(contexts: ReadonlyMap<number, MemberContext> = verificationStore.contexts): ModelSlabColumnJoint {
  const per = new Map<number, SlabColumnJoint>();
  for (const c of contexts.values()) if (c.slabColumnJoint) per.set(c.span?.representative ?? c.elementId, c.slabColumnJoint);
  return modelSlabColumnJoint(per);
}
