/**
 * The beams a project can list to take the slab as their flange: its physical beams by name, those
 * holding the members selected, and the names someone types, read one by one.
 */
import { PHYSICAL_GROUP_KIND } from '../model/physical/types';

type Group = { id: number; name?: string; kind: string; data?: unknown; members: { elements?: number[] } };
export interface NamedBeam { id: number; name: string; level: string }

const isBeam = (g: Group) => g.kind === PHYSICAL_GROUP_KIND && (g.data as { kind?: string } | undefined)?.kind === 'beam';

/** Every physical beam with its name and level, in the order a person reads names (V2 before V10). */
export function beamsByName(groups: Iterable<Group>): NamedBeam[] {
  return [...groups].filter(isBeam).map((g) => ({ id: g.id, name: g.name ?? `#${g.id}`, level: (g.data as { levelFrom?: string } | undefined)?.levelFrom?.replace(/^z:/, '') ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** The beams holding any of the members selected. */
export function beamsHolding(groups: Iterable<Group>, selected: ReadonlySet<number>): number[] {
  return selected.size ? [...groups].filter((g) => isBeam(g) && (g.members.elements ?? []).some((e) => selected.has(e))).map((g) => g.id) : [];
}

/** The beams named in `text`, separated by commas, semicolons or spaces, read without regard to case; the names no beam has, apart. */
export function parseBeamNames(text: string, beams: readonly NamedBeam[]): { ids: number[]; unknown: string[] } {
  const ids: number[] = [], unknown: string[] = [];
  for (const raw of text.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)) {
    const hit = beams.filter((b) => b.name.toLowerCase() === raw.toLowerCase());
    if (hit.length) ids.push(...hit.map((b) => b.id)); else unknown.push(raw);
  }
  return { ids: [...new Set(ids)], unknown };
}
