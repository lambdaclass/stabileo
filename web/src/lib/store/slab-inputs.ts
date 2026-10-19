/** What the slab design reads from the physical slabs and the decisions: panels, set bars, the predetermined base. */
import { storedDecisions } from './design-decisions';
import { physicalGroups } from './physical';
import { designData } from './design-data';

export function slabInputs() {
  const panelOf = new Map<number, string>();
  for (const g of physicalGroups()) {
    // Joists, ribs, planks and decks have designs of their own (`joist-store`, `special-floors`).
    if (g.physical.kind !== 'slab' || ['joist', 'waffle', 'hollowCore', 'composite', 'postTensioned'].includes(g.physical.typology ?? '')) continue;
    for (const id of [...(g.members.quads ?? []), ...(g.members.plates ?? [])]) panelOf.set(id, `L${g.id}`);
  }
  const base = designData().slabBase;
  return {
    slabPanelOf: (shellId: number) => panelOf.get(shellId),
    slabReinforcement: (panelId: string) => (storedDecisions().slabs ?? {})[panelId],
    ...(base ? { slabBase: base } : {}),
  };
}
