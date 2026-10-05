/**
 * The input every dynamic analysis runs on: the model on its centerline, its mass source, and the
 * densities that carry it. One builder for the advanced panel's modal, spectral, time history and
 * harmonic runs and for the spectral load cases, so none of them weighs the structure differently.
 */
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { t } from '../i18n';
import { withMassSource, densitiesFor } from '../engine/dynamics/mass-source-model';
import type { MassSourceReport } from '../engine/dynamics/mass-source';

/** The static input on the centerline (the dynamic payloads carry no constraints for offset helpers). */
export function centerlineInput() {
  // A jointed model would solve as rigid on the centerline: refused, as Solve's advanced paths do.
  if (modelStore.hasSlidingJoints()) throw new Error(t('advanced.slidingUnsupported'));
  if (modelStore.hasJoint3D()) throw new Error(t('advanced.jointsUnsupported'));
  const input = modelStore.buildSolverInput3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand', { expandMemberOffsets: false });
  if (!input) throw new Error(t('advanced.emptyModel'));
  return input;
}

/** The dynamic input with the project's mass source, its densities, and what was taken as mass. */
export function dynamicInput(): { input: any; densities: Map<number, number>; report: MassSourceReport } {
  const md = {
    nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
    loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
    quads: modelStore.quads, plates: modelStore.plates, constraints: modelStore.constraints,
    connectors: modelStore.connectors,
  };
  const ms = withMassSource(md as never, modelStore.model.loadCases, modelStore.model.massSource, centerlineInput(), uiStore.axisConvention3D === 'leftHand');
  return { input: ms.input, densities: densitiesFor(ms.input, ms.densities), report: ms.report };
}
