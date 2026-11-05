import { modelStore, uiStore } from '../store';
import { plasticMoments, type SectionMp } from '../engine/plastic-moments';
import type { SolverInput } from '../engine/types';
import type { PlasticCollapseResult } from '../engine/plastic-collapse';
import { knownIssueMessage } from '../engine/known-issue-message';

export interface PlasticRun {
  result: PlasticCollapseResult;
  mps: SectionMp[];
}

export class PlasticWithheld extends Error {
  readonly issue = 758;
}

export function runPlasticCollapse(): PlasticRun | null {
  const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
  if (!input) return null;
  throw new PlasticWithheld(knownIssueMessage({
    code: 'known_issue',
    severity: 'error',
    phase: 'PL-2D-INVARIANCE',
    value: 758,
    message: 'Results withheld: independently verify 2D plastic collapse.',
  }));
}

export function memberPlasticMoments(input: SolverInput, mpOfSection?: Map<number, number>): Map<number, number> {
  const bySection = mpOfSection ?? new Map(plasticMoments(modelStore.sections, modelStore.materials, modelStore.elements).map((m) => [m.sectionId, m.mp]));
  return new Map([...input.elements.values()].filter((e) => e.type === 'frame').map((e) => [e.id, bySection.get(e.sectionId) ?? Infinity]));
}
