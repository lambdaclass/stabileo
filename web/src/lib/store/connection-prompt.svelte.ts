/**
 * The questions the editor asks after an edit left two things touching
 * without a connection (see model/edit/connection-check). They queue: a new
 * one is shown, the earlier ones stay, and the card steps through them, so a
 * second crossing does not wipe the question about the first.
 *
 * Accepted while the model is still as its edit left it, a connection joins
 * that edit's undo step, so one undo takes both back. Accepted after other
 * edits, it is a step of its own. Declining changes nothing. A question whose
 * subject is gone (deleted, undone, already connected) drops out on its own.
 */
import { modelStore } from './model.svelte';

export interface ConnectionQuestion {
  message: string;
  accept: string;
  decline: string;
  /** Makes the connection. */
  run: () => void;
  /** False once what the question is about is gone or no longer applies. */
  stillApplies?: () => boolean;
  /** Questions with the same key are about the same thing: a new one replaces the old. */
  key?: string;
}

type Queued = ConnectionQuestion & { id: number; version: number };

let queue = $state.raw<Queued[]>([]);
let index = $state(0);
let seq = 0;

const applies = (q: Queued) => !q.stillApplies || q.stillApplies();

/** The questions that still apply. Read-only: reading never changes the queue. */
function live(): Queued[] { return queue.filter(applies); }
/** The index into live() of the question shown. */
function shownAt(list: Queued[]): number {
  if (!list.length) return 0;
  const shown = queue[index];
  const at = shown ? list.indexOf(shown) : -1;
  return at >= 0 ? at : Math.min(index, list.length - 1);
}

/** Drop what no longer applies, keeping the shown question in view. Actions only. */
function prune(): void {
  const list = live();
  index = shownAt(list);
  queue = list;
}

function remove(q: Queued): void {
  const at = queue.indexOf(q);
  if (at < 0) return;
  queue = queue.filter((x) => x !== q);
  // Stay on the next one, or the last if that was the end.
  index = Math.min(at, Math.max(0, queue.length - 1));
}

export const connectionPrompt = {
  /** The question on the card, or null. */
  get current(): Queued | null {
    const list = live();
    return list[shownAt(list)] ?? null;
  },
  /** How many are waiting, and which of them is shown (0-based). */
  get count() { return live().length; },
  get index() { return shownAt(live()); },

  ask(q: ConnectionQuestion): void {
    prune();
    const item: Queued = { ...q, id: ++seq, version: modelStore.modelVersion };
    const rest = q.key ? queue.filter((x) => x.key !== q.key) : queue;
    queue = [...rest, item];
    index = queue.length - 1;
  },

  accept(): void {
    prune();
    const q = queue[index];
    if (!q) return;
    remove(q);
    if (!applies(q)) return;
    if (modelStore.modelVersion === q.version) modelStore.amendLastStep(q.run);
    else modelStore.batch(q.run);
  },

  decline(): void {
    prune();
    const q = queue[index];
    if (q) remove(q);
  },

  next(): void { prune(); if (queue.length) index = (index + 1) % queue.length; },
  previous(): void { prune(); if (queue.length) index = (index - 1 + queue.length) % queue.length; },

  /** Forget every question (a model loaded, a new project). */
  clear(): void { queue = []; index = 0; },
};
