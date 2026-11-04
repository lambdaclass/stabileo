/**
 * The life of a member's design decision: proposed by a design run, edited by a person, locked
 * against a redesign; reverted to the last proposal; saved and recovered as a copy of a level's
 * bars. The decisions live beside the bars (`model.designDecisions`), so a lock, a revert or a
 * recovered copy is one undo step with them and survives the project file.
 *
 * A design run writes proposals only where there is no lock. What it does with a member a person
 * edited and did not lock is the caller's to say (`autoDesign`'s `edited` option).
 */
import { modelStore } from './model.svelte';
import { designRunStore } from './design-run.svelte';
import { verificationStore } from './verification.svelte';
import { detailableReinforcement } from '../engine/design/outcome';
import { emptyStoredDecisions, migrateStoredDecisions, type DecisionCopy, type DecisionState, type StoredDecisions } from '../design-contract/decisions';
export { withProposals } from '../design-contract/decisions';
import { withProposals as withProposalsFn } from '../design-contract/decisions';
import type { ProvidedReinforcement as ProvidedReinforcementLike } from '../design-contract/reinforcement';
import { physicalGroups } from './physical';
import { withSpanPieces } from './design-spans-store';

/** Every piece of the span each member is a piece of: a span is locked, reverted and copied whole. */
const withPieces = (ids: Iterable<number>) => withSpanPieces(ids, (id) => verificationStore.contextFor(id));

export function storedDecisions(): StoredDecisions {
  return modelStore.designDecisions ? migrateStoredDecisions(modelStore.designDecisions) : emptyStoredDecisions();
}

export const isLocked = (id: number): boolean => storedDecisions().locked.includes(id);
export const lockedIds = (): Set<number> => new Set(storedDecisions().locked);

/** What a member's bars are: none, proposed by a run, edited by a person, or locked. */
export function decisionState(id: number): DecisionState | 'none' {
  if (!modelStore.elements.get(id)?.reinforcement) return 'none';
  if (isLocked(id)) return 'locked';
  return designRunStore.manualOverrides.has(id) ? 'edited' : 'proposed';
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Lock or unlock members against a redesign. One undo step. */
export function setLocked(ids: Iterable<number>, locked: boolean): void {
  const d = storedDecisions();
  const set = new Set(d.locked);
  for (const id of withPieces(ids)) { if (locked) set.add(id); else set.delete(id); }
  modelStore.reinforcementTransaction((api) => api.setDecisions({ ...d, locked: [...set].sort((a, b) => a - b) }));
}

/**
 * Back to the last proposal: the bars the design gave each member, kept with the project, or the
 * outcome of this session's run when the project predates the record. A member no design ever
 * proposed for keeps its bars; nothing is erased. One undo step.
 */
export function revertToProposal(ids: Iterable<number>): Set<number> {
  const d = storedDecisions();
  const reverted = new Set<number>();
  const written = modelStore.reinforcementTransaction((api) => {
    for (const id of withPieces(ids)) {
      const stored = d.proposals[String(id)];
      const fromRun = detailableReinforcement(verificationStore.outcomeFor(id))?.rebar;
      const back = stored ?? fromRun;
      if (!back) continue;
      api.setReinforcement(id, clone(back));
      reverted.add(id);
    }
  });
  designRunStore.markAuto([...written].filter((id) => reverted.has(id)));
  return written;
}

/** The bar members of a level (by their physical elements), or every member with bars. */
function membersOf(levelId?: string): number[] {
  if (!levelId) return [...modelStore.elements.values()].filter((e) => e.reinforcement).map((e) => e.id);
  const ids = new Set<number>();
  for (const g of physicalGroups()) {
    if (g.physical.levelFrom !== levelId && g.physical.levelTo !== levelId) continue;
    for (const id of g.members.elements ?? []) ids.add(id);
  }
  return [...ids];
}

/** Save a copy of a level's bars, or the whole frame's. Returns its id. */
export function saveCopy(label: string, levelId?: string): string {
  const d = storedDecisions();
  const byElement: DecisionCopy['byElement'] = {};
  for (const id of membersOf(levelId)) {
    const r = modelStore.elements.get(id)?.reinforcement;
    byElement[String(id)] = r ? clone(r) : null;
  }
  const id = `copy-${Date.now().toString(36)}-${d.copies.length + 1}`;
  const copy: DecisionCopy = { id, label, at: new Date().toISOString(), ...(levelId ? { levelId } : {}), byElement };
  modelStore.reinforcementTransaction((api) => api.setDecisions({ ...d, copies: [...d.copies, copy] }));
  return id;
}

/**
 * Recover a copy: every member in it gets the bars it had, locked ones included (the person asked
 * for this copy). Members deleted since are skipped. One undo step.
 */
export function recoverCopy(copyId: string): number {
  const c = storedDecisions().copies.find((x) => x.id === copyId);
  if (!c) return 0;
  const written = modelStore.reinforcementTransaction((api) => {
    for (const [k, r] of Object.entries(c.byElement)) {
      const id = Number(k);
      if (modelStore.elements.has(id)) api.setReinforcement(id, r ? clone(r) : undefined);
    }
  });
  designRunStore.markManual([...written].filter((id) => c.byElement[String(id)]));
  return written.size;
}

export function removeCopy(copyId: string): void {
  const d = storedDecisions();
  modelStore.reinforcementTransaction((api) => api.setDecisions({ ...d, copies: d.copies.filter((x) => x.id !== copyId) }));
}

/**
 * Copy one member's bars onto others of the same section (equalize): each target gets the
 * arrangement as an edit. Targets of another section, or locked, are left. One undo step.
 */
export function equalizeFrom(sourceId: number, targets: Iterable<number>): number[] {
  const src = modelStore.elements.get(sourceId);
  if (!src?.reinforcement) return [];
  const locked = lockedIds();
  const own = new Set(withPieces([sourceId]));
  const ok = withPieces(targets).filter((id) => !own.has(id) && !locked.has(id) && modelStore.elements.get(id)?.sectionId === src.sectionId);
  const written = modelStore.reinforcementTransaction((api) => { for (const id of ok) api.setReinforcement(id, clone(src.reinforcement!)); });
  designRunStore.markManual(written);
  return [...written];
}

/**
 * The detailing's repaired bars, written as the new proposal of each member: what the design now
 * stands behind is what «revert» goes back to.
 */
export function writeRepaired(
  api: { setReinforcement(id: number, r: ProvidedReinforcementLike): void; setDecisions(d: StoredDecisions): void },
  repaired: Array<{ elementId: number; accepted?: ProvidedReinforcementLike }>,
): void {
  const list = repaired.filter((o) => o.accepted).map((o) => [o.elementId, o.accepted!] as [number, ProvidedReinforcementLike]);
  for (const [id, r] of list) api.setReinforcement(id, r);
  api.setDecisions(withProposalsFn(storedDecisions(), list));
}
