import { authStore } from './auth.svelte';
import { accounts } from '../features';
import { trackUsage } from '../telemetry/usage';

export type GatedAction = 'save' | 'share' | 'code' | 'export' | 'exercise' | 'feedback';

let pending = $state<{ action: GatedAction; run: () => unknown } | null>(null);
let open = $state(false);

function required(): boolean {
  return accounts() && authStore.saveRequiresAccount && !authStore.isAuthenticated;
}

function signInRequired(): boolean {
  return accounts() && authStore.userLoginEnabled && !authStore.isAuthenticated;
}

function ask(action: GatedAction, run: () => unknown): void {
  pending = { action, run };
  open = true;
  trackUsage('gate.shown', { action });
}

function settle(): void {
  const next = pending;
  pending = null;
  if (!next) return;
  if (!authStore.isAuthenticated) return;
  trackUsage('gate.passed', { action: next.action });
  void next.run();
}

/**
 * Saving or exporting the model behind an account. `guard` runs the action at once unless the
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

  /** Like `guard`, for what always needs an account while sign-in is open, whatever the save switch says. */
  requireSignIn(action: GatedAction, run: () => unknown): void {
    if (signInRequired()) ask(action, run);
    else void run();
  },
};
