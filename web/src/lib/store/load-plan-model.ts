import { modelStore } from './model.svelte';
import { unifiedPlates } from '../features';
import { msg, type EngineMessage } from '../codes/message';
import { isConvex } from '../engine/loads/floor-tributary';
import type { LoadModelData, LoadPlan } from '../engine/loads/load-plan';
import { PHYSICAL_GROUP_KIND } from '../model/physical/types';
import { plateGeometry, plateLoops, plateProblem, plateSurfaceOf } from '../model/physical/plate';

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
  if (!unifiedPlates()) return analytical;
  const shells = new Map<number, { id: number; nodes: number[]; thickness: number; materialId: number }>();
  const sources = [];
  for (const group of model.groups.values()) {
    const surface = group.kind === PHYSICAL_GROUP_KIND && plateSurfaceOf(group);
    if (!surface || group.members.quads?.length || group.members.plates?.length) continue;
    const { outer, holes } = plateLoops(group);
    const offset = surface.offset;
    if (holes.length || surface.arcMids?.length || surface.curved || (offset && (offset.x !== 0 || offset.y !== 0 || offset.z !== 0))
      || plateProblem(model, outer, [])) return { ...analytical, plateRequiringMesh: group.id };
    const geo = plateGeometry(model, group)!;
    const { u, v, o } = geo.frame;
    const points = geo.outer.map(([x, y, z]): [number, number] => [
      (x - o[0]) * u[0] + (y - o[1]) * u[1] + (z - o[2]) * u[2],
      (x - o[0]) * v[0] + (y - o[1]) * v[1] + (z - o[2]) * v[2],
    ]);
    if (!isConvex(points) && !isConvex(points.reverse())) return { ...analytical, plateRequiringMesh: group.id };
    const shell = { id: -group.id, nodes: outer, thickness: surface.thickness, materialId: surface.materialId };
    shells.set(shell.id, shell);
    sources.push([shell, geo.outer, model.materials.get(shell.materialId)?.rho]);
  }
  return shells.size ? { ...analytical, quads: new Map([...model.quads, ...shells]), physicalPlateSource: JSON.stringify(sources) } : analytical;
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
