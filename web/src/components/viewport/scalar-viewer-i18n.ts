import { en, es, pt, de, fr, tr, hu } from './scalar-viewer-translations';
import { zh, ko } from './scalar-viewer-translations';
import { registerFeatureDictionaries } from '../../lib/i18n/store.svelte';

export const scalarViewerTranslations: Record<string, Record<string, string>> = {
  en, es, pt, de, fr, tr, ...(__PUBLIC_FEATURES__.research ? { hu } : {}),
  zh,
  ko,
};

registerFeatureDictionaries(scalarViewerTranslations);
