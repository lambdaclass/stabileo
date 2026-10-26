/** What the slab design reads from the physical slabs and the decisions: panels, set bars, the predetermined base. */
import { storedDecisions } from './design-decisions';
import { physicalGroups } from './physical';
import { designData } from './design-data';
import type { RibbedGeometry } from '../engine/design/slabs/ribbed';

export function slabInputs() {
  const panelOf = new Map<number, string>();
  const ribsOf = new Map<string, RibbedGeometry>();
  for (const g of physicalGroups()) {
    if (g.physical.kind !== 'slab') continue;
    // A waffle with its rib geometry chosen is laid out here, per rib; its rib checks stay in
    // `special-floors`. Joists, planks, decks and post-tensioned slabs have designs of their own
    // (`joist-store`, `special-floors`).
    const ribbed = g.physical.typology === 'waffle' ? designData().specialFloors?.systems?.[`S${g.id}`]?.ribbed : undefined;
    if (ribbed) ribsOf.set(`L${g.id}`, ribbed);
    else if (['joist', 'waffle', 'hollowCore', 'composite', 'postTensioned'].includes(g.physical.typology ?? '')) continue;
    for (const id of [...(g.members.quads ?? []), ...(g.members.plates ?? [])]) panelOf.set(id, `L${g.id}`);
  }
  const base = designData().slabBase;
  return {
    slabPanelOf: (shellId: number) => panelOf.get(shellId),
    slabRibs: (panelId: string) => ribsOf.get(panelId),
    slabReinforcement: (panelId: string) => (storedDecisions().slabs ?? {})[panelId],
    ...(base ? { slabBase: base } : {}),
  };
}
