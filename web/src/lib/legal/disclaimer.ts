import { LEGAL_VERSION } from './legal';

export const DISCLAIMER_STORAGE_KEY = 'stabileo-results-disclaimer';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

let acknowledgedThisVisit = false;

/** Without storage it still shows, once per visit: a safety notice is never skipped because the browser keeps nothing. */
export function shouldShowDisclaimer(store: Storage | null = storage()): boolean {
  if (acknowledgedThisVisit) return false;
  if (!store) return true;
  try {
    return store.getItem(DISCLAIMER_STORAGE_KEY) !== LEGAL_VERSION;
  } catch {
    return true;
  }
}

export function acknowledgeDisclaimer(store: Storage | null = storage()): void {
  acknowledgedThisVisit = true;
  try {
    store?.setItem(DISCLAIMER_STORAGE_KEY, LEGAL_VERSION);
  } catch {
    /* private mode: remembered for this visit */
  }
}

export function forgetDisclaimerVisit(): void {
  acknowledgedThisVisit = false;
}
