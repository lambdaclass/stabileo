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

export function shouldShowDisclaimer(store: Storage | null = storage()): boolean {
  if (!store) return false;
  try {
    return store.getItem(DISCLAIMER_STORAGE_KEY) !== LEGAL_VERSION;
  } catch {
    return false;
  }
}

export function acknowledgeDisclaimer(store: Storage | null = storage()): void {
  try {
    store?.setItem(DISCLAIMER_STORAGE_KEY, LEGAL_VERSION);
  } catch {
    /* private mode */
  }
}
