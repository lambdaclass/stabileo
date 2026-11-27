import { constraintNodes } from '../engine/steel/unbraced-length';
import { modelStore } from './model.svelte';

export function plateNodeReferences(): Set<number> {
  const nodes = modelStore.referencedNodeIds();
  for (const force of modelStore.model.dynamics?.timeHistory?.forces ?? []) nodes.add(force.nodeId);
  for (const node of modelStore.nodes.values()) if (node.name) nodes.add(node.id);
  return nodes;
}

export const retainedPlateNodes = (except?: number): Set<number> => {
  const s = plateNodeReferences();
  for (const e of modelStore.elements.values()) { s.add(e.nodeI); s.add(e.nodeJ); }
  for (const q of modelStore.quads.values()) q.nodes.forEach((n) => s.add(n));
  for (const p of modelStore.plates.values()) p.nodes.forEach((n) => s.add(n));
  for (const sp of modelStore.supports.values()) s.add(sp.nodeId);
  for (const l of modelStore.loads) if ('nodeId' in l.data) s.add((l.data as { nodeId: number }).nodeId);
  for (const n of constraintNodes(modelStore.model.constraints)) s.add(n);
  for (const g of modelStore.model.groups.values()) if (g.id !== except) g.members.nodes?.forEach((n) => s.add(n));
  return s;
};
