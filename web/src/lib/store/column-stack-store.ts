/**
 * Column stacks in the store: the model's stacks from the design's columns, the one a column is in,
 * and equalizing repeated stacks lift by lift (locked members left, one undo step, re-verified by
 * the reinforcement channel like any edit).
 */
import { modelStore } from './model.svelte';
import { designRunStore } from './design-run.svelte';
import { verificationStore } from './verification.svelte';
import { lockedIds } from './design-decisions';
import { columnStacks, equalizeStackGroup, repeatedStacks, type ColumnStack } from '../engine/design/column-stacks';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export function modelColumnStacks(): ColumnStack[] {
  const cols = [...verificationStore.contexts.values()].filter((c) => c.elementType === 'column').map((c) => c.elementId);
  return columnStacks({ nodes: modelStore.nodes, elements: modelStore.elements as never, columns: cols });
}

export function stackOf(columnId: number): { stack: ColumnStack; repeats: ColumnStack[] } | null {
  const all = modelColumnStacks();
  const stack = all.find((s) => s.lifts.some((l) => l.id === columnId));
  if (!stack) return null;
  return { stack, repeats: all.filter((s) => s.key !== stack.key && s.signature.join('|') === stack.signature.join('|')) };
}

function write(pairs: Array<{ target: number; source: number }>): number[] {
  const locked = lockedIds();
  const ok = pairs.filter((p) => !locked.has(p.target) && modelStore.elements.get(p.source)?.reinforcement);
  const written = modelStore.reinforcementTransaction((api) => { for (const p of ok) api.setReinforcement(p.target, clone(modelStore.elements.get(p.source)!.reinforcement!)); });
  designRunStore.markManual(written);
  return [...written];
}

/** Equalize a stack with the ones that repeat it. */
export function equalizeStack(columnId: number): number[] {
  const s = stackOf(columnId);
  if (!s || s.repeats.length === 0) return [];
  return write(equalizeStackGroup([s.stack, ...s.repeats], (id) => modelStore.elements.get(id)?.reinforcement));
}

/** Every group of repeated stacks, equalized, one undo step. */
export function equalizeAllStacks(): { groups: number; members: number } {
  const groups = repeatedStacks(modelColumnStacks());
  return { groups: groups.length, members: write(groups.flatMap((g) => equalizeStackGroup(g, (id) => modelStore.elements.get(id)?.reinforcement))).length };
}
