/**
 * Where the project stands against its last autosave: saving, saved, changed since, saved to the
 * fallback storage, or not saved. `autosave-service` reports each write here; the PRO header
 * reads it.
 */
import { historyStore } from './history.svelte';
import { modelStore } from './model.svelte';
import type { AutosaveWriteResult } from './autosave-db';

export type SaveState = 'idle' | 'saving' | 'saved' | 'changed' | 'degraded' | 'failed';

/** Where a save goes. Only this browser for now; an account is the other place once sign-in saves. */
export type SaveDestination = 'browser';

interface Mark { step: object | null; version: number }

let saving = $state(false);
let savedAt = $state<string | null>(null);
let savedRevision = $state<number | null>(null);
let backend = $state<AutosaveWriteResult['backend'] | null>(null);
let failure = $state<string | null>(null);
let saved = $state<Mark | null>(null);

const current = (): Mark => ({ step: historyStore.lastStep, version: modelStore.modelVersion });

export const saveStatus = {
  get saving() { return saving; },
  get savedAt() { return savedAt; },
  get revision() { return savedRevision; },
  get failure() { return failure; },
  get destination(): SaveDestination { return 'browser'; },
  /** Whether the model changed since the last save that worked. */
  get changed(): boolean {
    if (!saved) return true;
    const now = current();
    return now.step !== saved.step || now.version !== saved.version;
  },
  get state(): SaveState {
    if (saving) return 'saving';
    if (failure) return 'failed';
    if (!savedAt) return modelStore.nodes.size > 0 ? 'changed' : 'idle';
    if (this.changed) return 'changed';
    return backend === 'localstorage' ? 'degraded' : 'saved';
  },
  /** A write starts: what it holds is the model as it is now. */
  begin(): Mark { saving = true; return current(); },
  end(mark: Mark, result: AutosaveWriteResult | null): void {
    saving = false;
    if (!result) return;
    if (!result.ok) { failure = result.failure?.kind ?? 'unknown'; return; }
    failure = null;
    savedAt = new Date().toISOString();
    savedRevision = result.revision;
    backend = result.backend;
    saved = mark;
  },
  /** Test seam. */
  reset(): void { saving = false; savedAt = null; savedRevision = null; backend = null; failure = null; saved = null; },
};
