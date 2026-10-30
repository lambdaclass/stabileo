/**
 * The Dynamic panel's classroom choices, as reactive state over the plain
 * settings the explained documents read (engine/dynamics/course/settings).
 * A document already open on one of the dynamics methods is rebuilt when a
 * choice changes, so it says what the panel says.
 */
import { dynamicsSettings, setDynamicsSettings, type DynamicsSettings } from '../engine/dynamics/course/settings';
import { explainedSteps } from './explained-steps.svelte';

const DOCS = new Set(['sdof', 'mdofModal', 'massDiscretization']);

let state = $state<DynamicsSettings>(structuredClone(dynamicsSettings()));

export const courseDynamics = {
  get sdof() { return state.sdof; },
  get mdof() { return state.mdof; },
  get mass() { return state.mass; },
  set(patch: Parameters<typeof setDynamicsSettings>[0]): void {
    setDynamicsSettings(patch);
    state = structuredClone(dynamicsSettings());
    if (explainedSteps.view === 'doc' && explainedSteps.methodId && DOCS.has(explainedSteps.methodId)) explainedSteps.refresh();
  },
};
