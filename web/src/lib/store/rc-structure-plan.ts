import { modelStore } from './model.svelte';
import { familyLevels, structurePlan, STRUCTURE_FAMILIES, type StructureFamily, type StructureModel, type StructurePlan, type StructureRows } from '../rc-sheets/structure-plan';

const structureModel = (): StructureModel => ({
  nodes: modelStore.nodes, elements: modelStore.elements as never, sections: modelStore.sections as never,
  axes: modelStore.grid?.axes ?? [],
});

/** One family's plan of one level as the model places it now. */
export const structurePlanOf = (family: StructureFamily, level: string, rows: StructureRows): StructurePlan => structurePlan(family, level, rows, structureModel());

/** Every family's plan of every level its rows stand on. */
export function structurePlansOf(rows: StructureRows): StructurePlan[] {
  const m = structureModel();
  return STRUCTURE_FAMILIES.flatMap((f) => familyLevels(f, rows).map((l) => structurePlan(f, l, rows, m)));
}
