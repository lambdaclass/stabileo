import { authStore } from './auth.svelte';
import { accounts } from '../features';
import { trackUsage } from '../telemetry/usage';

export type GatedAction = 'save' | 'open' | 'import' | 'share' | 'code' | 'export' | 'exercise' | 'feedback';

let pending = $state<{ action: GatedAction; run: () => unknown; cancel?: () => void } | null>(null);
let open = $state(false);

function required(): boolean {
  return accounts() && authStore.saveRequiresAccount && !authStore.isAuthenticated;
}

function signInRequired(): boolean {
  return accounts() && authStore.userLoginEnabled && !authStore.isAuthenticated;
}

function ask(action: GatedAction, run: () => unknown, cancel?: () => void): void {
  pending?.cancel?.();
  pending = { action, run, cancel };
  open = true;
  trackUsage('gate.shown', { action });
}

function settle(): void {
  const next = pending;
  pending = null;
  if (!next) return;
  if (!authStore.isAuthenticated) {
    next.cancel?.();
    return;
  }
  trackUsage('gate.passed', { action: next.action });
  void next.run();
}

/**
 * Files in and out behind an account: saving, opening, importing and exporting. `guard` runs the action at once unless the
 * account is required and missing; then it asks for one and runs the action after sign-in.
 */
export const accountGate = {
  get required() { return required(); },
  get action() { return pending?.action ?? null; },
  get open() { return open; },
  set open(v: boolean) {
    open = v;
    if (!v) settle();
  },

  guard(action: GatedAction, run: () => unknown): void {
    if (required()) ask(action, run);
    else void run();
  },

  /**
   * For what opens a window in the click and writes into it later (a printed report): true when the
   * account is missing, and `run` is then asked for and called again after sign-in, so nothing is
   * written before.
   */
  defer(action: GatedAction, run: () => unknown): boolean {
    if (!required()) return false;
    ask(action, run);
    return true;
  },

  /** Resolves true once the action may go on: at once, or after sign-in; false if the request is closed. */
  allow(action: GatedAction): Promise<boolean> {
    if (!required()) return Promise.resolve(true);
    return new Promise((resolve) => ask(action, () => resolve(true), () => resolve(false)));
  },

  /**
   * Wraps a file input's change handler: the chosen file is read only once the action may go on.
   * The gate comes after the choice because a browser opens a file picker only from a fresh click,
   * which a sign-in in another window outlasts.
   */
  files<E extends Event>(action: GatedAction, handler: (e: E) => unknown): (e: E) => void {
    return (e: E) => {
      const input = (e.currentTarget ?? e.target) as HTMLInputElement | null;
      if (!required()) {
        void handler(e);
        return;
      }
      const later = { target: input, currentTarget: input } as unknown as E;
      ask(action, () => handler(later), () => {
        if (input) input.value = '';
      });
    };
  },

  /** Like `guard`, for what always needs an account while sign-in is open, whatever the save switch says. */
  requireSignIn(action: GatedAction, run: () => unknown): void {
    if (signInRequired()) ask(action, run);
    else void run();
  },
};
