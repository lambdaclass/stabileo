import * as dictionaries from './scalar-viewer-translations';
import { registerFeatureDictionaries } from '../../lib/i18n/store.svelte';

export const scalarViewerTranslations: Record<string, Record<string, string>> = dictionaries;

registerFeatureDictionaries(scalarViewerTranslations);
