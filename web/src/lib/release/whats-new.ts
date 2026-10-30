/**
 * The one-time "what's new / your results may have changed" notice.
 *
 * Every push to main is deployed, so a release can change the numbers a saved project gives
 * without the user doing anything. When a release does, `RESULTS_CHANGED_IN` names it and the
 * app says so once, on the first open after the update, with a link to the release notes.
 * Dismissing it records the release in localStorage, so it does not come back until a later
 * release sets `RESULTS_CHANGED_IN` again.
 *
 * This is global, not per project: a per-project re-check prompt is a separate feature.
 */

/** The last release whose fixes change analysis or design-check results. */
export const RESULTS_CHANGED_IN = '0.4.0';

export const WHATS_NEW_STORAGE_KEY = 'stabileo-whats-new-seen';

const NOTES_BASE = 'https://github.com/lambdaclass/stabileo/blob/main/docs/releases';

const NOTES_LOCALES = ['es', 'pt', 'de', 'fr', 'tr'];

/** The release notes in the reader's language (English for any locale without a translation). */
export function releaseNotesUrl(locale: string, version: string = RESULTS_CHANGED_IN): string {
  const suffix = NOTES_LOCALES.includes(locale) ? `.${locale}` : '';
  return `${NOTES_BASE}/v${version}${suffix}.md`;
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Whether the notice for `RESULTS_CHANGED_IN` has not been dismissed in this browser. */
export function shouldShowWhatsNew(store: Storage | null = storage()): boolean {
  if (!store) return false; // no storage: it would come back on every open
  try {
    return store.getItem(WHATS_NEW_STORAGE_KEY) !== RESULTS_CHANGED_IN;
  } catch {
    return false;
  }
}

export function dismissWhatsNew(store: Storage | null = storage()): void {
  try {
    store?.setItem(WHATS_NEW_STORAGE_KEY, RESULTS_CHANGED_IN);
  } catch {
    /* private mode: nothing to remember it in */
  }
}
