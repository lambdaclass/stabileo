import { modelStore } from './model.svelte';
import { physicalGroups } from './physical';
import { defaultLevelName, sortedLevels } from '../model/grid';
import { levelCentres, type LevelCentres } from '../engine/building/level-centres';
import { resolveMassFactors } from '../engine/dynamics/mass-source';

const TOL = 1e-3;

/**
 * The levels the centres are read at: the grid's, or, with none declared, the elevations the
 * columns run between, named from the lowest up.
 */
export function centreLevels(): Array<{ id: string; name: string; z: number }> {
  const m = modelStore.model;
  const declared = sortedLevels(m.grid);
  if (declared.length) return declared;
  const zs: number[] = [];
  for (const e of m.elements.values()) {
    const a = m.nodes.get(e.nodeI), b = m.nodes.get(e.nodeJ);
    if (!a || !b || Math.hypot(b.x - a.x, b.y - a.y) > TOL || Math.abs((b.z ?? 0) - (a.z ?? 0)) < TOL) continue;
    for (const z of [a.z ?? 0, b.z ?? 0]) if (!zs.some((x) => Math.abs(x - z) < TOL)) zs.push(z);
  }
  return zs.sort((p, q) => p - q).map((z, i) => ({ id: `z:${z}`, name: defaultLevelName(i), z }));
}

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
    levels: centreLevels(), walls,
  });
}
