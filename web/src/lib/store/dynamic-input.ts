/**
 * The input every dynamic analysis runs on: the model on its centerline, its mass source, and the
 * densities that carry it. One builder for the advanced panel's modal, spectral, time history and
 * harmonic runs and for the spectral load cases, so none of them weighs the structure differently.
 */
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { t } from '../i18n';
import { imposedRefusal } from '../engine/solver-service';
import { withMassSource, densitiesFor } from '../engine/dynamics/mass-source-model';
import type { MassSourceReport } from '../engine/dynamics/mass-source';

/**
 * The static input on the centerline (the dynamic payloads carry no constraints for offset helpers).
 *
 * `caseDisplacements`: for an analysis that solves the model's loads statically, every case
 * together as the linear "All loads" solve does (P-Delta, the imperfections' P-Delta, the
 * corotational solve, Winkler, SSI, creep); the cases' imposed displacements go on the supports
 * as that solve puts them. Left out of the eigen-analyses, the dynamic ones, the staged one
 * (its supports enter at the first stage, so every case's displacement would too), the
 * pushover's load factor and the influence line. `uncut`: no member cut for a load.
 */
export function centerlineInput(opts: { uncut?: boolean; caseDisplacements?: boolean } = {}) {
  // A jointed model would solve as rigid on the centerline: refused, as Solve's advanced paths do.
  if (modelStore.hasSlidingJoints()) throw new Error(t('advanced.slidingUnsupported'));
  if (modelStore.hasJoint3D()) throw new Error(t('advanced.jointsUnsupported'));
  // A case's imposed displacement on a direction no support holds is refused by node, as the
  // linear solve refuses it; the input builder could only drop it without a word.
  if (opts.caseDisplacements) {
    const refused = imposedRefusal(modelStore.model);
    if (refused) throw new Error(refused);
  }
  // The store's builder, so these analyses read the project's rules (self-weight as stated, the
  // shear-deformation switch, groups) exactly as Solve does.
  const input = modelStore.buildSolverInput3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand', { expandMemberOffsets: false, ...opts });
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
