/**
 * The loads of the model's floor-load definitions (`model/loads/floor-definitions.ts`), kept in
 * step with them: written when a definition is, and rewritten whenever the model moves under them
 * (a beam added, a node moved), once the model is still after an edit, and before any analysis
 * reads them (the axis convention, which is not an edit of the model, included). When nothing
 * changed, nothing is written.
 *
 * They are derived data, so a rewrite takes no undo step of its own: it belongs to the edit that
 * made it necessary. As a step of its own, undo took the rewrite back, the next solve wrote it
 * again, and that new step cleared redo.
 */
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { whatIf } from './whatif.svelte';
import { expandAll, definitionsCurrent, isDefinedLoad, zoneOutlineProblem, type DefinitionModel, type Expansion, type FloorLoadDef, type ZoneData } from '../model/loads/floor-definitions';
import type { GroupMembers, Load } from './model.svelte';

const defModel = (): DefinitionModel => modelStore.model as unknown as DefinitionModel;
const leftHand = () => uiStore.axisConvention3D === 'leftHand';
const fromDefOf = (l: Load) => (l.data as { fromDef?: number }).fromDef;

/**
 * What an expansion reads, by identity: the store replaces a family's map whenever it changes one
 * of its entries (inside `bulkMutate` only at the end, and nothing expands in there), and moves the
 * model's version on every edit.
 */
function expansionKey(): unknown[] {
  const m = modelStore.model;
  return [modelStore.modelVersion, m.nodes, m.elements, m.quads, m.plates, m.sections, m.groups, m.loadCases.map((c) => c.id).join(','), leftHand()];
}
let memo: { key: unknown[]; exp: Expansion[] } | null = null;

/**
 * Every definition expanded against the model as it is. Kept until the model changes: the list of
 * definitions and the rewrite after an edit read the same expansion (some tens of milliseconds on
 * a building of eight floors), instead of each making its own.
 */
export function expandDefinitions(): Expansion[] {
  const key = expansionKey();
  if (memo && memo.key.length === key.length && memo.key.every((v, i) => v === key[i])) return memo.exp;
  const exp = expandAll(defModel(), { leftHand: leftHand() });
  memo = { key, exp };
  return exp;
}

/**
 * Bring the definitions' loads up to date. Returns how many loads were written, or null when they
 * were already current.
 *
 * A load marked with a definition the model does not hold (a link or a file that lost it, a paste
 * from another model) stays, as a plain load: its definition is not there to write it again, and
 * deleting it took the floor's whole load away without a word.
 */
export function syncDefinedLoads(): number | null {
  const exp = expandDefinitions();
  const defs = new Set(exp.map((e) => e.defId));
  const orphan = (l: Load) => { const d = fromDefOf(l); return d !== undefined && !defs.has(d); };
  if (!modelStore.loads.some(orphan) && definitionsCurrent(modelStore.loads, exp)) return null;
  const fresh = exp.flatMap((e) => e.loads);
  // Part of the step being made, or of the last one: never a step of its own (see above).
  modelStore.amendLastStep(() => {
    modelStore.replaceLoads(modelStore.loads.flatMap((l) => {
      if (fromDefOf(l) === undefined) return [l];
      if (!orphan(l)) return [];
      const data = { ...l.data } as Record<string, unknown>;
      delete data.fromDef;
      return [{ ...l, data } as unknown as Load];
    }));
    for (const l of fresh) modelStore.addLoadEntry(l as Load);
  });
  return fresh.length;
}

/**
 * The same, before a solve or an analysis reads the loads. Not during an Explore session
 * (`whatif.svelte.ts`): its model is the baseline with each load scaled by its slider, the
 * definitions' loads included, and a rewrite would put them back unscaled.
 */
export function syncDefinedLoadsForAnalysis(): number | null {
  return whatIf.active ? null : syncDefinedLoads();
}

/** Whether the model has anything to keep in step: a definition, or a load one wrote. */
function hasDefinitions(): boolean {
  for (const g of modelStore.model.groups.values()) if (g.kind === 'floorLoad') return true;
  return modelStore.loads.some(isDefinedLoad);
}

let timer: ReturnType<typeof setTimeout> | null = null;
let syncing = false;

/** How long the model must stay still before the definitions' loads are rewritten, ms. */
export const DEFINED_LOADS_SETTLE_MS = 150;

/**
 * After a change of the model (`store/index.ts`): the definitions' loads rewritten once the model
 * has been still for a moment, in the current undo step. A rewrite expands every definition (some
 * tens of milliseconds on a building of eight floors), and rewriting on every edit cost that on
 * every step of a node drag; now a drag pays it once, when it stops.
 *
 * Nothing reads them stale meanwhile: every analysis builds its input through the store, which
 * flushes a pending rewrite first (`flushDefinedLoadsSync`), and Solve and live calc rewrite
 * before solving. Only the drawing and the tables may show the previous loads for that moment.
 */
export function scheduleDefinedLoadsSync(): void {
  if (syncing) return;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; runPendingSync(); }, DEFINED_LOADS_SETTLE_MS);
}

/** A rewrite scheduled and not yet run, run now: before an analysis reads the loads. */
export function flushDefinedLoadsSync(): void {
  if (timer === null) return;
  clearTimeout(timer);
  timer = null;
  runPendingSync();
}

function runPendingSync(): void {
  if (!uiStore.is3DWorkspace || !hasDefinitions()) return;
  // Its own rewrite is a change of the model too; it does not schedule another.
  syncing = true;
  try { syncDefinedLoadsForAnalysis(); } finally { syncing = false; }
}

/** A new floor-load definition, with its loads, in one undo step. Returns its group id. */
export function addFloorLoadDef(name: string, def: FloorLoadDef, own: GroupMembers = {}): number {
  let id = -1;
  modelStore.batch(() => {
    id = modelStore.addGroup(name, 'floorLoad', own, { data: def as unknown as Record<string, unknown> });
    syncDefinedLoads();
  });
  return id;
}

/** A definition removed with its loads. */
export function removeFloorLoadDef(id: number): void {
  modelStore.batch(() => {
    modelStore.removeGroup(id);
    syncDefinedLoads();
  });
}

/**
 * A zone from nodes in order around its outline, members it leaves out and other zones as
 * openings. -1, and nothing added, for an outline that is no zone (`zoneOutlineProblem`): fewer
 * than three nodes, or picked out of order so that it crosses itself.
 */
export function addLoadZone(name: string, outline: number[], excluded: number[] = [], openings: number[] = []): number {
  if (zoneOutlineProblem(defModel(), outline)) return -1;
  let id = -1;
  const data: ZoneData = { ...(openings.length ? { openings } : {}), corners: outline.length };
  modelStore.batch(() => {
    id = modelStore.addGroup(name, 'loadZone', { nodes: outline, ...(excluded.length ? { elements: excluded } : {}) }, { data: data as Record<string, unknown> });
    syncDefinedLoads();
  });
  return id;
}

/** A zone removed: the zones it was an opening of lose it, and the loads follow, in one step. */
export function removeLoadZone(id: number): void {
  modelStore.batch(() => {
    for (const g of modelStore.model.groups.values()) {
      const d = g.data as ZoneData | undefined;
      if (g.kind === 'loadZone' && d?.openings?.includes(id)) modelStore.setGroupData(g.id, { ...d, openings: d.openings.filter((x) => x !== id) });
    }
    modelStore.removeGroup(id);
    syncDefinedLoads();
  });
}
