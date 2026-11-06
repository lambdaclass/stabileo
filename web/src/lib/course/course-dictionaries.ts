import { registerFeatureDictionaries } from '../i18n/store.svelte';
import { stepsEs, stepsEn, stepsPt } from '../i18n/locales/steps';
import stepsDe from '../i18n/locales/steps/de';
import stepsFr from '../i18n/locales/steps/fr';
import stepsTr from '../i18n/locales/steps/tr';

registerFeatureDictionaries({ es: stepsEs, en: stepsEn, pt: stepsPt, de: stepsDe, fr: stepsFr, tr: stepsTr });
