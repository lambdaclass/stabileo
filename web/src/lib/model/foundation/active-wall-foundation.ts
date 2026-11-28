import { plateLoops } from '../physical/plate';
import type { ModelGroup } from '../../store/model.svelte';
import { ensurePlates } from '../../store/plates-from-shells';
import { modelStore } from '../../store/model.svelte';
import { holdPlateSidesAt, physicalPlates } from '../../store/physical-plates';

function holdWallBases(elevation: number) {
  ensurePlates();
  for (const p of physicalPlates()) if (p.physical.kind === 'wall') holdPlateSidesAt(p.id, elevation, 'fixed3d');
}

export const wallFoundation = {
  holdWallBases,
  holdExampleCore() {
    const supports = [...modelStore.supports.values()].filter(s => s.type === 'fixed3d');
    if (supports.length) holdWallBases(Math.min(...supports.map(s => modelStore.nodes.get(s.nodeId)?.z ?? 0)));
  },
  outline(group: ModelGroup) {
    const loops = plateLoops(group);
    return [...loops.outer, ...loops.holes.flat()];
  },
  hold(group: number, elevation: number) {
    return holdPlateSidesAt(group, elevation, 'fixed3d');
  },
};
