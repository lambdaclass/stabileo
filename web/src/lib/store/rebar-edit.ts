// Reinforcement editing helpers.
//
// EVERY write goes through `modelStore.reinforcementTransaction`, so:
//   - one user action = one undo step
//   - `model.elements` is reassigned exactly once (one reactive commit)
//   - `modelVersion` is NOT bumped → analysis results and retained demand survive
//   - no structural solve is triggered
//   - the affected elements' cached verification is dropped, so they re-verify
//     immediately from the retained demand
//
// The previous code reassigned `model.elements` directly from the component, pushed
// no history at all (reinforcement was simply not undoable), and mutated the live
// proxied object in place before cloning it.

import { modelStore } from './model.svelte';
import { designRunStore } from './design-run.svelte';
import type { ProvidedReinforcement, RebarLayer, StirrupDef } from './model.svelte';
import { resolveLayers } from '../engine/station-design-forces';

export type LayerField = 'topStartLayers' | 'topEndLayers' | 'bottomSpanLayers';
const GROUP_OF: Record<LayerField, 'topStart' | 'topEnd' | 'bottomSpan'> = {
  topStartLayers: 'topStart',
  topEndLayers: 'topEnd',
  bottomSpanLayers: 'bottomSpan',
};

export function getReinforcement(elemId: number): ProvidedReinforcement | undefined {
  return modelStore.elements.get(elemId)?.reinforcement;
}

/** Deep, proxy-free clone so callers never mutate live model state.
 *  A JSON round-trip unwraps Svelte 5 proxies; `$state.snapshot` is deliberately NOT
 *  used because this is a plain `.ts` module (runes are only compiled in
 *  `.svelte`/`.svelte.ts` files). `reinforcementTransaction` snapshots again on
 *  commit, so the stored object is proxy-free either way. */
function draft(elemId: number): ProvidedReinforcement {
  const cur = getReinforcement(elemId);
  return cur ? (JSON.parse(JSON.stringify(cur)) as ProvidedReinforcement) : {};
}

/** Commit one element's reinforcement as a manual (user) edit. */
export function commitManual(elemId: number, next: ProvidedReinforcement | undefined): void {
  const written = modelStore.reinforcementTransaction((api) => api.setReinforcement(elemId, next));
  if (written.size > 0) designRunStore.markManual(written);
}

/** Commit many elements at once — still ONE undo step. */
export function commitManualBatch(entries: Iterable<[number, ProvidedReinforcement | undefined]>): Set<number> {
  const written = modelStore.reinforcementTransaction((api) => {
    for (const [id, r] of entries) api.setReinforcement(id, r);
  });
  if (written.size > 0) designRunStore.markManual(written);
  return written;
}

export function getRegionLayers(elemId: number, field: LayerField): RebarLayer[] {
  const prov = getReinforcement(elemId);
  const gField = GROUP_OF[field];
  const legacy = field.includes('top') ? prov?.top : prov?.bottom;
  return resolveLayers(prov?.regions?.[field], prov?.regions?.[gField] ?? legacy);
}

export function setRegionLayers(elemId: number, field: LayerField, layers: RebarLayer[]): void {
  const p = draft(elemId);
  p.regions = p.regions ?? {};
  const gField = GROUP_OF[field];
  if (layers.length > 0) {
    p.regions[field] = layers.map((l, i) => ({ ...l, row: i }));
    p.regions[gField] = { count: layers.reduce((s, l) => s + l.count, 0), diameter: layers[0].diameter };
  } else {
    delete p.regions[field];
    delete p.regions[gField];
  }
  // Group form is derived from the flat layers here; keeping a stale group array
  // would let the two representations diverge.
  const groupsKey = gField === 'bottomSpan' ? 'bottomGroups' : gField === 'topStart' ? 'topStartGroups' : 'topEndGroups';
  if (p.regions[groupsKey]) delete p.regions[groupsKey];
  commitManual(elemId, p);
}

export function addLayerRow(elemId: number, field: LayerField): void {
  const layers = getRegionLayers(elemId, field);
  const dia = layers.length > 0 ? layers[layers.length - 1].diameter : 16;
  setRegionLayers(elemId, field, [...layers, { count: 2, diameter: dia, row: layers.length }]);
}

export function removeLayerRow(elemId: number, field: LayerField, row: number): void {
  setRegionLayers(elemId, field, getRegionLayers(elemId, field).filter(l => l.row !== row));
}

export function updateLayer(
  elemId: number, field: LayerField, row: number,
  key: 'count' | 'diameter', value: number,
): void {
  const layers = getRegionLayers(elemId, field).map(l => (
    l.row === row
      ? { ...l, [key]: key === 'count' ? Math.max(1, Math.round(value)) : value }
      : l
  ));
  setRegionLayers(elemId, field, layers);
}

export type StirrupField = 'stirrupsSupport' | 'stirrupsSpan';

export function getStirrups(elemId: number, field: StirrupField): StirrupDef | undefined {
  const p = getReinforcement(elemId);
  return p?.regions?.[field] ?? p?.stirrups;
}

export function setStirrups(elemId: number, field: StirrupField, patch: Partial<StirrupDef>): void {
  const p = draft(elemId);
  p.regions = p.regions ?? {};
  const cur = p.regions[field] ?? p.stirrups;
  p.regions[field] = {
    diameter: patch.diameter ?? cur?.diameter ?? 8,
    legs: Math.max(2, patch.legs ?? cur?.legs ?? 2),
    spacing: Math.max(0.05, patch.spacing ?? cur?.spacing ?? 0.15),
  };
  commitManual(elemId, p);
}

/** Column ties (single definition over the member). */
export function setTies(elemId: number, patch: Partial<StirrupDef>): void {
  const p = draft(elemId);
  const cur = p.stirrups;
  p.stirrups = {
    diameter: patch.diameter ?? cur?.diameter ?? 8,
    legs: Math.max(2, patch.legs ?? cur?.legs ?? 2),
    spacing: Math.max(0.05, patch.spacing ?? cur?.spacing ?? 0.15),
  };
  commitManual(elemId, p);
}

export interface ColumnFacePatch {
  cornerDia?: number;
  faceDia?: number;
  nBottom?: number;
  nTop?: number;
  nLeft?: number;
  nRight?: number;
}

export function setColumnBars(elemId: number, patch: ColumnFacePatch): void {
  const p = draft(elemId);
  const cur = p.column;
  const cornerDia = patch.cornerDia ?? cur?.cornerDia ?? p.longitudinal?.diameter ?? 16;
  const faceDia = patch.faceDia ?? cur?.faceDia ?? cornerDia;
  const clamp = (v: number | undefined, fallback: number) => Math.max(0, Math.min(10, Math.round(v ?? fallback)));
  const next = {
    cornerDia, faceDia,
    nBottom: clamp(patch.nBottom, cur?.nBottom ?? 0),
    nTop: clamp(patch.nTop, cur?.nTop ?? 0),
    nLeft: clamp(patch.nLeft, cur?.nLeft ?? 0),
    nRight: clamp(patch.nRight, cur?.nRight ?? 0),
  };
  p.column = next;
  p.longitudinal = { count: 4 + next.nBottom + next.nTop + next.nLeft + next.nRight, diameter: cornerDia };
  commitManual(elemId, p);
}

/** Remove all reinforcement from an element. */
export function clearReinforcement(elemId: number): void {
  const written = modelStore.reinforcementTransaction((api) => api.setReinforcement(elemId, undefined));
  designRunStore.clearMarks(written);
}

/** Revert edits by clearing reinforcement on the given elements (one undo step). */
export function revertReinforcement(ids: Iterable<number>): Set<number> {
  const list = [...ids];
  const written = modelStore.reinforcementTransaction((api) => {
    for (const id of list) api.setReinforcement(id, undefined);
  });
  designRunStore.clearMarks(written);
  return written;
}
