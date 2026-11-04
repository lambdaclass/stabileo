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

import { revertToProposal } from './design-decisions';
import { modelStore } from './model.svelte';
import { designRunStore } from './design-run.svelte';
import { verificationStore } from './verification.svelte';
import { withSpanPieces } from './design-spans-store';
import type { ProvidedReinforcement, RebarLayer, StirrupDef } from './model.svelte';
import { regroupBars } from '../engine/design/rebar-groups';
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

/** The pieces of the span an element belongs to: a span's pieces hold one arrangement. */
const pieces = (id: number) => withSpanPieces([id], (x) => verificationStore.contextFor(x));

/** Commit one element's reinforcement as a manual (user) edit. */
export function commitManual(elemId: number, next: ProvidedReinforcement | undefined): void {
  const written = modelStore.reinforcementTransaction((api) => { for (const id of pieces(elemId)) api.setReinforcement(id, next); });
  if (written.size > 0) designRunStore.markManual(written);
}

/** Commit many elements at once — still ONE undo step. */
export function commitManualBatch(entries: Iterable<[number, ProvidedReinforcement | undefined]>): Set<number> {
  const written = modelStore.reinforcementTransaction((api) => {
    for (const [id, r] of entries) for (const p of pieces(id)) api.setReinforcement(p, r);
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
  // The cut groups follow the edited layers: the bars that ran through keep running through, and
  // the rest keep the cut-off ends they had. Deleting them made every retouched beam full-length.
  const groupsKey = gField === 'bottomSpan' ? 'bottomGroups' : gField === 'topStart' ? 'topStartGroups' : 'topEndGroups';
  const regrouped = regroupBars(p.regions[groupsKey], layers);
  if (regrouped) p.regions[groupsKey] = regrouped;
  else delete p.regions[groupsKey];
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
    // Clamp to the constructible range — Av = legs × legArea enters the shear
    // capacity unchecked, so a typed legs=20 would verify green on fantasy
    // reinforcement. The editors advertise max=6; enforce it here too.
    legs: Math.max(2, Math.min(6, Math.round(patch.legs ?? cur?.legs ?? 2))),
    spacing: Math.max(0.05, patch.spacing ?? cur?.spacing ?? 0.15),
  };
  commitManual(elemId, p);
}

/** Whether the bottom bars running into each support end hooked (§25.4.3). */
export function getBottomHooks(elemId: number): { start: boolean; end: boolean } {
  const g = getReinforcement(elemId)?.regions?.bottomGroups ?? [];
  return { start: g.some((x) => x.anchorageStart === 'hook'), end: g.some((x) => x.anchorageEnd === 'hook') };
}

export function setBottomHook(elemId: number, toward: 'start' | 'end', hooked: boolean): void {
  const p = draft(elemId);
  p.regions = p.regions ?? {};
  const layers = resolveLayers(p.regions.bottomSpanLayers, p.regions.bottomSpan ?? p.bottom);
  if (layers.length === 0) return;
  const groups = p.regions.bottomGroups?.length
    ? p.regions.bottomGroups.map((g) => ({ ...g }))
    : [{ layers: layers.map((l, row) => ({ ...l, row })), label: 'all', continueStart: p.regions.continuity?.bottomIntoStart !== false, continueEnd: p.regions.continuity?.bottomIntoEnd !== false }];
  const key = toward === 'start' ? 'anchorageStart' : 'anchorageEnd';
  const reaches = toward === 'start' ? 'continueStart' : 'continueEnd';
  for (const g of groups) {
    if (g[reaches] === false) continue;
    if (hooked) g[key] = 'hook'; else delete g[key];
  }
  const plain = groups.length === 1 && !groups[0]!.anchorageStart && !groups[0]!.anchorageEnd && groups[0]!.label === 'all';
  if (plain) delete p.regions.bottomGroups; else p.regions.bottomGroups = groups;
  commitManual(elemId, p);
}

/** A deep beam's skin bars (§9.7.2.3), or none. */
export function getSkin(elemId: number): { diameter: number; spacing: number } | undefined {
  return getReinforcement(elemId)?.regions?.skin;
}

export function setSkin(elemId: number, patch: Partial<{ diameter: number; spacing: number }> | null): void {
  const p = draft(elemId);
  p.regions = p.regions ?? {};
  if (patch === null) delete p.regions.skin;
  else {
    const cur = p.regions.skin;
    p.regions.skin = { diameter: patch.diameter ?? cur?.diameter ?? 10, spacing: Math.max(0.05, patch.spacing ?? cur?.spacing ?? 0.25) };
  }
  commitManual(elemId, p);
}

/** The bars around a circular, T or L column, and a circular column's spiral (null removes it). */
export function setShapedBars(elemId: number, patch: { count?: number; diameter?: number; spiral?: { diameter: number; pitch: number } | null }): void {
  const p = draft(elemId);
  const cur = p.shaped;
  const count = Math.max(4, Math.min(40, Math.round(patch.count ?? cur?.count ?? 6)));
  const diameter = patch.diameter ?? cur?.diameter ?? 16;
  const spiral = patch.spiral === null ? undefined : patch.spiral ? { diameter: patch.spiral.diameter, pitch: Math.max(0.03, patch.spiral.pitch) } : cur?.spiral;
  p.shaped = { count, diameter, ...(spiral ? { spiral } : {}) };
  p.longitudinal = { count, diameter };
  commitManual(elemId, p);
}

/** A column's denser end zones, or none. */
export function setTieZones(elemId: number, z: { endLength: number; endSpacing: number } | null): void {
  const p = draft(elemId);
  if (z === null) delete p.tieZones;
  else p.tieZones = { endLength: Math.max(0.1, z.endLength), endSpacing: Math.max(0.05, z.endSpacing) };
  commitManual(elemId, p);
}

/** Column ties (single definition over the member). */
export function setTies(elemId: number, patch: Partial<StirrupDef>): void {
  const p = draft(elemId);
  const cur = p.stirrups;
  p.stirrups = {
    diameter: patch.diameter ?? cur?.diameter ?? 8,
    legs: Math.max(2, Math.min(6, Math.round(patch.legs ?? cur?.legs ?? 2))),
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
  // Consistent with COLUMN_LIMITS.maxPerFace (6) used by the generator, the
  // batch path and the editor input's max — the old 10 clamp let the single-
  // member editor commit arrangements the rest of the pipeline forbids.
  const clamp = (v: number | undefined, fallback: number) => Math.max(0, Math.min(6, Math.round(v ?? fallback)));
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

/**
 * Undo the edits on the given elements (one undo step): each gets back the last arrangement the
 * design proposed for it (`store/design-decisions.ts`). A member no design ever proposed for
 * keeps its bars: reverting erases nothing.
 */
export function revertReinforcement(ids: Iterable<number>): Set<number> {
  return revertToProposal(ids);
}
