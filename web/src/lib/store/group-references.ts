/**
 * What in the project points at a group by its id, and how to move those pointers when the id
 * changes.
 *
 * Re-reading the physical elements used to delete every inferred element and add it back under a
 * new id, even when nothing about it had changed. Whatever named the old id was left pointing at
 * nothing: a floor load targeted at a slab lost its loads at the next sync, and the systems, the
 * tendon layouts, the masonry choices, the phases and the joist systems stored under `S12`,
 * `W12`, `g12` or `J12` stopped applying to anything. Recognition now keeps an element's id when
 * it can, and moves these references when it cannot (`physical-recognition.ts`).
 *
 * The references, and whether the analysis reads them:
 *  - self-weight loads scoped to a group (`analysis.selfWeight[].groupId`): analysis;
 *  - floor-load definitions targeted at a group (`floorLoad` groups, `target.by === 'group'`): analysis;
 *  - mass weights over a group region (`massSource.weights[].region`): analysis;
 *  - strip footings under a wall (`footings[].wallGroupId`): the footing's support, analysis;
 *  - deflection rules scoped to a group: design;
 *  - stored design data keyed by element: special slab systems and tendon panels (`S{id}`),
 *    masonry choices (`W{id}`), phase assignments (`g{id}`), joist systems (`J{id}`), the
 *    declared role in the lateral-force-resisting system (`P{id}`, `model/lateral-system.ts`): design.
 */
import { modelStore } from './model.svelte';

export type GroupRefPlace =
  | 'selfWeight' | 'floorLoad' | 'massWeight' | 'footingWall'
  | 'deflection' | 'slabSystem' | 'tendons' | 'masonry' | 'phase' | 'joist' | 'lateral';

export interface GroupReference {
  place: GroupRefPlace;
  /** Whether the analysis reads it: moving it changes the solve's input. */
  analysis: boolean;
  /** What holds it, for the review (a definition's name, a footing's id). */
  holder?: string;
}

const ANALYSIS: ReadonlySet<GroupRefPlace> = new Set(['selfWeight', 'floorLoad', 'massWeight', 'footingWall']);


/** Every reference to group `id` in the project. */
export function groupReferences(id: number): GroupReference[] {
  const out: GroupReference[] = [];
  const m = modelStore.model;
  const push = (place: GroupRefPlace, holder?: string) => out.push({ place, analysis: ANALYSIS.has(place), ...(holder ? { holder } : {}) });
  for (const sw of m.analysis?.selfWeight ?? []) if (sw.groupId === id) push('selfWeight');
  for (const g of m.groups.values()) {
    if (g.kind !== 'floorLoad') continue;
    const t = (g.data as { target?: { by?: string; groupId?: number } } | undefined)?.target;
    if (t?.by === 'group' && t.groupId === id) push('floorLoad', g.name);
  }
  for (const w of (m.massSource as { weights?: Array<{ region?: { kind?: string; groupId?: number } }> } | undefined)?.weights ?? []) {
    if (w.region?.kind === 'group' && w.region.groupId === id) push('massWeight');
  }
  for (const f of m.footings.values()) if (f.wallGroupId === id) push('footingWall', `#${f.id}`);
  for (const r of m.deflectionLimits?.rules ?? []) if (r.scope.kind === 'group' && r.scope.groupId === id) push('deflection');
  return out;
}

/** A stored value that could not move because the target already held a different one. */
export interface DroppedValue { place: GroupRefPlace; fromId: number; toId: number }

/** The references whose extent is a set of members: they move to a group with exactly those members. */
export const EXTENT_PLACES: ReadonlySet<GroupRefPlace> = new Set(['selfWeight', 'floorLoad', 'massWeight', 'footingWall', 'deflection']);
/** The references that are a design decision for an element: they cannot be split or merged by themselves. */
export const DECISION_PLACES: ReadonlySet<GroupRefPlace> = new Set(['slabSystem', 'tendons', 'masonry', 'phase', 'joist', 'lateral']);

/**
 * Move every reference from each old id of `map` to its new one. Meant to run inside the
 * caller's undo batch. Returns whether a reference the analysis reads moved; the caller decides
 * from it which undo channel the whole operation goes on.
 */
export function remapGroupReferences(
  map: ReadonlyMap<number, number>,
  only?: ReadonlySet<GroupRefPlace>,
): { analysis: boolean; moved: number; dropped: DroppedValue[] } {
  const m = modelStore.model;
  let analysis = false, moved = 0;
  const dropped: DroppedValue[] = [];
  const want = (p: GroupRefPlace) => !only || only.has(p);
  const to = (id: number | undefined) => (id !== undefined ? map.get(id) : undefined);

  const sw = want('selfWeight') ? m.analysis?.selfWeight : undefined;
  if (sw?.some((x) => to(x.groupId) !== undefined)) {
    modelStore.setAnalysis({ selfWeight: sw.map((x) => { const n = to(x.groupId); if (n === undefined) return x; moved++; return { ...x, groupId: n }; }) });
    analysis = true;
  }
  for (const g of [...m.groups.values()]) {
    if (!want('floorLoad') || g.kind !== 'floorLoad') continue;
    const d = g.data as { target?: { by?: string; groupId?: number } } | undefined;
    const n = d?.target?.by === 'group' ? to(d.target.groupId) : undefined;
    if (n === undefined) continue;
    modelStore.setGroupData(g.id, { ...d, target: { by: 'group', groupId: n } } as Record<string, unknown>);
    moved++; analysis = true;
  }
  const ms = (want('massWeight') ? m.massSource : undefined) as { weights?: Array<{ region?: { kind?: string; groupId?: number } }> } | undefined;
  if (ms?.weights?.some((w) => w.region?.kind === 'group' && to(w.region.groupId) !== undefined)) {
    modelStore.setMassSource({
      ...(ms as object),
      weights: ms.weights.map((w) => {
        const n = w.region?.kind === 'group' ? to(w.region.groupId) : undefined;
        if (n === undefined) return w;
        moved++;
        return { ...w, region: { kind: 'group', groupId: n } };
      }),
    } as never);
    analysis = true;
  }
  for (const f of want('footingWall') ? [...m.footings.values()] : []) {
    const n = to(f.wallGroupId);
    if (n === undefined) continue;
    modelStore.updateFooting(f.id, { wallGroupId: n });
    moved++; analysis = true;
  }
  const rules = want('deflection') ? m.deflectionLimits?.rules : undefined;
  if (rules?.some((r) => r.scope.kind === 'group' && to(r.scope.groupId) !== undefined)) {
    modelStore.setDeflectionLimits({
      ...m.deflectionLimits!,
      rules: rules.map((r) => {
        if (r.scope.kind !== 'group') return r;
        const n = to(r.scope.groupId);
        if (n === undefined) return r;
        moved++;
        return { ...r, scope: { kind: 'group' as const, groupId: n } };
      }),
    });
  }

  return { analysis, moved, dropped };
}
