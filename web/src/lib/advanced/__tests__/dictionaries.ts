import es from '../../i18n/locales/es';
import en from '../../i18n/locales/en';
import pt from '../../i18n/locales/pt';
import de from '../../i18n/locales/de';
import fr from '../../i18n/locales/fr';
import tr from '../../i18n/locales/tr';
import hu from '../../i18n/locales/hu';
import zh from '../../i18n/locales/zh';
import { stepsEs, stepsEn, stepsPt } from '../../i18n/locales/steps';
import stepsDe from '../../i18n/locales/steps/de';
import stepsFr from '../../i18n/locales/steps/fr';
import stepsTr from '../../i18n/locales/steps/tr';
import stepsHu from '../../i18n/locales/steps/hu';
import stepsZh from '../../i18n/locales/steps/zh';

/** What Basic reads in each complete language: the main dictionary with the step-by-step one. */
export const DICTS: Record<string, Record<string, string>> = {
  es: { ...es, ...stepsEs }, en: { ...en, ...stepsEn }, pt: { ...pt, ...stepsPt },
  de: { ...de, ...stepsDe }, fr: { ...fr, ...stepsFr }, tr: { ...tr, ...stepsTr }, hu: { ...hu, ...stepsHu }, zh: { ...zh, ...stepsZh },
};

export const LOCALES = Object.keys(DICTS);
