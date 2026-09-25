/**
 * Run the plastic collapse analysis on the model as it stands.
 *
 * Mp of each frame member from its section's own plastic modulus
 * (plastic-moments.ts); Np = fy·A for a truss bar, with fy from its material
 * (250 MPa if it has none, and said so by `plasticMoments`).
 */
import { modelStore, uiStore } from '../store';
import { plasticMoments, DEFAULT_FY, type SectionMp } from '../engine/plastic-moments';
import { plasticCollapse2D, type PlasticCollapseResult } from '../engine/plastic-collapse';

export interface PlasticRun {
  result: PlasticCollapseResult;
  mps: SectionMp[];
}

export function runPlasticCollapse(): PlasticRun | null {
  const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
  if (!input) return null;
  const mps = plasticMoments(modelStore.sections, modelStore.materials, modelStore.elements);
  const mpOfSection = new Map(mps.map((m) => [m.sectionId, m.mp]));
  const result = plasticCollapse2D(input, {
    mp: (id) => mpOfSection.get(input.elements.get(id)!.sectionId) ?? Infinity,
    np: (id) => {
      const e = input.elements.get(id)!;
      const fy = modelStore.materials.get(e.materialId)?.fy || DEFAULT_FY;
      const a = input.sections.get(e.sectionId)?.a ?? 0;
      return fy * 1000 * a;
    },
  });
  return { result, mps };
}
