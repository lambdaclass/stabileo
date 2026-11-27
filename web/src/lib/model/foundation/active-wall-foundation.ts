import { plateLoops } from '../physical/plate';
import type { ModelGroup } from '../../store/model.svelte';
import { holdPlateSidesAt } from '../../store/physical-plates';

export const wallFoundation = {
  outline(group: ModelGroup) {
    const loops = plateLoops(group);
    return [...loops.outer, ...loops.holes.flat()];
  },
  hold(group: number, elevation: number) {
    return holdPlateSidesAt(group, elevation, 'fixed3d');
  },
};
