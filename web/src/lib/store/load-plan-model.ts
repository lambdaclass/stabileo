import { modelStore } from './model.svelte';
import { physicalLoadProvider } from './physical-load-provider';
import { msg, type EngineMessage } from '../codes/message';
import type { LoadModelData, LoadPlan } from '../engine/loads/load-plan';

export function loadPlanModel(): LoadModelData {
  const model = modelStore.model;
  const analytical: LoadModelData = {
    nodes: modelStore.nodes,
    elements: modelStore.elements,
    sections: model.sections,
    materials: model.materials,
    loadCases: model.loadCases,
    quads: model.quads,
    plates: model.plates,
    supports: modelStore.supports,
    constraints: model.constraints,
  };
  return physicalLoadProvider?.project(analytical) ?? analytical;
}

export function physicalPlanRefusal(plan: LoadPlan): EngineMessage | undefined {
  const surface = plan.surface.filter(load => load.quadId < 0);
  const thermal = plan.thermal.find(load => (load.quadId ?? 0) < 0);
  if (thermal) return msg('loadPlan.blocked.unmeshedPlateThermal');
  if (surface.some(load => load.vary)) return msg('loadPlan.blocked.unmeshedPlatePressure');
  if (!surface.length && !plan.physicalPlateSource) return;
  const current = loadPlanModel();
  if (current.plateRequiringMesh !== undefined) return msg('loadPlan.blocked.meshPhysicalPlate', { id: current.plateRequiringMesh });
  const missing = surface.find(load => !current.quads?.has(load.quadId));
  if (missing) return msg('loadPlan.blocked.meshPhysicalPlate', { id: -missing.quadId });
  return plan.physicalPlateSource && plan.physicalPlateSource === current.physicalPlateSource ? undefined : msg('autoLoad.previewStale');
}
