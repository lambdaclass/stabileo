/**
 * The batch for walls, slab panels, footings and stairs in the store: each family's items as the
 * batch reads them (the person's arrangement where saved, else the design's), and writing a
 * batch's rows in one undo step. Walls and slabs are laid again after the write, as their editors
 * do; footings and stairs are checked again by their own channels.
 */
import { modelStore } from './model.svelte';
import { detailingStore } from './detailing.svelte';
import { storedDecisions } from './design-decisions';
import { designData } from './design-data';
import { saveStairs, stairEntries } from './stairs-pt';
import type { FamilyRow, FootingMatsShape } from '../engine/design/family-batch';
import type { SlabPanelReinforcement, WallReinforcement } from '../design-contract/reinforcement';

export type BatchFamily = 'wall' | 'slab' | 'footing' | 'stair';

export function wallItems() {
  const d = storedDecisions().walls ?? {};
  return (detailingStore.lastFloorRun?.walls ?? []).map((w) => ({ id: w.wallId, label: w.wallId, current: d[w.wallId] ?? w.reinforcement, thickness: w.input.thickness }));
}

export function slabItems() {
  const d = storedDecisions().slabs ?? {};
  return (detailingStore.lastFloorRun?.slabs ?? []).flatMap((s) => (s.panel ? [{ id: s.panelId, label: s.panelId, current: d[s.panelId] ?? s.panel.reinforcement, thickness: s.panel.input.thickness }] : []));
}

export function footingItems() {
  return [...modelStore.model.footings.values()].sort((a, b) => a.id - b.id).map((f, i) => ({ id: String(f.id), label: `Z${i + 1}`, current: f.mats as FootingMatsShape | undefined }));
}

export function stairItems() {
  return stairEntries().map((s) => ({ id: s.id, label: s.name, barDia: s.barDia ?? 12, distDia: s.distDia ?? 8 }));
}

/** The project's bar diameters, for the batch's diameter check. */
export const batchDiameters = (): number[] => [...new Set([...designData().longDiametersMm, ...designData().stirrupDiametersMm])].sort((a, b) => a - b);

/** Write the rows that change, one undo step. Returns how many items changed. */
export function applyFamilyBatch(family: BatchFamily, rows: ReadonlyArray<FamilyRow<unknown>>): number {
  const ok = rows.filter((r) => r.next !== undefined);
  if (!ok.length) return 0;
  if (family === 'wall' || family === 'slab') {
    const d = storedDecisions();
    const key = family === 'wall' ? 'walls' : 'slabs';
    const map = { ...((d[key] ?? {}) as Record<string, WallReinforcement | SlabPanelReinforcement>) };
    for (const r of ok) map[r.id] = JSON.parse(JSON.stringify(r.next));
    modelStore.reinforcementTransaction((api) => api.setDecisions({ ...d, [key]: map }));
    detailingStore.generateFloors({ families: [family] });
  } else if (family === 'footing') {
    modelStore.batch(() => { for (const r of ok) modelStore.updateFooting(Number(r.id), { mats: r.next as FootingMatsShape }); });
  } else {
    const by = new Map(ok.map((r) => [r.id, r.next as { barDia: number; distDia: number }]));
    saveStairs(stairEntries().map((s) => (by.has(s.id) ? { ...s, ...by.get(s.id)! } : s)));
  }
  return ok.length;
}
