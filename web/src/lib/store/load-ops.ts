/**
 * Operations on loads as a set: copy, move and scale loads between cases, duplicate a case, and
 * write a batch of new loads to many targets. Each is one undo step.
 *
 * The magnitude of a load is the fields `model/loads/load-magnitudes.ts` names for its type, so a
 * scaled tendon is its force, a scaled imposed displacement its six components, and a position, a
 * frame or a case never scales.
 */
import { modelStore, type Load } from './model.svelte';
import { scaledLoad } from '../model/loads/load-magnitudes';

/** The loads with these ids, in model order. */
function picked(ids: Iterable<number>): Load[] {
  const want = new Set(ids);
  return modelStore.loads.filter((l) => want.has(l.data.id));
}

/** New loads, whole, under new ids, in one undo step; the ids they took. */
export function addLoads(loads: readonly Load[]): number[] {
  const out: number[] = [];
  modelStore.batch(() => { for (const l of loads) out.push(modelStore.addLoadEntry(l)); });
  return out;
}

/** A copy of each load in `caseId`, times `factor`. The originals stay. */
export function copyLoadsToCase(ids: Iterable<number>, caseId: number, factor = 1): number[] {
  return addLoads(picked(ids).map((l) => {
    const c = scaledLoad(l, factor);
    return { ...c, data: { ...c.data, caseId } } as Load;
  }));
}

/** The loads moved to `caseId`, unchanged otherwise. */
export function moveLoadsToCase(ids: Iterable<number>, caseId: number): void {
  const want = new Set(ids);
  modelStore.batch(() => {
    modelStore.replaceLoads(modelStore.loads.map((l) => (want.has(l.data.id) ? ({ ...l, data: { ...l.data, caseId } } as Load) : l)));
  });
}

/** The loads times `k`, in place. */
export function scaleLoads(ids: Iterable<number>, k: number): void {
  const want = new Set(ids);
  modelStore.batch(() => {
    modelStore.replaceLoads(modelStore.loads.map((l) => (want.has(l.data.id) ? scaledLoad(l, k) : l)));
  });
}

/** The loads, removed. */
export function removeLoads(ids: Iterable<number>): void {
  const want = new Set(ids);
  modelStore.batch(() => { modelStore.replaceLoads(modelStore.loads.filter((l) => !want.has(l.data.id))); });
}

/**
 * A new case with the same type and flags as `caseId`, its loads copied times `factor`, and its
 * self-weight rows too. Combinations are left as they are: a duplicate is a new case, not a
 * replacement. Returns the new case's id, or null when there is no such case.
 */
export function duplicateCase(caseId: number, name: string, factor = 1): number | null {
  const lc = modelStore.model.loadCases.find((c) => c.id === caseId);
  if (!lc) return null;
  let id = 0;
  modelStore.batch(() => {
    id = modelStore.addLoadCase(name, lc.type, { ...(lc.alternatives ? { alternatives: lc.alternatives } : {}), ...(lc.pattern ? { pattern: true } : {}) });
    const own = modelStore.loads.filter((l) => (l.data.caseId ?? 1) === caseId);
    for (const l of own) {
      const c = scaledLoad(l, factor);
      modelStore.addLoadEntry({ ...c, data: { ...c.data, caseId: id } } as Load);
    }
    const analysis = modelStore.model.analysis;
    const rows = analysis?.selfWeight?.filter((r) => r.caseId === caseId) ?? [];
    if (analysis && rows.length) {
      modelStore.model.analysis = { ...analysis, selfWeight: [...(analysis.selfWeight ?? []), ...rows.map((r) => ({ ...r, caseId: id, factor: r.factor * factor }))] };
    }
  });
  return id;
}

/** What deleting a case takes with it: its loads, and the combinations that use it. */
export function caseDeletionScope(caseId: number): { loads: number; combinations: number } {
  return {
    loads: modelStore.loads.filter((l) => (l.data.caseId ?? 1) === caseId).length,
    combinations: modelStore.model.combinations.filter((c) => c.factors.some((f) => f.caseId === caseId && f.factor !== 0)).length,
  };
}
