import { registerTranslations } from './translations';
import { registerFeatureDictionaries } from '../../lib/i18n/store.svelte';
registerFeatureDictionaries(registerTranslations);
