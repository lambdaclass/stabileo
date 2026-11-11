import { toolTranslations } from './translations';
import { hubTranslations } from './hub-i18n';
import { registerFeatureDictionaries } from '../../lib/i18n/store.svelte';
registerFeatureDictionaries(toolTranslations);
registerFeatureDictionaries(hubTranslations);
