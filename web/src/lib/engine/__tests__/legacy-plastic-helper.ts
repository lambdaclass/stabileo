import { modelStore, uiStore } from '../../store';
import { plasticMoments, DEFAULT_FY, type SectionMp } from '../plastic-moments';
import { plasticCollapse2D, type PlasticCollapseResult } from '../plastic-collapse';
import { advancedRefusal2D, variableRefusal2D } from '../solver-service';
import { t } from '../../i18n';

export interface PlasticRun {
  result: PlasticCollapseResult;
  mps: SectionMp[];
}

export function runLegacyPlasticCollapse(): PlasticRun | null {
  const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
  if (!input) return null;
  const refusal = variableRefusal2D(modelStore.model) ?? advancedRefusal2D(input);
  if (refusal) throw new Error(refusal);
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
  if (result.unloaded) throw new Error(t('advanced.plasticNoLoads'));
  return { result, mps };
}

