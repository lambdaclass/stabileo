/**
 * The flexibility-method wizard's state: the solved method, the step on
 * screen, and which state or coefficient the reader is looking at.
 *
 * Kept apart from `dsmStepsStore` because the two wizards share nothing but a
 * panel, and they are mutually exclusive in it — opening one closes the other.
 */
import type { ForceMethodResult } from '../engine/force-method/solve';

export const FM_STEPS = 9;

function createFMStepsStore() {
  let result = $state<ForceMethodResult | null>(null);
  let currentStep = $state(1);
  let isOpen = $state(false);
  /** 0 is state 0; i ≥ 1 is Xᵢ = 1. */
  let selectedState = $state(1);
  /** The δᵢⱼ whose breakdown is shown, 0-based. */
  let selectedI = $state(0);
  let selectedJ = $state(0);

  return {
    get result() { return result; },
    get currentStep() { return currentStep; },
    get isOpen() { return isOpen; },
    get selectedState() { return selectedState; },
    get selectedI() { return selectedI; },
    get selectedJ() { return selectedJ; },

    setResult(r: ForceMethodResult) {
      result = r;
      currentStep = 1;
      selectedState = r.redundants.length > 0 ? 1 : 0;
      selectedI = 0;
      selectedJ = 0;
    },
    open() { isOpen = true; },
    close() { isOpen = false; },
    nextStep() { if (currentStep < FM_STEPS) currentStep++; },
    prevStep() { if (currentStep > 1) currentStep--; },
    goToStep(step: number) { if (step >= 1 && step <= FM_STEPS) currentStep = step; },
    selectState(k: number) { selectedState = k; },
    selectCoefficient(i: number, j: number) { selectedI = i; selectedJ = j; },
    clear() {
      result = null;
      currentStep = 1;
      isOpen = false;
      selectedState = 1;
      selectedI = 0;
      selectedJ = 0;
    },
  };
}

export const fmStepsStore = createFMStepsStore();
