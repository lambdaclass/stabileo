import { modelStore } from './model.svelte';
import { historyStore } from './history.svelte';
import { discretizationStore } from './discretization.svelte';
import type { Load, Plate, Quad } from './model.svelte';
import type { Constraint3D } from '../engine/types-3d';
import { cornerValues, planRefinedMesh, type RefinedMesh, type RefinedMeshPlan, type RefinedMeshRefusal } from '../model/edit/refined-mesh';

type ShellLoad = Extract<Load, { type: 'surface3d' | 'thermalQuad3d' }>;

/**
 * Make the model's mesh the refined one, as one undo step. Returns what it added. A member that
 * cannot be cut where the mesh needs it undoes the step: its shells would be split around nodes
 * the member does not reach.
 */
export function applyRefinedMeshPlan(plan: RefinedMeshPlan): { nodes: number; shells: number } | { refused: RefinedMeshRefusal } {
  const idOf = new Map<number, number>();
  const node = (id: number) => idOf.get(id) ?? id;
  const placed = new Map(plan.nodes.map((n) => [n.id, n]));
  let shells = 0;
  let uncut = false;
  modelStore.batch(() => {
    for (const f of plan.frames) {
      const cut = modelStore.splitMember(f.parent, f.at);
      if (!cut || cut.nodeIds.length !== f.nodes.length) { uncut = true; return; }
      f.nodes.forEach((engineId, k) => {
        const made = cut.nodeIds[k]!, at = placed.get(engineId)!, now = modelStore.nodes.get(made)!;
        idOf.set(engineId, made);
        if (now.x !== at.x || now.y !== at.y || (now.z ?? 0) !== at.z) modelStore.updateNode(made, at.x, at.y, at.z);
      });
    }
    modelStore.clearConstraints();
    const grouped = new Map<number, { quads?: number[]; plates?: number[] }>();
    for (const [gid, g] of modelStore.model.groups) {
      if (g.members.quads?.length || g.members.plates?.length) grouped.set(gid, { quads: g.members.quads, plates: g.members.plates });
    }
    const parts = { quad: new Map<number, number[]>(), plate: new Map<number, number[]>() };
    modelStore.bulkMutate(() => {
      for (const n of plan.nodes) if (!idOf.has(n.id)) idOf.set(n.id, modelStore.addNode(n.x, n.y, n.z));
      const loadsOn = new Map<string, ShellLoad[]>();
      for (const l of modelStore.loads) {
        if (l.type !== 'surface3d' && l.type !== 'thermalQuad3d') continue;
        const key = `${l.data.on === 'plate' ? 'plate' : 'quad'}${l.data.quadId}`;
        const list = loadsOn.get(key);
        if (list) list.push(l);
        else loadsOn.set(key, [l]);
      }
      for (const s of plan.shells) {
        const parent = (s.kind === 'quad' ? modelStore.quads : modelStore.model.plates).get(s.id)!;
        const { id: _id, nodes: _nodes, ...fields } = parent;
        const ids = s.children.map((child) => {
          const id = modelStore.addShellEntry(s.kind, { ...fields, nodes: child.nodes.map(node) } as Omit<Quad, 'id'> | Omit<Plate, 'id'>);
          for (const l of loadsOn.get(`${s.kind}${s.id}`) ?? []) {
            const data = { ...l.data, quadId: id } as ShellLoad['data'];
            if (l.type === 'surface3d' && l.data.qNodes) (data as { qNodes?: number[] }).qNodes = cornerValues(child.weights, l.data.qNodes);
            modelStore.addLoadEntry({ type: l.type, data } as Load);
          }
          return id;
        });
        parts[s.kind].set(s.id, ids);
        shells += ids.length;
        if (s.kind === 'quad') modelStore.removeQuad(s.id);
        else modelStore.removePlate(s.id);
      }
      for (const s of plan.supports) modelStore.addSupportEntry({ ...s.fields, nodeId: node(s.nodeId) });
      for (const terms of plan.constraints) {
        modelStore.addConstraint({ type: 'linearMPC', terms: terms.map((term) => ({ ...term, nodeId: node(term.nodeId) })) } as Constraint3D);
      }
    });
    for (const [gid, before] of grouped) {
      const g = modelStore.model.groups.get(gid);
      if (!g) continue;
      const into = (list: number[] | undefined, split: Map<number, number[]>) => list?.flatMap((id) => split.get(id) ?? [id]);
      if (!before.quads?.some((id) => parts.quad.has(id)) && !before.plates?.some((id) => parts.plate.has(id))) continue;
      modelStore.setGroupMembers(gid, {
        ...g.members,
        ...(before.quads ? { quads: into(before.quads, parts.quad) } : {}),
        ...(before.plates ? { plates: into(before.plates, parts.plate) } : {}),
      });
    }
  });
  if (uncut) {
    historyStore.undo();
    return { refused: 'member' };
  }
  return { nodes: plan.nodes.length, shells };
}

export function applyRefinedMesh(wire: Record<string, any>, mesh: RefinedMesh): { refused: RefinedMeshRefusal } | { nodes: number; shells: number } {
  const plan = planRefinedMesh({ ...modelStore.model, constraints: modelStore.constraints }, wire, mesh);
  return 'refused' in plan ? plan : applyRefinedMeshPlan(plan);
}

/** Apply the adaptive refinement on screen to the model. */
export function applyAdaptiveMesh(): { refused: RefinedMeshRefusal } | { nodes: number; shells: number } {
  const refined = discretizationStore.refinedMesh();
  return refined ? applyRefinedMesh(refined.wire, refined.mesh) : { refused: 'stale' };
}
