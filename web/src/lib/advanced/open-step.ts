import { openExplainedMethod, openFlexibilityWizard, openStiffnessWizard } from '../actions/step-wizards';
import { openSecondOrderSteps } from '../actions/second-order';

/** Open a step-by-step method from the Advanced list or from inside a function; going back returns there. */
export function openStepMethod(id: string): void {
  if (id === 'dsm') void openStiffnessWizard(false);
  else if (id === 'fm') void openFlexibilityWizard(false);
  else if (id.startsWith('so-')) openSecondOrderSteps(id);
  else openExplainedMethod(id);
}
