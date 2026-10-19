/**
 * Copy a level's elements to other levels: the beams and slabs at the level and the columns and
 * walls of the storey below it, filtered by kind, each copy a declared element of the level it
 * lands on. One undo step. Bars and shells that are already where a copy would land are not
 * doubled, and a copied element left with nothing of its own is not kept.
 */
import { modelStore } from '../../store/model.svelte';
import { copyTransformed } from '../edit/transformed-copy';
import { translation } from '../edit/affine';
import type { StructuralGrid } from '../grid';
import { PHYSICAL_GROUP_KIND, type PhysicalData, type PhysicalKind } from '../physical/types';
import { levelAt } from '../physical/recognize';
import { nextName, PREFIX } from './declare';

export interface CopyLevelsResult { copied: number; levels: number; refused?: 'nothing' | 'levels' }

export function copyToLevels(g: StructuralGrid, o: { from: string; to: string[]; kinds: PhysicalKind[] }): CopyLevelsResult {
  const from = g.levels.find((l) => l.id === o.from);
  const targets = o.to.map((id) => g.levels.find((l) => l.id === id)).filter((l) => l && l.id !== o.from) as typeof g.levels;
  if (!from || targets.length === 0) return { copied: 0, levels: 0, refused: 'levels' };
  const picked = [...modelStore.model.groups.values()].filter((grp) => {
    if (grp.kind !== PHYSICAL_GROUP_KIND) return false;
    const d = grp.data as unknown as PhysicalData;
    if (!o.kinds.includes(d.kind)) return false;
    return d.kind === 'column' || d.kind === 'wall' ? d.levelTo === from.id : d.levelFrom === from.id;
  });
  if (picked.length === 0) return { copied: 0, levels: 0, refused: 'nothing' };
  const set = {
    nodes: [] as number[],
    elements: picked.flatMap((p) => p.members.elements ?? []),
    quads: picked.flatMap((p) => p.members.quads ?? []),
    plates: picked.flatMap((p) => p.members.plates ?? []),
  };
  // Only the physical groups go with the copy; every other group the set happens to fill stays.
  const others = [...modelStore.model.groups.values()].filter((grp) => !picked.includes(grp)).map((grp) => grp.id);
  let copied = 0;
  modelStore.batch(() => {
    const r = copyTransformed(set, targets.map((l) => translation([0, 0, l.z - from.z])), { withGroups: true, withLoads: false, withSupports: false });
    const levels = modelStore.grid?.levels ?? g.levels;
    const names = Object.fromEntries((Object.keys(PREFIX) as PhysicalKind[]).map((k) => [k, nextName(PREFIX[k])])) as Record<PhysicalKind, () => string>;
    for (const id of r.groups) {
      const grp = modelStore.model.groups.get(id);
      if (!grp) continue;
      if (grp.kind !== PHYSICAL_GROUP_KIND || others.includes(id)) { modelStore.removeGroup(id); continue; }
      const m = {
        elements: (grp.members.elements ?? []).filter((x) => modelStore.elements.has(x)),
        quads: (grp.members.quads ?? []).filter((x) => modelStore.quads.has(x)),
        plates: (grp.members.plates ?? []).filter((x) => modelStore.plates.has(x)),
      };
      if (m.elements.length + m.quads.length + m.plates.length === 0) { modelStore.removeGroup(id); continue; }
      const zs = [
        ...m.elements.flatMap((e) => { const el = modelStore.elements.get(e)!; return [el.nodeI, el.nodeJ]; }),
        ...m.quads.flatMap((q) => modelStore.quads.get(q)!.nodes), ...m.plates.flatMap((q) => modelStore.plates.get(q)!.nodes),
      ].map((n) => modelStore.nodes.get(n)?.z ?? 0);
      const d = grp.data as unknown as PhysicalData;
      modelStore.setGroupMembers(id, m);
      modelStore.setGroupData(id, { ...d, levelFrom: levelAt(Math.min(...zs), levels), levelTo: levelAt(Math.max(...zs), levels) } as unknown as Record<string, unknown>);
      modelStore.renameGroup(id, names[d.kind]());
      copied++;
    }
  });
  return { copied, levels: targets.length };
}
