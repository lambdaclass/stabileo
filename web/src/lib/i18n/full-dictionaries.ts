/**
 * The whole dictionaries the application speaks, registered with the store on import.
 *
 * The store starts with the public pages' entries only (`virtual:public-i18n`), so the landing and
 * the blog do not download all of them. App.svelte imports this module first, so everything is
 * registered before any of the application renders; the test setup imports it too.
 */
import { es, en, pt } from 'virtual:app-i18n';
import steelEs from './locales/steel/es';
import steelEn from './locales/steel/en';
import steelPt from './locales/steel/pt';
import { stepsEs, stepsEn, stepsPt } from './locales/steps';
import { registerDictionaries } from './store.svelte';

registerDictionaries({
  es: { ...es, ...steelEs, ...stepsEs },
  en: { ...en, ...steelEn, ...stepsEn },
  pt: { ...pt, ...steelPt, ...stepsPt },
});
