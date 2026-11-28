import { registerFeatureDictionaries } from '../i18n/store.svelte';
import { stepsEs, stepsEn, stepsPt } from '../i18n/locales/steps';
import stepsDe from '../i18n/locales/steps/de';
import stepsFr from '../i18n/locales/steps/fr';
import stepsTr from '../i18n/locales/steps/tr';
import stepsHu from '../i18n/locales/steps/hu';
import stepsZh from '../i18n/locales/steps/zh';
import stepsVi from '../i18n/locales/steps/vi';

registerFeatureDictionaries({ es: stepsEs, en: stepsEn, pt: stepsPt, de: stepsDe, fr: stepsFr, tr: stepsTr, hu: stepsHu, zh: stepsZh, vi: stepsVi });
