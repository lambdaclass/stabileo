/**
 * Column stacks in the store: the model's stacks from the design's columns, the one a column is in,
 * and equalizing repeated stacks lift by lift (locked members left, one undo step, re-verified by
 * the reinforcement channel like any edit).
 */
import { modelStore } from './model.svelte';
import { designRunStore } from './design-run.svelte';
import { verificationStore } from './verification.svelte';
import { lockedIds, storedDecisions } from './design-decisions';
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

/** The lap length a person set for a column's stack group, m; undefined when the code's is used. */
export function columnLapOf(columnId: number): number | undefined {
  return storedDecisions().columnLaps?.[String(columnId)];
}

/**
 * Set the lap length of a column's bars for its stack and the stacks that repeat it (the group),
 * one undo step; null goes back to the code's. A length under the code's splice is kept as set
 * and reported by the detailing's splice check, never raised silently.
 */
export function setColumnLap(columnId: number, lap: number | null): number[] {
  const s = stackOf(columnId);
  if (!s) return [];
  const ids = [s.stack, ...s.repeats].flatMap((st) => st.lifts.map((l) => l.id));
  modelStore.reinforcementTransaction((api) => {
    const d = storedDecisions();
    const laps = { ...(d.columnLaps ?? {}) };
    for (const id of ids) { if (lap === null) delete laps[String(id)]; else laps[String(id)] = Math.round(lap * 1000) / 1000; }
    api.setDecisions({ ...d, columnLaps: laps });
  });
  return ids;
}

export type ColumnShapeChoice = { kind: 'rect'; b: number; h: number } | { kind: 'circle'; D: number };

/** The section a shape stands for: a rectangle, or a solid circle (`isSolidCircle`). */
export function sectionForShape(s: ColumnShapeChoice): { name: string; a: number; iy: number; iz: number; j: number; b: number; h: number; shape: 'rect' | 'CHS' } {
  const cm = (v: number) => Math.round(v * 100);
  if (s.kind === 'circle') {
    const D = s.D;
    return { name: `Ø${cm(D)}`, a: (Math.PI * D * D) / 4, iy: (Math.PI * D ** 4) / 64, iz: (Math.PI * D ** 4) / 64, j: (Math.PI * D ** 4) / 32, b: D, h: D, shape: 'CHS' };
  }
  const { b, h } = s, lo = Math.min(b, h), hi = Math.max(b, h);
  // Saint-Venant torsion of a rectangle: β·hi·lo³, β from the side ratio.
  const beta = 1 / 3 - 0.21 * (lo / hi) * (1 - (lo / hi) ** 4 / 12);
  return { name: `${cm(b)}×${cm(h)}`, a: b * h, iy: (b * h ** 3) / 12, iz: (h * b ** 3) / 12, j: beta * hi * lo ** 3, b, h, shape: 'rect' };
}

/**
 * Change the section shape of a column: the lift, its stack, or its stack and the stacks that
 * repeat it. One undo step. The bars a lift holds were chosen for the old shape, so they are
 * taken off and the count returned for the caller to say; the lift is designed again from there.
 */
export function changeColumnShape(columnId: number, shape: ColumnShapeChoice, scope: 'lift' | 'stack' | 'group'): { changed: number[]; cleared: number } {
  const s = stackOf(columnId);
  if (!s) return { changed: [], cleared: 0 };
  const ids = scope === 'lift' ? [columnId] : (scope === 'stack' ? [s.stack] : [s.stack, ...s.repeats]).flatMap((st) => st.lifts.map((l) => l.id));
  const want = sectionForShape(shape);
  let cleared = 0;
  modelStore.batch(() => {
    const same = [...modelStore.sections.values()].find((x) => x.shape === want.shape && Math.abs((x.b ?? 0) - want.b) < 1e-6 && Math.abs((x.h ?? 0) - want.h) < 1e-6 && Math.abs(x.a - want.a) < 1e-9);
    const sectionId = same?.id ?? modelStore.addSection(want as never);
    for (const id of ids) {
      if (modelStore.elements.get(id)?.sectionId === sectionId) continue;
      modelStore.updateElementSection(id, sectionId);
      if (modelStore.elements.get(id)?.reinforcement) { modelStore.updateElement(id, { reinforcement: undefined }); cleared += 1; }
    }
  });
  return { changed: ids, cleared };
}
