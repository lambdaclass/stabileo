import { modelStore, uiStore } from '../store';
import type { SectionMp } from '../engine/plastic-moments';
import type { PlasticCollapseResult } from '../engine/plastic-collapse';
import { knownIssueMessage } from '../engine/known-issues';

export interface PlasticRun {
  result: PlasticCollapseResult;
  mps: SectionMp[];
}

export function runPlasticCollapse(): PlasticRun | null {
  const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
  if (!input) return null;
  throw new Error(knownIssueMessage({
    code: 'known_issue',
    severity: 'error',
    phase: 'PL-2D-INVARIANCE',
    value: 758,
    message: 'Results withheld: independently verify 2D plastic collapse.',
  }));
}
