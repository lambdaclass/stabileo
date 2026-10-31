import { toolTranslations } from '../tools/translations';
import { registerFeatureDictionaries } from '../../lib/i18n/store.svelte';

export const scalarViewerTranslations: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(toolTranslations).map(([locale, dictionary]) => [locale, Object.fromEntries(Object.entries(dictionary).filter(([key]) => key.startsWith('scalarViewer.')))]),
);

registerFeatureDictionaries(scalarViewerTranslations);
