import type { Translations } from './types';
import { OFFERED_LOCALES } from './offered';

const LAZY_LOCALES: Record<string, () => Promise<{ default: Translations }>> = {
  de: () => import('./locales/browser/de'),
  fr: () => import('./locales/browser/fr'),
  tr: () => import('./locales/browser/tr'),
  zh: () => import('./locales/browser/zh'),
  ja: () => import('./locales/browser/ja'),
  ...(__PUBLIC_FEATURES__.research ? { hu: () => import('./locales/browser/hu') } : {}),
};

export function ensureBrowserLocale(loc: string, ensurePublicLocale: (loc: string) => Promise<void>, registerFeatureDictionaries: (feature: Record<string, Translations>) => void, pendingLoads: Map<string, Promise<void>>): Promise<void> {
  const load = LAZY_LOCALES[loc];
  if (!load || !(OFFERED_LOCALES as readonly string[]).includes(loc)) {
    return ensurePublicLocale(loc).catch((err) => {
      console.warn(`i18n: the ${loc} public entries did not load; showing English until they do`, err);
    });
  }
  let pending = pendingLoads.get(loc);
  if (!pending) {
    pending = Promise.all([load(), ensurePublicLocale(loc)]).then(
      ([m]) => {
        registerFeatureDictionaries({ [loc]: m.default });
      },
      (err) => {
        pendingLoads.delete(loc);
        console.warn(`i18n: the ${loc} dictionary did not load; showing English until it does`, err);
      },
    );
    pendingLoads.set(loc, pending);
  }
  return pending;
}
