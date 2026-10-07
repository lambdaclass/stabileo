/**
 * The questions the editor asks after an edit left two things touching
 * without a connection (see model/edit/connection-check). They queue: a new
 * one is shown, the earlier ones stay, and the card steps through them, so a
 * second crossing does not wipe the question about the first.
 *
 * Accepted while the model is still as its edit left it, a connection joins
 * that edit's undo step, so one undo takes both back; a question whose yes
 * removes what the edit made (`undoesEdit`) undoes the edit instead. Accepted after other
 * edits, it is a step of its own. "Other edits" are any that took an undo step, not only those
 * that changed the analysed model: a named view or a footing takes one and leaves the version
 * alone, and the edit's step is then no longer the last. A question not about an edit (`ownStep`:
 * a file opened, a model imported) is always a step of its own. Declining changes nothing. A
 * question whose subject is gone (deleted, undone, already connected) drops out on its own.
 */
import { modelStore } from './model.svelte';
import { historyStore } from './history.svelte';

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
  /**
   * The yes takes the edit back: accepted while the model is still as the edit
   * left it, it is that edit's undo (with whatever the edit made on the way,
   * such as a member split for its end). Later, it is `run` as a step of its own.
   */
  undoesEdit?: boolean;
  /**
   * Not about an edit: asked when a model was opened or imported. Its yes is a step of its own,
   * so an undo goes back to the model as it came, not to before it was opened.
   */
  ownStep?: boolean;
  /**
   * What the no does, when it does more than leave things as they are: "Keep both" remembers the
   * pair, and asks what the overlap held back. Not an edit; run only while the question applies.
   */
  declined?: () => void;
}

/** `version` and `step`: the model and the undo stack as the edit left them. */
type Queued = ConnectionQuestion & { id: number; version: number; step: object | null };

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
    const item: Queued = { ...q, id: ++seq, version: modelStore.modelVersion, step: historyStore.lastStep };
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
    const untouched = !q.ownStep && modelStore.modelVersion === q.version && historyStore.lastStep === q.step;
    if (untouched && q.undoesEdit) {
      // An undo puts a snapshot back, and a put-back model forgets every question
      // (store/index.ts); the others in the queue were not about this edit.
      const others = queue;
      historyStore.undo();
      queue = others;
      prune();
    }
    else if (untouched) modelStore.amendLastStep(q.run);
    else modelStore.batch(q.run);
  },

  decline(): void {
    prune();
    const q = queue[index];
    if (!q) return;
    remove(q);
    if (applies(q)) q.declined?.();
  },

  next(): void { prune(); if (queue.length) index = (index + 1) % queue.length; },
  previous(): void { prune(); if (queue.length) index = (index - 1 + queue.length) % queue.length; },

  /** Forget every question (a model loaded, a new project). */
  clear(): void { queue = []; index = 0; },
};
