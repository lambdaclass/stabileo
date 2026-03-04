import type { DSMStepData } from '../engine/solver-detailed';

function createDSMStepsStore() {
  let stepData = $state<DSMStepData | null>(null);
  let currentStep = $state(1); // 1-9
  let highlightedElement = $state<number | null>(null);
  let highlightedDOFs = $state<Set<number>>(new Set());
  let isOpen = $state(false);
  let selectedElemForStep = $state<number | null>(null); // for steps 2,3,9
  let quizMode = $state(false);

  return {
    get stepData() { return stepData; },
    get currentStep() { return currentStep; },
    get highlightedElement() { return highlightedElement; },
    get highlightedDOFs() { return highlightedDOFs; },
    get isOpen() { return isOpen; },
    get selectedElemForStep() { return selectedElemForStep; },
    get quizMode() { return quizMode; },
    set quizMode(v: boolean) { quizMode = v; },

    setStepData(data: DSMStepData) {
      stepData = data;
      currentStep = 1;
      highlightedElement = null;
      highlightedDOFs = new Set();
      selectedElemForStep = data.elements.length > 0 ? data.elements[0].elementId : null;
    },

    open() { isOpen = true; },
    close() {
      isOpen = false;
      highlightedElement = null;
      highlightedDOFs = new Set();
    },

    nextStep() { if (currentStep < 9) currentStep++; },
    prevStep() { if (currentStep > 1) currentStep--; },
    goToStep(step: number) { if (step >= 1 && step <= 9) currentStep = step; },

    highlightElement(elemId: number | null) {
      highlightedElement = elemId;
      if (elemId !== null && stepData) {
        const elem = stepData.elements.find(e => e.elementId === elemId);
        highlightedDOFs = elem ? new Set(elem.dofIndices) : new Set();
      } else {
        highlightedDOFs = new Set();
      }
    },

    selectElement(elemId: number) { selectedElemForStep = elemId; },

    clear() {
      stepData = null;
      currentStep = 1;
      highlightedElement = null;
      highlightedDOFs = new Set();
      isOpen = false;
      selectedElemForStep = null;
      quizMode = false;
    },
  };
}

export const dsmStepsStore = createDSMStepsStore();
