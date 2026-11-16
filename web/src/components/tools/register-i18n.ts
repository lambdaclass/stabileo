import { toolTranslations } from './translations';
import { hubTranslations } from './hub-i18n';
import { registerFeatureDictionaries } from '../../lib/i18n/store.svelte';
registerFeatureDictionaries(toolTranslations);
if (import.meta.env.VITE_TOOLS !== '0') registerFeatureDictionaries(hubTranslations);
