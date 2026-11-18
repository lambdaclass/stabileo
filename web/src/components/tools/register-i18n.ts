import { toolTranslations } from './translations';
import { hubTranslations } from './hub-i18n';
import { registerFeatureDictionaries } from '../../lib/i18n/store.svelte';
registerFeatureDictionaries(toolTranslations);
if (__PUBLIC_FEATURES__.tools) registerFeatureDictionaries(hubTranslations);
