/**
 * The question the editor asks right after an edit left two things touching
 * without a connection (see model/edit/connection-check): one at a time, the
 * newest replacing an older one.
 *
 * Accepted while the model is still as the edit left it, the connection joins
 * that edit's undo step, so one undo takes both back. Accepted after other
 * edits, it is a step of its own. Declining changes nothing.
 */
import { modelStore } from './model.svelte';

export interface ConnectionQuestion {
  message: string;
  accept: string;
  decline: string;
  /** Makes the connection. */
  run: () => void;
  /** False once what the question is about is gone (deleted, undone). */
  stillApplies?: () => boolean;
}

let current = $state<(ConnectionQuestion & { id: number; version: number }) | null>(null);
let seq = 0;

export const connectionPrompt = {
  get current() { return current; },

  ask(q: ConnectionQuestion): void {
    current = { ...q, id: ++seq, version: modelStore.modelVersion };
  },

  accept(): void {
    const q = current;
    current = null;
    if (!q || (q.stillApplies && !q.stillApplies())) return;
    if (modelStore.modelVersion === q.version) modelStore.amendLastStep(q.run);
    else modelStore.batch(q.run);
  },

  decline(): void { current = null; },
};
