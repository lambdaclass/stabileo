import { buildFeatures } from '../../../config/public-features.mjs';
import { COMPLETE as de } from './locales/complete/de';
import { COMPLETE as fr } from './locales/complete/fr';
import { COMPLETE as tr } from './locales/complete/tr';
import { COMPLETE as hu } from './locales/complete/hu';
import { COMPLETE as ru } from './locales/complete/ru';
import { COMPLETE as zh } from './locales/complete/zh';

export type Locale = 'es' | 'en' | 'pt' | 'de' | 'fr' | 'tr' | 'hu' | 'zh' | 'ru';

const research = typeof __PUBLIC_FEATURES_COMPILED__ === 'undefined' ? buildFeatures().research : __PUBLIC_FEATURES__.research;

const COMPLETE: Partial<Record<Locale, boolean>> = { de, fr, tr, zh, ru, ...(research ? { hu } : {}) };

/** Whether a language is translated in full: always for es, en and pt; for the others, once their `complete/<code>.ts` says so. */
export function isComplete(code: string): boolean {
  return code in COMPLETE ? COMPLETE[code as Locale] === true : ['es', 'en', 'pt'].includes(code);
}

export const OFFERED_LOCALES: readonly Locale[] = (['es', 'en', 'pt', 'de', 'fr', 'tr', 'zh', 'ru', ...(research ? ['hu' as const] : [])] as const).filter(isComplete);

export const PUBLIC_LOCALES: readonly Locale[] = (['en', 'es', 'pt', 'de', 'fr', 'tr', 'zh', 'ru', ...(research ? ['hu' as const] : [])] as const).filter(isComplete);

export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', es: 'Español', pt: 'Português', de: 'Deutsch', fr: 'Français', tr: 'Türkçe', hu: 'Magyar', ru: 'Русский', zh: '中文' };
