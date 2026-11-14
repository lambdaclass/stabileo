import { COMPLETE as de } from './locales/complete/de';
import { COMPLETE as fr } from './locales/complete/fr';
import { COMPLETE as tr } from './locales/complete/tr';
import { COMPLETE as hu } from './locales/complete/hu';

export type Locale = 'es' | 'en' | 'pt' | 'de' | 'fr' | 'tr' | 'hu';

const COMPLETE: Partial<Record<Locale, boolean>> = { de, fr, tr, hu };

/** Whether a language is translated in full: always for es, en and pt; for the others, once their `complete/<code>.ts` says so. */
export function isComplete(code: string): boolean {
  return code in COMPLETE ? COMPLETE[code as Locale] === true : ['es', 'en', 'pt'].includes(code);
}

export const OFFERED_LOCALES: readonly Locale[] = (['es', 'en', 'pt', 'de', 'fr', 'tr', 'hu'] as const).filter(isComplete);

export const PUBLIC_LOCALES: readonly Locale[] = (['en', 'es', 'pt', 'de', 'fr', 'tr', 'hu'] as const).filter(isComplete);

export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', es: 'Español', pt: 'Português', de: 'Deutsch', fr: 'Français', tr: 'Türkçe', hu: 'Magyar' };
