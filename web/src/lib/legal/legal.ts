import { publicHref } from '../i18n/public-routes';
import type { PublicLocale } from '../i18n/store.svelte';
import { PUBLIC_LOCALES } from '../i18n/offered';

export { LEGAL_VERSION } from './version';

export const TERMS_PATH = '/terms';
export const PRIVACY_PATH = '/privacy';
export const USAGE_DATA_PATH = '/usage-data';

export function legalHref(path: string, locale: string): string {
  return publicHref(path, (PUBLIC_LOCALES as readonly string[]).includes(locale) ? (locale as PublicLocale) : 'en');
}
