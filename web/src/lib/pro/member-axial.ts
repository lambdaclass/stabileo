/**
 * A member's axial behaviour as one choice: its type (frame, truss) and its one-way or cable
 * behaviour. Specifications › Members and the double-click editor both read and set it here.
 */
import { modelStore } from '../store/model.svelte';
import type { Element } from '../store/model.svelte';
import type { MemberBehaviour } from '../engine/member-behaviour';

export type Axial = 'frame' | 'truss' | MemberBehaviour;
export const AXIAL_CHOICES: readonly Axial[] = ['frame', 'truss', 'tensionOnly', 'compressionOnly', 'cable', 'inactive'];

export const axialOf = (e: Element): Axial => e.behaviour ?? (e.type === 'truss' ? 'truss' : 'frame');

/** Set it on every member of `ids`, as one undo step. */
export function setAxial(ids: Iterable<number>, v: Axial): void {
  modelStore.batch(() => {
    for (const id of ids) {
      if (v === 'frame' || v === 'truss') modelStore.updateElement(id, { type: v, behaviour: undefined });
      else modelStore.updateElement(id, { behaviour: v });
    }
  });
}
