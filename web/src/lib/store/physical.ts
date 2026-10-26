/**
 * The model's physical elements, as the store keeps them: groups of kind `physicalMember`.
 *
 * Recognising them (`physical-recognition.ts`) updates the ones that were inferred or came from a
 * generator, keeping their ids, and leaves every one a person declared, in one undo step.
 * Declaring a kind or a typology makes the element declared, so a later recognition leaves it alone.
 */
import { modelStore } from './model.svelte';
import { applyRecognition, planRecognition } from './physical-recognition';
import { physicalDataOf, type PhysicalData, type PhysicalKind } from '../model/physical';
import type { ModelGroup } from './model.svelte';

export function physicalGroups(): Array<ModelGroup & { physical: PhysicalData }> {
  const out: Array<ModelGroup & { physical: PhysicalData }> = [];
  for (const g of modelStore.model.groups.values()) {
    const d = physicalDataOf(g);
    if (d) out.push({ ...g, physical: d });
  }
  return out;
}

/**
 * Read the physical elements off the model and apply all of it. Returns how many there are now.
 *
 * The command without review (imports, scripts). Elements keep their ids where the reading
 * matches them, references follow the ones that change, and a reading that changes nothing
 * writes nothing: see `physical-recognition.ts`, which the panel uses to review it first.
 */
export function recognizePhysicalElements(): number {
  applyRecognition(planRecognition());
  return physicalGroups().length;
}

/** A person says what the element is: its kind, and it becomes declared. */
export function declarePhysicalKind(groupId: number, kind: PhysicalKind): void {
  const g = modelStore.model.groups.get(groupId);
  const d = g ? physicalDataOf(g) : null;
  if (!g || !d) return;
  const next: PhysicalData = { ...d, kind, provenance: 'declared' };
  if (next.typology) delete next.typology;
  modelStore.setGroupData(groupId, next as unknown as Record<string, unknown>);
}

export function declarePhysicalTypology(groupId: number, typology: string | null): void {
  const g = modelStore.model.groups.get(groupId);
  const d = g ? physicalDataOf(g) : null;
  if (!g || !d) return;
  const next: PhysicalData = { ...d, provenance: 'declared', ...(typology ? { typology } : {}) };
  if (!typology) delete next.typology;
  modelStore.setGroupData(groupId, next as unknown as Record<string, unknown>);
}

/** An element's section, for all its bars at once; one undo step. */
export function setPhysicalSection(groupId: number, sectionId: number): void {
  const g = modelStore.model.groups.get(groupId);
  if (!g || !modelStore.sections.has(sectionId)) return;
  modelStore.batch(() => {
    for (const id of g.members.elements ?? []) if (modelStore.elements.has(id)) modelStore.updateElementSection(id, sectionId);
  });
}

/** An element's thickness, for all its shells at once (a wall's at its storey); one undo step. */
export function setPhysicalThickness(groupId: number, thickness: number): void {
  const g = modelStore.model.groups.get(groupId);
  if (!g || !(thickness > 0)) return;
  modelStore.batch(() => {
    for (const id of g.members.quads ?? []) if (modelStore.quads.has(id)) modelStore.updateQuad(id, { thickness });
    for (const id of g.members.plates ?? []) if (modelStore.plates.has(id)) modelStore.updatePlate(id, { thickness });
  });
}

/** The section all of an element's bars share, or null when they differ or it has none. */
export function physicalSection(g: { members: { elements?: number[] } }): number | null {
  const ids = new Set((g.members.elements ?? []).map((id) => modelStore.elements.get(id)?.sectionId));
  return ids.size === 1 ? [...ids][0] ?? null : null;
}

/** The thickness all of an element's shells share, or null. */
export function physicalThickness(g: { members: { quads?: number[]; plates?: number[] } }): number | null {
  const ts = new Set([
    ...(g.members.quads ?? []).map((id) => modelStore.quads.get(id)?.thickness),
    ...(g.members.plates ?? []).map((id) => modelStore.plates.get(id)?.thickness),
  ]);
  return ts.size === 1 ? [...ts][0] ?? null : null;
}
