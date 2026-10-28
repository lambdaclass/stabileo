import { publicHref } from '../i18n/public-routes';
import type { PublicLocale } from '../i18n/store.svelte';

/** Must equal `StabileoAuth.Consents.terms_version/0`: the backend asks again when they differ. */
export const LEGAL_VERSION = '2026-10-27';

export const TERMS_PATH = '/terms';
export const PRIVACY_PATH = '/privacy';
export const USAGE_DATA_PATH = '/usage-data';

const PUBLIC: readonly PublicLocale[] = ['es', 'en', 'pt'];

export function legalHref(path: string, locale: string): string {
  return publicHref(path, (PUBLIC as readonly string[]).includes(locale) ? (locale as PublicLocale) : 'en');
}
