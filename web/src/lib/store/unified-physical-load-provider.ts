import type { LoadModelData } from '../engine/loads/load-plan';
import { isConvex } from '../engine/loads/floor-tributary';
import type { FloorLoadDef } from '../model/loads/floor-definitions';
import { PHYSICAL_GROUP_KIND } from '../model/physical/types';
import { plateGeometry, plateLoops, plateProblem, plateSurfaceOf } from '../model/physical/plate';
import { modelStore } from './model.svelte';
import type { PhysicalLoadProvider } from './physical-load-provider';

function project(analytical: LoadModelData): LoadModelData {
  const model = modelStore.model;
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

export const physicalLoadProvider: PhysicalLoadProvider = {
  project,
  pressures(generatedBy) {
    const onPlates = new Map<string, { groupId: number; caseId: number; q: number; dir?: [number, number, number] }>();
    return {
      collect(load, caseId) {
        if (load.quadId >= 0) return false;
        const groupId = -load.quadId;
        const dir = load.frame === 'global' ? load.dir : undefined;
        const key = `${groupId}:${caseId}:${dir ?? ''}`;
        const q = (onPlates.get(key)?.q ?? 0) + load.q;
        onPlates.set(key, { groupId, caseId, q, ...(dir ? { dir } : {}) });
        return true;
      },
      write() {
        for (const d of onPlates.values()) {
          const def: FloorLoadDef & { generatedBy: string } = { caseId: d.caseId, q: d.q, target: { by: 'group', groupId: d.groupId }, distribution: 'slab', ...(d.dir ? { dir: d.dir } : {}), generatedBy };
          const name = `${modelStore.model.groups.get(d.groupId)?.name ?? `#${d.groupId}`} · ${modelStore.model.loadCases.find((c) => c.id === d.caseId)?.name ?? d.caseId}`;
          modelStore.addGroup(name, 'floorLoad', {}, { data: def as unknown as Record<string, unknown> });
        }
      },
    };
  },
};
