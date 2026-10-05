/**
 * The loads of the model's floor-load definitions (`model/loads/floor-definitions.ts`), kept in
 * step with them: written when a definition is, and rewritten before a solve when the model has
 * moved under them (a beam added, a node moved, the axis convention changed). Each rewrite is one
 * undo step; when nothing changed, nothing is written.
 */
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { expandAll, definitionsCurrent, type DefinitionModel, type Expansion, type FloorLoadDef } from '../model/loads/floor-definitions';
import type { GroupMembers, Load } from './model.svelte';

const defModel = (): DefinitionModel => modelStore.model as unknown as DefinitionModel;
const leftHand = () => uiStore.axisConvention3D === 'leftHand';

/** Every definition expanded against the model as it is. */
export function expandDefinitions(): Expansion[] {
  return expandAll(defModel(), { leftHand: leftHand() });
}

/**
 * Bring the definitions' loads up to date. Returns how many loads were written, or null when they
 * were already current.
 */
export function syncDefinedLoads(): number | null {
  const exp = expandDefinitions();
  if (definitionsCurrent(modelStore.loads, exp)) return null;
  const fresh = exp.flatMap((e) => e.loads);
  modelStore.batch(() => {
    modelStore.replaceLoads(modelStore.loads.filter((l) => (l.data as { fromDef?: number }).fromDef === undefined));
    for (const l of fresh) modelStore.addLoadEntry(l as Load);
  });
  return fresh.length;
}

/** A new floor-load definition, with its loads, in one undo step. Returns its group id. */
export function addFloorLoadDef(name: string, def: FloorLoadDef, own: GroupMembers = {}): number {
  let id = -1;
  modelStore.batch(() => {
    id = modelStore.addGroup(name, 'floorLoad', own, { data: def as unknown as Record<string, unknown> });
    syncDefinedLoads();
  });
  return id;
}

/** A definition changed, with its loads, in one undo step. */
export function updateFloorLoadDef(id: number, def: FloorLoadDef): void {
  modelStore.batch(() => {
    modelStore.setGroupData(id, def as unknown as Record<string, unknown>);
    syncDefinedLoads();
  });
}

/** A definition removed with its loads. */
export function removeFloorLoadDef(id: number): void {
  modelStore.batch(() => {
    modelStore.removeGroup(id);
    syncDefinedLoads();
  });
}

/** A zone from nodes in order around its outline, members it leaves out and other zones as openings. */
export function addLoadZone(name: string, outline: number[], excluded: number[] = [], openings: number[] = []): number {
  let id = -1;
  modelStore.batch(() => {
    id = modelStore.addGroup(name, 'loadZone', { nodes: outline, ...(excluded.length ? { elements: excluded } : {}) }, openings.length ? { data: { openings } } : undefined);
    syncDefinedLoads();
  });
  return id;
}
