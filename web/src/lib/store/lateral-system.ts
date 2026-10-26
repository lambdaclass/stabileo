/**
 * The project's declaration of which members are part of the lateral-force-resisting system
 * (`model/lateral-system.ts`), as the design reads it and as a person changes it.
 *
 * Read: `lateralResolver` hands the member contexts each member's reading (its own declaration,
 * its physical element's, the beams' default, or none), so the verifier, the candidate search and
 * the detailing all read the one reading. Changed: through the design data (`patchDesignData`), so
 * a declaration saves and opens with the project, autosaves, undoes as one step, keeps the solve
 * and retires the design it fed.
 *
 * A member that belongs to a physical element is declared on the element (`P{id}`): the whole
 * continuous beam, which keeps its id when the elements are recognised again
 * (`group-references.ts`, place `lateral`) and keeps its declaration when its bars are split or
 * re-meshed, since the bars are read off it when the design runs. Elsewhere the analysis member is
 * declared (`e{id}`), every piece of its span with it.
 */
import { modelStore } from './model.svelte';
import { designData, patchDesignData } from './design-data';
import { physicalGroups } from './physical';
import {
  lateralReadingOf, memberKey, physicalKey,
  type LateralReading, type LateralRole, type LateralSystemData,
} from '../model/lateral-system';

/** The declarations in force. */
export const lateralData = (): LateralSystemData => designData().lateralSystem ?? {};

/** Each analysis bar's physical element of a frame kind, by element id. */
function physicalOfElements(): Map<number, number> {
  const out = new Map<number, number>();
  for (const g of physicalGroups()) {
    if (g.physical.kind !== 'beam' && g.physical.kind !== 'column') continue;
    for (const id of g.members.elements ?? []) out.set(id, g.id);
  }
  return out;
}

/** Every member's reading, for the member contexts (`buildAllMemberContexts` `lateralOf`). */
export function lateralResolver(): (elementId: number, kind: 'beam' | 'column' | 'wall') => LateralReading {
  const data = lateralData(), phys = physicalOfElements();
  return (id, kind) => lateralReadingOf(data, id, { physicalId: phys.get(id), kind });
}

/** One member's reading, as the design would read it now. */
export function lateralReadingFor(elementId: number, kind: 'beam' | 'column' | 'wall' = 'beam'): LateralReading {
  return lateralResolver()(elementId, kind);
}

/**
 * Declare members part of the lateral system, not part of it, or withdraw their declaration
 * (null: they read the beams' default, or nothing). A member of a physical element declares the
 * element, and the element's bars lose any declaration of their own, so the element's governs.
 * One undo step; the design it fed is retired.
 */
export function setMemberLateral(elementIds: readonly number[], role: LateralRole | null): void {
  declareLateral(elementIds.map((id) => [id, role] as const));
}

/** Several members, each with its own role (or null), as one undo step (`setMemberLateral`). */
export function declareLateral(assign: Iterable<readonly [number, LateralRole | null]>): void {
  const d = lateralData(), phys = physicalOfElements();
  const members: Record<string, LateralRole> = { ...(d.members ?? {}) };
  const groups = new Map<number, LateralRole | null>();
  for (const [id, role] of assign) {
    if (!modelStore.model.elements.has(id)) continue;
    const g = phys.get(id);
    if (g === undefined) { if (role) members[memberKey(id)] = role; else delete members[memberKey(id)]; continue; }
    groups.set(g, role);
  }
  for (const [g, role] of groups) {
    if (role) members[physicalKey(g)] = role; else delete members[physicalKey(g)];
    for (const [id, owner] of phys) if (owner === g) delete members[memberKey(id)];
  }
  writeLateral({ ...d, members });
}

/** The beams' default: what a beam that declares nothing of its own is (null: not declared). */
export function setBeamsLateral(role: LateralRole | null): void {
  const { beams: _b, ...rest } = lateralData();
  writeLateral(role ? { ...rest, beams: role } : rest);
}

function writeLateral(next: LateralSystemData): void {
  const members = next.members && Object.keys(next.members).length ? next.members : undefined;
  const clean: LateralSystemData = { ...(next.beams ? { beams: next.beams } : {}), ...(members ? { members } : {}) };
  if (JSON.stringify(clean) === JSON.stringify(lateralData())) return;
  patchDesignData({ lateralSystem: Object.keys(clean).length ? clean : undefined });
}
