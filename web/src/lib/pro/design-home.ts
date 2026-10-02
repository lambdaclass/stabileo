/**
 * Where the Design stage opens: the concrete workflow, or steel design when the model's members
 * are mostly steel. It always opened the concrete workflow, so a steel shed landed on a panel
 * about reinforcement with nothing to design.
 *
 * Pure.
 */
import { materialFamilyOf } from '../engine/steel/material-family';
import { catalogueGradeFamily } from '../engine/steel/grade-family';

export function designHome(
  elements: Iterable<{ materialId: number }>,
  materials: ReadonlyMap<number, unknown>,
): 'design' | 'steel' {
  let steel = 0, concrete = 0;
  for (const e of elements) {
    const fam = materialFamilyOf(materials.get(e.materialId) as never, catalogueGradeFamily).family;
    if (fam === 'steel') steel++;
    else if (fam === 'concrete') concrete++;
  }
  return steel > concrete ? 'steel' : 'design';
}

/**
 * The material a new plate is offered: the model's first concrete, when it has one. Slabs and
 * walls are concrete far more often than not, and the first material of a new model is its
 * steel, so a plate drawn without a look at the list came out as a steel plate.
 */
export function defaultShellMaterial(materials: ReadonlyMap<number, unknown>): number {
  for (const [id, m] of materials) if (materialFamilyOf(m as never, catalogueGradeFamily).family === 'concrete') return id;
  return [...materials.keys()][0] ?? 1;
}
