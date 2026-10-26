/** What the wall design reads from the decisions and the physical walls: the bars a person set, the openings. */
import { storedDecisions } from './design-decisions';
import { physicalGroups } from './physical';

export function wallInputs() {
  return {
    wallReinforcement: (wallId: string) => (storedDecisions().walls ?? {})[wallId],
    wallOpenings: (shellIds: readonly number[]) => {
      const set = new Set(shellIds);
      const g = physicalGroups().find((x) => x.physical.kind === 'wall' && (x.members.quads ?? []).some((q) => set.has(q)));
      return g?.physical.openings ?? [];
    },
  };
}
