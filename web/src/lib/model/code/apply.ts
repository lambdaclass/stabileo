/**
 * Applying model code to the open model, as one undo step.
 *
 * The code replaces what it covers and nothing else. What the application produced — detailing,
 * exports, joint designs, revisions — stays as it was and goes stale through the same revision
 * machinery an edit in the viewport would trigger; it is not discarded. A member that survives
 * (same id) keeps its reinforcement, for the same reason.
 *
 * Id counters never move backwards: a counter below an id the produced documents still name
 * would hand that id to a new entity.
 */
import { modelStore } from '../../store/model.svelte';
import type { ModelSnapshot } from '../../store/history.svelte';
import { COVERED_FIELDS } from './coverage';
import { codeToModel, type CodeError } from './format';

export type ApplyResult = { applied: true; keptReinforcement: number } | { applied: false; errors: CodeError[] };

/** The model the code describes, over `base` (the open model, or an empty one). */
export function mergeCode(base: ModelSnapshot, parsed: Partial<ModelSnapshot>): { snapshot: ModelSnapshot; keptReinforcement: number } {
  const next = JSON.parse(JSON.stringify(base)) as Record<string, any>;
  const p = parsed as Record<string, any>;
  for (const f of COVERED_FIELDS) {
    if (p[f] === undefined) { if (f !== 'name') delete next[f]; continue; }
    next[f] = JSON.parse(JSON.stringify(p[f]));
  }
  let kept = 0;
  const before = new Map<number, any>((base.elements ?? []) as Array<[number, any]>);
  next.elements = (next.elements ?? []).map(([id, e]: [number, any]) => {
    const r = before.get(id)?.reinforcement;
    if (r && !e.reinforcement) { kept++; return [id, { ...e, reinforcement: JSON.parse(JSON.stringify(r)) }]; }
    return [id, e];
  });
  const counters: Record<string, number> = { ...(base.nextId as Record<string, number>) };
  for (const [k, v] of Object.entries((p.nextId ?? {}) as Record<string, number>)) counters[k] = Math.max(counters[k] ?? 1, v);
  next.nextId = counters;
  return { snapshot: next as ModelSnapshot, keptReinforcement: kept };
}

export function applyCode(text: string): ApplyResult {
  const r = codeToModel(text);
  if (!r.snapshot) return { applied: false, errors: r.errors };
  const { snapshot, keptReinforcement } = mergeCode(modelStore.snapshot(), r.snapshot);
  modelStore.batch(() => modelStore.restore(snapshot));
  return { applied: true, keptReinforcement };
}
