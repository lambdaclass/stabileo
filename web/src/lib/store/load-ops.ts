/**
 * Operations on loads as a set: copy, move and scale loads between cases, duplicate a case, and
 * write a batch of new loads to many targets. Each is one undo step.
 *
 * The magnitude of a load is the fields `model/loads/load-magnitudes.ts` names for its type, so a
 * scaled tendon is its force, a scaled imposed displacement its six components, and a position, a
 * frame or a case never scales.
 *
 * A load a floor-load definition wrote is moved, scaled and removed through its definition, never
 * here: the next rewrite would undo the edit (`store/defined-loads.ts`). A copy of one is the
 * user's (`userCopy`).
 */
import { modelStore, type Load } from './model.svelte';
import { uiStore } from './ui.svelte';
import { editLeavesNothing, scaledLoad } from '../model/loads/load-magnitudes';
import { reframedMemberLoad, type LoadFrame } from '../model/loads/load-frame';
import { isDefinedLoad } from '../model/loads/floor-definitions';

/** The loads with these ids, in model order. */
function picked(ids: Iterable<number>): Load[] {
  const want = new Set(ids);
  return modelStore.loads.filter((l) => want.has(l.data.id));
}

/** New loads, whole, under new ids, in one undo step; the ids they took. None is no edit at all. */
export function addLoads(loads: readonly Load[]): number[] {
  // An empty batch still pushed an undo step and bumped the model's version, clearing the results.
  if (loads.length === 0) return [];
  const out: number[] = [];
  modelStore.batch(() => { for (const l of loads) out.push(modelStore.addLoadEntry(l)); });
  return out;
}

/**
 * A nodal load of these six components at `nodeId`, or null and nothing added when every one is
 * zero: the context menu's "add load" placed a load of nothing when the draw bar held zeros.
 */
export function addNodalLoadIfAny(nodeId: number, v: { fx: number; fy: number; fz: number; mx: number; my: number; mz: number }, caseId: number): number | null {
  if ([v.fx, v.fy, v.fz, v.mx, v.my, v.mz].every((x) => x === 0)) return null;
  return modelStore.addNodalLoad3D(nodeId, v.fx, v.fy, v.fz, v.mx, v.my, v.mz, caseId);
}

/**
 * A thermal load on a member, or null and nothing added when both its changes are zero: the 3D
 * thermal tool wrote ΔTg = ∇T = 0, where every other tool refuses a load of nothing.
 */
export function addThermalLoadIfAny(elementId: number, dtUniform: number, dtGradient: number, caseId: number): number | null {
  if (dtUniform === 0 && dtGradient === 0) return null;
  return modelStore.addThermalLoad(elementId, dtUniform, dtGradient, caseId);
}

/**
 * What became of an edit from the edit card: made; refused because it would leave a load of
 * nothing (`zero`); refused because it puts a member load off its member (`place`, the store's
 * `editKeepsPlace`); or no such load (`gone`). A refused edit changes nothing, not even the
 * version, so the card says why and keeps the results, where it used to say nothing and clear them.
 */
export type LoadEditOutcome = 'done' | 'zero' | 'place' | 'gone';

export function editLoad(loadId: number, edit: Record<string, number | boolean | string | undefined>): LoadEditOutcome {
  const load = modelStore.loads.find((l) => l.data.id === loadId);
  if (!load) return 'gone';
  if (editLeavesNothing(load, edit)) return 'zero';
  return modelStore.updateLoad(loadId, edit) ? 'done' : 'place';
}

/** Whether the model has the case: loads written to one it does not have belong to no case. */
const caseExists = (caseId: number) => modelStore.model.loadCases.some((c) => c.id === caseId);

/**
 * A copy of `l` in `caseId`, times `factor`, as the user's: a copy is the user's act, so it does
 * not carry the generator's mark, and "replace generated loads" (`apply-load-plan.ts`) leaves it.
 * It used to copy the mark too, and the next replace deleted the user's copies with the originals.
 */
function userCopy(l: Load, factor: number, caseId: number): Load {
  const c = scaledLoad(l, factor);
  const data = { ...c.data, caseId } as Record<string, unknown>;
  delete data.generatedBy;
  // Nor to a floor-load definition (`fromDef`): a rewrite of the definition would replace it.
  delete data.fromDef;
  return { ...c, data } as unknown as Load;
}

/** A copy of each load in `caseId`, times `factor`. The originals stay. Nothing for a case not there. */
export function copyLoadsToCase(ids: Iterable<number>, caseId: number, factor = 1): number[] {
  if (!caseExists(caseId)) return [];
  return addLoads(picked(ids).map((l) => userCopy(l, factor, caseId)));
}

/** The user's own of these ids: a definition's are left out (see above). */
const own = (ids: Iterable<number>) => new Set(picked(ids).filter((l) => !isDefinedLoad(l)).map((l) => l.data.id));

/** The loads moved to `caseId`, unchanged otherwise; false, and nothing moved, for a case not there. */
export function moveLoadsToCase(ids: Iterable<number>, caseId: number): boolean {
  if (!caseExists(caseId)) return false;
  const want = own(ids);
  modelStore.batch(() => {
    modelStore.replaceLoads(modelStore.loads.map((l) => (want.has(l.data.id) ? ({ ...l, data: { ...l.data, caseId } } as Load) : l)));
  });
  return true;
}

/** The loads times `k`, in place. */
export function scaleLoads(ids: Iterable<number>, k: number): void {
  const want = own(ids);
  if (want.size === 0) return;
  modelStore.batch(() => {
    modelStore.replaceLoads(modelStore.loads.map((l) => (want.has(l.data.id) ? scaledLoad(l, k) : l)));
  });
}

/** The loads, removed. */
export function removeLoads(ids: Iterable<number>): void {
  const want = own(ids);
  if (want.size === 0) return;
  modelStore.batch(() => { modelStore.replaceLoads(modelStore.loads.filter((l) => !want.has(l.data.id))); });
}

/**
 * A new case with the same type, flags and category as `caseId`, its loads copied times `factor`
 * (the user's, `userCopy`), and its self-weight rows too. Combinations are left as they are: a
 * duplicate is a new case, not a replacement. Returns the new case's id, or null when there is no
 * such case. The category is what the action is (`codes/families/origin.ts`); a duplicate of the
 * dead load is still a permanent action, and it used to come out with none.
 */
export function duplicateCase(caseId: number, name: string, factor = 1): number | null {
  const lc = modelStore.model.loadCases.find((c) => c.id === caseId);
  if (!lc) return null;
  let id = 0;
  modelStore.batch(() => {
    id = modelStore.addLoadCase(name, lc.type, { ...(lc.alternatives ? { alternatives: lc.alternatives } : {}), ...(lc.pattern ? { pattern: true } : {}), ...(lc.category ? { category: lc.category } : {}) });
    const own = modelStore.loads.filter((l) => (l.data.caseId ?? 1) === caseId);
    for (const l of own) modelStore.addLoadEntry(userCopy(l, factor, id));
    const analysis = modelStore.model.analysis;
    const rows = analysis?.selfWeight?.filter((r) => r.caseId === caseId) ?? [];
    if (analysis && rows.length) {
      modelStore.model.analysis = { ...analysis, selfWeight: [...(analysis.selfWeight ?? []), ...rows.map((r) => ({ ...r, caseId: id, factor: r.factor * factor }))] };
    }
  });
  return id;
}

/**
 * What deleting a case takes with it, as `removeLoadCase` takes it: its loads, the combinations
 * that use it, its self-weight rows, and its factor in a mass source written case by case.
 */
export function caseDeletionScope(caseId: number): { loads: number; combinations: number; selfWeight: number; mass: boolean } {
  const ms = modelStore.model.massSource;
  return {
    loads: modelStore.loads.filter((l) => (l.data.caseId ?? 1) === caseId).length,
    combinations: modelStore.model.combinations.filter((c) => c.factors.some((f) => f.caseId === caseId && f.factor !== 0)).length,
    selfWeight: modelStore.model.analysis?.selfWeight?.filter((r) => r.caseId === caseId).length ?? 0,
    mass: ms?.kind === 'custom' && ms.factors.some((f) => f.caseId === caseId),
  };
}

/**
 * A member load moved to frame `to` (the edit card's Global / Local), acting as it did: every
 * component re-expressed (`model/loads/load-frame.ts`), not the frame alone, which turned a
 * global sideways qX into an axial one. One undo step; false, and nothing changed, when the load
 * is in that frame already, has no frame, or its member has no axes.
 */
export function setMemberLoadFrame(loadId: number, to: LoadFrame): boolean {
  const load = modelStore.loads.find((l) => l.data.id === loadId);
  if (!load) return false;
  const now = (load.data as { frame?: string }).frame ?? 'local';
  if (now === to) return false;
  const edit = reframedMemberLoad(load, modelStore.model as never, to, uiStore.axisConvention3D === 'leftHand');
  return edit ? modelStore.updateLoad(loadId, edit) : false;
}
