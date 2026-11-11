import { toolTranslations } from './translations';
import { mohrToolTranslations } from './mohr-tools';
import { registerFeatureDictionaries } from '../../lib/i18n/store.svelte';
registerFeatureDictionaries(toolTranslations);
registerFeatureDictionaries(mohrToolTranslations);
