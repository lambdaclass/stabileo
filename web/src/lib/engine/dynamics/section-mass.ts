import type { SolverMaterial } from '../types';
import type { ModelData } from '../solver-service';
import { createSectionWeight } from '../../section/weight';
import { solvableModel } from '../member-behaviour';
import { G, massDensities } from './requests';

interface MassInput {
  materials: Map<number, SolverMaterial>;
  sections: Map<number, { a: number }>;
  elements: Map<number, { id: number; materialId: number; sectionId: number }>;
}

/**
 * The engine integrates density × its stiffness area. For a drawn composite that area is
 * transformed, so give each section/material pair an analysis-only material with an equivalent
 * mass density. E and G stay unchanged, and shells sharing the original material keep its density.
 */
export function withSectionMass<T extends MassInput>(input: T, model: ModelData): { input: T; densities: Map<number, number> } {
  // The model as the input was built from it: a variable member's pieces and their sections
  // (`variable-members.ts`), so a drawn composite of variable depth weighs piece by piece too.
  model = solvableModel(model);
  const densities = massDensities(model.materials, input.materials.keys());
  const materials = new Map(input.materials);
  const elements = new Map(input.elements);
  const weight = createSectionWeight(model.materials);
  const cloned = new Map<string, number>();
  let next = Math.max(0, ...materials.keys()) + 1;
  for (const [id, e] of input.elements) {
    const sectionId = model.elements.get(id)?.sectionId ?? e.sectionId;
    const section = model.sections.get(sectionId);
    if (!section?.drawn) continue;
    const area = input.sections.get(e.sectionId)?.a;
    const material = materials.get(e.materialId);
    if (!material || area === undefined || !(area > 0)) throw new Error('Composite mass requires a positive area and a material');
    const key = `${e.materialId}/${sectionId}/${area}`;
    let materialId = cloned.get(key);
    if (materialId === undefined) {
      materialId = next++;
      materials.set(materialId, { ...material, id: materialId });
      const originalMaterial = model.elements.get(id)?.materialId ?? e.materialId;
      densities.set(materialId, weight(section, originalMaterial) * 1000 / (G * area));
      cloned.set(key, materialId);
    }
    elements.set(id, { ...e, materialId });
  }
  return { input: { ...input, materials, elements }, densities };
}
