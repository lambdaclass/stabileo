import { modelStore } from './model.svelte';
import { columnFixedPoint, setColumnFixedPoint } from './placement';
import { familyLevels, structurePlan, STRUCTURE_FAMILIES, type StructureFamily, type StructureModel, type StructurePlan, type StructureRows } from '../rc-sheets/structure-plan';
import { withFixedPoints, type FixedPointKind } from '../rc-sheets/fixed-points';

const structureModel = (): StructureModel => ({
  nodes: modelStore.nodes, elements: modelStore.elements as never, sections: modelStore.sections as never,
  axes: modelStore.grid?.axes ?? [],
});

/** The fixed point the project states for a column stack, the centre when none (`store/placement.ts`). */
export const fixedPointKind = (stack: string): FixedPointKind => columnFixedPoint(stack);

/** State a column stack's fixed point, the storeys above moved to it (`store/placement.ts`). */
export const setFixedPoint = (stack: string, kind: FixedPointKind): void => setColumnFixedPoint(stack, kind);

const placed = (plans: StructurePlan[], rows: StructureRows & { levels?: readonly string[] }) => withFixedPoints(plans, rows.levels ?? [], fixedPointKind);

/** One family's plan of one level as the model places it now, its columns by their stacks' fixed points. */
export function structurePlanOf(family: StructureFamily, level: string, rows: StructureRows & { levels?: readonly string[] }): StructurePlan {
  const m = structureModel();
  if (family !== 'vertical') return structurePlan(family, level, rows, m);
  const all = placed(familyLevels(family, rows).map((l) => structurePlan(family, l, rows, m)), rows);
  return all.find((p) => p.level === level) ?? placed([structurePlan(family, level, rows, m)], rows)[0]!;
}

/** Every family's plan of every level its rows stand on, its columns by their stacks' fixed points. */
export function structurePlansOf(rows: StructureRows & { levels?: readonly string[] }): StructurePlan[] {
  const m = structureModel();
  return placed(STRUCTURE_FAMILIES.flatMap((f) => familyLevels(f, rows).map((l) => structurePlan(f, l, rows, m))), rows);
}
