import { authStore } from './auth.svelte';
import { accounts } from '../features';
import { trackUsage } from '../telemetry/usage';

export type GatedAction = 'save' | 'open' | 'import' | 'share' | 'code' | 'export' | 'exercise' | 'feedback' | 'editor';

interface Request {
  action: GatedAction;
  runs: (() => unknown)[];
  cancels: (() => void)[];
  failOpen: boolean;
}

let pending = $state.raw<Request | null>(null);
let open = $state(false);
let signInUnavailable = false;
const released = new WeakSet<Event>();

function required(): boolean {
  return __PUBLIC_FEATURES__.accounts && accounts() && authStore.saveRequiresAccount && !authStore.isAuthenticated && !signInUnavailable;
}

function signInRequired(): boolean {
  return accounts() && authStore.userLoginEnabled && !authStore.isAuthenticated;
}

function ask(action: GatedAction, run: () => unknown, cancel?: () => void, failOpen = true): void {
  if (pending && open) {
    pending = { ...pending, failOpen: pending.failOpen && failOpen, runs: [...pending.runs, run], cancels: cancel ? [...pending.cancels, cancel] : pending.cancels };
    return;
  }
  pending = { action, runs: [run], cancels: cancel ? [cancel] : [], failOpen };
  open = true;
  trackUsage('gate.shown', { action });
}

function settle(): void {
  if (!__PUBLIC_FEATURES__.accounts) return;
  const next = pending;
  pending = null;
  if (!next) return;
  if (!authStore.isAuthenticated) {
    for (const cancel of next.cancels) cancel();
    return;
  }
  trackUsage('gate.passed', { action: next.action });
  for (const run of next.runs) void run();
}

function fileAction(input: HTMLInputElement): GatedAction {
  return input.accept.includes('.ded') ? 'open' : 'import';
}

export const accountGate = {
  get required() { return required(); },
  get action() { return pending?.action ?? null; },
  get open() { return open; },
  set open(v: boolean) {
    open = v;
    if (!v) settle();
  },

  guard(action: GatedAction, run: () => unknown, cancel?: () => void): void {
    if (__PUBLIC_FEATURES__.accounts && required()) ask(action, run, cancel);
    else void run();
  },

  run<T>(action: GatedAction, work: () => T | Promise<T>, cancelled: T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      accountGate.guard(action, () => {
        try {
          Promise.resolve(work()).then(resolve, reject);
        } catch (error) {
          reject(error);
        }
      }, () => resolve(cancelled));
    });
  },

  /** For what opens its own window in the click: true when the account is missing, and `run` is then called again once the action may go on. */
  defer(action: GatedAction, run: () => unknown): boolean {
    if (!__PUBLIC_FEATURES__.accounts || !required()) return false;
    ask(action, run);
    return true;
  },

  /**
   * The editor itself, when it needs an account: asks until there is one, never goes on without
   * it, and `leave` runs when the reader turns it down.
   */
  requireForEditor(leave: () => void): void {
    if (!__PUBLIC_FEATURES__.accounts || authStore.isAuthenticated || (open && pending?.action === 'editor')) return;
    ask('editor', () => {}, leave, false);
  },

  requireSignIn(action: GatedAction, run: () => unknown): void {
    if (__PUBLIC_FEATURES__.accounts && signInRequired()) ask(action, run, undefined, false);
    else void run();
  },

  /**
   * Called when sign-in could not happen (the window was blocked, Google or the exchange failed):
   * a save or export goes ahead without an account, and so does every later one in this visit.
   * False when the waiting action needs the account itself.
   */
  proceedWithoutAccount(): boolean {
    const next = pending;
    if (!next?.failOpen) return false;
    signInUnavailable = true;
    pending = null;
    open = false;
    trackUsage('gate.unavailable', { action: next.action });
    for (const run of next.runs) void run();
    return true;
  },
};

/**
 * Holds every file input's chosen file until the account gate lets it through, then hands the
 * same change event on again. An input marked `data-account-free` is never held.
 */
export function gateFileInputs(target: Window = window): () => void {
  if (!__PUBLIC_FEATURES__.accounts) return () => {};
  const onChange = (e: Event) => {
    const input = e.target as HTMLInputElement | null;
    if (released.has(e) || input?.tagName !== 'INPUT' || input.type !== 'file') return;
    if (!input.files?.length || input.dataset.accountFree !== undefined || !required()) return;
    e.stopImmediatePropagation();
    ask(fileAction(input), () => {
      const again = new Event('change', { bubbles: true });
      released.add(again);
      input.dispatchEvent(again);
    }, () => {
      input.value = '';
    });
  };
  target.addEventListener('change', onChange, true);
  return () => target.removeEventListener('change', onChange, true);
}
