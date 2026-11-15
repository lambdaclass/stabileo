import { modelStore } from './model.svelte';
import { physicalGroups } from './physical';
import { sortedLevels } from '../model/grid';
import { levelCentres, type LevelCentres } from '../engine/building/level-centres';
import { resolveMassFactors } from '../engine/dynamics/mass-source';

export function modelLevelCentres(): LevelCentres[] {
  const m = modelStore.model;
  const factors = new Map(resolveMassFactors(m.loadCases.map((c) => ({ id: c.id, name: c.name, type: c.type ?? '' })), m.massSource).map((f) => [f.caseId, f.factor]));
  const walls = physicalGroups().filter((g) => g.physical.kind === 'wall').flatMap((g) => (g.members.quads ?? []).length ? [{
    nodes: [...new Set((g.members.quads ?? []).flatMap((q) => m.quads.get(q)?.nodes ?? []))],
    thickness: m.quads.get(g.members.quads![0]!)?.thickness ?? 0,
    materialId: m.quads.get(g.members.quads![0]!)?.materialId ?? 0,
  }] : []);
  return levelCentres({
    nodes: m.nodes, elements: m.elements as never, sections: m.sections as never, materials: m.materials as never,
    quads: m.quads as never, loads: m.loads as never, massFactor: (id) => factors.get(id) ?? 0,
    levels: sortedLevels(m.grid), walls,
  });
}
