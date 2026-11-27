import { openExplainedMethod, openFlexibilityWizard, openStiffnessWizard } from '../actions/step-wizards';
import { openSecondOrderSteps } from '../actions/second-order';

import { ownerOfMethod } from './catalog';
import { uiStore } from '../store/ui.svelte';

export function stepBlockedReason(id: string): string | null {
  const owner = ownerOfMethod(id);
  if (owner?.requires.plane && uiStore.is3DWorkspace) return 'advanced.only2d';
  return owner?.id === 'plastic' ? 'knownIssue.PL-2D-INVARIANCE' : null;
}

/** Open a step-by-step method from the Advanced list or from inside a function; going back returns there. */
export function openStepMethod(id: string): void {
  if (stepBlockedReason(id)) return;
  if (id === 'dsm') void openStiffnessWizard(false);
  else if (id === 'fm') void openFlexibilityWizard(false);
  else if (id.startsWith('so-')) openSecondOrderSteps(id);
  else openExplainedMethod(id);
}
