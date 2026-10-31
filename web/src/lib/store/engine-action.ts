/**
 * Run a user action that needs the calculation engine, and say so when it cannot.
 *
 * Every engineering result comes from the engine (`engine/engine-unavailable.ts`): without it a
 * computation throws `EngineUnavailableError`, and when the engine refuses an input,
 * `EngineCheckError` with its message. A button whose handler let that escape did nothing
 * visible. `runEngineAction` runs the action, and on an engine error shows "engine not available"
 * or the engine's message as an error toast and returns `undefined`. Any other error is rethrown:
 * it is a defect, not an engine state.
 */
import { knownIssueRefusal } from '../engine/known-issues';
import { uiStore } from './ui.svelte';
import { tp } from '../i18n';
import { engineFailureMessage } from '../engine/engine-unavailable';

export function runEngineAction<T>(action: () => T): T | undefined {
  try {
    return action();
  } catch (err) {
    const m = engineFailureMessage(err);
    if (!m) throw err;
    uiStore.toast(tp(m.key, m.params ?? {}), 'error');
    return undefined;
  }
}

/** `runEngineAction` for an async action. */
export async function runEngineActionAsync<T>(action: () => Promise<T>): Promise<T | undefined> {
  try {
    return await action();
  } catch (err) {
    const m = engineFailureMessage(err);
    if (!m) throw err;
    uiStore.toast(tp(m.key, m.params ?? {}), 'error');
    return undefined;
  }
}

/**
 * For a `$derived` that needs the engine: its value, or the message to show in its place. The
 * derivation never throws an engine error, so the screen keeps working and says why it is empty.
 */
export function engineGuarded<T>(compute: () => T): { value: T; error: null } | { value: null; error: string } {
  try {
    return { value: compute(), error: null };
  } catch (err) {
    const m = engineFailureMessage(err);
    if (!m) throw err;
    return { value: null, error: tp(m.key, m.params ?? {}) };
  }
}

/** The text of any error for a panel: an engine error in the reader's language, anything else as raised. */
export function errorText(e: unknown): string {
  const refusal = knownIssueRefusal(e);
  if (refusal) return refusal;
  const m = engineFailureMessage(e);
  return m ? tp(m.key, m.params ?? {}) : String(e instanceof Error ? e.message : e);
}
